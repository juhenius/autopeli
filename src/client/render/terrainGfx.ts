/**
 * TerrainGfx: draws one filled polygon per Terrain Chunk, fed by the sim's
 * TerrainBodies through its build / dispose hooks. Drawing only.
 */
import Phaser from 'phaser'
import { hexToNum } from '../../shared/colours'
import type { Config } from '../../shared/config'
import type { TrackPoint } from '../../shared/sim/track'
import { BASE_Y } from '../../shared/sim/terrain'

export class TerrainGfx {
  private readonly chunks = new Map<number, Phaser.GameObjects.Graphics>()

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly palette: Config['PALETTE'],
  ) {}

  /** Points are world px (y down), as TerrainBodies hands them over. */
  build(index: number, pts: { x: number; y: number }[]): void {
    const { palette } = this
    const gfx = this.scene.add.graphics().setDepth(1)
    const floor = BASE_Y + 400
    gfx.fillStyle(hexToNum(palette.terrainFill), 1)
    gfx.beginPath()
    gfx.moveTo(pts[0]!.x, floor)
    for (const p of pts) gfx.lineTo(p.x, p.y)
    gfx.lineTo(pts[pts.length - 1]!.x, floor)
    gfx.closePath()
    gfx.fillPath()
    gfx.lineStyle(palette.terrainLineWidth, hexToNum(palette.terrainLine), 1)
    gfx.beginPath()
    gfx.moveTo(pts[0]!.x, pts[0]!.y)
    for (const p of pts) gfx.lineTo(p.x, p.y)
    gfx.strokePath()
    this.chunks.get(index)?.destroy()
    this.chunks.set(index, gfx)
  }

  dispose(index: number): void {
    this.chunks.get(index)?.destroy()
    this.chunks.delete(index)
  }

  destroy(): void {
    for (const g of this.chunks.values()) g.destroy()
    this.chunks.clear()
  }
}

export type { TrackPoint }
