/**
 * The Run state machine (ADR 0004): Days and Nights, Ready, the Drivers'
 * roster and the Score. Pure of sockets,
 * timers and physics: every method takes `now` where time matters and
 * returns whether the snapshot changed; the World reports positions in.
 * Events the server must act on (bring everyone home, rebuild the world) are
 * queued and drained with `takeEvents()`.
 */
import type { FarmDayInfo, FarmDriverSnap, FarmPhase, FarmSnapshot, FieldSnap } from '../shared/protocol.ts'
import type { ServerConfig } from './config.ts'
import { FARMHOUSE_X } from './strip.ts'
import type { VehicleKind } from '../shared/sim/vehicles/spec.ts'

export interface DriverRec {
  id: number
  name: string
  /** The device, so a rejoin (even under a new name) gets this record back. */
  token: string
  /** Index into DRIVER_COLOURS. */
  colour: number
  vehicle: VehicleKind
  connected: boolean
  ready: string | null
  x: number
  flipped: boolean
  home: boolean
}

/** What the server does when the Run says so. */
export type RunEvent = 'day-start' | 'night'

export class Run {
  readonly seed: number
  private readonly cfg: ServerConfig
  private phase: FarmPhase = 'night'
  private day = 0
  private dayInfo: FarmDayInfo | null = null
  private readonly drivers = new Map<number, DriverRec>()
  private events: RunEvent[] = []
  /** Produce banked this Run. */
  private score = 0

  constructor(seed: number, cfg: ServerConfig) {
    this.seed = seed >>> 0
    this.cfg = cfg
  }

  get currentPhase(): FarmPhase {
    return this.phase
  }

  get currentDay(): number {
    return this.day
  }

  get farmhouseX(): number {
    return FARMHOUSE_X
  }

  takeEvents(): RunEvent[] {
    const out = this.events
    this.events = []
    return out
  }

  /** A joining Driver; the same device rejoining during a Run gets its record back, under its current name. */
  addDriver(id: number, name: string, token: string = name, colour = 0, vehicle: VehicleKind = 'car'): void {
    for (const [oldId, d] of this.drivers) {
      if (!d.connected && d.token === token) {
        this.drivers.delete(oldId)
        this.drivers.set(id, { ...d, id, name, colour, vehicle, connected: true, ready: null })
        return
      }
    }
    this.drivers.set(id, { id, name, token, colour, vehicle, connected: true, ready: null, x: FARMHOUSE_X, flipped: false, home: true })
  }

  setVehicle(id: number, vehicle: VehicleKind): boolean {
    const d = this.drivers.get(id)
    if (d === undefined || d.vehicle === vehicle) return false
    d.vehicle = vehicle
    return true
  }

  vehicleOf(id: number): VehicleKind {
    return this.drivers.get(id)?.vehicle ?? 'car'
  }

  removeDriver(id: number): void {
    const d = this.drivers.get(id)
    if (d === undefined) return
    d.connected = false
    d.ready = null
  }

  private connected(): DriverRec[] {
    return [...this.drivers.values()].filter((d) => d.connected)
  }

  private allReady(choice: string): boolean {
    const c = this.connected()
    return c.length > 0 && c.every((d) => d.ready === choice)
  }

  /** Ready on a choice: 'go' starts the next Day from a Night. */
  ready(id: number, choice: string | null, now: number): boolean {
    const d = this.drivers.get(id)
    if (d === undefined || !d.connected) return false
    d.ready = choice
    if (this.phase === 'night' && this.allReady('go')) this.startDay(now)
    return true
  }

  /** Use pressed by a Driver: at home during a Day it is Ready 'home'; everyone home and Ready ends the Day early. */
  usePressed(id: number, now: number): boolean {
    const d = this.drivers.get(id)
    if (d === undefined || !d.connected || this.phase !== 'day' || !d.home) return false
    d.ready = 'home'
    if (this.allReady('home')) this.endDay(now)
    return true
  }

  /** Positions from the World, once per tick. Leaving the Farmhouse zone clears a 'home' Ready. */
  updateDrivers(positions: { id: number; x: number; flipped: boolean }[]): boolean {
    let changed = false
    for (const p of positions) {
      const d = this.drivers.get(p.id)
      if (d === undefined) continue
      const home = Math.abs(p.x - FARMHOUSE_X) <= this.cfg.farmhouseZonePx
      if (d.home !== home || d.flipped !== p.flipped) changed = true
      if (!home && d.ready === 'home') {
        d.ready = null
        changed = true
      }
      d.x = p.x
      d.flipped = p.flipped
      d.home = home
    }
    return changed
  }

  /** Sunset ends a Day. */
  tick(now: number): boolean {
    if (this.phase === 'day' && this.dayInfo !== null && now >= this.dayInfo.end) {
      this.endDay(now)
      return true
    }
    return false
  }

  /** Daylight 1 until duskFraction of the Day remains, then a linear fade to 0 at Sunset. The sky follows it; the motor no longer does. */
  daylight(now: number): number {
    if (this.phase !== 'day' || this.dayInfo === null) return 1
    const { start, end } = this.dayInfo
    const remaining = (end - now) / (end - start)
    if (remaining >= this.cfg.duskFraction) return 1
    return Math.max(0, remaining / this.cfg.duskFraction)
  }

  private startDay(now: number): void {
    this.day++
    this.phase = 'day'
    this.dayInfo = { start: now, end: now + this.cfg.dayLengthMs, duskMs: this.cfg.dayLengthMs * this.cfg.duskFraction }
    // Whoever left is off the roster from the next Day (a rejoin starts a fresh record).
    for (const [id, d] of this.drivers) if (!d.connected) this.drivers.delete(id)
    for (const d of this.drivers.values()) d.ready = null
    this.events.push('day-start')
  }

  private endDay(now: number): void {
    void now
    this.dayInfo = null
    this.phase = 'night' // the Days go on
    for (const d of this.drivers.values()) d.ready = null
    this.events.push('night')
  }

  /** Produce banked at a Night (the World counted it). */
  bank(n: number): void {
    this.score += n
  }

  /** The Fields live in the World (sim state); the server hands them in. */
  snapshot(fields: FieldSnap[] = []): FarmSnapshot {
    const drivers: FarmDriverSnap[] = [...this.drivers.values()].map(({ token: _token, ...d }) => ({ ...d }))
    return {
      phase: this.phase,
      seed: this.seed,
      day: this.day,
      dayInfo: this.dayInfo === null ? null : { ...this.dayInfo },
      drivers,
      fields,
      farmhouseX: FARMHOUSE_X,
      score: this.score,
    }
  }
}
