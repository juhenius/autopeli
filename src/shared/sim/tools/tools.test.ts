import { describe, expect, it } from 'vitest'
import { createConfig } from '../../config/index.ts'
import { CELL, cellState, inPlaceZone, STRIP } from '../strip.ts'
import { NO_INPUT, World, type HeldInput } from '../world.ts'

/** A flat Strip so the plough drags on level ground. */
function flatWorld(): World {
  const config = createConfig()
  config.TRACK.thetaDeg = 0
  config.TRACK.crestH = 0
  return new World(config, 11)
}

const held = (h: Partial<HeldInput>): HeldInput => ({ ...NO_INPUT, ...h })

describe('tools in the World', () => {
  it('tap 1 next to the parked plough hoists it; use lowers it; dragging over a Field tills cells', () => {
    const w = flatWorld()
    // Park the car with its left hitch point over the plough (which parks at toolParkX).
    const plough = w.tools.find((t) => t.kind === 'plough')!
    w.addDriver(1, plough.x + w.config.HANDLING.chassisWidth / 2)
    for (let i = 0; i < 60; i++) w.step()
    // Tap slot 1.
    w.setInput(1, held({ slots: [true, false, false] }))
    w.step()
    w.setInput(1, held({}))
    w.step()
    expect(plough.owner).toBe(1)
    expect(plough.slot).toBe(1)
    for (let i = 0; i < 90; i++) w.step()
    expect(plough.phase).toBe('raised')
    // Tap again: lowered. Then drive right into Field A and count tilled cells.
    w.setInput(1, held({ slots: [true, false, false] }))
    w.step()
    w.setInput(1, held({}))
    w.step()
    expect(plough.phase).toBe('lowered')
    const field = STRIP.fields[0]!
    w.setInput(1, held({ gas: true }))
    for (let i = 0; i < 60 * 40 && w.chassisX(1) < field.toPx + 200; i++) w.step()
    expect(w.chassisX(1)).toBeGreaterThan(field.toPx)
    const cells = w.fields.snaps()[0]!.cells
    expect(cells.filter((c) => c === CELL.tilled).length).toBeGreaterThan(20)
    expect(w.toolStates().find((t) => t.kind === 'plough')?.state).toBe('lowered')
  })

  it('a Turn swaps the end Slots and mirrors the drawn facing', () => {
    const w = flatWorld()
    const plough = w.tools.find((t) => t.kind === 'plough')!
    w.addDriver(1, plough.x + w.config.HANDLING.chassisWidth / 2)
    for (let i = 0; i < 60; i++) w.step()
    w.setInput(1, held({ slots: [true, false, false] }))
    w.step()
    w.setInput(1, held({}))
    for (let i = 0; i < 90; i++) w.step()
    expect(plough.slot).toBe(1)
    w.setInput(1, held({ turn: true }))
    for (let i = 0; i < 20; i++) w.step()
    expect(plough.slot).toBe(3)
    const me = w.vehicleStates().find((v) => v.id === 1)!
    expect(me.f).toBe(-1)
    expect(plough.x).toBeGreaterThan(w.chassisX(1))
  })
})

describe('seed bag and harvester', () => {
  /** Hitch the tool of `kind` at slot 1 and lower it; the car starts with its left hitch point over the tool. */
  function rigWith(kind: 'seeds' | 'harvester'): { w: World; tool: (typeof w.tools)[number] } {
    const w = flatWorld()
    const tool = w.tools.find((t) => t.kind === kind)!
    // The barn row is tight: park the other tools far away so the car does not spawn on one.
    for (const t of w.tools) if (t !== tool) w.physics.Body.setPosition(t.body, { x: 5000 + t.id * 100, y: t.y }, false)
    w.addDriver(1, tool.x + w.config.HANDLING.chassisWidth / 2)
    for (let i = 0; i < 60; i++) w.step()
    w.setInput(1, held({ slots: [true, false, false] }))
    w.step()
    w.setInput(1, held({}))
    for (let i = 0; i < 90; i++) w.step()
    w.setInput(1, held({ slots: [true, false, false] }))
    w.step()
    w.setInput(1, held({}))
    w.step()
    expect(tool.phase).toBe('lowered')
    return { w, tool }
  }

  it('the seed bag sows tilled cells only', () => {
    const { w } = rigWith('seeds')
    const f = STRIP.fields[0]!
    const cells = w.fields.cells(0)
    for (let i = 0; i < cells.length; i++) cells[i] = i % 2 === 0 ? CELL.tilled : CELL.untilled
    w.setInput(1, held({ gas: true }))
    for (let i = 0; i < 60 * 40 && w.chassisX(1) < f.toPx + 200; i++) w.step()
    const sown = cells.filter((c) => c === CELL.sown).length
    expect(sown).toBeGreaterThan(15)
    expect(cells.filter((c) => c === CELL.untilled).length).toBeGreaterThan(30) // the untilled half stayed untilled
  })

  it('the harvester turns ripe cells to soil and drops a Produce every five cells', () => {
    const { w } = rigWith('harvester')
    const f = STRIP.fields[0]!
    const cells = w.fields.cells(0)
    for (let i = 0; i < cells.length; i++) cells[i] = i < 10 ? CELL.ripe : CELL.untilled
    w.setInput(1, held({ gas: true }))
    for (let i = 0; i < 60 * 40 && w.chassisX(1) < f.toPx + 200; i++) w.step()
    expect(cells.slice(0, 10).every((c) => c === CELL.untilled)).toBe(true)
    expect(w.produce.size).toBe(2)
    expect(w.produceStates()[0]!.x).toBeGreaterThan(f.fromPx - 100)
  })
})

describe('the Box and banking', () => {
  it('Use takes a Produce within reach, the Box gets heavier, and banking empties it only inside the zone', () => {
    const w = flatWorld()
    const box = w.tools.find((t) => t.kind === 'box')!
    for (const t of w.tools) if (t !== box) w.physics.Body.setPosition(t.body, { x: 5000 + t.id * 100, y: t.y }, false)
    w.addDriver(1, box.x + w.config.HANDLING.chassisWidth / 2)
    for (let i = 0; i < 60; i++) w.step()
    w.setInput(1, held({ slots: [true, false, false] }))
    w.step()
    w.setInput(1, held({}))
    for (let i = 0; i < 90; i++) w.step()
    expect(box.phase).toBe('raised')
    const m0 = box.body.mass
    w.spawnProduce(box.x + 20, box.y - 40)
    w.spawnProduce(box.x - 20, box.y - 40)
    for (let i = 0; i < 30; i++) w.step()
    w.setInput(1, held({ slots: [true, false, false] }))
    w.step()
    w.setInput(1, held({}))
    w.step()
    expect(box.load).toBe(1)
    expect(w.produce.size).toBe(1)
    expect(box.body.mass).toBeCloseTo(m0 + w.produceMass(), 6)
    // Banking: the car is far from the Farmhouse (0): nothing banks; driving the Box into the zone banks it at once.
    expect(w.bank(0, 400)).toBe(0)
    expect(w.step().banked).toBe(0)
    expect(box.load).toBe(1)
    w.physics.Body.setPosition(w.drivers_(1).vehicle.bodies.chassis, { x: 0, y: 400 }, false)
    w.physics.Body.setPosition(box.body, { x: 0, y: 380 }, false)
    expect(w.step().banked).toBe(1)
    expect(box.load).toBe(0)
    expect(box.body.mass).toBeCloseTo(m0, 6)
    expect(w.bank(0, 400)).toBe(0) // nothing left for the Night
  })
})

describe('the ramp', () => {
  it('Use plants a static wedge ahead of the car and the Tool is gone', () => {
    const w = flatWorld()
    const ramp = w.tools.find((t) => t.kind === 'ramp')!
    for (const t of w.tools) if (t !== ramp) w.physics.Body.setPosition(t.body, { x: 5000 + t.id * 100, y: t.y }, false)
    w.addDriver(1, ramp.x + w.config.HANDLING.chassisWidth / 2)
    for (let i = 0; i < 60; i++) w.step()
    w.setInput(1, held({ slots: [true, false, false] }))
    w.step()
    w.setInput(1, held({}))
    for (let i = 0; i < 90; i++) w.step()
    expect(ramp.phase).toBe('raised')
    const bodiesBefore = w.physics.allBodies().length
    w.setInput(1, held({ slots: [true, false, false] }))
    w.step()
    w.setInput(1, held({}))
    w.step()
    expect(w.tools.some((t) => t.kind === 'ramp')).toBe(false)
    expect(w.ramps).toHaveLength(1)
    expect(w.ramps[0]!.x).toBeCloseTo(w.chassisX(1) + w.config.TOOL.rampAheadPx, -1)
    const wedge = w.physics.allBodies().find((b) => b.label === 'terrain-ramp')
    expect(wedge?.isStatic).toBe(true)
    expect(w.physics.allBodies().length).toBe(bodiesBefore) // one Tool body out, one wedge in
    expect(w.toolStates().some((t) => t.kind === 'ramp')).toBe(false)
  })
})

describe('water', () => {
  it('the tank starts empty, fills at the Well, waters a sown cell, and gets heavier with water', () => {
    const w = flatWorld()
    const tank = w.tools.find((t) => t.kind === 'tank')!
    expect(tank.fill).toBe(0)
    const m0 = tank.body.mass
    const well = STRIP.places.find((p) => p.kind === 'well')!
    w.physics.Body.setPosition(tank.body, { x: well.x + 50, y: tank.y }, false)
    expect(inPlaceZone('well', well.x + 50)).toBe(true)
    w.step()
    expect(tank.fill).toBe(Math.min(w.config.TOOL.tankCap, w.config.TOOL.waterStock0))
    expect(tank.body.mass).toBeCloseTo(m0 + w.config.TOOL.tankCap * w.config.TOOL.waterMass, 6)
    const x = STRIP.fields[0]!.fromPx + 40
    w.fields.till(x)
    w.fields.sow(x)
    expect(w.fields.water(x)).toBe(true)
    expect(cellState(w.fields.cells(0)[2]!)).toBe(CELL.sown)
  })

  it('the seed bag fills from the Barn stock where it parks, runs out per cell sown, and tops up again inside the Barn zone', () => {
    const w = flatWorld()
    const bag = w.tools.find((t) => t.kind === 'seeds')!
    w.step()
    expect(bag.fill).toBe(Math.min(w.config.TOOL.seedCap, w.config.TOOL.seedStock0))
    const left = w.stocks.seed
    bag.setFill(3)
    w.physics.Body.setPosition(bag.body, { x: 3000, y: bag.y }, false)
    w.step()
    expect(bag.fill).toBe(3)
    const barn = STRIP.places.find((p) => p.kind === 'barn')!
    w.physics.Body.setPosition(bag.body, { x: barn.x + 100, y: bag.y }, false)
    w.step()
    expect(bag.fill).toBe(Math.min(w.config.TOOL.seedCap, 3 + left))
  })
})
