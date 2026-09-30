import { describe, expect, it } from 'vitest'
import { createConfig } from '../config/index.ts'
import { Physics } from './physics.ts'
import { spawnVehicle } from './vehicle.ts'
import { NO_INPUT, World, type HeldInput } from './world.ts'

/** Where the test Vehicles start, px (the flat test Track is the same everywhere). */
const SPAWN_X = 500

/** A World on a flat Track: no Phaser, plain matter-js, driven through the World's own seam. */
function flatWorld(tools = false): World {
  const config = createConfig()
  config.TRACK.thetaDeg = 0
  config.TRACK.crestH = 0
  return new World(config, 7, { tools })
}

const held = (h: Partial<HeldInput>): HeldInput => ({ ...NO_INPUT, ...h })
/** Hold an input for n steps. */
const run = (w: World, id: number, h: Partial<HeldInput>, n: number): void => {
  w.setInput(id, held(h))
  for (let i = 0; i < n; i++) w.step()
}
const stateOf = (w: World, id = 1) => w.vehicleStates().find((v) => v.id === id)!
/** Each Wheel body's gap to the surface, px (about 0 on the ground). */
const gaps = (w: World, id = 1): [number, number] => {
  const spec = w.drivers_(id).vehicle.spec
  const s = stateOf(w, id).sim
  return [0, 1].map((i) => w.surfaceYAt(s.w[i]![0]!) - (s.w[i]![1]! + spec.wheels[i]!.radius)) as [number, number]
}

describe('headless sim', () => {
  it('a Vehicle settles on the Track and drives forward under gas', () => {
    const w = flatWorld()
    w.addDriver(1, SPAWN_X)
    run(w, 1, {}, 90)
    const rest = stateOf(w)
    expect(Math.abs(rest.sim.c[4]!)).toBeLessThan(0.5)
    for (const g of gaps(w)) expect(Math.abs(g)).toBeLessThan(2)
    run(w, 1, { gas: true }, 240)
    expect(stateOf(w).cx - rest.cx).toBeGreaterThan(600)
  })

  it('a Jump leaves the ground and lands again', () => {
    const w = flatWorld()
    w.addDriver(1, SPAWN_X)
    run(w, 1, {}, 90)
    run(w, 1, { jump: true }, 1)
    w.setInput(1, held({}))
    let airborne = 0
    for (let i = 0; i < 120; i++) {
      w.step()
      if (Math.min(...gaps(w)) > 3) airborne++
    }
    expect(airborne).toBeGreaterThan(5)
    for (const g of gaps(w)) expect(Math.abs(g)).toBeLessThan(2)
  })
})

describe('the Wheel Box', () => {
  const config = createConfig()
  const h = config.HANDLING
  const box = () => {
    const physics = new Physics(h.gravityY)
    const vehicle = spawnVehicle(physics, h, 0, 0)
    return { physics, vehicle }
  }
  /** Wheel 0's chassis-local offset (the Chassis is level). */
  const local = (v: ReturnType<typeof box>['vehicle']) => {
    const c = v.bodies.chassis.position
    const w = v.bodies.wheels[0].position
    return { lx: w.x - c.x, ly: w.y - c.y }
  }

  it('projects a Wheel pushed past the box back onto its face', () => {
    const { physics, vehicle } = box()
    const rest = local(vehicle)
    physics.Body.setPosition(vehicle.bodies.wheels[0], { x: vehicle.bodies.wheels[0].position.x - 15, y: vehicle.bodies.wheels[0].position.y }, false)
    vehicle.clampTravel()
    expect(local(vehicle).lx).toBeCloseTo(rest.lx - h.wheelBoxX, 5)
    expect(local(vehicle).ly).toBeCloseTo(rest.ly, 5)
  })

  it('snaps a Wheel flung far out of the box back to its rest pose', () => {
    const { physics, vehicle } = box()
    const rest = local(vehicle)
    physics.Body.setPosition(vehicle.bodies.wheels[0], { x: vehicle.bodies.wheels[0].position.x, y: vehicle.bodies.wheels[0].position.y + 200 }, false)
    vehicle.clampTravel()
    expect(local(vehicle).lx).toBeCloseTo(rest.lx, 5)
    expect(local(vehicle).ly).toBeCloseTo(rest.ly, 5)
  })
})

describe('World vehicle swap', () => {
  it('setVehicle rebuilds the Driver in place as the other kind, keeping the seat', () => {
    const w = flatWorld()
    w.addDriver(1, SPAWN_X)
    expect(w.vehicleKind(1)).toBe('car')
    run(w, 1, {}, 60)
    w.setVehicle(1, 'tractor')
    expect(w.vehicleKind(1)).toBe('tractor')
    expect(Math.abs(w.chassisX(1) - SPAWN_X)).toBeLessThan(30)
    run(w, 1, {}, 120)
    expect(stateOf(w).k).toBe('tractor')
    expect(Math.abs(stateOf(w).ca)).toBeLessThan(0.1)
    w.setVehicle(1, 'tractor') // same kind: no-op
    expect(w.vehicleKind(1)).toBe('tractor')
  })
})

describe('World inputs at Night', () => {
  it('releaseInputs lets go of a held gas: the car stops accelerating', () => {
    const w = flatWorld()
    w.addDriver(1, SPAWN_X)
    run(w, 1, {}, 60)
    run(w, 1, { gas: true }, 120)
    const vDriving = stateOf(w).sim.c[3]!
    expect(vDriving).toBeGreaterThan(2)
    w.releaseInputs()
    for (let i = 0; i < 300; i++) w.step()
    expect(stateOf(w).sim.c[3]!).toBeLessThan(vDriving * 0.5)
  })
})

describe('Flip, Rescue and Respawn', () => {
  it('a flipped Driver stays put until another drives past within Rescue range, then is upright again', () => {
    const w = flatWorld()
    w.addDriver(1, SPAWN_X)
    w.addDriver(2, SPAWN_X - 500)
    for (let i = 0; i < 60; i++) w.step()
    w.restoreSim(1, w.simOf(1), true)
    for (let i = 0; i < 60; i++) w.step()
    expect(w.isFlipped(1)).toBe(true)
    expect(stateOf(w, 1).respawnS).toBeGreaterThan(0)
    // Driver 2 drives over: within range, the Flip ends at once and Driver 1 stands upright where it was.
    w.setInput(2, held({ gas: true }))
    let steps = 0
    while (w.isFlipped(1) && steps < 600) {
      w.step()
      steps++
    }
    expect(steps).toBeLessThan(600)
    expect(Math.abs(w.chassisX(2) - w.chassisX(1))).toBeLessThanOrEqual(w.config.FLIP.rescueRangePx + 20)
    expect(Math.abs(w.chassisX(1) - SPAWN_X)).toBeLessThan(30)
    expect(w.isFlipped(1)).toBe(false)
  })

  it('alone, a flipped Driver waits out the countdown', () => {
    const w = flatWorld()
    w.addDriver(1, SPAWN_X)
    for (let i = 0; i < 60; i++) w.step()
    w.restoreSim(1, w.simOf(1), true)
    for (let i = 0; i < 300; i++) w.step()
    expect(w.isFlipped(1)).toBe(true)
  })

  it('a Respawn drops every hitched Tool', () => {
    const w = flatWorld(true)
    const plough = w.tools.find((t) => t.kind === 'plough')!
    w.addDriver(1, plough.x + w.config.HANDLING.chassisWidth / 2)
    run(w, 1, {}, 60)
    run(w, 1, { slots: [true, false, false] }, 1)
    run(w, 1, {}, 90)
    expect(w.toolStates().find((t) => t.kind === 'plough')?.slot).toEqual([1, 1])
    w.respawn(1, plough.x + 400)
    expect(w.toolStates().find((t) => t.kind === 'plough')?.slot).toBeNull()
    run(w, 1, {}, 60)
    expect(Math.abs(w.chassisX(1) - (plough.x + 400))).toBeLessThan(30)
    expect(Math.abs(stateOf(w).ca)).toBeLessThan(0.1)
  })
})
