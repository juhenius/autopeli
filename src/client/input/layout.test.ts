import { describe, expect, it } from 'vitest'
import { CONTROLS, controlOf, placement, zoneAt } from './layout'

const W = 1000
const H = 600

describe('the controls table', () => {
  it('finds each zone under its own pad and nothing under a button', () => {
    // The corners: brake bottom-left, gas bottom-right, the Jump above gas, Use top-centre.
    expect(zoneAt(80, H - 80, W, H)).toBe('brake')
    expect(zoneAt(W - 80, H - 80, W, H)).toBe('gas')
    expect(zoneAt(W - 80, H - 260, W, H)).toBe('jump')
    expect(zoneAt(W / 2, 100, W, H)).toBe('use')
    // The Slot row and the Turn sit where no zone is: their buttons take the pointer themselves.
    expect(zoneAt(W / 2, H - 40, W, H)).toBeNull()
    expect(zoneAt(80, H - 260, W, H)).toBeNull()
    // Nothing in the middle of the screen.
    expect(zoneAt(W / 2, H / 2, W, H)).toBeNull()
  })

  it('the corner zones run the full height of their band, so a finger high on the pad still drives', () => {
    expect(zoneAt(10, H - 1, W, H)).toBe('brake')
    expect(zoneAt(10, H - 190, W, H)).toBe('brake')
    expect(zoneAt(W - 10, H - 1, W, H)).toBe('gas')
  })

  it('places every control from the table, and the keys are unique', () => {
    const keys = CONTROLS.flatMap((c) => c.keys)
    expect(new Set(keys).size).toBe(keys.length)
    expect(placement(controlOf('gas'))).toContain('right: calc(env(safe-area-inset-right, 0px) + 24px)')
    expect(placement(controlOf('slot2'))).toContain('left: 50%; margin-left: -36px')
    expect(placement(controlOf('use'))).toContain('top: calc(env(safe-area-inset-top, 0px) + 120px)')
  })
})
