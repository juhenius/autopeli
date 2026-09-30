import { describe, expect, it } from 'vitest'
import type { ServerMsg } from '../shared/protocol.ts'
import { CELL, CELL_WATERED } from '../shared/sim/strip.ts'
import { NO_INPUT, type HeldInput } from '../shared/sim/world.ts'
import { SERVER_CONFIG, type ServerConfig } from './config.ts'
import { Room, type Outbound } from './room.ts'

/** Deterministic seed source: 100, 101, 102, … */
const seedSequence = (): (() => number) => {
  let n = 100
  return () => n++
}
/** Deterministic device tokens for joins that bring none: tok-1, tok-2, … */
const tokenSequence = (): (() => string) => {
  let n = 0
  return () => `tok-${++n}`
}
const cfg: ServerConfig = { ...SERVER_CONFIG, emptyGraceMs: 1000, dayLengthMs: 3000 }
const makeRoom = (over: Partial<ServerConfig> = {}): Room => new Room({ ...cfg, ...over }, seedSequence(), tokenSequence())

/** The timer: ticks the Room every 4 ms of wall time and collects what it sent. */
class Clock {
  now = 0
  constructor(private readonly room: Room) {}
  run(ms: number): Outbound[] {
    const out: Outbound[] = []
    const end = this.now + ms
    while (this.now < end) {
      this.now = Math.min(end, this.now + 4)
      out.push(...this.room.tick(this.now))
    }
    return out
  }
}

type Sent = Extract<Outbound, { kind: 'send' }>
const sent = (out: Outbound[]): Sent[] => out.filter((o): o is Sent => o.kind === 'send')
const ofType = <T extends ServerMsg['t']>(out: Outbound[], t: T): { to: number[]; msg: Extract<ServerMsg, { t: T }> }[] =>
  sent(out)
    .filter((o) => o.msg.t === t)
    .map((o) => ({ to: o.to, msg: o.msg as Extract<ServerMsg, { t: T }> }))
const last = <T>(xs: T[]): T => {
  expect(xs.length).toBeGreaterThan(0)
  return xs[xs.length - 1]!
}
let seq = 0
const input = (h: Partial<HeldInput>) => ({ seq: ++seq, ...NO_INPUT, ...h })
const join = (room: Room, name: string, now = 0, token: string | null = null) => {
  const res = room.join(name, token, null, 'car', now)
  if (!res.ok) throw new Error(res.reason)
  return res
}

describe('Room membership', () => {
  it('the first join creates the Run and its World: a welcome with a fresh seed and nobody else, the Run snapshot, a log line', () => {
    const room = makeRoom()
    const res = join(room, 'A')
    expect(res.id).toBe(1)
    const welcome = last(ofType(res.out, 'welcome'))
    expect(welcome.to).toEqual([1])
    expect(welcome.msg).toMatchObject({ id: 1, seed: 100, drivers: [], tunables: [] })
    expect(welcome.msg.run.drivers.map((d) => d.name)).toEqual(['A'])
    expect(last(ofType(res.out, 'run')).to).toEqual([1])
    expect(res.out.some((o) => o.kind === 'log' && o.line.includes('A#1 joined'))).toBe(true)
    expect(room.world_?.driverIds()).toEqual([1])
  })

  it('later joins share the seed, see the roster, and the others hear who joined', () => {
    const room = makeRoom()
    join(room, 'A')
    const res = join(room, 'B')
    expect(last(ofType(res.out, 'welcome')).msg).toMatchObject({ id: 2, seed: 100, drivers: [{ id: 1, name: 'A' }] })
    expect(last(ofType(res.out, 'joined'))).toEqual({ to: [1], msg: { t: 'joined', id: 2, name: 'B' } })
    expect(last(ofType(res.out, 'run')).to).toEqual([1, 2])
  })

  it('rejects a join at capacity', () => {
    const room = makeRoom({ maxDrivers: 2 })
    join(room, 'A')
    join(room, 'B')
    expect(room.join('C', null, null, 'car', 0)).toMatchObject({ ok: false, reason: 'room-full' })
    expect(room.size).toBe(2)
  })

  it('a non-last leave keeps the Run and tells the others; ids are never reused', () => {
    const room = makeRoom()
    join(room, 'A')
    join(room, 'B')
    const out = room.leave(1, 0)
    expect(last(ofType(out, 'left'))).toEqual({ to: [2], msg: { t: 'left', id: 1 } })
    expect(room.world_?.driverIds()).toEqual([2])
    const res = join(room, 'C')
    expect(res.id).toBe(3)
    expect(last(ofType(res.out, 'welcome')).msg.seed).toBe(100)
  })

  it('an empty Room keeps its Run and World through the grace, then disposes them; the next join starts a fresh Run', () => {
    const room = makeRoom()
    const clock = new Clock(room)
    join(room, 'A')
    room.leave(1, 0)
    expect(last(ofType(join(room, 'A', 500).out, 'welcome')).msg.seed).toBe(100)
    room.leave(2, 600)
    clock.now = 600
    clock.run(999)
    expect(room.run).not.toBeNull()
    expect(room.world_).not.toBeNull()
    clock.run(1)
    expect(room.run).toBeNull()
    expect(room.world_).toBeNull()
    const res = join(room, 'B', 1600)
    expect(last(ofType(res.out, 'welcome')).msg).toMatchObject({ seed: 101, drivers: [] })
  })

  it('the same device joining again takes its Seat over: the old socket is closed, the others hear it left, the Run record carries over under the new name', () => {
    const room = makeRoom({ maxDrivers: 2 })
    join(room, 'A', 0, 'tok-a')
    join(room, 'B', 0, 'tok-b')
    const res = join(room, 'A2', 5, 'tok-a')
    expect(res.id).toBe(3)
    expect(res.out[0]).toEqual({ kind: 'close', to: 1, reason: 'replaced' })
    expect(last(ofType(res.out, 'left'))).toEqual({ to: [2], msg: { t: 'left', id: 1 } })
    expect(last(ofType(res.out, 'welcome')).msg.drivers).toEqual([{ id: 2, name: 'B' }])
    expect(room.ids()).toEqual([2, 3])
    expect(room.world_?.driverIds()).toEqual([2, 3])
    const drivers = room.run!.snapshot().drivers
    expect(drivers.map((d) => [d.id, d.name, d.connected])).toEqual([[2, 'B', true], [3, 'A2', true]])
    expect(drivers[0]).not.toHaveProperty('token')
    // The old socket's late close is a no-op.
    expect(room.leave(1, 6)).toEqual([])
    expect(room.ids()).toEqual([2, 3])
  })

  it('a member picks a Vehicle for the next Day and everyone sees it; a stranger cannot', () => {
    const room = makeRoom()
    join(room, 'A')
    const out = room.vehicle(1, 'tractor', 1)
    expect(last(ofType(out, 'run')).msg.run.drivers[0]!.vehicle).toBe('tractor')
    expect(room.vehicle(9, 'tractor', 1)).toEqual([])
  })
})

describe('Room Days', () => {
  it('inputs at Night are dropped; once the Day starts they drive', () => {
    const room = makeRoom()
    const clock = new Clock(room)
    join(room, 'A')
    room.input(1, input({ gas: true }))
    const night = ofType(clock.run(500), 'state')
    expect(Math.abs(last(night).msg.vehicles[0]!.cx - night[0]!.msg.vehicles[0]!.cx)).toBeLessThan(1)
    expect(last(ofType(room.ready(1, 'go', clock.now), 'run')).msg.run.phase).toBe('day')
    const x0 = last(night).msg.vehicles[0]!.cx
    room.input(1, input({ gas: true }))
    const day = ofType(clock.run(1000), 'state')
    expect(last(day).msg.vehicles[0]!.cx - x0).toBeGreaterThan(100)
  })

  it('everyone home and pressing Use ends the Day early, and the next Ready starts another', () => {
    const room = makeRoom()
    const clock = new Clock(room)
    join(room, 'A')
    join(room, 'B')
    room.ready(1, 'go', clock.now)
    expect(last(ofType(room.ready(2, 'go', clock.now), 'run')).msg.run).toMatchObject({ phase: 'day', day: 1 })
    clock.run(100)
    for (const id of [1, 2]) room.input(id, input({ use: true }))
    let out = clock.run(100)
    for (const id of [1, 2]) room.input(id, input({}))
    out.push(...clock.run(100))
    expect(last(ofType(out, 'run')).msg.run.phase).toBe('night')
    room.ready(1, 'go', clock.now)
    expect(last(ofType(room.ready(2, 'go', clock.now), 'run')).msg.run).toMatchObject({ phase: 'day', day: 2 })
  })

  it('at Sunset everyone is home and upright holding no Tool, the pads are let go, a Box in the zone has banked, the Fields grew', () => {
    const room = makeRoom()
    const clock = new Clock(room)
    join(room, 'A')
    join(room, 'B')
    room.ready(1, 'go', clock.now)
    room.ready(2, 'go', clock.now)
    const w = room.world_!
    // The plough parked at A's left hitch point; a tap on Slot 1 hitches it.
    const plough = w.tools.find((t) => t.kind === 'plough')!
    w.physics.Body.setPosition(plough.body, { x: w.chassisX(1) - w.config.HANDLING.chassisWidth / 2, y: plough.body.position.y })
    clock.run(200)
    room.input(1, input({ slots: [true, false, false] }))
    clock.run(50)
    room.input(1, input({}))
    clock.run(300)
    expect(last(ofType(clock.run(50), 'state')).msg.tools.find((t) => t.kind === 'plough')?.slot).toEqual([1, 1])
    // A loaded Box inside the Farmhouse zone banks at once.
    const box = w.tools.find((t) => t.kind === 'box')!
    w.physics.Body.setPosition(box.body, { x: 60, y: box.body.position.y })
    box.setLoad(3)
    expect(last(ofType(clock.run(100), 'run')).msg.run.score).toBe(3)
    // A watered sown cell, and a pad held down into the Night.
    w.fields.cells(0)[0] = CELL.sown | CELL_WATERED
    room.input(1, input({ gas: true }))
    const out = clock.run(3000)
    const night = last(ofType(out, 'run')).msg.run
    expect(night.phase).toBe('night')
    expect(night.day).toBe(1)
    expect(night.score).toBe(3)
    expect(night.fields[0]!.cells[0]).toBe(CELL.sprouting)
    expect(night.drivers.map((d) => d.home)).toEqual([true, true])
    const after = ofType(clock.run(500), 'state')
    const first = after[0]!.msg
    const lastState = last(after).msg
    expect(first.tools.find((t) => t.kind === 'plough')?.slot).toBeNull()
    for (const v of lastState.vehicles) {
      expect(Math.abs(v.cx)).toBeLessThanOrEqual(cfg.farmhouseZonePx)
      expect(v.flipped).toBe(false)
    }
    // The gas pad A still holds does not drive through the Night.
    expect(Math.abs(lastState.vehicles[0]!.cx - first.vehicles[0]!.cx)).toBeLessThan(2)
  })

  it('a rebuild dial keeps the Fields and everyone in place; a new Run starts the Fields over with the dials still applied', () => {
    const room = makeRoom()
    const clock = new Clock(room)
    join(room, 'A')
    const before = room.world_!
    before.fields.cells(0)[5] = CELL.tilled
    const x0 = before.chassisX(1)
    room.tune('TRACK.crestH', 50)
    const rebuilt = room.world_!
    expect(rebuilt).not.toBe(before)
    expect(rebuilt.fields.snaps()[0]!.cells[5]).toBe(CELL.tilled)
    expect(rebuilt.chassisX(1)).toBeCloseTo(x0)
    expect(rebuilt.config.TRACK.crestH).toBe(50)
    expect(rebuilt.driverIds()).toEqual([1])
    room.leave(1, clock.now)
    clock.run(1000)
    expect(room.world_).toBeNull()
    join(room, 'B', clock.now)
    const fresh = room.world_!
    expect(fresh.seed).toBe(101)
    expect(fresh.fields.snaps()[0]!.cells[5]).toBe(CELL.untilled)
    expect(fresh.config.TRACK.crestH).toBe(50)
  })

  it('state goes out at stateHz; the pickup list rides along at first, then only every 2 s', () => {
    const room = makeRoom({ stateHz: 30 })
    const clock = new Clock(room)
    join(room, 'A')
    const states = ofType(clock.run(2100), 'state')
    expect(states.length).toBeGreaterThanOrEqual(60)
    expect(states.length).toBeLessThanOrEqual(66)
    expect(states[0]!.msg.pickups).not.toBeNull()
    expect(states[1]!.msg.pickups).toBeNull()
    expect(states.filter((s) => s.msg.pickups !== null).length).toBe(2)
  })
})
