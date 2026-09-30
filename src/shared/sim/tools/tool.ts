/**
 * Tool: a world object with a Ring at its centre, simulated by the server.
 * Parked, it collides with everything and rolls where it likes; hitched, it
 * shares its owner's Vehicle group and hangs on a rope from a Slot's hitch
 * point.
 *
 * Kinds:
 * - plough, seeds, tank, harvester: the drag tools. Use toggles raised (the Ring pulled to the hitch point
 *   and held rigid by two short stiff pins, squared to the Chassis) and lowered
 *   (the rope plays out to rodLength and the box is dragged; on the ground
 *   it takes a soil force sized to the whole Vehicle's mass and works the Field
 *   cell under it: the plough tills untilled cells, the seed bag sows tilled
 *   ones, the tank waters sown and sprouting ones, the harvester turns ripe
 *   ones back to soil and drops a Produce every perProduceCells cells). The
 *   seed bag and the tank run out (`fill`) and top up from their store's
 *   stock while they sit inside its zone: the Barn's seeds, the Well's
 *   water, both fed by pickups. The tank's mass grows with its water.
 * - box: an open crate, rigid in any Slot (never lowered). Use takes the
 *   nearest Produce within hitch reach into it, up to boxCap; its mass grows
 *   by the Produce's mass per item, so a full Box on the roof is top-heavy.
 *   Driving past the Farmhouse banks and empties it (the World does that).
 * - ramp: a small wedge, rigid in any Slot. Use plants a solid static ramp
 *   ahead of the Vehicle (the facing way) and the Tool is gone for the Run.
 * - rockets: a tube. Use fires a burst along the Chassis axis the facing
 *   way, applied at the Slot's hitch point (a top Slot pitches the nose down),
 *   then a cooldown. Never lowered.
 */
import type { Config } from '../../config/index.ts'
import type { ToolState } from '../../protocol.ts'
import type { Body, BodyModule, Constraint, Physics } from '../physics.ts'
import type { VehicleBodies } from '../vehicle.ts'
import type { SlotId } from './slots.ts'
import type { Fields } from '../fields.ts'
import { STORE, TOOL_KIND, type ToolKind } from './kinds.ts'

export type { ToolKind } from './kinds.ts'
export type ToolPhase = 'parked' | 'hoisting' | 'raised' | 'lowered'

export interface Pt {
  x: number
  y: number
}

/** What a Tool needs from the World. */
export interface ToolHost {
  readonly physics: Physics
  readonly config: Config
  surfaceYAt(x: number): number
  /** The Fields a drag Tool works. */
  readonly fields: Fields
  /** The harvester drops a Produce body here. */
  spawnProduce(x: number, y: number): void
  /** The Box takes the nearest Produce within `reach` of (x, y): true when one was taken. */
  takeProduceNear(x: number, y: number, reach: number): boolean
  /** One Produce body's mass (a Box weighs this much more per item). */
  produceMass(): number
  /** The ramp Tool plants a static wedge with its low end at x, rising toward `facing`. */
  deployRamp(x: number, facing: 1 | -1): void
  /** Inside the zone of the Place of that kind. */
  inZone(kind: 'barn' | 'well', x: number): boolean
  /** Take up to n from a store's stock; returns what was taken. */
  takeStock(kind: 'seed' | 'water', n: number): number
}

const DT2 = (1000 / 60) * (1000 / 60)
/** Second pin of the raised weld, this far along the tool's own x axis, px. */
const WELD_ARM = 16

export const rot = (p: Pt, a: number): Pt => {
  const c = Math.cos(a)
  const s = Math.sin(a)
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c }
}
export const add = (a: Pt, b: Pt): Pt => ({ x: a.x + b.x, y: a.y + b.y })
const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y)

/** The Vehicle a hitched Tool hangs from (the Driver's Vehicle satisfies it). */
export interface ToolCarrier {
  readonly bodies: VehicleBodies
  /** Which way the Vehicle points; the rockets push and draw their nose this way, a Ramp is planted this way. */
  readonly facing: 1 | -1
  /** A Slot's hitch point, chassis-local, for the current facing. */
  hitchLocal(slot: SlotId): Pt
}

export class Tool {
  readonly body: Body
  owner: number | null = null
  slot: SlotId | null = null
  phase: ToolPhase = 'parked'
  /** What carries the Tool while hitched: it reads the facing and its Slot's hitch point from it live. */
  private carrier: ToolCarrier | null = null
  /** The facing at the last drop: a parked Tool keeps drawing its nose the way it was left. */
  private lastFacing: 1 | -1 = 1
  private rod: Constraint | null = null
  /** Raised only: a second pin so the tool cannot spin on its Ring. */
  private weld: Constraint | null = null
  private digging = false
  private burstUntil = -Infinity
  private cooldownUntil = -Infinity
  private thrusting = false
  /** Harvester: cells harvested since the last Produce dropped. */
  private harvested = 0
  /** Box: Produce carried. */
  load = 0
  /** Ramp: deployed, to be removed by the World after this step. */
  spent = false
  /** Seed bag / tank: doses left. */
  fill = 0
  private baseMass = 0
  private readonly p: Config['TOOL']

  constructor(
    private readonly host: ToolHost,
    readonly id: number,
    readonly kind: ToolKind,
    parkX: number,
  ) {
    const p = host.config.TOOL
    this.p = p
    const physics = host.physics
    const opts = { density: p.density, friction: p.friction, frictionAir: 0.01, label: `tool-${kind}` }
    const fp = TOOL_KIND[kind].footprint(p)
    const y = host.surfaceYAt(parkX) - fp.h / 2 - 2
    this.body = fp.circle
      ? physics.circle(parkX, y, fp.w / 2, opts)
      : physics.rectangle(parkX, y, fp.w, fp.h, { ...opts, chamfer: { radius: fp.chamfer } })
  }

  get x(): number {
    return this.body.position.x
  }

  /** Box: set the load and the mass that goes with it. */
  setLoad(n: number): void {
    if (this.baseMass === 0) this.baseMass = this.body.mass
    this.load = n
    this.Body.setMass(this.body, this.baseMass + n * this.host.produceMass())
  }

  /** Seed bag / tank: set the doses left (the tank's mass follows its water). */
  setFill(n: number): void {
    this.fill = n
    if (TOOL_KIND[this.kind].store === 'water') {
      if (this.baseMass === 0) this.baseMass = this.body.mass
      this.Body.setMass(this.body, this.baseMass + n * this.p.waterMass)
    }
  }

  /** Inside its source zone a seed bag or tank tops up from the store's stock. */
  private refill(): void {
    const store = TOOL_KIND[this.kind].store
    if (store === null) return
    const cap = this.p[STORE[store].cap]
    if (this.fill >= cap) return
    if (!this.host.inZone(STORE[store].zone, this.body.position.x)) return
    const got = this.host.takeStock(store, cap - this.fill)
    if (got > 0) this.setFill(this.fill + got)
  }

  get y(): number {
    return this.body.position.y
  }

  get parked(): boolean {
    return this.phase === 'parked'
  }

  /** Which way the Tool faces: its carrier's way while hitched, the way it was left while parked. */
  get facing(): 1 | -1 {
    return this.carrier?.facing ?? this.lastFacing
  }

  /** The hitch point of the Slot the Tool hangs from, chassis-local. */
  private get hitchLocal(): Pt {
    return this.carrier!.hitchLocal(this.slot!)
  }

  private get Body(): BodyModule {
    return this.host.physics.Body
  }

  /** Parked: group 0 (collides with every car). Hitched: the owner's Vehicle group (never with its own car). */
  private setGroup(carrier: ToolCarrier | null): void {
    const f = carrier?.bodies.chassis.collisionFilter
    this.body.collisionFilter.group = f === undefined ? 0 : f.group
  }

  private hitchWorld(): Pt {
    const c = this.carrier!.bodies.chassis
    return add(c.position, rot(this.hitchLocal, c.angle))
  }

  private ringDistance(): number {
    return dist(this.hitchWorld(), this.body.position)
  }

  /** Hitch to a Slot: the tool is hoisted in on the rope. */
  attach(owner: number, carrier: ToolCarrier, slot: SlotId): void {
    this.owner = owner
    this.carrier = carrier
    this.slot = slot
    this.setGroup(carrier)
    this.makeRod(this.ringDistance())
    this.phase = 'hoisting'
  }

  private makeRod(length: number): void {
    const c = this.carrier!.bodies.chassis
    this.rod = this.host.physics.constraint(c, this.body, length, this.p.rodStiffness, {
      pointA: rot(this.hitchLocal, c.angle),
      pointB: { x: 0, y: 0 },
      damping: this.p.rodDamping,
    })
  }

  /** The car mirrored under this tool (a Turn): hang it from its new Slot. A raised tool teleports to the
   * new hitch point (that is the mirror); a lowered one stays on the ground and only its rope moves. */
  rehitch(slot: SlotId): void {
    if (this.carrier === null) return
    this.slot = slot
    this.weldOff()
    if (this.rod !== null) this.host.physics.removeConstraint(this.rod)
    this.rod = null
    const c = this.carrier.bodies.chassis
    if (this.phase === 'raised') {
      this.Body.setPosition(this.body, this.hitchWorld(), false)
      this.Body.setVelocity(this.body, { x: c.velocity.x, y: c.velocity.y })
      this.Body.setAngle(this.body, c.angle, false)
    }
    this.makeRod(this.phase === 'raised' ? 0 : this.phase === 'lowered' ? this.p.rodLength : this.ringDistance())
    if (this.phase === 'raised') this.weldOn()
  }

  /** Arrived at the hitch point: square the tool to the car and pin it a second time so it cannot spin. */
  private weldOn(): void {
    if (this.weld !== null || this.carrier === null) return
    const c = this.carrier.bodies.chassis
    this.Body.setAngle(this.body, c.angle, false)
    this.Body.setAngularVelocity(this.body, c.angularVelocity)
    this.weld = this.host.physics.constraint(c, this.body, 0, this.p.raisedStiffness, {
      pointA: rot(add(this.hitchLocal, { x: WELD_ARM, y: 0 }), c.angle),
      pointB: rot({ x: WELD_ARM, y: 0 }, this.body.angle),
    })
  }

  private weldOff(): void {
    if (this.weld === null) return
    this.host.physics.removeConstraint(this.weld)
    this.weld = null
  }

  /** The Slot's use. Drag tools: raised ↔ lowered. Box: take a Produce. Rockets: fire a burst. */
  use(step: number): void {
    if (this.kind === 'box') {
      if (this.phase === 'parked' || this.load >= this.p.boxCap) return
      if (this.host.takeProduceNear(this.body.position.x, this.body.position.y, this.p.hitchReach)) this.setLoad(this.load + 1)
      return
    }
    if (this.kind === 'ramp') {
      if (this.phase === 'parked' || this.carrier === null || this.spent) return
      const c = this.carrier.bodies.chassis
      this.host.deployRamp(c.position.x + this.facing * this.p.rampAheadPx, this.facing)
      this.spent = true
      return
    }
    if (this.kind === 'rockets') {
      if (this.phase !== 'parked' && step >= this.cooldownUntil) {
        this.burstUntil = step + this.p.rocketBurstS * 60
        this.cooldownUntil = this.burstUntil + this.p.rocketCooldownS * 60
      }
      return
    }
    if (this.phase === 'raised') {
      this.phase = 'lowered'
      this.weldOff()
    } else if (this.phase === 'lowered') this.phase = 'hoisting'
  }

  drop(): void {
    if (this.owner === null) return
    this.weldOff()
    if (this.rod !== null) this.host.physics.removeConstraint(this.rod)
    this.rod = null
    this.lastFacing = this.facing
    this.owner = null
    this.carrier = null
    this.slot = null
    this.phase = 'parked'
    this.digging = false
    this.burstUntil = -Infinity
    this.setGroup(null)
  }

  private lowest(): Pt {
    const v = this.body.vertices as Pt[]
    let best = v[0]!
    for (const q of v) if (q.y > best.y) best = q
    return best
  }

  private rigMass(): number {
    const r = this.carrier?.bodies ?? null
    return (r === null ? 0 : r.chassis.mass + r.wheels[0].mass + r.wheels[1].mass) + this.body.mass
  }

  /** A drag tool: ground resistance while lowered and on the ground, and its work on the cell under it. */
  private drag(): void {
    const low = this.lowest()
    this.digging = this.phase === 'lowered' && low.y >= this.host.surfaceYAt(low.x) - this.p.digReach
    if (!this.digging) return
    const b = this.body
    const dir = b.velocity.x >= 0 ? 1 : -1
    // Matter: Δv = F / m · dt², so this is a deceleration of the whole Vehicle in px/step². The backward pull acts
    // at the centre of mass (a Vehicle-sized force at a corner spins the light tool); the suction holds it down.
    // The pull grows with speed over the first few px/step, so a Vehicle can always start from rest.
    const bite = Math.min(1, Math.abs(b.velocity.x) / 3)
    const shareDial = TOOL_KIND[this.kind].dragShare
    const share = shareDial === null ? 1 : this.p[shareDial]
    const f = (this.p.digAccel * share * this.rigMass()) / DT2
    this.Body.applyForce(b, b.position, { x: -dir * f * bite, y: f * this.p.digSuction })
    const x = b.position.x
    const fields = this.host.fields
    if (this.kind === 'plough') fields.till(x)
    else if (this.kind === 'seeds') {
      if (this.fill > 0 && fields.sow(x)) this.setFill(this.fill - 1)
    } else if (this.kind === 'tank') {
      if (this.fill > 0 && fields.water(x)) this.setFill(this.fill - 1)
    } else if (fields.harvest(x)) {
      this.harvested++
      if (this.harvested >= this.p.perProduceCells) {
        this.harvested = 0
        this.host.spawnProduce(x - dir * 30, b.position.y - 30)
      }
    }
  }

  /** Rockets: thrust along the Chassis axis, applied to the Chassis at the hitch point (or its centre). */
  private fire(step: number): void {
    this.thrusting = this.carrier !== null && this.phase !== 'parked' && step < this.burstUntil
    if (!this.thrusting || this.carrier === null) return
    const c = this.carrier.bodies.chassis
    const f = (this.p.rocketThrust * this.rigMass()) / DT2
    this.Body.applyForce(c, this.p.rocketAtHitch >= 1 ? this.hitchWorld() : c.position, rot({ x: f * this.facing, y: 0 }, c.angle))
  }

  /** Before the physics step: the rope's rest length and stiffness for the phase, then the kind's own work. */
  step(step: number): void {
    this.refill()
    if (this.rod !== null && this.carrier !== null) {
      const r = this.rod
      r.damping = this.p.rodDamping
      if (this.phase === 'hoisting') {
        r.length = Math.max(0, r.length - this.p.hoistPxPerStep)
        r.stiffness = this.p.rodStiffness
        if (r.length === 0) {
          this.phase = 'raised'
          this.weldOn()
        }
      } else if (this.phase === 'raised') {
        r.length = 0
        r.stiffness = this.p.raisedStiffness
        if (this.weld !== null) this.weld.stiffness = this.p.raisedStiffness
      } else {
        r.length = this.p.rodLength
        // A rope pulls only when stretched; a rod also pushes.
        const stretched = this.ringDistance() > this.p.rodLength
        r.stiffness = this.p.rope >= 1 && !stretched ? 0 : this.p.rodStiffness
      }
    } else this.digging = false
    if (this.kind === 'rockets') this.fire(step)
    else if (TOOL_KIND[this.kind].drag) this.drag()
  }

  state(step: number): ToolState {
    return {
      id: this.id,
      kind: this.kind,
      x: this.body.position.x,
      y: this.body.position.y,
      a: this.body.angle,
      slot: this.owner === null || this.slot === null ? null : [this.owner, this.slot],
      state: this.phase,
      thrusting: this.thrusting,
      cooldownS: this.kind === 'rockets' && step < this.cooldownUntil ? (this.cooldownUntil - step) / 60 : 0,
      digging: this.digging,
      f: this.facing,
      load: this.load,
      fill: this.fill,
    }
  }

  dispose(): void {
    this.drop()
    this.host.physics.remove(this.body)
  }
}
