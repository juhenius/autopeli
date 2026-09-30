import { describe, expect, it } from 'vitest'
import { createConfig } from '../../config/index.ts'
import { CHUNK_WIDTH, chunkPoints, crestAt, crestFacesRight, crestOriginX, noiseElevation, surfaceHeight } from './index.ts'

const P = createConfig().TRACK

describe('track', () => {
  it('is deterministic: same seed → identical points, different seeds differ', () => {
    for (const index of [-3, 0, 1, 7, 100]) {
      expect(chunkPoints(P, 12345, index)).toEqual(chunkPoints(P, 12345, index))
    }
    const a = chunkPoints(P, 1, 5)
    const b = chunkPoints(P, 2, 5)
    expect(a.map((p) => p.elevation)).not.toEqual(b.map((p) => p.elevation))
  })

  it('noise-only |slope| stays ≤ thetaDeg at every sampled x, many seeds', () => {
    const limit = Math.tan(((P.thetaDeg + 1) * Math.PI) / 180) // 1° sampling margin
    for (let seed = 1; seed <= 20; seed++) {
      let prev = noiseElevation(P, seed, -20008)
      for (let x = -20000; x <= 40000; x += 8) {
        const h = noiseElevation(P, seed, x)
        expect(Math.abs(h - prev) / 8, `seed ${seed} x ${x}`).toBeLessThanOrEqual(limit)
        prev = h
      }
    }
  })

  it('Crest count per km sits in the expected band', () => {
    // p = crestP (0.45) per cell, so expect ~45 of 100 with a generous band.
    for (const seed of [1, 5, 77, 1234, 987654]) {
      let count = 0
      for (let cell = -50; cell <= 49; cell++) {
        if (crestOriginX(P, seed, cell) !== null) count++
      }
      expect(count, `seed ${seed}`).toBeGreaterThanOrEqual(20)
      expect(count, `seed ${seed}`).toBeLessThanOrEqual(75)
    }
  })

  it('consecutive Chunks share their endpoint', () => {
    for (const seed of [1, 42]) {
      for (const index of [-2, -1, 0, 3, 50]) {
        const cur = chunkPoints(P, seed, index)
        const next = chunkPoints(P, seed, index + 1)
        expect(cur[cur.length - 1]).toEqual(next[0])
        expect(cur[0]!.x).toBe(index * CHUNK_WIDTH)
      }
    }
  })
})

describe('track flats (Places)', () => {
  it('is level within the inner half of placeFlatPx and continuous across the blend', () => {
    const c = 20_000
    for (const seed of [3, 77, 4242]) {
      expect(surfaceHeight(P, seed, c, [c])).toBeCloseTo(0, 9) // every flat sits at the mean level
      for (let x = c - P.placeFlatPx / 2; x <= c + P.placeFlatPx / 2; x += 16) {
        expect(surfaceHeight(P, seed, x, [c])).toBeCloseTo(0, 6)
      }
      // Continuous: a step no larger than the unflattened terrain's own step there (Crest edges are steep).
      let prev = surfaceHeight(P, seed, c - P.placeFlatPx - 100, [c])
      let prevBase = surfaceHeight(P, seed, c - P.placeFlatPx - 100)
      for (let x = c - P.placeFlatPx - 99; x <= c + P.placeFlatPx + 100; x += 4) {
        const h = surfaceHeight(P, seed, x, [c])
        const base = surfaceHeight(P, seed, x)
        expect(Math.abs(h - prev)).toBeLessThan(Math.max(6, Math.abs(base - prevBase) + 1))
        prev = h
        prevBase = base
      }
      // Untouched far away.
      expect(surfaceHeight(P, seed, c + 5000, [c])).toBe(surfaceHeight(P, seed, c + 5000))
    }
  })
})

describe('two overlapping flats (the Barn and the Farmhouse)', () => {
  it('share one level yard and blend into the hills no steeper than the hills themselves (Crests aside)', () => {
    const Q = { ...P, crestH: 0 }
    const flats = [-900, 0]
    for (let seed = 1; seed <= 40; seed++) {
      let prev = surfaceHeight(Q, seed, -2000, flats)
      let worst = 0
      let yard = 0
      for (let x = -1996; x <= 1000; x += 4) {
        const h = surfaceHeight(Q, seed, x, flats)
        worst = Math.max(worst, Math.abs(h - prev) / 4)
        if (x > -900 && x < 0) yard = Math.max(yard, Math.abs(h))
        prev = h
      }
      expect(Math.atan(worst) * (180 / Math.PI), `seed ${seed}`).toBeLessThan(Q.thetaDeg + 8)
      expect(yard, `seed ${seed}`).toBeLessThan(1e-6)
    }
  })
})

describe('crest-free spans (the Fields)', () => {
  it('places no Crest touching a Field, whole or in part, for many seeds', () => {
    const spans: [number, number][] = [
      [900, 2100],
      [3200, 4400],
    ]
    for (let seed = 1; seed <= 60; seed++) {
      for (const [from, to] of spans) {
        for (let x = from - 1; x <= to + 1; x += 4) {
          // The surface with and without Crests is identical across the span: no Crest contributes there.
          expect(surfaceHeight(P, seed, x, [], spans), `seed ${seed} x ${x}`).toBe(surfaceHeight({ ...P, crestH: 0 }, seed, x, [], spans))
        }
      }
      // Elsewhere Crests still happen.
      let crests = 0
      for (let cell = -50; cell <= 60; cell++) if (crestOriginX(P, seed, cell, spans) !== null) crests++
      expect(crests).toBeGreaterThan(10)
    }
  })
})

describe('Crest orientation', () => {
  it('is half and half across cells, and a mirrored Crest is the right-facing one reflected', () => {
    let right = 0
    const N = 400
    for (let cell = 0; cell < N; cell++) if (crestFacesRight(7, cell)) right++
    expect(right).toBeGreaterThan(N * 0.4)
    expect(right).toBeLessThan(N * 0.6)
    // Find one Crest of each orientation and check the shapes mirror: the steep side is on the drop's side.
    const span = P.crestL + P.segLen
    for (const wantRight of [true, false]) {
      let cell = 1
      while (crestOriginX(P, 7, cell) === null || crestFacesRight(7, cell) !== wantRight) cell++
      const x0 = crestOriginX(P, 7, cell)!
      const early = crestAt(P, 7, x0 + P.segLen / 2) // within one segment of the start
      const late = crestAt(P, 7, x0 + span - P.segLen / 2) // within one segment of the end
      if (wantRight) expect(early).toBeLessThan(late) // gentle start, cliff at the end
      else expect(early).toBeGreaterThan(late) // cliff at the start, gentle end
    }
  })
})
