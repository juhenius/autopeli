import { describe, expect, it } from 'vitest'
import { createConfig } from '../../config/index.ts'
import { airTorqueDir, groundTangent, motorAccel, surfaceSlip, tractionImpulse } from './torqueRules.ts'

const t = createConfig().HANDLING

describe('motorAccel', () => {
  it('coasts with no input', () => {
    expect(motorAccel(t, { gas: false, brake: false, jump: false, use: false }, 0.3)).toBe(0)
  })
  it('full drive torque at standstill', () => {
    expect(motorAccel(t, { gas: true, brake: false, jump: false, use: false }, 0)).toBeCloseTo(t.driveAccel)
  })
  it('drive torque fades to zero at top speed (top speed emerges)', () => {
    expect(motorAccel(t, { gas: true, brake: false, jump: false, use: false }, t.omegaMax)).toBe(0)
  })
  it('full brake torque while rolling forward (lock-up emerges)', () => {
    expect(motorAccel(t, { gas: false, brake: true, jump: false, use: false }, 0.5)).toBeCloseTo(-t.brakeAccel)
  })
  it('reverse tapers to zero at the weaker reverse top speed', () => {
    expect(motorAccel(t, { gas: false, brake: true, jump: false, use: false }, -t.omegaMax * t.reverseRatio)).toBeCloseTo(0)
  })
  it('brake wins when both held', () => {
    expect(motorAccel(t, { gas: true, brake: true, jump: false, use: false }, 0)).toBeLessThan(0)
  })
})

describe('tractionImpulse', () => {
  it('proportional to slip under the grip budget', () => {
    expect(tractionImpulse(t, 0.1, 5)).toBeCloseTo(0.1 * t.slipStiff)
  })
  it('clamps at gripBase + gripPerLoad × compression, both directions', () => {
    const budget = t.gripBase + t.gripPerLoad * 5
    expect(tractionImpulse(t, 1000, 5)).toBeCloseTo(budget)
    expect(tractionImpulse(t, -1000, 5)).toBeCloseTo(-budget)
  })
  it('negative compression counts as zero load (grip floor only)', () => {
    expect(tractionImpulse(t, 1000, -3)).toBeCloseTo(t.gripBase)
  })
})

describe('surfaceSlip', () => {
  it('zero when rolling clean', () => {
    expect(surfaceSlip(0.5, 18, 9)).toBeCloseTo(0)
  })
  it('positive on wheelspin, negative on skid', () => {
    expect(surfaceSlip(1, 18, 9)).toBeGreaterThan(0)
    expect(surfaceSlip(0, 18, 9)).toBeLessThan(0)
  })
})

describe('airTorqueDir — physical mapping', () => {
  it('gas = nose-up (negative ω)', () => {
    expect(airTorqueDir({ gas: true, brake: false, jump: false, use: false })).toBe(-1)
  })
  it('brake = nose-down (positive ω)', () => {
    expect(airTorqueDir({ gas: false, brake: true, jump: false, use: false })).toBe(1)
  })
  it('both or neither held = none', () => {
    expect(airTorqueDir({ gas: true, brake: true, jump: false, use: false })).toBe(0)
    expect(airTorqueDir({ gas: false, brake: false, jump: false, use: false })).toBe(0)
  })
})

describe('groundTangent', () => {
  it('unit length; downhill (+slope, y down) points +y', () => {
    const g = groundTangent(0.5)
    expect(Math.hypot(g.x, g.y)).toBeCloseTo(1)
    expect(g.y).toBeGreaterThan(0)
    expect(g.x).toBeGreaterThan(0)
  })
})
