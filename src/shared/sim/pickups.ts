/**
 * Pickups: seed packets and water drops scattered along the hills, the
 * reason to drive further (farm slice 4). Pure and seeded per Day: the
 * server lays them, any car that drives through one takes it, and it lands
 * in the Barn's seed stock or the Well's water stock on the spot. Clusters
 * get denser with distance from the Farmhouse; none in a Place's flat or a
 * Field. Endless: a cursor per direction lays clusters as far as anyone
 * drives, deterministically, so the hills never run out.
 */
import type { Config } from '../config/index.ts'
import { hash01 } from './track/index.ts'
import { FARMHOUSE_X, STRIP } from './strip.ts'

export type PickupKind = 'seed' | 'water'

export interface Pickup {
  id: number
  kind: PickupKind
  x: number
}

/** How far out the first lay of a Day reaches, px from the Farmhouse; further as cars go further. */
export const PICKUP_RANGE_PX = 12_000
/** Pickups are laid this far ahead of the furthest car, in one go, twice as far. */
export const PICKUP_AHEAD_PX = 4000

/** Where the next cluster goes in one direction. */
export interface PickupCursor {
  dir: 1 | -1
  cluster: number
  x: number
}

export const startCursor = (dir: 1 | -1, config: Config): PickupCursor => ({ dir, cluster: 0, x: FARMHOUSE_X + dir * config.TOOL.pickupNearPx })

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t

/** True where nothing is laid: a Place's flat or a Field, with a margin. */
function keepClear(p: Config['TRACK'], x: number): boolean {
  for (const place of STRIP.places) if (Math.abs(x - place.x) < p.placeFlatPx) return true
  for (const f of STRIP.fields) if (x > f.fromPx - 120 && x < f.toPx + 120) return true
  return false
}

/** Lay clusters from the cursor until |x − home| reaches `untilPx`, advancing the cursor and the id counter.
 * Cluster spacing shrinks from `pickupNearPx` at home to `pickupFarPx` at `pickupFarDistPx`. */
export function layUntil(seed: number, day: number, config: Config, cursor: PickupCursor, untilPx: number, ids: { next: number }): Pickup[] {
  const t = config.TOOL
  const daySeed = (seed ^ (day * 0x9e3779b1)) >>> 0
  const out: Pickup[] = []
  while (Math.abs(cursor.x - FARMHOUSE_X) < untilPx) {
    cursor.cluster++
    const key = cursor.dir * 100_000 + cursor.cluster
    const kind: PickupKind = hash01(daySeed, key * 31 + 7) < 0.5 ? 'seed' : 'water'
    const n = Math.max(1, Math.round(t.pickupCluster * (0.6 + 0.8 * hash01(daySeed, key * 31 + 11))))
    const centre = cursor.x + (hash01(daySeed, key * 31 + 13) - 0.5) * 120
    if (!keepClear(config.TRACK, centre)) {
      for (let i = 0; i < n; i++) {
        const px = centre + (i - (n - 1) / 2) * 26 + (hash01(daySeed, key * 31 + 17 + i) - 0.5) * 12
        if (!keepClear(config.TRACK, px)) out.push({ id: ids.next++, kind, x: Math.round(px) })
      }
    }
    const far = Math.min(1, Math.abs(cursor.x - FARMHOUSE_X) / Math.max(1, t.pickupFarDistPx))
    cursor.x += cursor.dir * lerp(t.pickupNearPx, t.pickupFarPx, far) * (0.8 + 0.4 * hash01(daySeed, key * 31 + 19))
  }
  return out
}

/** The Day's first lay, both ways out to PICKUP_RANGE_PX (tests and a fresh Day). */
export function layPickups(seed: number, day: number, config: Config): Pickup[] {
  const ids = { next: 1 }
  return [...layUntil(seed, day, config, startCursor(-1, config), PICKUP_RANGE_PX, ids), ...layUntil(seed, day, config, startCursor(1, config), PICKUP_RANGE_PX, ids)]
}
