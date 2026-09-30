import { describe, expect, it } from 'vitest'
import { createConfig } from '../../config/index.ts'
import { createRulesState, isGrounded, tick } from './rules.ts'

const P = createConfig().HANDLING

describe('grounded bookkeeping', () => {
  it('a Wheel counts as touching for contactGrace steps after its last contact', () => {
    let s = createRulesState()
    expect(isGrounded(s, P)).toBe(false)
    s = tick(s, [true, false])
    expect(isGrounded(s, P)).toBe(true)
    for (let i = 0; i < P.contactGrace; i++) {
      s = tick(s, [false, false])
      expect(isGrounded(s, P), `grace step ${i + 1}`).toBe(true)
    }
    s = tick(s, [false, false])
    expect(isGrounded(s, P)).toBe(false)
  })

  it('either Wheel grounds the Vehicle', () => {
    const s = tick(createRulesState(), [false, true])
    expect(isGrounded(s, P)).toBe(true)
  })
})
