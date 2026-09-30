import { describe, expect, it } from 'vitest'
import { createConfig } from '../config/index.ts'
import { layPickups, layUntil, PICKUP_RANGE_PX, startCursor } from './pickups.ts'
import { FARMHOUSE_X, STRIP } from './strip.ts'
import { NO_INPUT, World } from './world.ts'

const config = createConfig()

describe('pickups', () => {
  it('are laid deterministically per Day, never in a Place flat or a Field, denser far out', () => {
    const a = layPickups(11, 1, config)
    expect(layPickups(11, 1, config)).toEqual(a)
    expect(layPickups(11, 2, config).map((p) => p.x)).not.toEqual(a.map((p) => p.x))
    expect(a.length).toBeGreaterThan(40)
    for (const p of a) {
      for (const place of STRIP.places) expect(Math.abs(p.x - place.x)).toBeGreaterThanOrEqual(config.TRACK.placeFlatPx)
      for (const f of STRIP.fields) expect(p.x < f.fromPx - 120 || p.x > f.toPx + 120).toBe(true)
    }
    const near = a.filter((p) => Math.abs(p.x - FARMHOUSE_X) < 2000).length
    const far = a.filter((p) => Math.abs(p.x - FARMHOUSE_X) >= 6000 && Math.abs(p.x - FARMHOUSE_X) < 8000).length
    expect(far).toBeGreaterThan(near)
  })

  it('a car driving through one adds it to the store, and a tool in the zone drains the store', () => {
    const w = new World({ ...config, TRACK: { ...config.TRACK, thetaDeg: 0, crestH: 0 } }, 11)
    w.layPickups(1)
    const first = [...w.pickups.values()].find((p) => p.kind === 'seed' && p.x > 0)!
    w.addDriver(1, first.x - 400)
    for (let i = 0; i < 60; i++) w.step() // the parked bag drinks the Barn's stock meanwhile
    const seedsBefore = w.stocks.seed
    w.setInput(1, { ...NO_INPUT, gas: true })
    let changed = false
    for (let i = 0; i < 60 * 20 && w.pickups.has(first.id); i++) changed = w.step().pickupsChanged || changed
    expect(w.pickups.has(first.id)).toBe(false)
    expect(changed).toBe(true)
    expect(w.stocks.seed).toBeGreaterThan(seedsBefore)
    // The bag at the Barn drains the stock down to what the bag lacks.
    const bag = w.tools.find((t) => t.kind === 'seeds')!
    bag.setFill(0)
    const stock = w.stocks.seed
    w.step()
    expect(bag.fill).toBe(Math.min(config.TOOL.seedCap, stock))
    expect(w.stocks.seed).toBe(stock - bag.fill)
  })
})

describe('endless pickups', () => {
  it('a cursor continues the same sequence past the first range, and the World lays ahead of a far car', () => {
    const ids = { next: 1 }
    const c = startCursor(1, config)
    const first = layUntil(11, 1, config, c, PICKUP_RANGE_PX, ids)
    const more = layUntil(11, 1, config, c, PICKUP_RANGE_PX + 6000, ids)
    expect(more.length).toBeGreaterThan(8)
    expect(Math.min(...more.map((p) => p.x))).toBeGreaterThanOrEqual(Math.max(...first.map((p) => p.x)))
    // Laying in one go to the far range gives the same pickups as the two steps.
    const oneGo = layUntil(11, 1, config, startCursor(1, config), PICKUP_RANGE_PX + 6000, { next: 1 })
    expect(oneGo).toEqual([...first, ...more])

    const w = new World({ ...config, TRACK: { ...config.TRACK, thetaDeg: 0, crestH: 0 } }, 11, { tools: false })
    w.layPickups(1)
    const before = Math.max(...[...w.pickups.values()].map((p) => p.x))
    w.addDriver(1, 15_000)
    w.step()
    const after = Math.max(...[...w.pickups.values()].map((p) => p.x))
    expect(after).toBeGreaterThan(before + 3000)
  })
})

describe('scattered upgrades', () => {
  it('a rockets or ramp Tool lies on the hills about every upgradeEveryPx, laid ahead of the furthest car', () => {
    const cfg = { ...config, TRACK: { ...config.TRACK, thetaDeg: 0, crestH: 0 } }
    const w = new World(cfg, 11)
    const parked = w.tools.length
    w.addDriver(1, 0)
    w.step()
    expect(w.tools.length).toBe(parked)
    const far = new World(cfg, 11)
    far.addDriver(1, 2.5 * cfg.TOOL.upgradeEveryPx)
    far.step()
    const scattered = far.tools.slice(parked)
    // Laid out to 2.5 gaps + 4 000 ahead each way: two or three per direction at about 1, 2 (and 3) gaps out.
    const right = scattered.filter((t) => t.x > 0)
    expect(right.length).toBeGreaterThanOrEqual(2)
    expect(right.map((t) => t.kind)).toEqual(['rockets', 'ramp', 'rockets'].slice(0, right.length))
    for (const [i, t] of right.entries()) expect(Math.abs(t.x - (i + 1) * cfg.TOOL.upgradeEveryPx)).toBeLessThan(0.6 * cfg.TOOL.upgradeEveryPx)
    const left = scattered.filter((t) => t.x < 0)
    expect(left.length).toBeGreaterThanOrEqual(2)
    expect(left.map((t) => t.kind)).toEqual(['ramp', 'rockets', 'ramp'].slice(0, left.length))
    // They sit on the surface, not falling through.
    for (let i = 0; i < 120; i++) far.step()
    for (const t of scattered) expect(Math.abs(t.state(far.step_).y - far.surfaceYAt(t.x))).toBeLessThan(40)
  })
})
