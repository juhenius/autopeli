import { describe, expect, it } from 'vitest'
import { PoseInterpolator } from './interpolator'
import type { VehicleState } from '../../shared/protocol'

const pose = (cx: number, flipped = false): VehicleState => ({
  id: 1,
  k: 'car',
  cx,
  cy: 0,
  ca: 0,
  w: [
    [cx - 40, 30, 0],
    [cx + 40, 30, 0],
  ],
  s: [0, 0],
  kick: 0,
  f: 1,
  flipped,
  respawnS: 0,
  ack: 0,
  sim: { c: [], w: [[], []], h: [], t: [] },
})

describe('PoseInterpolator', () => {
  it('renders delayMs behind the newest arrival, lerped between arrivals', () => {
    const ip = new PoseInterpolator(0)
    ip.push(pose(0), 0)
    ip.push(pose(100), 100)
    const s = ip.sample(150, 100, 3000)!
    expect(s.sample.cx).toBeCloseTo(50)
    expect(s.sample.w[1][0]).toBeCloseTo(90)
    expect(s.opacity).toBe(1)
  })

  it('holds the newest pose instead of extrapolating', () => {
    const ip = new PoseInterpolator(0)
    ip.push(pose(0), 0)
    ip.push(pose(100), 100)
    expect(ip.sample(1000, 100, 3000)!.sample.cx).toBe(100)
    expect(ip.latest?.cx).toBe(100)
  })

  it('fades out after the silence threshold and disappears', () => {
    const ip = new PoseInterpolator(0)
    ip.push(pose(0), 0)
    expect(ip.sample(3250, 50, 3000)!.opacity).toBeCloseTo(0.5)
    expect(ip.sample(4000, 50, 3000)).toBeNull()
  })

  it('discrete fields take the newer sample', () => {
    const ip = new PoseInterpolator(0)
    ip.push(pose(0), 0)
    ip.push(pose(100, true), 100)
    expect(ip.sample(150, 100, 3000)!.sample.flipped).toBe(true)
  })
})
