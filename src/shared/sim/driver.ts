/**
 * Driver: one seat in the World — the Vehicle (its bodies, replaced on a
 * Respawn or a change of kind) and everything that drives it: the held
 * input and its numbered queue, Handling, the Turn, the Slots and the Flip.
 * The World steps every Driver twice per fixed step, `drive()` before the
 * physics step and `settle()` after it, and passes in the one fact about
 * other Drivers (a Rescue). Everything else comes through the host: the
 * ground and the parked Tools.
 */
import { STEP_MS, type Config } from '../config/index.ts'
import type { SimState, VehicleState } from '../protocol.ts'
import { createFlipState, flipStep, type FlipState } from './flip/index.ts'
import { Handling } from './handling/index.ts'
import type { InputFrame } from './input.ts'
import type { Physics } from './physics.ts'
import { SLOT_IDS, Slots } from './tools/slots.ts'
import type { Pt, Tool } from './tools/tool.ts'
import { Turn } from './tools/turn.ts'
import { spawnVehicle, type Vehicle } from './vehicle.ts'
import type { VehicleKind, VehicleSpec } from './vehicles/spec.ts'

/** What a client holds down, one per step. */
export interface HeldInput {
  gas: boolean
  brake: boolean
  jump: boolean
  use: boolean
  slots: [boolean, boolean, boolean]
  turn: boolean
}

export const NO_INPUT: HeldInput = { gas: false, brake: false, jump: false, use: false, slots: [false, false, false], turn: false }

/** What a Driver needs from the World. */
export interface DriverHost {
  readonly physics: Physics
  readonly config: Config
  surfaceYAt(x: number): number
  slopeAt(x: number): number
  /** The parked Tool whose Ring is nearest to p within reach, or null. */
  parkedToolNear(p: Pt, reach: number): Tool | null
}

/** Chassis spawn height above the surface, px. */
const SPAWN_ABOVE = 60
/** Numbered inputs kept waiting at most; beyond that the oldest is dropped. */
const QUEUE_MAX = 3

export class Driver {
  /** The current bodies. Replaced whole by a Respawn or a change of kind; the Slots and Tools follow. */
  vehicle: Vehicle
  private handling: Handling
  private flip: FlipState = createFlipState()
  private readonly slots: Slots
  private readonly turn = new Turn()
  private held: HeldInput = NO_INPUT
  private queue: { seq: number; held: HeldInput }[] = []
  private ack = 0
  /** Rising edges seen since the last step (a press shorter than a step still counts). */
  private pressed = { jump: false, use: false }

  constructor(
    private readonly host: DriverHost,
    readonly id: number,
    x: number,
    spec: VehicleSpec,
  ) {
    this.vehicle = this.spawn(x, spec)
    this.handling = this.newHandling(spec)
    this.slots = new Slots((s) => this.vehicle.hitchLocal(s))
  }

  get chassisX(): number {
    return this.vehicle.chassisX
  }

  get kind(): VehicleKind {
    return this.vehicle.spec.kind
  }

  get flipped(): boolean {
    return this.flip.phase === 'flipped'
  }

  /** Upright and under control (a Rescuer must be). */
  get driving(): boolean {
    return this.flip.phase === 'driving'
  }

  // ---- input ----------------------------------------------------------------------------------

  /** A numbered input from a client; one is applied per step, in order. A backlog beyond QUEUE_MAX drops its oldest. */
  pushInput(seq: number, held: HeldInput): void {
    if (seq <= this.ack) return
    this.queue.push({ seq, held })
    while (this.queue.length > QUEUE_MAX) this.queue.shift()
  }

  /** An unnumbered input (tests): applied at the next step. */
  setInput(held: HeldInput): void {
    this.pushInput(this.ack + this.queue.length + 1, held)
  }

  /** Night: let go (a held gas would drive the car through the Night otherwise); the queue drops too. */
  releaseInputs(): void {
    this.held = NO_INPUT
    this.queue.length = 0
    this.pressed = { jump: false, use: false }
  }

  /** This step's input: the next queued one, else the last one held. Edges become one-shots. */
  private consumeInput(): void {
    const next = this.queue.shift()
    if (next === undefined) return
    if (next.held.jump && !this.held.jump) this.pressed.jump = true
    if (next.held.use && !this.held.use) this.pressed.use = true
    this.held = next.held
    this.ack = next.seq
  }

  // ---- the step -------------------------------------------------------------------------------

  /**
   * Before the physics step: this step's input, Handling, the Turn and the Slot controls. While
   * flipped the physics keeps stepping (the Vehicle settles) but nothing drives. Returns true when Use
   * was pressed this step (the World's context action).
   */
  drive(step: number): boolean {
    this.consumeInput()
    const input: InputFrame = { gas: this.held.gas, brake: this.held.brake, jump: this.pressed.jump, use: this.pressed.use }
    const use = this.pressed.use
    this.pressed = { jump: false, use: false }
    if (this.flip.phase === 'driving') {
      this.handling.step(input, this.vehicle)
      this.stepTurnAndSlots(step)
    }
    return use
  }

  /** The Turn's mid-point mirrors the Vehicle and swaps the end Slots; a Slot tap hitches or uses, a hold drops. */
  private stepTurnAndSlots(step: number): void {
    if (this.turn.step(this.held.turn, step) === 'mid') {
      this.vehicle.mirror(this.turn.facing)
      for (const { tool, slot } of this.slots.flip()) tool.rehitch(slot)
    }
    for (const { slot, ev } of this.slots.step(this.held.slots, step)) {
      const inSlot = this.slots.get(slot)
      if (ev === 'hold') {
        if (inSlot !== undefined) {
          this.slots.remove(slot)
          inSlot.drop()
        }
      } else if (inSlot !== undefined) inSlot.use(step)
      else {
        const hitch = this.slots.hitchWorld(slot, this.vehicle.bodies.chassis)
        const tool = this.host.parkedToolNear(hitch, this.host.config.TOOL.hitchReach)
        if (tool !== null) {
          tool.attach(this.id, this.vehicle, slot)
          this.slots.put(slot, tool)
        }
      }
    }
  }

  /**
   * After the physics step: the Wheel Box, contact, the Flip. `rescued`: another Driver passed within
   * Rescue range this step. A Flip ending (Rescue or the countdown) respawns in place.
   */
  settle(rescued: boolean): void {
    this.vehicle.clampTravel()
    const sense = this.vehicle.sense()
    const prev = this.flip.phase
    this.flip = flipStep(this.flip, { roofContact: sense.roofContact, rescued }, STEP_MS, this.host.config.FLIP)
    if (prev === 'flipped' && this.flip.phase === 'driving') this.respawn(this.chassisX)
  }

  // ---- lifecycle ------------------------------------------------------------------------------

  /** Upright at x with the same kind and facing; every hitched Tool falls off (the ropes held the old bodies). */
  respawn(x: number): void {
    this.dropTools()
    const spec = this.vehicle.spec
    this.vehicle.dispose()
    this.vehicle = this.spawn(x, spec)
    this.vehicle.mirror(this.turn.facing)
    this.handling.reset()
    this.flip = createFlipState()
  }

  /** Another kind in place (a Day's start, a rejoin): Tools drop, the seat's inputs and ack stay. */
  setVehicle(spec: VehicleSpec): void {
    if (this.vehicle.spec.kind === spec.kind) return
    const x = this.chassisX
    this.dropTools()
    this.vehicle.dispose()
    this.vehicle = this.spawn(x, spec)
    this.vehicle.mirror(this.turn.facing)
    this.handling = this.newHandling(spec)
    this.flip = createFlipState()
  }

  /** Every hitched Tool falls off. */
  dropTools(): void {
    for (const s of SLOT_IDS) this.slots.remove(s)?.drop()
  }

  /** A Tool that left the World (a spent Ramp) is in no Slot any more. */
  forget(tool: Tool): void {
    for (const s of SLOT_IDS) if (this.slots.get(s) === tool) this.slots.remove(s)
  }

  applyInertiaScale(scale: number): void {
    this.vehicle.applyInertiaScale(scale)
  }

  dispose(): void {
    this.dropTools()
    this.vehicle.dispose()
  }

  // ---- the wire -------------------------------------------------------------------------------

  /** The state message's Vehicle. */
  state(step: number): VehicleState {
    const { chassis, wheels } = this.vehicle.bodies
    const at = this.vehicle.wheelDrawPositions(this.handling.kick)
    // Wheels go out by side (left first), not by body: the Turn swaps the bodies' sides in one step, and by
    // side a symmetric vehicle's swap never shows on the wire (the client picks the drawn radius by facing).
    const left = this.vehicle.facing === 1 ? 0 : 1
    const right = 1 - left
    return {
      id: this.id,
      cx: chassis.position.x,
      cy: chassis.position.y,
      ca: chassis.angle,
      w: [
        [at[left]!.x, at[left]!.y, wheels[left]!.angle],
        [at[right]!.x, at[right]!.y, wheels[right]!.angle],
      ],
      s: [this.handling.lastSlip[left]!, this.handling.lastSlip[right]!],
      kick: this.handling.kick,
      f: this.turn.scale,
      k: this.vehicle.spec.kind,
      flipped: this.flipped,
      respawnS: this.flip.respawnRemaining,
      ack: this.ack,
      sim: this.snapshot(step),
    }
  }

  /** The full physical state, replayable (client-side prediction). */
  snapshot(step: number): SimState {
    return { ...this.vehicle.bodyStates(), h: this.handling.snapshot(), t: this.turn.snapshot(step) }
  }

  /** Snap to the server's state; the Flip phase follows the server's flag. */
  restore(sim: SimState, flipped: boolean, step: number): void {
    if (sim.c.length < 6) return
    this.vehicle.setBodyStates(sim.c, sim.w)
    this.handling.restore(sim.h)
    // The Turn too: the wheel positions above belong to the server's facing, so the facing (and the anchors) must match them.
    this.turn.restore(sim.t, step)
    this.vehicle.setFacing(this.turn.wheelFacing)
    if (flipped && this.flip.phase !== 'flipped') this.flip = { ...this.flip, phase: 'flipped', respawnRemaining: this.host.config.FLIP.flipRespawnS }
    else if (!flipped && this.flip.phase === 'flipped') this.flip = createFlipState()
  }

  private spawn(x: number, spec: VehicleSpec): Vehicle {
    return spawnVehicle(this.host.physics, this.host.config.HANDLING, x, this.host.surfaceYAt(x) - SPAWN_ABOVE, spec)
  }

  private newHandling(spec: VehicleSpec): Handling {
    return new Handling(
      this.host.config.HANDLING,
      this.host.physics.Body,
      (sx) => this.host.slopeAt(sx),
      (sx) => this.host.surfaceYAt(sx),
      spec,
    )
  }
}
