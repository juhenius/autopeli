/**
 * Track: pure, stateless functions of (seed, x) — any Chunk builds
 * independently; same seed, same Track; the hills run both ways from
 * the Farmhouse. Elevation is in px, up-positive; the terrain module maps
 * it to world y = BASE_Y − elevation (track never sees BASE_Y).
 * No Phaser imports.
 */
import type { Config } from '../../config/index.ts'

export type TrackParams = Config['TRACK']

/** Chunk width, px (a fixed fact, not a tunable). */
export const CHUNK_WIDTH = 512

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v)
const degToRad = (deg: number): number => (deg * Math.PI) / 180

/** Integer hash → [0, 1). Deterministic per (seed, n). */
export function hash01(seed: number, n: number): number {
  let h = (n * 0x9e3779b1) ^ (seed * 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d)
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39)
  h ^= h >>> 15
  return (h >>> 0) / 4294967296
}

/** Value noise: random control points every `period` px, cosine-interpolated. */
export function valueNoise(seed: number, x: number, period: number, octave: number): number {
  const i = Math.floor(x / period)
  const t = x / period - i
  const s = (1 - Math.cos(t * Math.PI)) / 2
  const a = hash01(seed, i * 7919 + octave * 104729)
  const b = hash01(seed, (i + 1) * 7919 + octave * 104729)
  return a + (b - a) * s
}

/** Amplitude from the target max slope: worst-case slope of the two octaves is 1.75·π·A/W. */
export function amp(p: TrackParams): number {
  return (Math.tan(degToRad(p.thetaDeg)) * p.wavelength) / (1.75 * Math.PI)
}

/** World x where this cell's Crest starts, or null if the cell has none. */
/** A stretch of x that gets no Crest (the Fields). */
export type Span = readonly [number, number]

export function crestOriginX(p: TrackParams, seed: number, cell: number, crestFree: readonly Span[] = []): number | null {
  const cellX = cell * p.crestCell
  if (p.crestH <= 0) return null
  if (hash01(seed, cell * 26041 + 777767) >= p.crestP) return null
  const x0 = cellX + hash01(seed, cell * 48619 + 393919) * (p.crestCell - (p.crestL + p.segLen))
  // A Crest is placed whole or not at all: one whose ramp or drop would touch a crest-free span is skipped.
  const x1 = x0 + p.crestL + p.segLen
  for (const [from, to] of crestFree) if (x1 > from && x0 < to) return null
  return x0
}

/** Which way a cell's Crest launches: true = a ramp on the left and the drop on the right (for driving right),
 * false = the mirror image, so a car driving left gets its own launches. Half and half, from the seed. */
export function crestFacesRight(seed: number, cell: number): boolean {
  return hash01(seed, cell * 15731 + 2027) < 0.5
}

/** A Crest added on top of the noise: a linear rise over crestL and a one-segment drop, either way round. */
export function crestAt(p: TrackParams, seed: number, x: number, crestFree: readonly Span[] = []): number {
  const cell = Math.floor(x / p.crestCell)
  const x0 = crestOriginX(p, seed, cell, crestFree)
  if (x0 === null) return 0
  const span = p.crestL + p.segLen
  let u = x - x0
  if (u <= 0 || u >= span) return 0
  if (!crestFacesRight(seed, cell)) u = span - u // mirror: the drop on the left, the ramp rising toward the right
  return u <= p.crestL ? (p.crestH * u) / p.crestL : p.crestH * (1 - (u - p.crestL) / p.segLen)
}

/** The rolling-hills part only (no Crest): noise · A. Exposed for the slope sweep test. */
export function noiseElevation(p: TrackParams, seed: number, x: number): number {
  const n =
    (valueNoise(seed, x, p.wavelength, 0) - 0.5) * 2 +
    (valueNoise(seed, x, p.wavelength / 3, 1) - 0.5) * 0.5
  return n * amp(p)
}

/**
 * Flat-spot mask at x for the given flat centres (the Places): 1 within the
 * inner half of placeFlatPx of a centre, cosine-blended to 0 at the full
 * distance, so buildings sit on level ground.
 */
export function flatMask(p: TrackParams, flats: readonly number[], x: number): number {
  let m = 0
  const outer = p.placeFlatPx
  const inner = outer / 2
  for (const c of flats) {
    const d = Math.abs(x - c)
    if (d >= outer) continue
    if (d <= inner) return 1
    const t = (d - inner) / (outer - inner)
    m = Math.max(m, (1 + Math.cos(t * Math.PI)) / 2)
  }
  return m
}

/** The nearest flat centre to x within placeFlatPx, or null. */
function nearestFlat(p: TrackParams, flats: readonly number[], x: number): number | null {
  let best: number | null = null
  for (const c of flats) if (Math.abs(x - c) < p.placeFlatPx && (best === null || Math.abs(x - c) < Math.abs(x - best))) best = c
  return best
}

/** Surface elevation at world x, px, up-positive. Around a flat centre the
 * hills blend to the mean level (elevation 0), never to the centre's own
 * height: every Place then sits at the same height, so two overlapping
 * flats (the Barn and the Farmhouse) share a level yard instead of meeting
 * in a step, and the blend into the hills is at most the noise amplitude.
 * Crests are suppressed there. */
export function surfaceHeight(p: TrackParams, seed: number, x: number, flats: readonly number[] = [], crestFree: readonly Span[] = []): number {
  const crest = crestAt(p, seed, x, crestFree)
  const c = nearestFlat(p, flats, x)
  if (c === null) return noiseElevation(p, seed, x) + crest
  const m = flatMask(p, flats, x)
  return (noiseElevation(p, seed, x) + crest) * (1 - m)
}

export interface TrackPoint {
  x: number
  elevation: number
}

/**
 * The surface points of one Chunk: segsPerChunk + 1 points (17 at segLen 32),
 * x = chunkIndex·512 + k·segLen. Endpoints are shared with the neighbouring
 * Chunks; negative indices are valid.
 */
export function chunkPoints(
  p: TrackParams,
  seed: number,
  chunkIndex: number,
  flats: readonly number[] = [],
  crestFree: readonly Span[] = [],
): TrackPoint[] {
  const segs = Math.max(1, Math.round(CHUNK_WIDTH / p.segLen))
  const x0 = chunkIndex * CHUNK_WIDTH
  const pts: TrackPoint[] = []
  for (let k = 0; k <= segs; k++) {
    const x = x0 + k * p.segLen
    pts.push({ x, elevation: surfaceHeight(p, seed, x, flats, crestFree) })
  }
  return pts
}

/** The public track surface with params bound — what the composition root hands to terrain. */
export interface Track {
  surfaceHeight(seed: number, x: number): number
  chunkPoints(seed: number, chunkIndex: number): TrackPoint[]
}

/** `flats`: world x centres to level the Terrain around (the Places); `crestFree`: spans that get no Crest (the Fields). */
export function createTrack(p: TrackParams, flats: readonly number[] = [], crestFree: readonly Span[] = []): Track {
  return {
    surfaceHeight: (seed, x) => surfaceHeight(p, seed, x, flats, crestFree),
    chunkPoints: (seed, chunkIndex) => chunkPoints(p, seed, chunkIndex, flats, crestFree),
  }
}
