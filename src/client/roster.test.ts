import { describe, expect, it } from 'vitest'
import { createConfig } from '../shared/config'
import type { VehicleState } from '../shared/protocol'
import { NO_INPUT } from '../shared/sim/world'
import { Roster, type VehicleDrawing } from './roster'

/** A drawing that only remembers what it was told. */
class FakeGfx implements VehicleDrawing {
  visible = false
  name = ''
  colour = ''
  alpha = 1
  pose: [number, number, number] | null = null
  destroyed = false
  setChassisPose(x: number, y: number, r: number): void {
    this.pose = [x, y, r]
  }
  setWheelPose(): void {}
  setFacing(): void {}
  setName(n: string): void {
    this.name = n
  }
  setColour(c: string): void {
    this.colour = c
  }
  setAlpha(a: number): void {
    this.alpha = a
  }
  setVisible(v: boolean): void {
    this.visible = v
  }
  spray(): void {}
  destroy(): void {
    this.destroyed = true
  }
}

const vehicle = (id: number, cx: number, k = 'car'): VehicleState => ({
  id,
  k,
  cx,
  cy: 400,
  ca: 0,
  w: [
    [cx - 30, 420, 0],
    [cx + 30, 420, 0],
  ],
  s: [0, 0],
  kick: 0,
  f: 1,
  flipped: false,
  respawnS: 0,
  ack: 0,
  sim: { c: [], w: [[], []], h: [], t: [] },
})
const state = (...vehicles: VehicleState[]) => ({ t: 'state' as const, now: 0, step: 0, vehicles, tools: [], produce: [], ramps: [], pickups: null, stocks: [0, 0] as [number, number] })

function roster(predict = 0) {
  const config = createConfig()
  config.NET.predict = predict
  config.TRACK.thetaDeg = 0
  config.TRACK.crestH = 0
  const made: FakeGfx[] = []
  const r = new Roster(config, () => {
    const g = new FakeGfx()
    made.push(g)
    return g
  })
  return { r, made, config }
}

describe('Roster', () => {
  it('draws a Driver on first sight with its name and colour, and drops the drawing when they leave', () => {
    const { r, made } = roster()
    r.welcome(1, 'me', [{ id: 2, name: 'B' }])
    r.run({ phase: 'day', seed: 1, day: 1, dayInfo: null, drivers: [{ id: 2, name: 'B', colour: 3, vehicle: 'car', connected: true, ready: null, x: 0, flipped: false, home: true }], fields: [], farmhouseX: 0, score: 0 })
    r.state(state(vehicle(2, 500)), 100)
    expect(made).toHaveLength(1)
    r.draw(200)
    expect(made[0]!.visible).toBe(true)
    expect(made[0]!.name).toBe('B')
    expect(made[0]!.alpha).toBeCloseTo(0.9)
    r.left(2)
    expect(made[0]!.destroyed).toBe(true)
    expect(r.size).toBe(0)
  })

  it('rebuilds the drawing when a Driver changes Vehicle kind', () => {
    const { r, made } = roster()
    r.welcome(1, 'me', [])
    r.state(state(vehicle(2, 500)), 100)
    r.state(state(vehicle(2, 500, 'tractor')), 150)
    expect(made).toHaveLength(2)
    expect(made[0]!.destroyed).toBe(true)
    expect(r.size).toBe(1)
  })

  it('with prediction on, the own pose is the predicted one and inputs are numbered by the predictor; switching it off drops it', () => {
    const { r, config } = roster(1)
    r.welcome(1, 'me', [])
    r.newRun(7)
    r.state(state(vehicle(1, 500)), 100)
    expect(r.predictionReadout()).toMatch(/^prediction on/)
    expect(r.step(NO_INPUT)).toBe(1)
    expect(r.step(NO_INPUT)).toBe(2)
    expect(r.own(100)?.id).toBe(1)
    config.NET.predict = 0
    expect(r.step(NO_INPUT)).toBe(1)
    expect(r.predictionReadout()).toBe('prediction off')
  })

  it('with prediction off, the own pose is interpolated like the others', () => {
    const { r, config } = roster()
    config.NET.interpDelayMs = 100
    r.welcome(1, 'me', [])
    r.state(state(vehicle(1, 0)), 100)
    r.state(state(vehicle(1, 100)), 200)
    expect(r.own(250)?.cx).toBeCloseTo(50)
    expect(r.latest(1)?.cx).toBe(100)
  })

  it('labels the other Drivers outside the camera window by side', () => {
    const { r } = roster()
    r.welcome(1, 'me', [
      { id: 2, name: 'far right' },
      { id: 3, name: 'far left' },
      { id: 4, name: 'here' },
    ])
    r.state(state(vehicle(1, 500), vehicle(2, 3000), vehicle(3, -3000), vehicle(4, 600)), 100)
    expect(r.labels(0, 1000)).toEqual([
      { name: 'far right', side: 'right' },
      { name: 'far left', side: 'left' },
    ])
  })
})
