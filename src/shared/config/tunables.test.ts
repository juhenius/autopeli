import { describe, expect, it } from 'vitest'
import { createConfig } from './index'
import { TUNABLES } from './tunables'

function resolve(obj: unknown, path: string): unknown {
  let cur: unknown = obj
  for (const key of path.split('.')) {
    if (typeof cur !== 'object' || cur === null) return undefined
    cur = (cur as Record<string, unknown>)[key]
  }
  return cur
}

describe('tunables descriptor table', () => {
  const config = createConfig()

  it('every row resolves to a numeric Config value inside its range', () => {
    for (const t of TUNABLES) {
      const value = resolve(config, t.path)
      expect(value, t.path).toBeTypeOf('number')
      expect(t.min, t.path).toBeLessThan(t.max)
      expect(t.step, t.path).toBeGreaterThan(0)
      expect(value as number, t.path).toBeGreaterThanOrEqual(t.min)
      expect(value as number, t.path).toBeLessThanOrEqual(t.max)
    }
  })

  it('covers every tunable exactly once (all records except PALETTE)', () => {
    const expected: string[] = []
    for (const [record, values] of Object.entries(config)) {
      if (record === 'PALETTE') continue
      for (const key of Object.keys(values)) expected.push(`${record}.${key}`)
    }
    const actual = TUNABLES.map((t) => t.path)
    expect(new Set(actual).size).toBe(actual.length)
    expect(actual.slice().sort()).toEqual(expected.sort())
  })
})
