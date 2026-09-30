/**
 * Roster: the Room as this client draws it. It takes the server's messages
 * (the welcome, who joined and left, the Run snapshot, every state) and
 * answers the drawn pose of any Driver right now — the own one predicted
 * when prediction is on — plus names, colours and the edge labels for a
 * camera window. It owns each Driver's arrival buffer and drawing (made
 * through the factory it is given, so a test passes a fake) and the
 * predictor's lifecycle: made on the first own state, dropped when
 * prediction is switched off, and a drawing rebuilt when a Driver's Vehicle
 * changes kind. No Phaser.
 */
import { colourOf } from '../shared/colours'
import type { Config } from '../shared/config'
import type { DriverInfo, FarmSnapshot, VehicleState } from '../shared/protocol'
import { isVehicleKind, specOf } from '../shared/sim/vehicles/index'
import type { VehicleKind, VehicleSpec } from '../shared/sim/vehicles/spec'
import type { HeldInput } from '../shared/sim/world'
import type { DriverLabel } from './hud'
import type { StateMsg } from './net/client'
import { PoseInterpolator } from './net/interpolator'
import { Predictor } from './net/prediction'

/** What a drawn Vehicle can be told (VehicleGfx is one). */
export interface VehicleDrawing {
  setChassisPose(x: number, y: number, rotation: number): void
  setWheelPose(side: 0 | 1, x: number, y: number, rotation: number): void
  setFacing(scaleX: number): void
  setName(name: string): void
  setColour(hex: string): void
  setAlpha(alpha: number): void
  setVisible(visible: boolean): void
  spray(wheels: { x: number; y: number }[], slip: [number, number], min: number): void
  destroy(): void
}

interface Drawn {
  kind: VehicleKind
  gfx: VehicleDrawing
  interp: PoseInterpolator
}

export class Roster {
  private selfId: number | null = null
  private ownName = ''
  private seed = 0
  private readonly names = new Map<number, string>()
  private readonly colours = new Map<number, number>()
  private readonly vehicles = new Map<number, Drawn>()
  private predictor: Predictor | null = null
  private inputSeq = 0

  constructor(
    private readonly config: Config,
    private readonly makeGfx: (spec: VehicleSpec) => VehicleDrawing,
  ) {}

  get size(): number {
    return this.vehicles.size
  }

  get self(): number | null {
    return this.selfId
  }

  // ---- the server's messages -------------------------------------------------------------------

  welcome(selfId: number, ownName: string, drivers: DriverInfo[]): void {
    this.selfId = selfId
    this.ownName = ownName
    this.names.clear()
    for (const d of drivers) this.names.set(d.id, d.name)
    this.names.set(selfId, ownName)
    this.inputSeq = 0
  }

  joined(d: DriverInfo): void {
    this.names.set(d.id, d.name)
  }

  left(id: number): void {
    this.drop(id)
  }

  run(snap: FarmSnapshot): void {
    for (const d of snap.drivers) {
      this.names.set(d.id, d.name)
      this.colours.set(d.id, d.colour)
    }
  }

  /** A new Run's seed: every drawn thing starts over. */
  newRun(seed: number): void {
    this.seed = seed
    this.predictor?.dispose()
    this.predictor = null
    this.clear()
  }

  /** Nothing is drawn (this client was replaced, or the socket closed). */
  clear(): void {
    for (const id of [...this.vehicles.keys()]) this.drop(id)
  }

  state(msg: StateMsg, now: number): void {
    for (const v of msg.vehicles) {
      let d = this.vehicles.get(v.id)
      const kind = isVehicleKind(v.k) ? v.k : 'car'
      if (d !== undefined && d.kind !== kind) {
        // A new Vehicle at a Day's start: fresh drawing, fresh interpolation.
        this.drop(v.id)
        d = undefined
      }
      if (d === undefined) {
        d = { kind, gfx: this.makeGfx(specOf(kind, this.config)), interp: new PoseInterpolator(now) }
        d.gfx.setVisible(false)
        this.vehicles.set(v.id, d)
      }
      d.interp.push(v, now)
      if (v.id === this.selfId && this.config.NET.predict >= 1) {
        if (this.predictor === null) this.predictor = new Predictor(this.config, this.seed, v.id, v.cx)
        this.predictor.setVehicle(kind)
        this.predictor.reconcile(v, this.config.NET.snapPx)
      }
    }
  }

  // ---- the own input ------------------------------------------------------------------------

  /** One local step with this input: predicted when prediction is on; returns the sequence number to send. */
  step(held: HeldInput): number {
    if (this.config.NET.predict < 1 && this.predictor !== null) {
      this.predictor.dispose()
      this.predictor = null
    }
    return this.predictor !== null ? this.predictor.step(held) : ++this.inputSeq
  }

  /** Per frame: the prediction's visual error decays. */
  decay(): void {
    this.predictor?.decay(this.config.NET.smoothing)
  }

  // ---- poses -----------------------------------------------------------------------------------

  /** The own Vehicle's drawn pose: predicted when prediction is on, else interpolated like the others. */
  own(now: number): VehicleState | null {
    if (this.selfId === null) return null
    const predicted = this.predictor?.pose() ?? null
    if (predicted !== null) return predicted
    return this.vehicles.get(this.selfId)?.interp.sample(now, this.config.NET.interpDelayMs, this.config.NET.fadeAfterMs)?.sample ?? null
  }

  /** The newest state of a Driver, the truth rather than the drawn pose. */
  latest(id: number): VehicleState | null {
    return this.vehicles.get(id)?.interp.latest ?? null
  }

  /** Draw every Vehicle for this frame; returns the drawn poses by Driver. */
  draw(now: number): [number, VehicleState][] {
    const { interpDelayMs, fadeAfterMs } = this.config.NET
    const drawn: [number, VehicleState][] = []
    for (const [id, d] of this.vehicles) {
      const predicted = id === this.selfId && this.predictor !== null ? this.predictor.pose() : null
      const s = predicted !== null ? { sample: predicted, opacity: 1 } : d.interp.sample(now, interpDelayMs, fadeAfterMs)
      if (s === null) {
        d.gfx.setVisible(false)
        continue
      }
      const p = s.sample
      d.gfx.setChassisPose(p.cx, p.cy, p.ca)
      d.gfx.setFacing(p.f)
      d.gfx.setWheelPose(0, p.w[0][0], p.w[0][1], p.w[0][2])
      d.gfx.setWheelPose(1, p.w[1][0], p.w[1][1], p.w[1][2])
      d.gfx.setName(this.names.get(id) ?? '')
      d.gfx.setColour(colourOf(this.colours.get(id) ?? 0))
      d.gfx.setAlpha((id === this.selfId ? 1 : 0.9) * s.opacity)
      d.gfx.setVisible(true)
      drawn.push([id, p])
      if (!p.flipped) {
        d.gfx.spray(
          [
            { x: p.w[0][0], y: p.w[0][1] },
            { x: p.w[1][0], y: p.w[1][1] },
          ],
          p.s,
          this.config.HANDLING.slipFxMin,
        )
      }
    }
    return drawn
  }

  /** The other Drivers outside the camera window [x0, x1], as edge labels. */
  labels(x0: number, x1: number): DriverLabel[] {
    const out: DriverLabel[] = []
    for (const [id, d] of this.vehicles) {
      if (id === this.selfId) continue
      const p = d.interp.latest
      const name = this.names.get(id)
      if (p === null || name === undefined) continue
      if (p.cx > x1) out.push({ name, side: 'right' })
      else if (p.cx < x0) out.push({ name, side: 'left' })
    }
    return out
  }

  predictionReadout(): string {
    return this.predictor === null ? 'prediction off' : `prediction on · last correction ${this.predictor.lastCorrectionPx.toFixed(1)} px · seq ${this.predictor.lastSeq}`
  }

  private drop(id: number): void {
    const v = this.vehicles.get(id)
    if (v === undefined) return
    v.gfx.destroy()
    this.vehicles.delete(id)
    this.names.delete(id)
  }
}
