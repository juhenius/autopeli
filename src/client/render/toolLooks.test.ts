import { describe, expect, it } from 'vitest'
import { createConfig } from '../../shared/config'
import type { ToolState } from '../../shared/protocol'
import { TOOL_KINDS } from '../../shared/sim/tools/kinds'
import { LOOKS } from './toolLooks'

const p = createConfig().TOOL
const tool = (over: Partial<ToolState>): ToolState => ({
  id: 1,
  kind: 'plough',
  x: 0,
  y: 0,
  a: 0,
  slot: [1, 1],
  state: 'raised',
  thrusting: false,
  cooldownS: 0,
  digging: false,
  f: 1,
  load: 0,
  fill: 0,
  ...over,
})

describe('the Slot faces', () => {
  it('every kind has a look', () => {
    for (const k of TOOL_KINDS) expect(LOOKS[k]).toBeDefined()
  })

  it('a drag Tool reads down while lowered and is at work then, up otherwise', () => {
    expect(LOOKS.plough.face(tool({ state: 'lowered' }), p)).toEqual({ sub: 'down', active: true })
    expect(LOOKS.harvester.face(tool({ state: 'raised' }), p)).toEqual({ sub: 'up', active: false })
  })

  it('the seed bag and the tank read their fill', () => {
    expect(LOOKS.seeds.face(tool({ kind: 'seeds', fill: 37, state: 'lowered' }), p)).toEqual({ sub: '37', active: true })
    expect(LOOKS.tank.face(tool({ kind: 'tank', fill: 0 }), p)).toEqual({ sub: '0', active: false })
  })

  it('the Box reads its load over its cap, the Ramp says plant', () => {
    expect(LOOKS.box.face(tool({ kind: 'box', load: 3 }), p)).toEqual({ sub: `3/${p.boxCap}`, active: false })
    expect(LOOKS.ramp.face(tool({ kind: 'ramp' }), p)).toEqual({ sub: 'plant', active: false })
  })

  it('the Rockets burn, cool down, then read ready', () => {
    expect(LOOKS.rockets.face(tool({ kind: 'rockets', thrusting: true }), p)).toEqual({ sub: '🔥', active: true })
    expect(LOOKS.rockets.face(tool({ kind: 'rockets', cooldownS: 2.2 }), p)).toEqual({ sub: '3 s', active: false })
    expect(LOOKS.rockets.face(tool({ kind: 'rockets' }), p)).toEqual({ sub: 'ready', active: false })
  })

  it('the icon key quantises a fill to eighths, so a bag draining does not redraw every dose', () => {
    const at = (fill: number) => LOOKS.seeds.icon(tool({ kind: 'seeds', fill }), p).key
    expect(at(p.seedCap)).toBe(at(p.seedCap - 1))
    expect(at(0)).not.toBe(at(p.seedCap))
    expect(LOOKS.seeds.icon(tool({ kind: 'seeds', fill: p.seedCap, f: -1, thrusting: true }), p).still).toMatchObject({ f: 1, thrusting: false, slot: null })
  })
})
