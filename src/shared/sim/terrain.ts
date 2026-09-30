/**
 * TerrainBodies: sole owner of Terrain bodies. One thick rotated static
 * slab per segment (never fromVertices — decomposition seams are real
 * collision edges); drawing is the client's through the hooks. Spawn/dispose
 * only from the sim step, never from collision events.
 */
import type { Config } from '../config/index.ts'
import type { Body, Physics } from './physics.ts'
import { CHUNK_WIDTH, type Track, type TrackPoint } from './track/index.ts'

/** Drawing hooks: the client's TerrainGfx draws what the bodies cover. Points are world px, y down. */
export interface TerrainHooks {
  build?(index: number, pts: { x: number; y: number }[]): void
  dispose?(index: number): void
}

/** World y of the mean surface: world y = BASE_Y − elevation. A terrain constant — track never sees it. */
export const BASE_Y = 520

/** Chunks kept on each side of the Chassis and of every anchor (the floor: the camera look-ahead shows ~830 px). */
const AHEAD = 2

/**
 * Slab end extension at a joint: +overlap/2 normally, so joints seal. At a
 * joint turned downward by more than 90° (a Crest lip) a slab's deep corner
 * would punch through the neighbour's top face — an invisible wall on the
 * lip approach and a bump on the cliff face — so trim the end back by
 * thickness·(−cosΔ)/sinΔ (+1 px margin) instead: a mitre. Capped at 45 % of
 * the segment so a slab never degenerates.
 */
function endExtension(
  prevAngle: number,
  nextAngle: number,
  thickness: number,
  overlap: number,
  len: number,
): number {
  let d = nextAngle - prevAngle
  d = Math.atan2(Math.sin(d), Math.cos(d))
  if (d <= Math.PI / 2) return overlap / 2
  return -Math.min((thickness * -Math.cos(d)) / Math.sin(d) + 1, len * 0.45)
}

interface Chunk {
  index: number
  bodies: Body[]
}

export class TerrainBodies {
  private chunks = new Map<number, Chunk>()
  private spawnedCount = 0

  constructor(
    private readonly physics: Physics,
    private readonly config: Config,
    private readonly track: Track,
    private readonly seed: number,
    private readonly hooks: TerrainHooks = {},
  ) {}

  /** Number of Chunks alive (perf readout). */
  get chunkCount(): number {
    return this.chunks.size
  }

  /** Total Chunks spawned over the streamer's life (perf readout). */
  get spawned(): number {
    return this.spawnedCount
  }

  /** Every Terrain body alive — for live terrainFriction tuning. */
  forEachBody(fn: (body: Body) => void): void {
    for (const c of this.chunks.values()) for (const b of c.bodies) fn(b)
  }

  /** Keep Chunks around the Chassis and around every extra anchor (a parked Tool needs ground under it). Called from the World step. */
  stream(chassisX: number, anchors: readonly number[] = []): void {
    const wanted = new Set<number>()
    for (const x of [chassisX, ...anchors]) {
      const cur = Math.floor(x / CHUNK_WIDTH)
      for (let i = cur - AHEAD; i <= cur + AHEAD; i++) wanted.add(i)
    }
    for (const i of wanted) {
      if (!this.chunks.has(i)) this.chunks.set(i, this.buildChunk(i))
    }
    for (const c of [...this.chunks.values()]) {
      if (!wanted.has(c.index)) this.disposeChunk(c)
    }
  }

  /** Dispose every Chunk (restart). */
  disposeAll(): void {
    for (const c of [...this.chunks.values()]) this.disposeChunk(c)
  }

  private buildChunk(index: number): Chunk {
    const { TRACK, HANDLING } = this.config
    const pts = this.track
      .chunkPoints(this.seed, index)
      .map((p: TrackPoint) => ({ x: p.x, y: BASE_Y - p.elevation }))

    // One phantom point beyond each end so joint angles at Chunk edges are known.
    const first = pts[0]!
    const last = pts[pts.length - 1]!
    const ext = [
      { x: first.x - TRACK.segLen, y: BASE_Y - this.track.surfaceHeight(this.seed, first.x - TRACK.segLen) },
      ...pts,
      { x: last.x + TRACK.segLen, y: BASE_Y - this.track.surfaceHeight(this.seed, last.x + TRACK.segLen) },
    ]
    const angles: number[] = []
    for (let k = 0; k < ext.length - 1; k++) {
      angles.push(Math.atan2(ext[k + 1]!.y - ext[k]!.y, ext[k + 1]!.x - ext[k]!.x))
    }

    const bodies: Body[] = []
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]!
      const b = pts[i + 1]!
      const dx = b.x - a.x
      const dy = b.y - a.y
      const len = Math.hypot(dx, dy)
      const angle = Math.atan2(dy, dx)
      // Slab centre sits half a thickness BELOW the segment midpoint: in screen
      // coordinates the outward normal (-dy, dx)/len of a left-to-right segment
      // points down (y grows downward).
      const nx = -dy / len
      const ny = dx / len
      // Per-end extension: overlap/2, or a mitre trim at a sharp Crest-lip joint.
      const e0 = endExtension(angles[i]!, angles[i + 1]!, TRACK.slab, TRACK.overlap, len)
      const e1 = endExtension(angles[i + 1]!, angles[i + 2]!, TRACK.slab, TRACK.overlap, len)
      const cx = (a.x + b.x) / 2 + (dx / len) * ((e1 - e0) / 2) + nx * (TRACK.slab / 2)
      const cy = (a.y + b.y) / 2 + (dy / len) * ((e1 - e0) / 2) + ny * (TRACK.slab / 2)
      bodies.push(
        this.physics.rectangle(cx, cy, len + e0 + e1, TRACK.slab, {
          isStatic: true,
          angle,
          friction: HANDLING.terrainFriction,
          restitution: 0,
          chamfer: TRACK.chamfer > 0 ? { radius: TRACK.chamfer } : undefined,
          label: `terrain-${index}`,
        }),
      )
    }

    this.hooks.build?.(index, pts)
    this.spawnedCount++
    return { index, bodies }
  }

  private disposeChunk(c: Chunk): void {
    this.physics.remove(c.bodies)
    this.hooks.dispose?.(c.index)
    this.chunks.delete(c.index)
  }
}
