/**
 * World: one Room's whole simulation, headless. The Terrain, every Driver
 * (its Vehicle and what drives it), the Tools, the Fields, the Pickups and
 * the Produce, in one Physics; the rules that span Drivers (a Rescue, a
 * hitch) and the world's own bookkeeping live here. Stepped at the fixed rate by the server; snapshots are what
 * clients draw. No Phaser, no sockets, no timers: `step()` is the only clock.
 */
import { STEP_MS, type Config } from '../config/index.ts'
import type { PickupState, ProduceState, RampState, SimState, ToolState, VehicleState } from '../protocol.ts'
import { TUNABLES } from '../config/tunables.ts'
import { Driver, type DriverHost, type HeldInput } from './driver.ts'
import { Physics, type Body } from './physics.ts'
import { Fields } from './fields.ts'
import { inPlaceZone, STRIP, stripCrestFree, stripFlats, FARMHOUSE_X } from './strip.ts'
import { layUntil, PICKUP_AHEAD_PX, PICKUP_RANGE_PX, startCursor, type Pickup, type PickupCursor } from './pickups.ts'
import { hash01 } from './track/index.ts'
import { TOOL_KINDS, type ToolKind } from './tools/kinds.ts'
import { Tool, type Pt, type ToolHost } from './tools/tool.ts'
import { BASE_Y, TerrainBodies } from './terrain.ts'
import { createTrack, type Track } from './track/index.ts'
import { specOf } from './vehicles/index.ts'
import { carSpec, type VehicleKind, type VehicleSpec } from './vehicles/spec.ts'

/** Held controls as the client sends them; the World edge-detects the one-shots. */
export { NO_INPUT, type HeldInput } from './driver.ts'

export class World implements ToolHost, DriverHost {
  readonly physics: Physics
  readonly track: Track
  readonly terrain: TerrainBodies
  readonly tools: Tool[] = []
  /** Produce bodies on the ground, by id. */
  readonly produce = new Map<number, Body>()
  /** Deployed ramps: static wedges that stay for the Run. */
  readonly ramps: RampState[] = []
  /** The stores: seeds in the Barn, water in the Well, fed by pickups and drained by tools. */
  readonly stocks = { seed: 0, water: 0 }
  /** This Day's pickups still on the ground, by id. */
  readonly pickups = new Map<number, Pickup>()
  private pickupsChanged = false
  private pickupDay = 0
  private pickupIds = { next: 1 }
  private pickupCursors: [PickupCursor, PickupCursor] | null = null
  private nextToolId = 1
  /** Where the next scattered upgrade Tool (rockets or a ramp) goes, per direction; empty in a World without Tools. */
  private readonly upgradeCursors: { dir: 1 | -1; n: number; x: number }[] = []
  private nextProduceId = 1
  /** The Fields' Cells: sim state, copied across a rebuild. */
  readonly fields = new Fields()
  private readonly drivers = new Map<number, Driver>()
  private stepCount = 0

  constructor(
    readonly config: Config,
    readonly seed: number,
    options: { tools?: boolean } = {},
  ) {
    this.physics = new Physics(config.HANDLING.gravityY)
    this.track = createTrack(config.TRACK, stripFlats(), stripCrestFree())
    this.terrain = new TerrainBodies(this.physics, config, this.track, seed)
    // No walls: the hills run on past the Places for anyone who wants to just drive (the Terrain streams anywhere).
    this.stocks.seed = config.TOOL.seedStock0
    this.stocks.water = config.TOOL.waterStock0
    // The Tools park in front of the Barn (a predicting client's World has none).
    if (options.tools !== false) {
      this.terrain.stream(STRIP.toolParkX)
      TOOL_KINDS.forEach((kind, i) => this.tools.push(new Tool(this, this.nextToolId++, kind, STRIP.toolParkX - i * 90)))
      for (const dir of [-1, 1] as const) this.upgradeCursors.push({ dir, n: 0, x: FARMHOUSE_X + dir * this.upgradeGap(dir, 0) })
    }
  }

  get step_(): number {
    return this.stepCount
  }

  surfaceYAt(x: number): number {
    return BASE_Y - this.track.surfaceHeight(this.seed, x)
  }

  /** DriverHost: the ground slope dy/dx at x (the slip tangent's source). */
  slopeAt(x: number): number {
    const d = 4
    return -(this.track.surfaceHeight(this.seed, x + d) - this.track.surfaceHeight(this.seed, x - d)) / (2 * d)
  }

  /** Spawn a Driver's Vehicle upright on the surface at x (replacing any existing one). */
  addDriver(id: number, x: number, spec: VehicleSpec = carSpec(this.config.HANDLING)): void {
    this.removeDriver(id)
    this.terrain.stream(x, this.anchorXs())
    this.drivers.set(id, new Driver(this, id, x, spec))
  }

  removeDriver(id: number): void {
    const d = this.drivers.get(id)
    if (d === undefined) return
    d.dispose()
    this.drivers.delete(id)
  }

  /** DriverHost: the parked Tool whose Ring is nearest to p within reach, or null. */
  parkedToolNear(p: Pt, reach: number): Tool | null {
    let best: Tool | null = null
    let bestD = reach
    for (const t of this.tools) {
      if (!t.parked) continue
      const dd = Math.hypot(t.x - p.x, t.y - p.y)
      if (dd <= bestD) {
        best = t
        bestD = dd
      }
    }
    return best
  }

  /** ToolHost: inside the zone of the Barn or the Well. */
  inZone(kind: 'barn' | 'well', x: number): boolean {
    return inPlaceZone(kind, x)
  }

  /** ToolHost: take up to n from a store. */
  takeStock(kind: 'seed' | 'water', n: number): number {
    const got = Math.max(0, Math.min(n, Math.floor(this.stocks[kind])))
    this.stocks[kind] -= got
    return got
  }

  /** A new Day's pickups replace whatever was left; the first lay reaches PICKUP_RANGE_PX, more follows the cars. */
  layPickups(day: number): void {
    this.pickups.clear()
    this.pickupDay = day
    this.pickupIds = { next: 1 }
    this.pickupCursors = [startCursor(-1, this.config), startCursor(1, this.config)]
    this.layPickupsUntil(PICKUP_RANGE_PX)
  }

  /** Lay clusters in both directions out to |x − home| = untilPx (no-op where already laid). */
  private layPickupsUntil(untilPx: number): void {
    for (const cursor of this.pickupCursors ?? []) {
      for (const p of layUntil(this.seed, this.pickupDay, this.config, cursor, untilPx, this.pickupIds)) {
        this.pickups.set(p.id, p)
        this.pickupsChanged = true
      }
    }
  }

  /** The hills never run out: pickups and upgrade Tools get laid ahead of the furthest car. */
  private extendHills(): void {
    let furthest = 0
    for (const d of this.drivers.values()) furthest = Math.max(furthest, Math.abs(d.vehicle.chassisX - FARMHOUSE_X))
    if (this.pickupCursors !== null) {
      for (const cursor of this.pickupCursors) {
        if (Math.abs(cursor.x - FARMHOUSE_X) < furthest + PICKUP_AHEAD_PX) this.layPickupsUntil(furthest + 2 * PICKUP_AHEAD_PX)
      }
    }
    for (const c of this.upgradeCursors) {
      while (Math.abs(c.x - FARMHOUSE_X) < furthest + PICKUP_AHEAD_PX) {
        // Rockets and ramps alternate, the two directions out of phase, so the first find each way differs.
        const kind: ToolKind = (c.n + (c.dir === 1 ? 0 : 1)) % 2 === 0 ? 'rockets' : 'ramp'
        this.tools.push(new Tool(this, this.nextToolId++, kind, Math.round(c.x)))
        c.n++
        c.x += c.dir * this.upgradeGap(c.dir, c.n)
      }
    }
  }

  /** Spacing between scattered upgrade Tools: upgradeEveryPx ± 20 %, seeded per Run. */
  private upgradeGap(dir: 1 | -1, n: number): number {
    return this.config.TOOL.upgradeEveryPx * (0.8 + 0.4 * hash01(this.seed, n * 2 + (dir === 1 ? 1 : 0) + 7_000_000))
  }

  pickupStates(): PickupState[] {
    return [...this.pickups.values()].map((p) => ({ id: p.id, k: p.kind, x: p.x }))
  }

  /** Any car driving through a pickup takes it into its store on the spot. */
  private collectPickups(): void {
    if (this.pickups.size === 0) return
    const r = this.config.TOOL.pickupRadiusPx
    for (const d of this.drivers.values()) {
      const c = d.vehicle.bodies.chassis.position
      for (const [id, p] of this.pickups) {
        if (Math.abs(p.x - c.x) > r) continue
        const py = this.surfaceYAt(p.x) - 14
        if (Math.abs(py - c.y) > r + 30) continue
        this.pickups.delete(id)
        this.stocks[p.kind]++
        this.pickupsChanged = true
      }
    }
  }

  /** ToolHost: the harvester drops a Produce body here. */
  spawnProduce(x: number, y: number): void {
    const p = this.config.TOOL
    const id = this.nextProduceId++
    this.produce.set(id, this.physics.circle(x, y, p.produceRadius, { density: p.produceDensity, friction: 0.5, frictionAir: 0.01, restitution: 0.1, label: `produce-${id}` }))
  }

  /** ToolHost: the Box takes the nearest Produce within reach. */
  takeProduceNear(x: number, y: number, reach: number): boolean {
    let best: number | null = null
    let bestD = reach
    for (const [id, b] of this.produce) {
      const d = Math.hypot(b.position.x - x, b.position.y - y)
      if (d <= bestD) {
        best = id
        bestD = d
      }
    }
    if (best === null) return false
    this.physics.remove(this.produce.get(best)!)
    this.produce.delete(best)
    return true
  }

  /** ToolHost: plant a static wedge with its low end on the ground at x, rising toward `facing`. */
  deployRamp(x: number, facing: 1 | -1): void {
    const p = this.config.TOOL
    const a = (p.rampAngleDeg * Math.PI) / 180
    const y0 = this.surfaceYAt(x) + 2
    const run = facing * p.rampLength * Math.cos(a)
    const rise = p.rampLength * Math.sin(a)
    const verts = [
      { x, y: y0 },
      { x: x + run, y: y0 },
      { x: x + run, y: y0 - rise },
    ]
    const cx = (verts[0]!.x + verts[1]!.x + verts[2]!.x) / 3
    const cy = (verts[0]!.y + verts[1]!.y + verts[2]!.y) / 3
    this.physics.fromVertices(cx, cy, verts, { isStatic: true, friction: this.config.HANDLING.terrainFriction, label: 'terrain-ramp' })
    this.ramps.push({ x, y: y0, len: p.rampLength, angle: facing * a })
  }

  /** ToolHost: one Produce body's mass. */
  produceMass(): number {
    const p = this.config.TOOL
    return Math.PI * p.produceRadius * p.produceRadius * p.produceDensity
  }

  /** Night: every Box inside the Farmhouse zone banks its load and empties (usually already done by driving past); loose Produce in the zone banks too. Returns the count. */
  bank(zoneX: number, zonePx: number): number {
    let n = 0
    for (const t of this.tools) {
      if (t.kind !== 'box' || Math.abs(t.x - zoneX) > zonePx) continue
      n += t.load
      t.setLoad(0)
    }
    for (const [id, b] of [...this.produce]) {
      if (Math.abs(b.position.x - zoneX) > zonePx) continue
      this.physics.remove(b)
      this.produce.delete(id)
      n++
    }
    return n
  }

  produceStates(): ProduceState[] {
    return [...this.produce].map(([id, b]) => ({ id, x: b.position.x, y: b.position.y, a: b.angle }))
  }

  /** A Night: watered sown cells sprout and watered sprouting cells ripen; every watered flag clears. */
  /** Test access to a Driver. */
  drivers_(id: number): Driver {
    return this.drivers.get(id)!
  }

  driverIds(): number[] {
    return [...this.drivers.keys()]
  }

  /** Respawn upright at x (Sunset brings everyone home; a Flip respawns in place). */
  respawn(id: number, x: number): void {
    this.drivers.get(id)?.respawn(x)
  }

  /** The spec for a kind under this World's config (the panel's numbers). */
  specFor(kind: VehicleKind): VehicleSpec {
    return specOf(kind, this.config)
  }

  /** Swap a Driver into another vehicle kind in place (day start, or a rejoin): tools drop, the seat's inputs and ack stay. */
  setVehicle(id: number, kind: VehicleKind): void {
    this.drivers.get(id)?.setVehicle(this.specFor(kind))
  }

  vehicleKind(id: number): VehicleKind | null {
    return this.drivers.get(id)?.kind ?? null
  }

  /** A free spawn x near `x`: the first slot to the right not within `gap` of another Driver's Vehicle. */
  freeSpotNear(x: number, forId: number | null = null, gap = 160): number {
    const xs = [...this.drivers.values()].filter((d) => d.id !== forId).map((d) => d.chassisX)
    let sx = x
    for (let i = 0; i < 12; i++) {
      if (!xs.some((ox) => Math.abs(ox - sx) < gap)) return sx
      sx += gap
    }
    return sx
  }

  /** Night: every Driver lets go (a held gas would drive the car through the Night otherwise); queues drop too. */
  releaseInputs(): void {
    for (const d of this.drivers.values()) d.releaseInputs()
  }

  /** An unnumbered input (tests): applied at the next step. */
  setInput(id: number, held: HeldInput): void {
    this.drivers.get(id)?.setInput(held)
  }

  /** A numbered input from a client; one is applied per step, in order. */
  pushInput(id: number, seq: number, held: HeldInput): void {
    this.drivers.get(id)?.pushInput(seq, held)
  }

  /** The Vehicle's full physical state (client-side prediction). */
  simOf(id: number): SimState {
    return this.drivers.get(id)?.snapshot(this.stepCount) ?? { c: [], w: [[], []], h: [], t: [] }
  }

  /** Snap the Vehicle to the server's state; the Flip phase follows the server's flag. */
  restoreSim(id: number, sim: SimState, flipped: boolean): void {
    this.drivers.get(id)?.restore(sim, flipped, this.stepCount)
  }

  chassisX(id: number): number {
    return this.drivers.get(id)?.chassisX ?? 0
  }

  isFlipped(id: number): boolean {
    return this.drivers.get(id)?.flipped === true
  }

  /** x of every Vehicle, parked Tool and Produce: the terrain streams around them all (chunks dedupe). */
  private anchorXs(): number[] {
    return [
      ...[...this.drivers.values()].map((d) => d.chassisX),
      ...this.tools.filter((t) => t.parked).map((t) => t.x),
      ...[...this.produce.values()].map((b) => b.position.x),
    ]
  }

  /**
   * One fixed step. Returns the ids whose Use was pressed this step (the server's context action:
   * the early end of a Day at the Farmhouse).
   */
  step(): { usePressed: number[]; cellsChanged: boolean; banked: number; pickupsChanged: boolean } {
    const usePressed: number[] = []
    const FLIP = this.config.FLIP
    this.pickupsChanged = false
    this.extendHills()
    this.collectPickups()
    // A Box empties the moment it is inside the Farmhouse zone: driving past home banks it.
    let banked = 0
    for (const t of this.tools) {
      if (t.kind !== 'box' || t.load === 0 || !inPlaceZone('farmhouse', t.x)) continue
      banked += t.load
      t.setLoad(0)
    }
    const drivers = [...this.drivers.values()]
    for (const d of drivers) if (d.drive(this.stepCount)) usePressed.push(d.id)
    for (const t of this.tools) t.step(this.stepCount)
    // A spent ramp Tool leaves the world.
    for (const t of [...this.tools]) {
      if (!t.spent) continue
      for (const d of drivers) d.forget(t)
      t.dispose()
      this.tools.splice(this.tools.indexOf(t), 1)
    }
    this.physics.step(STEP_MS)
    for (const d of drivers) {
      // The one rule about two Drivers: a Rescue is another Driver passing within range.
      const rescued = d.flipped && drivers.some((o) => o !== d && o.driving && Math.abs(o.chassisX - d.chassisX) <= FLIP.rescueRangePx)
      d.settle(rescued)
    }
    const anchors = this.anchorXs()
    if (anchors.length > 0) this.terrain.stream(anchors[0]!, anchors.slice(1))
    this.stepCount++
    return { usePressed, cellsChanged: this.fields.takeChanged(), banked, pickupsChanged: this.pickupsChanged }
  }

  toolStates(): ToolState[] {
    return this.tools.map((t) => t.state(this.stepCount))
  }

  vehicleStates(): VehicleState[] {
    return [...this.drivers.values()].map((d) => d.state(this.stepCount))
  }

  /** A live tunable from the panel; returns true when the world must be rebuilt (a rebuild-group dial). */
  applyTunable(path: string, value: number): boolean {
    const t = TUNABLES.find((r) => r.path === path)
    if (t === undefined || !Number.isFinite(value)) return false
    const [rec, key] = path.split('.') as [keyof Config, string]
    const record = this.config[rec] as unknown as Record<string, number>
    record[key] = Math.min(t.max, Math.max(t.min, value))
    if (path === 'HANDLING.gravityY') this.physics.setGravity(value)
    if (path === 'HANDLING.terrainFriction') this.terrain.forEachBody((b) => (b.friction = value))
    if (path === 'HANDLING.chassisInertiaScale') for (const d of this.drivers.values()) d.applyInertiaScale(value)
    return t.group === 'rebuild'
  }

  dispose(): void {
    for (const id of this.driverIds()) this.removeDriver(id)
    for (const t of this.tools) t.dispose()
    this.tools.length = 0
    for (const b of this.produce.values()) this.physics.remove(b)
    this.produce.clear()
    this.terrain.disposeAll()
    this.physics.dispose()
  }
}
