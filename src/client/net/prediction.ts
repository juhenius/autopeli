/**
 * Predictor: client-side prediction of the own Vehicle (ADR 0005 follow-up).
 * The client runs the same headless World the server runs, with only its own
 * Vehicle in it, one step per local fixed step, sending every input with a
 * sequence number. When the server's state arrives it carries the Vehicle's
 * full physical state and the last input sequence it applied: the local
 * Vehicle snaps to that state and the inputs the server has not seen yet are
 * replayed, so the drawn car stays where it will be, not where it was. The
 * position the correction moved the car by is kept as a visual error that
 * decays over a few frames, so a small correction is a nudge, not a jump.
 * Anything the local World lacks — other cars, Tools on a rope — shows up as
 * exactly such corrections.
 */
import type { VehicleKind } from '../../shared/sim/vehicles/spec'
import type { Config } from '../../shared/config'
import { World, type HeldInput } from '../../shared/sim/world'
import { wrapAngle } from './arrivals'
import type { VehicleState } from '../../shared/protocol'

const HISTORY_MAX = 240

export class Predictor {
  private readonly world: World
  private seq = 0
  private readonly history: { seq: number; held: HeldInput }[] = []
  /** Visual error offsets (drawn = predicted + error), per body, decaying per frame. */
  private err = { cx: 0, cy: 0, ca: 0, w: [[0, 0, 0], [0, 0, 0]] as [number[], number[]] }
  /** Last correction size, px (readout). */
  lastCorrectionPx = 0

  constructor(
    config: Config,
    seed: number,
    private readonly selfId: number,
    spawnX: number,
  ) {
    this.world = new World(config, seed, { tools: false })
    this.world.addDriver(selfId, spawnX)
  }

  /** The own vehicle changed kind (day start): rebuild it here too; the next reconcile snaps the state. */
  setVehicle(kind: VehicleKind): void {
    this.world.setVehicle(this.selfId, kind)
  }

  get lastSeq(): number {
    return this.seq
  }

  /** One local fixed step with this step's held input; returns the sequence number to send with it. */
  step(held: HeldInput): number {
    this.seq++
    this.history.push({ seq: this.seq, held })
    if (this.history.length > HISTORY_MAX) this.history.shift()
    this.world.pushInput(this.selfId, this.seq, held)
    this.world.step()
    return this.seq
  }

  /** The server's state for the own Vehicle arrived: snap, replay the unacknowledged inputs, keep the visual error. */
  reconcile(server: VehicleState, snapPx: number): void {
    const before = this.world.vehicleStates()[0]
    this.world.restoreSim(this.selfId, server.sim, server.flipped)
    while (this.history.length > 0 && this.history[0]!.seq <= server.ack) this.history.shift()
    for (const h of this.history) {
      this.world.pushInput(this.selfId, h.seq, h.held)
      this.world.step()
    }
    const after = this.world.vehicleStates()[0]
    if (before === undefined || after === undefined) return
    const dx = before.cx - after.cx
    const dy = before.cy - after.cy
    this.lastCorrectionPx = Math.hypot(dx, dy)
    if (this.lastCorrectionPx > snapPx) {
      this.err = { cx: 0, cy: 0, ca: 0, w: [[0, 0, 0], [0, 0, 0]] }
      return
    }
    const e = this.err
    e.cx += dx
    e.cy += dy
    e.ca += wrapAngle(before.ca - after.ca)
    // Each Wheel keeps its own error: the suspension re-settles after a snap and would twitch otherwise.
    for (const i of [0, 1] as const) {
      e.w[i][0]! += before.w[i][0] - after.w[i][0]
      e.w[i][1]! += before.w[i][1] - after.w[i][1]
      e.w[i][2]! += wrapAngle(before.w[i][2] - after.w[i][2])
    }
  }

  /** Per frame: the visual error decays toward zero. */
  decay(retain: number): void {
    const e = this.err
    e.cx *= retain
    e.cy *= retain
    e.ca *= retain
    for (const w of e.w) for (let k = 0; k < 3; k++) w[k]! *= retain
  }

  /** The drawn pose: the predicted state plus the decaying visual error. */
  pose(): VehicleState | null {
    const s = this.world.vehicleStates()[0]
    if (s === undefined) return null
    const e = this.err
    const off = (p: [number, number, number], i: 0 | 1): [number, number, number] => [p[0] + e.w[i][0]!, p[1] + e.w[i][1]!, p[2] + e.w[i][2]!]
    return { ...s, cx: s.cx + e.cx, cy: s.cy + e.cy, ca: s.ca + e.ca, w: [off(s.w[0], 0), off(s.w[1], 1)] }
  }

  dispose(): void {
    this.world.dispose()
  }
}
