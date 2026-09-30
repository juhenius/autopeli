/**
 * Vehicle: Chassis + two Wheels + variant-A Suspension (soft vertical spring
 * plus stiff trailing arm per Wheel), built from a VehicleSpec and the
 * HANDLING rebuild group (suspension numbers). Wheel i is always the spec's
 * wheel i (its radius, its motor); the Turn mirrors which side it sits on.
 * The only module that reads Matter collision pairs; bodies only, drawing is
 * the client's VehicleGfx.
 */
import type { Config } from '../config/index.ts'
import type { Body, Constraint, PairLike, Physics } from './physics.ts'
import { carSpec, hitchLocal, type Pt, type VehicleSpec } from './vehicles/spec.ts'
import type { SlotId } from './tools/slots.ts'

export interface SenseFrame {
  /** Per Wheel, raw this-step contact with any non-Vehicle body (grace is Handling's). */
  wheelTouching: [boolean, boolean]
  /** Some Chassis–Terrain contact vertex lies in the Chassis's upper half (Flip material). */
  roofContact: boolean
  /** A Wheel is touching a deployed Ramp's wedge, which boosts the Vehicle along its slope. */
  onRamp: boolean
}

export interface VehicleBodies {
  chassis: Body
  wheels: [Body, Body]
}

type HandlingConfig = Config['HANDLING']

const clampNum = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v)

/**
 * Mirror a constraint's chassis anchor across the chassis's vertical axis.
 * Matter keeps `pointA` in world orientation and rotates it lazily at each
 * solve by the body's angle change since `angleA`, so the anchor is taken
 * back into the chassis frame by that stored angle, its x negated, and
 * rotated out again — negating the world x on a tilted chassis would yank
 * the suspension and launch the vehicle.
 */
function mirrorAnchor(k: Constraint): void {
  const a = (k as unknown as { angleA: number }).angleA
  const cos = Math.cos(a)
  const sin = Math.sin(a)
  const lx = k.pointA.x * cos + k.pointA.y * sin
  const ly = -k.pointA.x * sin + k.pointA.y * cos
  k.pointA.x = -lx * cos - ly * sin
  k.pointA.y = -lx * sin + ly * cos
}

/** Box-clamp correction beyond this (px) is a pathological pose (mirror flip) — snap to rest instead. */
const SNAP_DIST = 25

export class Vehicle {
  readonly bodies: VehicleBodies
  /** Which way the spec's frame points: −1 once mirrored by a Turn. */
  facing: 1 | -1 = 1
  private readonly constraints: Constraint[] = []
  /** Per Wheel: [spring, arm]. */
  private readonly wheelConstraints: [Constraint, Constraint][] = []
  /** Matter's computed inertia carries a hidden ×4 _inertiaScale; this is the physical value. */
  private readonly chassisBaseInertia: number

  constructor(
    private readonly physics: Physics,
    private readonly handling: HandlingConfig,
    readonly spec: VehicleSpec,
    x: number,
    y: number,
  ) {
    const h = handling
    const group = physics.nextGroup() // negative: Chassis and Wheels never collide with each other
    const chassis = physics.rectangle(x, y, spec.body.w, spec.body.h, {
      chamfer: { radius: 8 },
      collisionFilter: { group },
      density: h.chassisDensity * spec.body.densityScale,
      friction: 0.3,
      frictionAir: h.chassisAirDrag,
      label: 'chassis',
    })
    const wheels = spec.wheels.map((ws) =>
      physics.circle(x + ws.x, y + ws.y, ws.radius, {
        friction: 0, // grip belongs to Handling's slip model, never Matter contact friction
        frictionStatic: 0,
        frictionAir: 0,
        restitution: h.wheelRestitution,
        collisionFilter: { group },
        density: h.wheelDensity,
        label: 'wheel',
      }),
    ) as [Body, Body]
    wheels.forEach((w, i) => {
      const ws = spec.wheels[i]!
      const dy = ws.y - h.wheelDrop // the suspension geometry rides with the wheel's rest height
      // Soft vertical spring from chassis-local (x, anchorY).
      const spring = physics.constraint(chassis, w, h.wheelDrop - h.anchorY, h.springStiffness, {
        pointA: { x: ws.x, y: h.anchorY + dy },
        damping: h.springDamping,
      })
      // Stiff trailing arm: a horizontal rod at Wheel-centre height (length from current placement).
      const arm = physics.constraint(chassis, w, undefined, 0.9, {
        pointA: { x: ws.x - Math.sign(ws.x) * h.armX, y: h.armY + dy },
      })
      this.constraints.push(spring, arm)
      this.wheelConstraints.push([spring, arm])
    })
    this.bodies = { chassis, wheels }
    this.chassisBaseInertia = chassis.inertia / 4
    this.applyInertiaScale(h.chassisInertiaScale)
  }

  /**
   * Chassis spin-weight: Matter quadruples computed inertia (_inertiaScale 4)
   * so every torque turns bodies at a quarter of the physical rate. 1 =
   * physical, 4 = Matter's default. Live tunable.
   */
  applyInertiaScale(scale: number): void {
    this.physics.Body.setInertia(this.bodies.chassis, this.chassisBaseInertia * Math.max(0.5, scale))
  }

  /** A Slot's hitch point, chassis-local, for the current facing. */
  hitchLocal(slot: SlotId): Pt {
    return hitchLocal(this.spec, slot, this.facing)
  }

  /** The spec's rest x of Wheel i for the current facing. */
  private restX(i: number): number {
    return this.spec.wheels[i]!.x * this.facing
  }

  /**
   * The Turn's mid-point: the Wheels change sides in the physics — each
   * goes to its own mirrored rest x (so its arm and spring keep their
   * geometry, no yank) at the other wheel's contact height (so a bigger
   * wheel sits higher and nothing is buried in a slope), keeps its body,
   * radius, motor and velocity, and the suspension anchors mirror. A
   * symmetric vehicle is left physically untouched.
   */
  mirror(facing: 1 | -1): void {
    if (facing === this.facing) return
    this.facing = facing
    const Body = this.physics.Body
    const c = this.bodies.chassis
    const cos = Math.cos(c.angle)
    const sin = Math.sin(c.angle)
    const local = this.bodies.wheels.map((w) => {
      const relX = w.position.x - c.position.x
      const relY = w.position.y - c.position.y
      return { lx: relX * cos + relY * sin, ly: -relX * sin + relY * cos }
    })
    this.bodies.wheels.forEach((w, i) => {
      const other = local[1 - i]!
      const lx = this.spec.wheels[i]!.x * facing
      const ly = other.ly + this.spec.wheels[1 - i]!.radius - this.spec.wheels[i]!.radius
      Body.setPosition(w, { x: c.position.x + lx * cos - ly * sin, y: c.position.y + lx * sin + ly * cos }, false)
      for (const k of this.wheelConstraints[i]!) mirrorAnchor(k)
    })
  }

  /** Adopt a facing without moving the Wheels (their positions came from the server under this facing): only the anchors mirror. */
  setFacing(facing: 1 | -1): void {
    if (facing === this.facing) return
    this.facing = facing
    for (const pair of this.wheelConstraints) for (const k of pair) mirrorAnchor(k)
  }

  /** Where the Wheels are drawn: their bodies, offset `kick` px straight down in the world — the
   * launch is world-up, so the kick reads as world-down however the car is tilted (drawing only). */
  wheelDrawPositions(kick: number): [{ x: number; y: number }, { x: number; y: number }] {
    const [w0, w1] = this.bodies.wheels
    return [
      { x: w0.position.x, y: w0.position.y + kick },
      { x: w1.position.x, y: w1.position.y + kick },
    ]
  }

  /** Bodies as numbers [x, y, angle, vx, vy, ω] (client-side prediction). */
  bodyStates(): { c: number[]; w: [number[], number[]] } {
    const one = (b: Body): number[] => [b.position.x, b.position.y, b.angle, b.velocity.x, b.velocity.y, b.angularVelocity]
    return { c: one(this.bodies.chassis), w: [one(this.bodies.wheels[0]), one(this.bodies.wheels[1])] }
  }

  setBodyStates(c: number[], w: [number[], number[]]): void {
    const Body = this.physics.Body
    const set = (b: Body, v: number[]): void => {
      if (v.length < 6) return
      Body.setPosition(b, { x: v[0]!, y: v[1]! }, false)
      Body.setAngle(b, v[2]!, false)
      Body.setVelocity(b, { x: v[3]!, y: v[4]! })
      Body.setAngularVelocity(b, v[5]!)
    }
    set(this.bodies.chassis, c)
    set(this.bodies.wheels[0], w[0])
    set(this.bodies.wheels[1], w[1])
  }

  get chassisX(): number {
    return this.bodies.chassis.position.x
  }

  get chassisY(): number {
    return this.bodies.chassis.position.y
  }

  private get pairs(): PairLike[] {
    return this.physics.pairs
  }

  /** Raw contact state from the engine's active pairs, once per step. */
  sense(): SenseFrame {
    const { chassis, wheels } = this.bodies
    const pairs = this.pairs
    const isVehicle = (b: Body) => b === chassis || b === wheels[0] || b === wheels[1]

    const wheelTouching = wheels.map((w) =>
      pairs.some(
        (p) =>
          p.isActive &&
          ((p.bodyA === w && !isVehicle(p.bodyB)) || (p.bodyB === w && !isVehicle(p.bodyA))),
      ),
    ) as [boolean, boolean]
    const onRamp = pairs.some(
      (p) =>
        p.isActive &&
        ((wheels.includes(p.bodyA as (typeof wheels)[number]) && p.bodyB.label === 'ramp') ||
          (wheels.includes(p.bodyB as (typeof wheels)[number]) && p.bodyA.label === 'ramp')),
    )

    let roofContact = false
    const cos = Math.cos(chassis.angle)
    const sin = Math.sin(chassis.angle)
    for (const p of pairs) {
      if (!p.isActive) continue
      const other =
        p.bodyA === chassis ? p.bodyB : p.bodyB === chassis ? p.bodyA : null
      if (other === null || !other.label.startsWith('terrain')) continue
      const supports = p.collision.supports
      const count = p.collision.supportCount ?? supports.length
      for (let i = 0; i < count; i++) {
        const s = supports[i]
        if (!s) continue
        // Rotate the contact point into Chassis space; upper half (local y < 0) is Flip material.
        const dx = s.x - chassis.position.x
        const dy = s.y - chassis.position.y
        const localY = -dx * sin + dy * cos
        if (localY < 0) {
          roofContact = true
          break
        }
      }
      if (roofContact) break
    }

    return { wheelTouching, roofContact, onRamp }
  }

  /**
   * Wheel box clamp, run after each physics step (compound-part fenders are
   * impossible in Matter): each Wheel centre must end the step inside a
   * chassis-local box around its rest pose — travel from the spring anchor in
   * [minTravel, maxTravel] along the Chassis down axis, lateral offset within
   * ±wheelBoxX of the hub. Violations are projected to the nearest face and
   * the chassis-relative velocity component out of that face is removed; a
   * correction beyond SNAP_DIST (a mirror flip past the arm anchor) snaps the
   * Wheel back to its rest pose with the Chassis's velocity instead.
   * minTravel 0 disables the clamp entirely.
   */
  clampTravel(): void {
    const h = this.handling
    if (h.minTravel <= 0) return
    const Body = this.physics.Body
    const c = this.bodies.chassis
    const cos = Math.cos(c.angle)
    const sin = Math.sin(c.angle)
    this.bodies.wheels.forEach((w, i) => {
      const dx = this.restX(i)
      const restY = this.spec.wheels[i]!.y
      const dy = restY - h.wheelDrop
      // Chassis-local Wheel centre: lx along the chassis x axis, ly down-positive.
      const relX = w.position.x - c.position.x
      const relY = w.position.y - c.position.y
      const lx = relX * cos + relY * sin
      const ly = -relX * sin + relY * cos
      const cx = clampNum(lx, dx - h.wheelBoxX, dx + h.wheelBoxX)
      const cy = clampNum(ly, h.anchorY + dy + h.minTravel, h.anchorY + dy + h.maxTravel)
      if (cx === lx && cy === ly) return
      if (Math.hypot(cx - lx, cy - ly) > SNAP_DIST) {
        Body.setPosition(
          w,
          { x: c.position.x + dx * cos - restY * sin, y: c.position.y + dx * sin + restY * cos },
          false,
        )
        Body.setVelocity(w, { x: c.velocity.x, y: c.velocity.y })
        return
      }
      Body.setPosition(
        w,
        { x: c.position.x + cx * cos - cy * sin, y: c.position.y + cx * sin + cy * cos },
        false,
      )
      // Remove the chassis-relative velocity component pushing out of each
      // violated face — and hand that momentum to the Chassis at the Wheel's
      // position instead of deleting it: an off-centre end-stop shove both
      // lifts and pitches, so a rear-first landing rotates the nose down out
      // of pure geometry (no scripted landing rule needed).
      let wx = w.velocity.x
      let wy = w.velocity.y
      const rvx = wx - c.velocity.x
      const rvy = wy - c.velocity.y
      const vaX = rvx * cos + rvy * sin
      const vaY = -rvx * sin + rvy * cos
      let remX = 0
      let remY = 0
      if ((lx < cx && vaX < 0) || (lx > cx && vaX > 0)) {
        remX += vaX * cos
        remY += vaX * sin
      }
      if ((ly < cy && vaY < 0) || (ly > cy && vaY > 0)) {
        remX += vaY * -sin
        remY += vaY * cos
      }
      if (remX === 0 && remY === 0) return
      Body.setVelocity(w, { x: wx - remX, y: wy - remY })
      const rx = w.position.x - c.position.x
      const ry = w.position.y - c.position.y
      Body.setVelocity(c, {
        x: c.velocity.x + (remX * w.mass) / c.mass,
        y: c.velocity.y + (remY * w.mass) / c.mass,
      })
      Body.setAngularVelocity(c, c.angularVelocity + (w.mass * (rx * remY - ry * remX)) / c.inertia)
    })
  }

  /**
   * Per-Wheel Suspension spring compression, px, signed: rest length minus
   * the current anchor-to-Wheel distance — positive is compressed (the
   * torque model's normal load, so weight transfer changes grip for real),
   * negative is extended (the Kick's travel bookkeeping).
   */
  springCompressions(): [number, number] {
    const h = this.handling
    const c = this.bodies.chassis
    const rest = h.wheelDrop - h.anchorY
    const cos = Math.cos(c.angle)
    const sin = Math.sin(c.angle)
    // Each spring's anchor: the wheel's rest x for the current facing, anchorY shifted with the wheel's rest height.
    const comp = (i: 0 | 1): number => {
      const dx = this.restX(i)
      const ay0 = h.anchorY + this.spec.wheels[i]!.y - h.wheelDrop
      const ax = c.position.x + dx * cos - ay0 * sin
      const ay = c.position.y + dx * sin + ay0 * cos
      const w = this.bodies.wheels[i]
      return rest - Math.hypot(w.position.x - ax, w.position.y - ay)
    }
    return [comp(0), comp(1)]
  }

  dispose(): void {
    for (const constraint of this.constraints) this.physics.removeConstraint(constraint)
    this.physics.remove([this.bodies.chassis, ...this.bodies.wheels])
  }
}

/** Spawn at world (x, y); the caller places y relative to the Track surface. */
export function spawnVehicle(physics: Physics, handling: HandlingConfig, x: number, y: number, spec: VehicleSpec = carSpec(handling)): Vehicle {
  return new Vehicle(physics, handling, spec, x, y)
}
