/**
 * PlacesView: the Strip's props on the client — the Barn, the Farmhouse,
 * the Fields' posts and their tilled furrows.
 * Drawn once per Run from the Track; the furrows redraw when the Run
 * snapshot's Fields change. Drawing only.
 */
import type Phaser from 'phaser'
import type { FieldSnap } from '../../shared/protocol'
import { CELL_PX, cellState, cellWatered, STRIP } from '../../shared/sim/strip'
import { BASE_Y } from '../../shared/sim/terrain'
import type { Track } from '../../shared/sim/track'

export class PlacesView {
  private readonly props: Phaser.GameObjects.Graphics
  private readonly furrows: Phaser.GameObjects.Graphics
  private readonly labels: Phaser.GameObjects.Text[] = []
  private fieldsKey = ''

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly track: Track,
    private readonly seed: number,
  ) {
    this.props = scene.add.graphics().setDepth(1.4)
    this.furrows = scene.add.graphics().setDepth(1.3)
    this.drawProps()
  }

  private surfaceY(x: number): number {
    return BASE_Y - this.track.surfaceHeight(this.seed, x)
  }

  private label(text: string, x: number, y: number): void {
    this.labels.push(
      this.scene.add.text(x, y, text, { fontFamily: 'system-ui, sans-serif', fontSize: '16px', color: '#ffffff' }).setOrigin(0.5, 1).setDepth(1.5).setAlpha(0.9),
    )
  }

  private drawProps(): void {
    const g = this.props
    g.clear()
    for (const p of STRIP.places) {
      const y = this.surfaceY(p.x)
      if (p.kind === 'barn') {
        g.fillStyle(0x8b3a2f, 1).fillRect(p.x - 90, y - 110, 180, 110)
        g.fillStyle(0x5c2a22, 1).fillTriangle(p.x - 100, y - 110, p.x + 100, y - 110, p.x, y - 170)
        g.fillStyle(0x3b1d17, 1).fillRect(p.x - 30, y - 70, 60, 70)
        this.label('Barn', p.x, y - 176)
      } else if (p.kind === 'well') {
        g.fillStyle(0x7d8597, 1).fillRect(p.x - 40, y - 50, 80, 50)
        g.fillStyle(0x4a5568, 1).fillRect(p.x - 46, y - 56, 92, 8)
        g.fillStyle(0x6b4f2a, 1).fillRect(p.x - 34, y - 130, 8, 80).fillRect(p.x + 26, y - 130, 8, 80)
        g.fillStyle(0x8b3a2f, 1).fillTriangle(p.x - 56, y - 126, p.x + 56, y - 126, p.x, y - 170)
        g.fillStyle(0x3a86ff, 1).fillRect(p.x - 30, y - 42, 60, 10)
        this.label('Well', p.x, y - 176)
      } else {
        g.fillStyle(0xf1e9d2, 1).fillRect(p.x - 70, y - 90, 140, 90)
        g.fillStyle(0xc0392b, 1).fillTriangle(p.x - 80, y - 90, p.x + 80, y - 90, p.x, y - 140)
        g.fillStyle(0x6b4f2a, 1).fillRect(p.x - 18, y - 50, 36, 50)
        g.fillStyle(0x8ecae6, 1).fillRect(p.x + 28, y - 72, 26, 22)
        this.label('Home', p.x, y - 146)
      }
    }
    for (const f of STRIP.fields) {
      for (const x of [f.fromPx, f.toPx]) {
        const y = this.surfaceY(x)
        g.fillStyle(0x6b4f2a, 1).fillRect(x - 3, y - 40, 6, 40)
        g.fillStyle(0xe9c46a, 1).fillRect(x - 3, y - 40, 14, 8)
      }
      const mid = (f.fromPx + f.toPx) / 2
      this.label(`Field ${String.fromCharCode(65 + f.id)}`, mid, this.surfaceY(mid) - 30)
    }
  }

  /** The Fields' cells from the Run snapshot, drawn by state; redraws only on change. */
  setFields(fields: FieldSnap[]): void {
    const key = fields.map((f) => `${f.id}:${f.cells.join('')}`).join('|')
    if (key === this.fieldsKey) return
    this.fieldsKey = key
    const g = this.furrows
    g.clear()
    for (const f of fields) {
      f.cells.forEach((v, i) => {
        const state = cellState(v)
        if (state === 0) return
        const x = f.fromPx + i * CELL_PX
        const y0 = this.surfaceY(x)
        const y1 = this.surfaceY(x + CELL_PX)
        // The furrow: every worked cell; watered ones darker and bluer.
        g.fillStyle(cellWatered(v) ? 0x3b2f3a : 0x5c3d1e, 1)
        g.beginPath()
        g.moveTo(x, y0 - 2)
        g.lineTo(x + CELL_PX, y1 - 2)
        g.lineTo(x + CELL_PX, y1 + 8)
        g.lineTo(x, y0 + 8)
        g.closePath()
        g.fillPath()
        const mx = x + CELL_PX / 2
        const my = (y0 + y1) / 2
        if (state === 2) g.fillStyle(0xe9c46a, 1).fillCircle(mx, my - 1, 2) // sown: a seed
        else if (state === 3) g.fillStyle(0x7bc043, 1).fillRect(mx - 1.5, my - 12, 3, 12) // sprouting
        else if (state === 4) {
          g.fillStyle(0x2f8f2f, 1).fillRect(mx - 2, my - 26, 4, 26) // ripe: a plant with its Produce
          g.fillStyle(0xf4a261, 1).fillCircle(mx, my - 6, 6)
        }
      })
    }
  }

  destroy(): void {
    this.props.destroy()
    this.furrows.destroy()
    for (const l of this.labels) l.destroy()
    this.labels.length = 0
  }
}
