import { describe, expect, it } from 'vitest'
import { daylight, secondsLeft, ServerClock } from './clock'

describe('ServerClock', () => {
  it('estimates server time from the last stamp', () => {
    const c = new ServerClock()
    c.sync(10_000, 4000)
    expect(c.now(5000)).toBe(11_000)
  })
})

describe('daylight', () => {
  const day = { end: 100_000, duskMs: 30_000 }
  it('is full until dusk, then fades linearly to Sunset', () => {
    expect(daylight(0, day)).toBe(1)
    expect(daylight(70_000, day)).toBe(1)
    expect(daylight(85_000, day)).toBeCloseTo(0.5)
    expect(daylight(100_000, day)).toBe(0)
    expect(daylight(120_000, day)).toBe(0)
  })
  it('counts seconds to Sunset', () => {
    expect(secondsLeft(97_500, day)).toBe(3)
    expect(secondsLeft(200_000, day)).toBe(0)
  })
})
