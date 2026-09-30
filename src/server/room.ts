/**
 * The Room, pure of sockets and timers: membership and capacity, the Run the
 * members share (ADR 0004) and the World the server simulates for them
 * (ADR 0005), with every rule that spans the three — a join builds or joins
 * the World, a rejoin from the same device takes its Seat over, Day-start
 * and Night bring everyone home, lay the Pickups, bank and grow the Fields, a
 * rebuild dial keeps the Fields, the state stream and the pickup resend keep
 * their cadence. Every intent takes `now` (wall ms) where time matters and
 * returns what to send; `tick(now)` runs the fixed steps that fell due and
 * returns the state and Run snapshots that came out of them. One implicit
 * global Room: the first join creates its Run (seed picked here); when the
 * last Driver leaves the Run survives `emptyGraceMs` so a sleeping iPad can
 * come back to a solo Run, then the next join starts a fresh one.
 */
import { randomUUID } from 'node:crypto'
import { defaultColour } from '../shared/colours.ts'
import { createConfig, STEP_MS } from '../shared/config/index.ts'
import type { DriverInfo, FieldSnap, InputMsg, ServerMsg } from '../shared/protocol.ts'
import type { VehicleKind } from '../shared/sim/vehicles/spec.ts'
import { World } from '../shared/sim/world.ts'
import type { ServerConfig } from './config.ts'
import { Run } from './run.ts'

/** What the Room wants done outside: a message to some members, a socket closed, a line logged. */
export type Outbound = { kind: 'send'; to: number[]; msg: ServerMsg } | { kind: 'close'; to: number; reason: 'replaced' } | { kind: 'log'; line: string }

export type JoinResult = { ok: true; id: number; out: Outbound[] } | { ok: false; reason: 'room-full'; out: Outbound[] }

interface Member {
  name: string
  token: string
  colour: number
  vehicle: VehicleKind
}

/** Never catch up more than this many steps in one tick (a stall must not become a burst). */
const MAX_STEPS = 5
/** The pickup list rides along with every this-many-th state regardless of changes, so a late joiner gets it. */
const PICKUPS_EVERY = 60

export class Room {
  private nextId = 1
  private readonly members = new Map<number, Member>()
  private currentRun: Run | null = null
  private currentWorld: World | null = null
  private emptySince: number | null = null
  /** Dials set through `tune`, reapplied to every rebuilt World. */
  private readonly tuned = new Map<string, number>()
  private pickupsDirty = true
  private stateCount = 0
  private acc = 0
  private lastTick: number | null = null
  // Not parameter properties: Node strip-only mode can't erase those.
  private readonly cfg: ServerConfig
  private readonly stateEvery: number
  private readonly newSeed: () => number
  private readonly newToken: () => string

  constructor(cfg: ServerConfig, newSeed: () => number, newToken: () => string = () => randomUUID()) {
    this.cfg = cfg
    this.stateEvery = Math.max(1, Math.round(60 / cfg.stateHz))
    this.newSeed = newSeed
    this.newToken = newToken
  }

  get size(): number {
    return this.members.size
  }

  /** The Run in progress (null before the first join or after the grace expired). Test access. */
  get run(): Run | null {
    return this.currentRun
  }

  /** The World being stepped (null while there is no Run). Test access. */
  get world_(): World | null {
    return this.currentWorld
  }

  ids(): number[] {
    return [...this.members.keys()]
  }

  /**
   * A Driver joins: the first join (or one after the empty grace) creates the Run and its World; the same
   * device joining again takes its old Seat over; at capacity → room-full. A missing token or colour is
   * filled in here. The welcome goes to the new Driver, `joined` to the others, the Run snapshot to all.
   */
  join(name: string, token: string | null, colour: number | null, vehicle: VehicleKind, now: number): JoinResult {
    const out: Outbound[] = []
    const tok = token ?? this.newToken()
    const col = colour ?? defaultColour(tok)
    const replaced = [...this.members].find(([, m]) => m.token === tok)?.[0] ?? null
    if (replaced !== null) {
      // The same device again: its old Seat goes at once and its old socket is told why.
      this.drop(replaced, now)
      out.push({ kind: 'close', to: replaced, reason: 'replaced' })
      out.push(this.send(this.ids(), { t: 'left', id: replaced }))
      out.push({ kind: 'log', line: `[room] ${name}#${replaced} replaced by a rejoin` })
    }
    if (this.members.size >= this.cfg.maxDrivers) return { ok: false, reason: 'room-full', out }
    if (this.currentRun === null || this.graceExpired(now)) this.currentRun = new Run(this.newSeed() >>> 0, this.cfg)
    this.emptySince = null
    const run = this.currentRun
    const id = this.nextId++
    const roster = this.roster()
    this.members.set(id, { name, token: tok, colour: col, vehicle })
    run.addDriver(id, name, tok, col, vehicle)
    if (this.currentWorld === null || this.currentWorld.seed !== run.seed) this.buildWorld()
    else this.currentWorld.addDriver(id, this.currentWorld.freeSpotNear(run.farmhouseX, id), this.currentWorld.specFor(vehicle))
    const world = this.currentWorld!
    out.push(
      this.send([id], {
        t: 'welcome',
        id,
        seed: run.seed,
        drivers: roster,
        now,
        run: run.snapshot(world.fields.snaps()),
        tunables: [...this.tuned].map(([path, value]) => ({ path, value })),
      }),
    )
    out.push(this.send(this.others(id), { t: 'joined', id, name }))
    out.push(...this.runMsg(now))
    out.push({ kind: 'log', line: `[room] ${name}#${id} joined (${this.members.size}/${this.cfg.maxDrivers}), seed ${run.seed}` })
    return { ok: true, id, out }
  }

  /** A Driver's socket closed. A Seat already taken over by a rejoin is long gone: nothing happens. */
  leave(id: number, now: number): Outbound[] {
    const m = this.members.get(id)
    if (m === undefined) return []
    this.drop(id, now)
    return [
      this.send(this.ids(), { t: 'left', id }),
      ...this.runMsg(now),
      { kind: 'log', line: `[room] ${m.name}#${id} left (${this.members.size}/${this.cfg.maxDrivers})` },
    ]
  }

  /** A held input, numbered; applied at the next step. Dropped at Night (the overlay is up: no driving). */
  input(id: number, msg: InputMsg): void {
    if (!this.members.has(id) || this.currentRun === null || this.currentWorld === null) return
    if (this.currentRun.currentPhase !== 'day') return
    this.currentWorld.pushInput(id, msg.seq, msg)
  }

  /** The Vehicle for the next Day (a mid-Day rejoin uses the join's). */
  vehicle(id: number, kind: VehicleKind, now: number): Outbound[] {
    const m = this.members.get(id)
    if (m === undefined) return []
    m.vehicle = kind
    return this.currentRun?.setVehicle(id, kind) ? this.runMsg(now) : []
  }

  /** Ready on a choice ('go' at Night starts the Day). */
  ready(id: number, choice: string | null, now: number): Outbound[] {
    if (this.currentRun === null || !this.currentRun.ready(id, choice, now)) return []
    this.handleEvents()
    return this.runMsg(now)
  }

  /** A live dial from the tuning panel, for the whole Room; a rebuild-group dial rebuilds the World. */
  tune(path: string, value: number): Outbound[] {
    this.tuned.set(path, value)
    if (this.currentWorld?.applyTunable(path, value)) this.buildWorld()
    return []
  }

  /** The debug restart: the World rebuilt on the current seed. */
  restart(): Outbound[] {
    if (this.currentRun !== null) this.buildWorld()
    return []
  }

  /**
   * Wall time moved on: run the fixed steps that fell due (at most MAX_STEPS), route what the World
   * reports into the Run, let the Run see Sunset, and return the state broadcasts that came due plus a
   * Run snapshot if it changed. Without a Run or steps to run it still lets the Run see the clock and
   * the empty grace expire.
   */
  tick(now: number): Outbound[] {
    const out: Outbound[] = []
    if (this.lastTick === null) this.lastTick = now
    this.acc += Math.max(0, now - this.lastTick)
    this.lastTick = now
    let steps = Math.floor(this.acc / STEP_MS)
    if (steps > MAX_STEPS) {
      steps = MAX_STEPS
      this.acc = 0
    } else this.acc -= steps * STEP_MS
    const run = this.currentRun
    const world = this.currentWorld
    if (run === null || world === null || steps === 0) {
      if (run !== null && run.tick(now)) {
        this.handleEvents()
        out.push(...this.runMsg(now))
      }
      this.expire(now)
      return out
    }
    let runChanged = false
    for (let i = 0; i < steps; i++) {
      const { usePressed, cellsChanged, banked, pickupsChanged } = world.step()
      if (pickupsChanged) this.pickupsDirty = true
      for (const id of usePressed) if (run.usePressed(id, now)) runChanged = true
      if (cellsChanged) runChanged = true
      if (banked > 0) {
        run.bank(banked)
        runChanged = true
      }
      if (world.step_ % this.stateEvery === 0) out.push(this.stateMsg(now))
    }
    if (run.updateDrivers(world.driverIds().map((id) => ({ id, x: world.chassisX(id), flipped: world.isFlipped(id) })))) runChanged = true
    if (run.tick(now)) runChanged = true
    if (runChanged) {
      this.handleEvents()
      out.push(...this.runMsg(now))
    }
    this.expire(now)
    return out
  }

  // ---- inside ---------------------------------------------------------------------------------

  private send(to: number[], msg: ServerMsg): Outbound {
    return { kind: 'send', to, msg }
  }

  private others(id: number): number[] {
    return this.ids().filter((m) => m !== id)
  }

  private roster(): DriverInfo[] {
    return [...this.members].map(([id, m]) => ({ id, name: m.name }))
  }

  private runMsg(now: number): Outbound[] {
    const run = this.currentRun
    if (run === null) return []
    return [this.send(this.ids(), { t: 'run', now, run: run.snapshot(this.currentWorld?.fields.snaps() ?? []) })]
  }

  private stateMsg(now: number): Outbound {
    const w = this.currentWorld!
    this.stateCount++
    const withPickups = this.pickupsDirty || this.stateCount % PICKUPS_EVERY === 0
    this.pickupsDirty = false
    return this.send(this.ids(), {
      t: 'state',
      now,
      step: w.step_,
      vehicles: w.vehicleStates(),
      tools: w.toolStates(),
      produce: w.produceStates(),
      ramps: w.ramps,
      pickups: withPickups ? w.pickupStates() : null,
      stocks: [w.stocks.seed, w.stocks.water],
    })
  }

  private drop(id: number, now: number): void {
    if (!this.members.delete(id)) return
    this.currentRun?.removeDriver(id)
    this.currentWorld?.removeDriver(id)
    if (this.members.size === 0) this.emptySince = now
  }

  private graceExpired(now: number): boolean {
    return this.members.size === 0 && this.emptySince !== null && now - this.emptySince >= this.cfg.emptyGraceMs
  }

  /** Nobody for the whole grace: the Run and its World go; the next join starts fresh. */
  private expire(now: number): void {
    if (!this.graceExpired(now)) return
    this.currentRun = null
    this.emptySince = null
    this.currentWorld?.dispose()
    this.currentWorld = null
  }

  /** A World for the current Run's seed with every member spawned. A rebuild keeps the Fields and everyone's x; a new Run starts them over. The tuned dials apply to every World. */
  private buildWorld(): void {
    const run = this.currentRun
    if (run === null) return
    const keepX = new Map<number, number>()
    let cells: FieldSnap[] = []
    const old = this.currentWorld
    if (old !== null) {
      for (const id of old.driverIds()) keepX.set(id, old.chassisX(id))
      if (old.seed === run.seed) cells = old.fields.snaps()
      old.dispose()
    }
    const world = new World(createConfig(), run.seed)
    world.fields.restore(cells)
    for (const [path, value] of this.tuned) world.applyTunable(path, value)
    for (const [id, m] of this.members) world.addDriver(id, keepX.get(id) ?? world.freeSpotNear(run.farmhouseX, id), world.specFor(m.vehicle))
    this.currentWorld = world
  }

  /** Sunset or an early end: every Driver home, upright, on a free spot. */
  private everyoneHome(): void {
    const run = this.currentRun
    const world = this.currentWorld
    if (run === null || world === null) return
    for (const id of this.members.keys()) world.respawn(id, world.freeSpotNear(run.farmhouseX, id))
  }

  /** What the Run says happens now: the Day's start and the Night, in the World. */
  private handleEvents(): void {
    const run = this.currentRun
    const world = this.currentWorld
    if (run === null) return
    for (const ev of run.takeEvents()) {
      if (ev === 'day-start') {
        // Everyone gets the Vehicle they chose at Night, then a spot at home, then the Day's Pickups.
        for (const [id, m] of this.members) world?.setVehicle(id, m.vehicle)
        this.everyoneHome()
        world?.layPickups(run.currentDay)
        this.pickupsDirty = true
      } else {
        // Bank where everyone stopped, bring them home, let go of every pad, let the Fields grow.
        if (world !== null) run.bank(world.bank(run.farmhouseX, this.cfg.farmhouseZonePx))
        this.everyoneHome()
        world?.releaseInputs()
        world?.fields.grow()
      }
    }
  }
}
