import { describe, expect, it } from 'vitest'
import { createConfig } from '../../config/index.ts'
import { createFlipState, flipStep, type FlipState } from './index.ts'

const FLIP = createConfig().FLIP
const DT = 1000 / 60

const step = (s: FlipState, roofContact = false, rescued = false) => flipStep(s, { roofContact, rescued }, DT, FLIP)

describe('flipStep', () => {
  it('flips after flipGrace consecutive roof-contact steps, not before, and starts the countdown', () => {
    let s = createFlipState()
    for (let i = 0; i < FLIP.flipGrace - 1; i++) {
      s = step(s, true)
      expect(s.phase).toBe('driving')
    }
    s = step(s, true)
    expect(s.phase).toBe('flipped')
    expect(s.respawnRemaining).toBeCloseTo(FLIP.flipRespawnS)
  })

  it('a break in roof contact resets the grace counter', () => {
    let s = createFlipState()
    for (let i = 0; i < FLIP.flipGrace - 1; i++) s = step(s, true)
    s = step(s, false)
    expect(s.flipSteps).toBe(0)
  })

  it('counts the Respawn down and returns to driving at 0', () => {
    let s: FlipState = { phase: 'flipped', respawnRemaining: 0.03, flipSteps: FLIP.flipGrace }
    s = step(s)
    expect(s.phase).toBe('flipped')
    s = step(s)
    expect(s.phase).toBe('driving')
    expect(s.respawnRemaining).toBe(0)
    expect(s.flipSteps).toBe(0)
  })

  it('a Rescue ends the Flip immediately', () => {
    let s: FlipState = { phase: 'flipped', respawnRemaining: 15, flipSteps: FLIP.flipGrace }
    s = step(s, false, true)
    expect(s.phase).toBe('driving')
  })
})
