/**
 * Wire protocol: JSON messages over one WebSocket per Driver. The server runs
 * the physics (farm spec, ADR 0005): clients send held inputs and Ready
 * choices, the server sends the Run snapshot on change and the world state at
 * stateHz. Pure data and parsers, shared by the client and the server
 * (type-only there). No Phaser, no sockets.
 */

import { DRIVER_COLOURS } from './colours.ts'
import { isVehicleKind } from './sim/vehicles/index.ts'
import type { VehicleKind } from './sim/vehicles/spec.ts'

export interface DriverInfo {
  id: number
  name: string
}

export type FarmPhase = 'day' | 'night'

export interface FarmDayInfo {
  start: number
  end: number
  /** Ms before `end` over which the light fades to 0. */
  duskMs: number
}

export interface FarmDriverSnap {
  id: number
  name: string
  /** Index into DRIVER_COLOURS. */
  colour: number
  /** What they drive next Day ('car' | 'tractor'). */
  vehicle: string
  connected: boolean
  ready: string | null
  x: number
  flipped: boolean
  /** Inside the Farmhouse zone. */
  home: boolean
}

export interface FieldSnap {
  id: number
  fromPx: number
  toPx: number
  /** One state per cell from fromPx: 0 untilled, 1 tilled, 2 sown, 3 sprouting, 4 ripe. */
  cells: number[]
}

export interface FarmSnapshot {
  phase: FarmPhase
  seed: number
  /** 0 before the first Day. */
  day: number
  dayInfo: FarmDayInfo | null
  drivers: FarmDriverSnap[]
  fields: FieldSnap[]
  /** Farmhouse x, px. */
  farmhouseX: number
  /** Produce banked this Run. */
  score: number
}

/** One Vehicle as the server simulates it, every state message. */
export interface VehicleState {
  id: number
  /** Vehicle kind ('car' | 'tractor'): the client draws the matching spec. */
  k: string
  cx: number
  cy: number
  ca: number
  /** Drawn Wheels by side, left then right: [x, y, angle]. Spec wheel 0 is the left one when facing right. */
  w: [[number, number, number], [number, number, number]]
  /** Slip per drawn Wheel, by side. */
  s: [number, number]
  /** Drawn Wheel kick, px. */
  kick: number
  /** Facing scale for the drawing, ±1 (through 0 mid-Turn). */
  f: number
  /** Flipped (the Chassis on its roof past the grace). */
  flipped: boolean
  /** Seconds until the in-place respawn while flipped. */
  respawnS: number
  /** Sequence number of the last input the server applied to this Vehicle. */
  ack: number
  /** The full physical state, for client-side prediction. */
  sim: SimState
}

/** A Vehicle's bodies and Handling as numbers: chassis and wheels [x, y, angle, vx, vy, ω], Handling's own state. */
export interface SimState {
  c: number[]
  w: [number[], number[]]
  h: number[]
  /** The Turn (facing and its animation); absent from old servers. */
  t: number[]
}

export interface ToolState {
  id: number
  kind: string
  x: number
  y: number
  a: number
  /** [driver id, slot id] when hitched. */
  slot: [number, number] | null
  state: string
  thrusting: boolean
  /** Rockets: seconds of cooldown left (0 = ready). */
  cooldownS: number
  /** Plough: in the ground right now. */
  digging: boolean
  /** Facing the owner's way, ±1 (rockets draw their nose this way). */
  f: number
  /** Box: Produce carried. */
  load: number
  /** Seed bag / tank: doses left. */
  fill: number
}

/** A Produce body on the ground. */
export interface ProduceState {
  id: number
  x: number
  y: number
  a: number
}

/** A deployed ramp: a static wedge from its low end (x, y) rising `len` px along `angle` (signed by direction). */
export interface RampState {
  x: number
  y: number
  len: number
  angle: number
}

/** A pickup on the ground: a seed packet or a water drop, at x on the surface. */
export interface PickupState {
  id: number
  k: 'seed' | 'water'
  x: number
}

export interface TunedEntry {
  path: string
  value: number
}

export type ServerMsg =
  | { t: 'welcome'; id: number; seed: number; drivers: DriverInfo[]; now: number; run: FarmSnapshot; tunables: TunedEntry[] }
  | { t: 'joined'; id: number; name: string }
  | { t: 'left'; id: number }
  | { t: 'run'; now: number; run: FarmSnapshot }
  | {
      t: 'state'
      now: number
      step: number
      vehicles: VehicleState[]
      tools: ToolState[]
      produce: ProduceState[]
      ramps: RampState[]
      /** The whole pickup list, only when it changed (and now and then for late joiners); absent = unchanged. */
      pickups: PickupState[] | null
      /** [seeds in the Barn, water in the Well]. */
      stocks: [number, number]
    }

/** Held controls, one per client step, numbered so the server can acknowledge them. */
export interface InputMsg {
  seq: number
  gas: boolean
  brake: boolean
  jump: boolean
  use: boolean
  slots: [boolean, boolean, boolean]
  turn: boolean
}

// ---- client → server --------------------------------------------------------------------------

/** `token` names the device (kept in localStorage): a rejoin with the same token takes over that Driver's seat. */
export const joinMsg = (name: string, token: string, colour: number, vehicle: string): string => JSON.stringify({ t: 'join', name, token, colour, vehicle })
/** The vehicle for the next Day (a mid-Day rejoin uses the join's). */
export const vehicleMsg = (kind: string): string => JSON.stringify({ t: 'vehicle', kind })
export const inputMsg = (h: InputMsg): string => JSON.stringify({ t: 'input', ...h })
export const readyMsg = (choice: string | null): string => JSON.stringify({ t: 'ready', choice })
export const tuneMsg = (path: string, value: number): string => JSON.stringify({ t: 'tune', path, value })
export const restartMsg = (): string => JSON.stringify({ t: 'restart' })

// ---- parsing ----------------------------------------------------------------------------------

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const bool = (v: unknown): boolean => v === true
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null
const triple = (v: unknown): v is [number, number, number] => Array.isArray(v) && v.length === 3 && v.every(num)

export function parseInputMsg(m: Record<string, unknown>): InputMsg {
  const slots = Array.isArray(m.slots) ? m.slots : []
  return {
    seq: num(m.seq) ? m.seq : 0,
    gas: bool(m.gas),
    brake: bool(m.brake),
    jump: bool(m.jump),
    use: bool(m.use),
    slots: [bool(slots[0]), bool(slots[1]), bool(slots[2])],
    turn: bool(m.turn),
  }
}

/** What a client sends. Join fields arrive normalised: the name trimmed and capped, the colour clamped, an unknown Vehicle is the Car; a missing token or colour is null for the server to fill in. */
export type ClientMsg =
  | { t: 'join'; name: string; token: string | null; colour: number | null; vehicle: VehicleKind }
  | ({ t: 'input' } & InputMsg)
  | { t: 'vehicle'; kind: VehicleKind }
  | { t: 'ready'; choice: string | null }
  | { t: 'tune'; path: string; value: number }
  | { t: 'restart' }

export function parseClientMsg(raw: string): ClientMsg | null {
  let v: unknown
  try {
    v = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isObj(v)) return null
  const m = v
  switch (m.t) {
    case 'join': {
      const name = typeof m.name === 'string' && m.name.trim() !== '' ? m.name.trim().slice(0, 24) : 'Driver'
      const token = typeof m.token === 'string' && m.token !== '' ? m.token.slice(0, 64) : null
      const colour = num(m.colour) ? Math.max(0, Math.min(DRIVER_COLOURS.length - 1, Math.round(m.colour))) : null
      return { t: 'join', name, token, colour, vehicle: isVehicleKind(m.vehicle) ? m.vehicle : 'car' }
    }
    case 'input':
      return { t: 'input', ...parseInputMsg(m) }
    case 'vehicle':
      return isVehicleKind(m.kind) ? { t: 'vehicle', kind: m.kind } : null
    case 'ready':
      return { t: 'ready', choice: typeof m.choice === 'string' ? m.choice : null }
    case 'tune':
      return typeof m.path === 'string' && num(m.value) ? { t: 'tune', path: m.path, value: m.value } : null
    case 'restart':
      return { t: 'restart' }
    default:
      return null
  }
}

function parseDrivers(v: unknown): DriverInfo[] | null {
  if (!Array.isArray(v)) return null
  const out: DriverInfo[] = []
  for (const p of v) {
    if (!isObj(p) || !num(p.id) || typeof p.name !== 'string') return null
    out.push({ id: p.id, name: p.name })
  }
  return out
}

export function parseVehicleState(v: unknown): VehicleState | null {
  if (!isObj(v)) return null
  const { id, k, cx, cy, ca, w, s, kick, f, flipped, respawnS, ack, sim } = v
  if (!num(id) || !num(cx) || !num(cy) || !num(ca) || !num(kick) || !num(f) || !num(respawnS)) return null
  if (!Array.isArray(w) || w.length !== 2 || !triple(w[0]) || !triple(w[1])) return null
  if (!Array.isArray(s) || s.length !== 2 || !num(s[0]) || !num(s[1])) return null
  const nums = (x: unknown): number[] | null => (Array.isArray(x) && x.every(num) ? x : null)
  if (!isObj(sim)) return null
  const c = nums(sim.c)
  const w0 = Array.isArray(sim.w) ? nums(sim.w[0]) : null
  const w1 = Array.isArray(sim.w) ? nums(sim.w[1]) : null
  const h = nums(sim.h)
  const t = nums(sim.t) ?? []
  if (c === null || w0 === null || w1 === null || h === null) return null
  return { id, k: typeof k === 'string' ? k : 'car', cx, cy, ca, w: [w[0], w[1]], s: [s[0], s[1]], kick, f, flipped: bool(flipped), respawnS, ack: num(ack) ? ack : 0, sim: { c, w: [w0, w1], h, t } }
}

function parseToolState(v: unknown): ToolState | null {
  if (!isObj(v)) return null
  const { id, kind, x, y, a, slot, state, thrusting, cooldownS, digging, f } = v
  if (!num(id) || typeof kind !== 'string' || !num(x) || !num(y) || !num(a) || typeof state !== 'string') return null
  const sl = Array.isArray(slot) && slot.length === 2 && num(slot[0]) && num(slot[1]) ? ([slot[0], slot[1]] as [number, number]) : null
  return { id, kind, x, y, a, slot: sl, state, thrusting: bool(thrusting), cooldownS: num(cooldownS) ? cooldownS : 0, digging: bool(digging), f: num(f) ? f : 1, load: num(v.load) ? v.load : 0, fill: num(v.fill) ? v.fill : 0 }
}

export function parseFarmSnapshot(v: unknown): FarmSnapshot | null {
  if (!isObj(v)) return null
  const { phase, seed, day, dayInfo, drivers, fields, farmhouseX, score } = v
  if ((phase !== 'day' && phase !== 'night') || !num(seed) || !num(day) || !num(farmhouseX)) return null
  let di: FarmDayInfo | null = null
  if (dayInfo !== null && dayInfo !== undefined) {
    if (!isObj(dayInfo) || !num(dayInfo.start) || !num(dayInfo.end) || !num(dayInfo.duskMs)) return null
    di = { start: dayInfo.start, end: dayInfo.end, duskMs: dayInfo.duskMs }
  }
  if (!Array.isArray(drivers) || !Array.isArray(fields)) return null
  const ds: FarmDriverSnap[] = []
  for (const d of drivers) {
    if (!isObj(d) || !num(d.id) || typeof d.name !== 'string' || !num(d.x)) return null
    ds.push({
      id: d.id,
      name: d.name,
      colour: num(d.colour) ? d.colour : 0,
      vehicle: typeof d.vehicle === 'string' ? d.vehicle : 'car',
      connected: bool(d.connected),
      ready: typeof d.ready === 'string' ? d.ready : null,
      x: d.x,
      flipped: bool(d.flipped),
      home: bool(d.home),
    })
  }
  const fs: FieldSnap[] = []
  for (const f of fields) {
    if (!isObj(f) || !num(f.id) || !num(f.fromPx) || !num(f.toPx) || !Array.isArray(f.cells)) return null
    fs.push({ id: f.id, fromPx: f.fromPx, toPx: f.toPx, cells: f.cells.map((c: unknown) => (num(c) ? c : 0)) })
  }
  return { phase, seed, day, dayInfo: di, drivers: ds, fields: fs, farmhouseX, score: num(score) ? score : 0 }
}

/** Parse one server message; null for anything malformed (the client ignores it). */
export function parseServerMsg(raw: string): ServerMsg | null {
  let v: unknown
  try {
    v = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isObj(v)) return null
  const m = v
  switch (m.t) {
    case 'welcome': {
      const drivers = parseDrivers(m.drivers)
      const run = parseFarmSnapshot(m.run)
      if (!num(m.id) || !num(m.seed) || !num(m.now) || drivers === null || run === null) return null
      const tunables: TunedEntry[] = []
      if (Array.isArray(m.tunables)) {
        for (const e of m.tunables) if (isObj(e) && typeof e.path === 'string' && num(e.value)) tunables.push({ path: e.path, value: e.value })
      }
      return { t: 'welcome', id: m.id, seed: m.seed, drivers, now: m.now, run, tunables }
    }
    case 'joined':
      return num(m.id) && typeof m.name === 'string' ? { t: 'joined', id: m.id, name: m.name } : null
    case 'left':
      return num(m.id) ? { t: 'left', id: m.id } : null
    case 'run': {
      const run = parseFarmSnapshot(m.run)
      return num(m.now) && run !== null ? { t: 'run', now: m.now, run } : null
    }
    case 'state': {
      if (!num(m.now) || !num(m.step) || !Array.isArray(m.vehicles) || !Array.isArray(m.tools)) return null
      const vehicles: VehicleState[] = []
      for (const x of m.vehicles) {
        const p = parseVehicleState(x)
        if (p === null) return null
        vehicles.push(p)
      }
      const tools: ToolState[] = []
      for (const x of m.tools) {
        const p = parseToolState(x)
        if (p === null) return null
        tools.push(p)
      }
      const produce: ProduceState[] = []
      if (Array.isArray(m.produce)) {
        for (const x of m.produce) {
          if (!isObj(x) || !num(x.id) || !num(x.x) || !num(x.y) || !num(x.a)) return null
          produce.push({ id: x.id, x: x.x, y: x.y, a: x.a })
        }
      }
      const ramps: RampState[] = []
      if (Array.isArray(m.ramps)) {
        for (const x of m.ramps) {
          if (!isObj(x) || !num(x.x) || !num(x.y) || !num(x.len) || !num(x.angle)) return null
          ramps.push({ x: x.x, y: x.y, len: x.len, angle: x.angle })
        }
      }
      let pickups: PickupState[] | null = null
      if (Array.isArray(m.pickups)) {
        pickups = []
        for (const x of m.pickups) {
          if (!isObj(x) || !num(x.id) || (x.k !== 'seed' && x.k !== 'water') || !num(x.x)) return null
          pickups.push({ id: x.id, k: x.k, x: x.x })
        }
      }
      const st = Array.isArray(m.stocks) && num(m.stocks[0]) && num(m.stocks[1]) ? ([m.stocks[0], m.stocks[1]] as [number, number]) : ([0, 0] as [number, number])
      return { t: 'state', now: m.now, step: m.step, vehicles, tools, produce, ramps, pickups, stocks: st }
    }
    default:
      return null
  }
}
