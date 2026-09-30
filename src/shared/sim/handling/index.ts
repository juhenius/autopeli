/**
 * Handling shell: applies the pure rules to a Vehicle's Matter bodies, one
 * call per step from its Driver, before the physics step.
 *
 * The model (handling v2, ADR 0002): motor torque spins the Wheels with a
 * linear speed curve, so top speed emerges instead of being set; the motor's
 * reaction torque tips the Chassis — wheelies on the ground, physical Air
 * Control in the air (gas = nose-up). Traction is a slip-proportional impulse
 * clamped by a Suspension-load grip budget, so burnouts, lock-skids, the
 * brake→reverse transition and load transfer all emerge. The Wheels carry no
 * Matter contact friction: this slip model is the only grip.
 */
import type { Config } from '../../config/index.ts'
import type { InputFrame } from '../input.ts'
import type { Body } from '../physics.ts'
import type { Vehicle } from '../vehicle.ts'
import { clamp, createRulesState, tick, wheelCountsTouching, type RulesState } from './rules.ts'
import { airTorqueDir, groundTangent, motorAccel, surfaceSlip, tractionImpulse } from './torqueRules.ts'
import { carSpec, type VehicleSpec } from '../vehicles/spec.ts'

/** The slice of Matter's Body module the shell needs (Physics.Body satisfies it). */
export interface BodyApi {
  setAngularVelocity(body: Body, velocity: number): void
  setVelocity(body: Body, velocity: { x: number; y: number }): void
}

/** Gravity's per-step Δv per unit of gravityY (Matter's default 0.001 scale at 60 Hz). */
const GRAVITY_DV = ((1000 / 60) * (1000 / 60)) / 1000

export class Handling {
  private state: RulesState = createRulesState()

  // Instrument readout: all reset by reset().
  /** Safety Speed Cap hits — must stay 0 in play. */
  capHits = 0
  /** Last step's Chassis motor-reaction impulse. */
  reaction = 0
  grounded = true
  reversing = false
  /** Last step's per-Wheel surface slip, px/step (0 when not touching). */
  lastSlip: [number, number] = [0, 0]
  private lastJump = Number.NEGATIVE_INFINITY
  /** How far the Wheels are drawn extended right now, px — purely visual, the bodies never move. */
  private visualExt = 0
  /** Kick animation: step until which the extension holds at full; before that it extends, after it returns. */
  private kickUntil = Number.NEGATIVE_INFINITY
  private prevGrounded = true
  private landingUntil = Number.NEGATIVE_INFINITY

  constructor(
    private readonly params: Config['HANDLING'],
    private readonly Body: BodyApi,
    /** World ground slope dy/dx at x (y down) — the slip tangent's source. */
    private readonly slopeAt: (x: number) => number,
    /** World y of the Track surface at x — the Jump's gap measure. */
    private readonly surfaceYAt: (x: number) => number,
    /** Per-Wheel radius and motor, and the vehicle's motor and spin scales. */
    private readonly spec: VehicleSpec = carSpec(params),
  ) {}

  reset(): void {
    this.state = createRulesState()
    this.capHits = 0
    this.reaction = 0
    this.grounded = true
    this.reversing = false
    this.lastSlip = [0, 0]
    this.lastJump = Number.NEGATIVE_INFINITY
    this.visualExt = 0
    this.kickUntil = Number.NEGATIVE_INFINITY
    this.prevGrounded = true
    this.landingUntil = Number.NEGATIVE_INFINITY
  }

  /** The kick's visual Wheel offset straight down (world), px (drawing only). */
  /** The replayable state as numbers (for client-side prediction); −Infinity travels as −1e9. */
  snapshot(): number[] {
    const fin = (v: number): number => (Number.isFinite(v) ? v : -1e9)
    return [
      this.state.step,
      fin(this.state.lastContact[0]),
      fin(this.state.lastContact[1]),
      fin(this.lastJump),
      this.visualExt,
      fin(this.kickUntil),
      this.prevGrounded ? 1 : 0,
      fin(this.landingUntil),
    ]
  }

  restore(v: number[]): void {
    if (v.length < 8) return
    this.state = { step: v[0]!, lastContact: [v[1]!, v[2]!] }
    this.lastJump = v[3]!
    this.visualExt = v[4]!
    this.kickUntil = v[5]!
    this.prevGrounded = v[6] === 1
    this.landingUntil = v[7]!
  }

  get kick(): number {
    return this.visualExt
  }

  /** One step: drive the Vehicle with this step's input. Reads its contact, spring loads, bodies and facing itself. */
  step(input: InputFrame, vehicle: Vehicle): void {
    const p = this.params
    const sense = vehicle.sense()
    const comps = vehicle.springCompressions()
    const bodies = vehicle.bodies
    // Which way the Wheels sit (the Turn's): the forward gear drives that way, the other pad is the reverse gear.
    const facing = vehicle.facing
    const { chassis, wheels } = bodies
    this.state = tick(this.state, sense.wheelTouching)
    const touching: [boolean, boolean] = [
      wheelCountsTouching(this.state, p, 0),
      wheelCountsTouching(this.state, p, 1),
    ]
    const grounded = touching[0] || touching[1]
    this.grounded = grounded

    // Jump: fires at the keypress, never later — one world-up impulse on
    // every body, replacing any downward motion. The window is a distance,
    // not a time: each Wheel's gap to the ground (0 while touching) sets
    // its push, full at the ground fading to nothing at jumpReachPx, and the
    // launch is as strong as the closer Wheel's push. The pushes act at the
    // Wheels' lever arms, so an uneven push pitches the Chassis (rear-only
    // nose-down, front-only nose-up; jumpPitchTorque scales it). The kick is
    // drawing only (`kick`) and plays on every press, launch or not: the
    // drawn Wheels extend to jumpReachPx — the same distance that can
    // launch — at kickExtend px/step, hold kickHold, return at
    // kickRetract.
    if (input.jump && this.state.step - this.lastJump >= p.jumpCooldown) {
      // The kick plays on every press, launch or not.
      this.kickUntil = this.state.step + Math.ceil(p.jumpReachPx / Math.max(1e-6, p.kickExtend)) + p.kickHold
      const push = wheels.map((w, i) => {
        if (touching[i]) return 1
        const gap = this.surfaceYAt(w.position.x) - (w.position.y + this.spec.wheels[i]!.radius)
        return clamp(1 - gap / Math.max(1e-6, p.jumpReachPx), 0, 1)
      }) as [number, number]
      const strength = Math.max(push[0], push[1])
      if (strength > 0) {
        this.lastJump = this.state.step
        const dv = p.jumpImpulse * strength
        for (const b of [chassis, ...wheels]) this.Body.setVelocity(b, { x: b.velocity.x, y: Math.min(b.velocity.y, 0) - dv })
        const total = push[0] + push[1]
        let torque = 0
        wheels.forEach((w, i) => {
          torque += -(w.position.x - chassis.position.x) * chassis.mass * dv * (push[i as 0 | 1] / total)
        })
        const dOmega = (torque / chassis.inertia) * p.jumpPitchTorque
        this.Body.setAngularVelocity(chassis, clamp(chassis.angularVelocity + dOmega, -p.maxSpin, p.maxSpin))
      }
    }
    if (this.state.step < this.kickUntil) this.visualExt = Math.min(p.jumpReachPx, this.visualExt + p.kickExtend)
    else this.visualExt = Math.max(0, this.visualExt - p.kickRetract)

    // Motor + traction, per Wheel.
    let totalAccel = 0
    const gear: InputFrame = facing === 1 ? input : { ...input, gas: input.brake, brake: input.gas }
    /** Σ motor impulse × wheel inertia: the torque the motor put into the wheels, which the Chassis feels back. */
    let motorTorque = 0
    const spec = this.spec
    wheels.forEach((w, i) => {
      const ws = spec.wheels[i]!
      let omega = w.angularVelocity
      // The spec's spin scale stretches the motor curve (top speed); its motor scale and the wheel's share scale the impulse.
      // The pads are absolute (right pad drives right) but the gears follow the facing: facing left, the left pad is the
      // forward gear and the right pad the reverse — the motor runs in the mirrored frame.
      const a = ws.driven ? facing * motorAccel(p, gear, (facing * omega) / spec.spinScale) * spec.motorScale * ws.motorShare : 0
      totalAccel += a
      motorTorque += a * w.inertia
      omega += a
      if (touching[i]) {
        const tan = groundTangent(this.slopeAt(w.position.x))
        const vt = w.velocity.x * tan.x + w.velocity.y * tan.y
        const slip = surfaceSlip(omega, ws.radius, vt)
        const dv = tractionImpulse(p, slip, comps[i as 0 | 1], spec.gripScale)
        this.Body.setVelocity(w, { x: w.velocity.x + tan.x * dv, y: w.velocity.y + tan.y * dv })
        // Equal-opposite on the Wheel's spin: traction eats wheelspin.
        omega -= (dv * w.mass * ws.radius) / w.inertia
        this.lastSlip[i as 0 | 1] = slip
      } else {
        this.lastSlip[i as 0 | 1] = 0
      }
      this.Body.setAngularVelocity(w, omega)
    })

    // Motor reaction torque on the Chassis — wheelies on the ground, the
    // physical Air Control core in the air. maxSpin stays the only assist cap.
    this.reaction = 0
    if (totalAccel !== 0 && p.reactionScale > 0) {
      this.reaction = (-motorTorque * p.reactionScale * spec.reactionScale) / chassis.inertia
      this.Body.setAngularVelocity(
        chassis,
        clamp(chassis.angularVelocity + this.reaction, -p.maxSpin, p.maxSpin),
      )
    }

    if (!grounded) {
      // Air Control assist on top of the physical reaction; both held = none.
      const dir = airTorqueDir(input)
      if (dir !== 0) {
        this.Body.setAngularVelocity(
          chassis,
          clamp(chassis.angularVelocity + dir * p.airTorque, -p.maxSpin, p.maxSpin),
        )
      }
      // Apex gravity-shaping: cancel a fraction of gravity while |vy| is inside the apex band.
      if (p.apexLift > 0 && Math.abs(chassis.velocity.y) < p.apexBand) {
        const lift = p.gravityY * GRAVITY_DV * p.apexLift
        for (const b of [chassis, ...wheels]) {
          this.Body.setVelocity(b, { x: b.velocity.x, y: b.velocity.y - lift })
        }
      }
    }

    // Landing Pitch: for a short window after touching down on one Wheel,
    // torque the Chassis toward the still-airborne end, proportional to the
    // landed Wheel's spring compression — the strut moment a rigid car would
    // feel, so a rear-first landing pitches the nose onto the front Wheel
    // instead of pogoing up. Single-wheel contact only, entered from the air,
    // so wheelies (which start grounded) are unaffected.
    if (!this.prevGrounded && grounded) this.landingUntil = this.state.step + p.landingWindow
    if (this.state.step <= this.landingUntil && touching[0] !== touching[1] && p.landingPitch > 0) {
      const i: 0 | 1 = touching[0] ? 0 : 1
      const dOmega = p.landingPitch * comps[i] * (i === 0 ? 1 : -1)
      this.Body.setAngularVelocity(
        chassis,
        clamp(chassis.angularVelocity + dOmega, -p.maxSpin, p.maxSpin),
      )
    }
    this.prevGrounded = grounded

    this.reversing = gear.brake && wheels.every((w) => facing * w.angularVelocity <= 0)

    // Safety Speed Cap: exists only to prevent tunnelling; must never be felt.
    for (const b of [chassis, ...wheels]) {
      if (b.speed > p.maxSpeed) {
        const k = p.maxSpeed / b.speed
        this.Body.setVelocity(b, { x: b.velocity.x * k, y: b.velocity.y * k })
        this.capHits++
      }
    }
  }
}
