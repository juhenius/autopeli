import { describe, expect, it } from 'vitest'
import { createConfig } from '../../config/index.ts'
import { NO_INPUT, World, type HeldInput } from '../world.ts'
import type { VehicleKind } from './spec.ts'

/** Where the test Vehicles start, px (the flat test Track is the same everywhere). */
const SPAWN_X = 200

/** A World with one Driver of a kind on a flat Track (or the hills, with `hills`, spawned at `x`). */
function flat(kind: VehicleKind, hills = false, x = SPAWN_X): World {
  const config = createConfig()
  if (!hills) {
    config.TRACK.thetaDeg = 0
    config.TRACK.crestH = 0
  }
  const w = new World(config, 7, { tools: false })
  w.addDriver(1, x, w.specFor(kind))
  return w
}

const held = (h: Partial<HeldInput>): HeldInput => ({ ...NO_INPUT, ...h })
const run = (w: World, h: Partial<HeldInput>, n: number): void => {
  w.setInput(1, held(h))
  for (let i = 0; i < n; i++) w.step()
}
const state = (w: World) => w.vehicleStates()[0]!
/** The Chassis: position, angle, velocity. */
const chassis = (w: World) => {
  const c = state(w).sim.c
  return { x: c[0]!, y: c[1]!, angle: c[2]!, vx: c[3]!, vy: c[4]! }
}
/** Wheel body i: position and spin. */
const wheel = (w: World, i: 0 | 1) => {
  const b = state(w).sim.w[i]
  return { x: b[0]!, y: b[1]!, omega: b[5]! }
}
/** The Chassis's mass: the only reach into the bodies, for the force comparison. */
const mass = (w: World): number => w.drivers_(1).vehicle.bodies.chassis.mass
/** Press the Turn and let its animation finish (the Wheels swap at its mid-point). */
const turn = (w: World): void => {
  run(w, { turn: true }, 1)
  run(w, {}, 20)
}
const gas = { gas: true }
const left = { brake: true }

const topSpeed = (kind: VehicleKind): number => {
  const w = flat(kind)
  run(w, {}, 90)
  run(w, gas, 600)
  return chassis(w).vx
}

describe('the Tractor', () => {
  it('settles level on the flat with both wheels on the ground, and is slower than the Car', () => {
    const w = flat('tractor')
    run(w, {}, 120)
    const spec = w.specFor('tractor')
    for (const i of [0, 1] as const) expect(Math.abs(w.surfaceYAt(wheel(w, i).x) - (wheel(w, i).y + spec.wheels[i].radius)), `wheel ${i} on the ground`).toBeLessThan(6)
    expect(Math.abs(chassis(w).angle)).toBeLessThan(0.08)
    const car = topSpeed('car')
    const tractor = topSpeed('tractor')
    expect(tractor).toBeGreaterThan(0.4 * car)
    expect(tractor).toBeLessThan(0.8 * car)
  })

  it('pulls harder: more motor impulse from rest than the Car over the first steps', () => {
    const accel = (kind: VehicleKind): number => {
      const w = flat(kind)
      run(w, {}, 90)
      const x0 = chassis(w).x
      run(w, gas, 30)
      // Distance from rest in half a second, normalised by mass: force, not just acceleration.
      return (chassis(w).x - x0) * mass(w)
    }
    expect(accel('tractor')).toBeGreaterThan(accel('car'))
  })

  it('mirrors at a Turn: the big wheel changes sides, both wheels stay on the ground, only the rear drives', () => {
    const w = flat('tractor')
    run(w, {}, 120)
    expect(wheel(w, 0).x).toBeLessThan(wheel(w, 1).x)
    const rearRadius = w.config.TRACTOR.rearRadius
    turn(w)
    expect(wheel(w, 0).x).toBeGreaterThan(wheel(w, 1).x)
    const v = w.drivers_(1).vehicle
    expect(v.hitchLocal(1).x).toBeLessThan(0)
    expect(v.hitchLocal(3).x).toBeGreaterThan(0)
    // Facing left, Slot 1 (left) is now the front hitch: closer in than the rear hitch that Slot 3 holds.
    expect(Math.abs(v.hitchLocal(1).x)).toBeLessThan(Math.abs(v.hitchLocal(3).x))
    run(w, {}, 120)
    expect(Math.abs(wheel(w, 0).y + rearRadius - w.surfaceYAt(wheel(w, 0).x))).toBeLessThan(6)
    expect(Math.abs(chassis(w).angle)).toBeLessThan(0.08)
    // No hop: the chassis barely moves vertically through the swap.
    const w2 = flat('tractor')
    run(w2, {}, 120)
    const y0 = chassis(w2).y
    run(w2, { turn: true }, 1)
    w2.setInput(1, held({}))
    let maxDy = 0
    let maxVy = 0
    for (let i = 0; i < 40; i++) {
      w2.step()
      maxDy = Math.max(maxDy, Math.abs(chassis(w2).y - y0))
      maxVy = Math.max(maxVy, Math.abs(chassis(w2).vy))
    }
    expect(maxDy).toBeLessThan(3)
    expect(maxVy).toBeLessThan(0.6)
    // Gas still spins the rear (index 0) and not the front.
    run(w, gas, 20)
    expect(Math.abs(wheel(w, 0).omega)).toBeGreaterThan(0.05)
    expect(chassis(w).x).toBeGreaterThan(SPAWN_X)
  })
})

describe('the gears follow the facing', () => {
  for (const kind of ['car', 'tractor'] as const) {
    it(`${kind}: after a Turn the left pad is the forward gear, as fast leftwards as the right pad was rightwards`, () => {
      const w = flat(kind)
      run(w, {}, 90)
      const right = topSpeed(kind)
      // Turned: the left pad now drives the forward gear leftwards.
      turn(w)
      run(w, left, 600)
      const leftSpeed = -chassis(w).vx
      expect(leftSpeed).toBeGreaterThan(0.9 * right)
      expect(leftSpeed).toBeLessThan(1.1 * right)
      // The spring loads (the grip budget) are the same both ways: the anchors follow the swap.
      const w3 = flat(kind)
      run(w3, {}, 120)
      const before = w3.drivers_(1).vehicle.springCompressions()
      turn(w3)
      run(w3, {}, 120)
      const after = w3.drivers_(1).vehicle.springCompressions()
      for (const i of [0, 1] as const) {
        expect(Math.abs(after[i] - before[i]), `${kind} wheel ${i} load after the Turn`).toBeLessThan(2)
      }
      // And it pulls away as hard leftwards: distance from rest in half a second, both ways.
      const pull = (dir: 1 | -1): number => {
        const v = flat(kind)
        run(v, {}, 120)
        if (dir === -1) turn(v)
        const x0 = chassis(v).x
        run(v, dir === 1 ? gas : left, 30)
        return dir * (chassis(v).x - x0)
      }
      const pr = pull(1)
      const pl = pull(-1)
      expect(pl, `${kind} pull left ${pl.toFixed(1)} vs right ${pr.toFixed(1)}`).toBeGreaterThan(0.85 * pr)
      expect(pl).toBeLessThan(1.15 * pr)
      // And the right pad is now the reverse gear: slower.
      const w2 = flat(kind)
      run(w2, {}, 90)
      turn(w2)
      run(w2, gas, 600)
      expect(chassis(w2).vx).toBeLessThan(0.8 * right)
      expect(chassis(w2).vx).toBeGreaterThan(0)
    })
  }
})

describe('a Turn on a slope', () => {
  for (const kind of ['car', 'tractor'] as const) {
    it(`${kind}: the wheels stay on the hill and nothing flies away`, () => {
      // Find a steep spot on the hills past the Strip's flats.
      const probe = flat(kind, true, 6000)
      let x = 6000
      for (let sx = 6000; sx < 12000; sx += 10) {
        const slope = (probe.surfaceYAt(sx + 5) - probe.surfaceYAt(sx - 5)) / 10
        if (Math.abs(slope) > 0.6) {
          x = sx
          break
        }
      }
      // A control run without the Turn: the same free roll down the hill.
      const roll = (withTurn: boolean) => {
        const w = flat(kind, true, x)
        run(w, {}, 120)
        if (withTurn) run(w, { turn: true }, 1)
        w.setInput(1, held({}))
        const speeds: number[] = []
        for (let i = 0; i < 70; i++) {
          w.step()
          speeds.push(Math.hypot(chassis(w).vx, chassis(w).vy))
        }
        const spec = w.drivers_(1).vehicle.spec
        const gaps = ([0, 1] as const).map((i) => wheel(w, i).y + spec.wheels[i].radius - w.surfaceYAt(wheel(w, i).x))
        return { speeds, gaps, angle: chassis(w).angle }
      }
      const control = roll(false)
      const turned = roll(true)
      for (let i = 0; i < 70; i++) expect(turned.speeds[i]!, `speed at step ${i}`).toBeLessThan(control.speeds[i]! + 3)
      // The wheels swapped places, so compare the two gaps as a pair (one may hang over a lip in both runs).
      const sorted = (g: number[]): number[] => g.map(Math.abs).sort((a, b) => a - b)
      for (const [i, g] of sorted(turned.gaps).entries()) expect(g, `gap ${i}`).toBeLessThan(sorted(control.gaps)[i]! + 14)
      expect(Math.abs(turned.angle - control.angle)).toBeLessThan(0.5)
    })
  }
})

describe('the Tractor’s hitch points', () => {
  it('are all within hitchReach of a tool lying on the ground beside it', () => {
    const w = flat('tractor')
    run(w, {}, 120)
    const c = chassis(w)
    const surfaceY = w.surfaceYAt(c.x)
    const ringAboveGround = 20 // a parked tool's ring, roughly
    for (const slot of [1, 2, 3] as const) {
      const h = w.drivers_(1).vehicle.hitchLocal(slot)
      const hy = c.y + h.y
      expect(surfaceY - ringAboveGround - hy, `slot ${slot} height over a parked ring`).toBeLessThan(w.config.TOOL.hitchReach - 10)
    }
  })
})
