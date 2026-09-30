import { describe, expect, it } from 'vitest'
import { ArrivalBuffer, blendPlaced } from './arrivals'

interface Thing {
  x: number
  y: number
  a: number
  note: string
}
const thing = (x: number, note = ''): Thing => ({ x, y: 0, a: 0, note })

describe('ArrivalBuffer', () => {
  it('is empty before any arrival and holds the first one until the delay has elapsed', () => {
    const b = new ArrivalBuffer<Thing>(blendPlaced, 0)
    expect(b.sample(10, 100)).toBeNull()
    b.push(thing(1), 100)
    expect(b.sample(150, 100)?.sample.x).toBe(1)
  })

  it('blends the two arrivals bracketing the drawn moment; discrete fields take the newer', () => {
    const b = new ArrivalBuffer<Thing>(blendPlaced, 0)
    b.push(thing(0, 'old'), 100)
    b.push(thing(10, 'new'), 200)
    const s = b.sample(250, 100)!.sample
    expect(s.x).toBeCloseTo(5)
    expect(s.note).toBe('new')
    expect(b.latest?.x).toBe(10)
  })

  it('never extrapolates past the newest arrival', () => {
    const b = new ArrivalBuffer<Thing>(blendPlaced, 0)
    b.push(thing(0), 100)
    b.push(thing(10), 200)
    expect(b.sample(1000, 50)?.sample.x).toBe(10)
  })

  it('blends angles along the shortest arc', () => {
    const b = new ArrivalBuffer<Thing>(blendPlaced, 0)
    b.push({ ...thing(0), a: Math.PI - 0.1 }, 100)
    b.push({ ...thing(0), a: -Math.PI + 0.1 }, 200)
    const a = b.sample(250, 100)!.sample.a
    expect(Math.abs(Math.abs(a) - Math.PI)).toBeLessThan(1e-9)
  })

  it('fades after the silence allowed, and is gone half a second later; no fade unless asked', () => {
    const b = new ArrivalBuffer<Thing>(blendPlaced, 0)
    b.push(thing(0), 100)
    expect(b.sample(3100, 50, 3000)?.opacity).toBe(1)
    expect(b.sample(3350, 50, 3000)?.opacity).toBeCloseTo(0.5)
    expect(b.sample(3700, 50, 3000)).toBeNull()
    expect(b.sample(3700, 50)?.opacity).toBe(1)
  })
})
