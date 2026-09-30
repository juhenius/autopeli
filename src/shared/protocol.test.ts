import { describe, expect, it } from 'vitest'
import { inputMsg, parseClientMsg, parseInputMsg, parseServerMsg, type FarmSnapshot, type VehicleState } from './protocol'

const run: FarmSnapshot = {
  phase: 'day',
  seed: 7,
  day: 2,
  dayInfo: { start: 1000, end: 181_000, duskMs: 54_000 },
  drivers: [{ id: 1, name: 'a', colour: 3, vehicle: 'car', connected: true, ready: null, x: 200, flipped: false, home: true }],
  fields: [{ id: 0, fromPx: 900, toPx: 2100, cells: [0, 1, 1, 10, 4] }],
  farmhouseX: 0,
  score: 3,
}

const vehicle: VehicleState = {
  id: 1,
  k: 'car',
  cx: 10,
  cy: 20,
  ca: 0.1,
  w: [
    [1, 2, 3],
    [4, 5, 6],
  ],
  s: [0.5, -0.5],
  kick: 3,
  f: 1,
  flipped: false,
  respawnS: 0,
  ack: 12,
  sim: { c: [10, 20, 0.1, 1, 0, 0], w: [[1, 2, 3, 0, 0, 1], [4, 5, 6, 0, 0, 1]], h: [5, 4, 4, -1e9, 0, -1e9, 1, -1e9], t: [1, 0, 0, 0, 0, 1] },
}

describe('parseServerMsg', () => {
  it('round-trips welcome, run and state', () => {
    expect(parseServerMsg(JSON.stringify({ t: 'welcome', id: 1, seed: 7, drivers: [{ id: 2, name: 'b' }], now: 5, run, tunables: [{ path: 'HANDLING.gravityY', value: 0.8 }] }))).toEqual({
      t: 'welcome',
      id: 1,
      seed: 7,
      drivers: [{ id: 2, name: 'b' }],
      now: 5,
      run,
      tunables: [{ path: 'HANDLING.gravityY', value: 0.8 }],
    })
    expect(parseServerMsg(JSON.stringify({ t: 'run', now: 9, run }))).toEqual({ t: 'run', now: 9, run })
    expect(parseServerMsg(JSON.stringify({ t: 'state', now: 9, step: 3, vehicles: [vehicle], tools: [], produce: [{ id: 1, x: 2, y: 3, a: 0 }] }))).toEqual({
      t: 'state',
      now: 9,
      step: 3,
      vehicles: [vehicle],
      tools: [],
      produce: [{ id: 1, x: 2, y: 3, a: 0 }],
      ramps: [],
      pickups: null,
      stocks: [0, 0],
    })
  })

  it('rejects malformed messages', () => {
    expect(parseServerMsg('nope')).toBeNull()
    expect(parseServerMsg(JSON.stringify({ t: 'run', now: 1, run: { ...run, phase: 'camp' } }))).toBeNull()
    expect(parseServerMsg(JSON.stringify({ t: 'state', now: 1, step: 1, vehicles: [{ ...vehicle, w: [] }], tools: [] }))).toBeNull()
    expect(parseServerMsg(JSON.stringify({ t: 'pose', id: 1 }))).toBeNull()
  })

  it('input messages carry held booleans only', () => {
    const raw = JSON.parse(inputMsg({ seq: 7, gas: true, brake: false, jump: true, use: false, slots: [false, true, false], turn: false }))
    expect(parseInputMsg(raw)).toEqual({ seq: 7, gas: true, brake: false, jump: true, use: false, slots: [false, true, false], turn: false })
    expect(parseInputMsg({ gas: 1, slots: 'x' })).toEqual({ seq: 0, gas: false, brake: false, jump: false, use: false, slots: [false, false, false], turn: false })
  })
})

describe('parseClientMsg', () => {
  it('normalises a join: name trimmed and capped, colour clamped, unknown vehicle is the Car, missing token is null', () => {
    expect(parseClientMsg(JSON.stringify({ t: 'join', name: '  Grace Hopper of the Harvard Mark I  ', token: 'dev-1', colour: 99, vehicle: 'tractor' }))).toEqual({
      t: 'join',
      name: 'Grace Hopper of the Harv',
      token: 'dev-1',
      colour: 7,
      vehicle: 'tractor',
    })
    expect(parseClientMsg(JSON.stringify({ t: 'join', name: '', vehicle: 'boat' }))).toEqual({ t: 'join', name: 'Driver', token: null, colour: null, vehicle: 'car' })
  })

  it('parses the rest and rejects what it cannot use', () => {
    expect(parseClientMsg(JSON.stringify({ t: 'ready', choice: 'go' }))).toEqual({ t: 'ready', choice: 'go' })
    expect(parseClientMsg(JSON.stringify({ t: 'ready' }))).toEqual({ t: 'ready', choice: null })
    expect(parseClientMsg(JSON.stringify({ t: 'vehicle', kind: 'tractor' }))).toEqual({ t: 'vehicle', kind: 'tractor' })
    expect(parseClientMsg(JSON.stringify({ t: 'vehicle', kind: 'boat' }))).toBeNull()
    expect(parseClientMsg(JSON.stringify({ t: 'tune', path: 'HANDLING.gravityY', value: 0.8 }))).toEqual({ t: 'tune', path: 'HANDLING.gravityY', value: 0.8 })
    expect(parseClientMsg(JSON.stringify({ t: 'tune', path: 'HANDLING.gravityY', value: 'x' }))).toBeNull()
    expect(parseClientMsg(JSON.stringify({ t: 'input', seq: 3, gas: true, slots: [false, true, false] }))).toEqual({ t: 'input', seq: 3, gas: true, brake: false, jump: false, use: false, slots: [false, true, false], turn: false })
    expect(parseClientMsg(JSON.stringify({ t: 'restart' }))).toEqual({ t: 'restart' })
    expect(parseClientMsg('{')).toBeNull()
    expect(parseClientMsg(JSON.stringify({ t: 'pose' }))).toBeNull()
  })
})
