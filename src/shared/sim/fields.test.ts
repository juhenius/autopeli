import { describe, expect, it } from 'vitest'
import { Fields } from './fields.ts'
import { CELL, CELL_WATERED, STRIP } from './strip.ts'

const x = STRIP.fields[0]!.fromPx + 40

describe('the Fields', () => {
  it('each verb moves a Cell from the one state it expects, and nothing outside a Field', () => {
    const f = new Fields()
    expect(f.till(x)).toBe(true)
    expect(f.till(x)).toBe(false)
    expect(f.sow(x)).toBe(true)
    expect(f.stateAt(x)).toBe(CELL.sown)
    expect(f.harvest(x)).toBe(false)
    expect(f.till(-5000)).toBe(false)
    expect(f.stateAt(-5000)).toBeNull()
    expect(f.takeChanged()).toBe(true)
    expect(f.takeChanged()).toBe(false)
  })

  it('waters sown and sprouting Cells only, once', () => {
    const f = new Fields()
    expect(f.water(x)).toBe(false) // untilled
    f.till(x)
    expect(f.water(x)).toBe(false) // tilled but not sown
    f.sow(x)
    expect(f.water(x)).toBe(true)
    expect(f.water(x)).toBe(false) // already watered
    expect(f.stateAt(x)).toBe(CELL.sown)
  })

  it('a Night grows watered Cells one stage and dries them; tilled, dry and ripe Cells stay', () => {
    const f = new Fields()
    const cells = f.cells(0)
    cells[0] = CELL.tilled
    cells[1] = CELL.sown
    cells[2] = CELL.sown | CELL_WATERED
    f.grow()
    expect([cells[0], cells[1], cells[2]]).toEqual([CELL.tilled, CELL.sown, CELL.sprouting])
    cells[2] = CELL.sprouting | CELL_WATERED
    f.grow()
    expect(cells[2]).toBe(CELL.ripe)
    cells[2] = CELL.ripe | CELL_WATERED
    f.grow()
    expect(cells[2]).toBe(CELL.ripe)
  })

  it('the harvest returns a ripe Cell to soil; snapshots restore into another Fields', () => {
    const f = new Fields()
    f.cells(0)[2] = CELL.ripe
    expect(f.harvest(x)).toBe(true)
    expect(f.stateAt(x)).toBe(CELL.untilled)
    f.sow(x)
    const g = new Fields()
    g.restore(f.snaps())
    expect(g.stateAt(x)).toBe(CELL.untilled)
    f.till(x)
    f.sow(x)
    g.restore(f.snaps())
    expect(g.stateAt(x)).toBe(CELL.sown)
  })
})
