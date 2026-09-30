import { describe, expect, it } from 'vitest'
import { SERVER_CONFIG } from './config.ts'
import { Run } from './run.ts'

const cfg = { ...SERVER_CONFIG, dayLengthMs: 10_000, farmhouseZonePx: 100 }

describe('farm Run', () => {
  it('starts at Night before Day 1 and needs everyone Ready to go', () => {
    const run = new Run(1, cfg)
    run.addDriver(1, 'a')
    run.addDriver(2, 'b')
    expect(run.currentPhase).toBe('night')
    run.ready(1, 'go', 1000)
    expect(run.currentPhase).toBe('night')
    run.ready(2, 'go', 1000)
    expect(run.currentPhase).toBe('day')
    expect(run.currentDay).toBe(1)
    expect(run.takeEvents()).toEqual(['day-start'])
    expect(run.snapshot().dayInfo).toEqual({ start: 1000, end: 11_000, duskMs: 3000 })
  })

  it('Sunset ends the Day; the light fades over the dusk fraction', () => {
    const run = new Run(1, cfg)
    run.addDriver(1, 'a')
    run.ready(1, 'go', 0)
    expect(run.daylight(0)).toBe(1)
    expect(run.daylight(7000)).toBe(1)
    expect(run.daylight(8500)).toBeCloseTo(0.5)
    expect(run.tick(9999)).toBe(false)
    expect(run.tick(10_000)).toBe(true)
    expect(run.currentPhase).toBe('night')
    expect(run.takeEvents()).toEqual(['day-start', 'night'])
  })

  it('everyone home and pressing Use ends the Day early; leaving home clears it', () => {
    const run = new Run(1, cfg)
    run.addDriver(1, 'a')
    run.addDriver(2, 'b')
    run.ready(1, 'go', 0)
    run.ready(2, 'go', 0)
    run.updateDrivers([
      { id: 1, x: run.farmhouseX + 20, flipped: false },
      { id: 2, x: run.farmhouseX + 900, flipped: false },
    ])
    expect(run.usePressed(1, 100)).toBe(true)
    expect(run.usePressed(2, 100)).toBe(false) // not home
    expect(run.currentPhase).toBe('day')
    run.updateDrivers([{ id: 1, x: run.farmhouseX + 900, flipped: false }])
    expect(run.snapshot().drivers.find((d) => d.id === 1)?.ready).toBeNull()
    run.updateDrivers([
      { id: 1, x: run.farmhouseX, flipped: false },
      { id: 2, x: run.farmhouseX, flipped: false },
    ])
    run.usePressed(1, 200)
    run.usePressed(2, 200)
    expect(run.currentPhase).toBe('night')
  })

  it('the Days go on: every Night leads to another Day, no end', () => {
    const run = new Run(1, cfg)
    run.addDriver(1, 'a')
    for (let day = 1; day <= 12; day++) {
      run.ready(1, 'go', day * 20_000)
      expect(run.currentDay).toBe(day)
      run.tick(day * 20_000 + 10_000)
      expect(run.currentPhase).toBe('night')
    }
  })

  it('a Driver rejoining by name gets its record back', () => {
    const run = new Run(1, cfg)
    run.addDriver(1, 'a')
    run.updateDrivers([{ id: 1, x: 1234, flipped: false }])
    run.removeDriver(1)
    run.addDriver(5, 'a')
    const d = run.snapshot().drivers
    expect(d).toHaveLength(1)
    expect(d[0]).toMatchObject({ id: 5, name: 'a', connected: true, x: 1234 })
  })
})

describe('Run roster pruning', () => {
  it('a Driver who left is off the roster once the next Day starts, and does not block the Ready', () => {
    const run = new Run(1, SERVER_CONFIG)
    run.addDriver(1, 'a', 'ta')
    run.addDriver(2, 'b', 'tb')
    run.removeDriver(2)
    expect(run.snapshot().drivers.map((d) => [d.id, d.connected])).toEqual([[1, true], [2, false]])
    expect(run.ready(1, 'go', 1000)).toBe(true)
    expect(run.snapshot().phase).toBe('day')
    expect(run.snapshot().drivers.map((d) => d.id)).toEqual([1])
  })
})
