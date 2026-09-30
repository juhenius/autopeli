/**
 * TerrainView: the client's Terrain drawing. No bodies — the server has
 * those. Keeps a window of drawn Chunks around a centre x (the camera),
 * built from the same seeded Track the server simulates, so what you see is
 * what the cars drive on.
 */
import type Phaser from 'phaser'
import type { Config } from '../../shared/config'
import { BASE_Y } from '../../shared/sim/terrain'
import { CHUNK_WIDTH, type Track } from '../../shared/sim/track'
import { TerrainGfx } from './terrainGfx'

/** Chunks kept on each side of the centre (the view is ~2.5 Chunks wide). */
const AROUND = 3

export class TerrainView {
  private readonly gfx: TerrainGfx
  private readonly drawn = new Set<number>()

  constructor(
    scene: Phaser.Scene,
    private readonly config: Config,
    private readonly track: Track,
    private readonly seed: number,
  ) {
    this.gfx = new TerrainGfx(scene, config.PALETTE)
  }

  stream(centerX: number): void {
    const cur = Math.floor(centerX / CHUNK_WIDTH)
    const wanted = new Set<number>()
    for (let i = cur - AROUND; i <= cur + AROUND; i++) wanted.add(i)
    for (const i of wanted) {
      if (this.drawn.has(i)) continue
      const pts = this.track.chunkPoints(this.seed, i).map((p) => ({ x: p.x, y: BASE_Y - p.elevation }))
      this.gfx.build(i, pts)
      this.drawn.add(i)
    }
    for (const i of [...this.drawn]) {
      if (!wanted.has(i)) {
        this.gfx.dispose(i)
        this.drawn.delete(i)
      }
    }
  }

  get chunkCount(): number {
    return this.drawn.size
  }

  surfaceYAt(x: number): number {
    return BASE_Y - this.track.surfaceHeight(this.seed, x)
  }

  /** Redraw everything (a rebuild dial changed the Track). */
  reset(): void {
    for (const i of [...this.drawn]) this.gfx.dispose(i)
    this.drawn.clear()
    void this.config
  }

  destroy(): void {
    this.gfx.destroy()
    this.drawn.clear()
  }
}
