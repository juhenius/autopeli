import { describe, expect, it } from 'vitest'
import { createConfig } from '../../config/index.ts'
import { World } from '../world.ts'
import { TOOL_KIND, TOOL_KINDS } from './kinds.ts'

describe('the Tool kinds', () => {
  it('park in front of the Barn in the table’s order, each body the size its footprint says', () => {
    const config = createConfig()
    const w = new World(config, 5)
    expect(w.tools.map((t) => t.kind)).toEqual(TOOL_KINDS)
    for (const t of w.tools) {
      const fp = TOOL_KIND[t.kind].footprint(config.TOOL)
      const b = t.body.bounds
      const size = fp.circle ? fp.w : fp.w
      expect(b.max.x - b.min.x, `${t.kind} width`).toBeCloseTo(size, 0)
      expect(b.max.y - b.min.y, `${t.kind} height`).toBeCloseTo(fp.circle ? fp.w : fp.h, 0)
    }
  })

  it('every drag Tool can be lowered; the rest stay rigid in a Slot', () => {
    expect(TOOL_KINDS.filter((k) => TOOL_KIND[k].drag)).toEqual(['plough', 'seeds', 'tank', 'harvester'])
    expect(TOOL_KINDS.filter((k) => TOOL_KIND[k].store !== null)).toEqual(['seeds', 'tank'])
  })
})
