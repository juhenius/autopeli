/**
 * The Fields: every Cell of every Field and the one table of what a Cell
 * may become. The drag Tools till, sow, water and harvest the Cell under
 * them through the verbs here; the Night grows every watered Cell one stage.
 * The World copies the Cells across a rebuild and the server sends them in
 * every Run snapshot.
 */
import type { FieldSnap } from '../protocol.ts'
import { CELL, CELL_WATERED, cellAt, cellState, cellWatered, fieldCells, STRIP, type CellState } from './strip.ts'

interface Field {
  id: number
  fromPx: number
  toPx: number
  /** One value per Cell from fromPx: the state in the low bits, the watered flag above them. */
  cells: number[]
}

export class Fields {
  private readonly fields: Field[] = STRIP.fields.map((f) => ({ ...f, cells: new Array<number>(fieldCells(f)).fill(CELL.untilled) }))
  private changed = false

  /** The Cell state under x, or null outside every Field. */
  stateAt(x: number): CellState | null {
    const c = this.at(x)
    return c === null ? null : cellState(c.field.cells[c.index]!)
  }

  /** The Cells of one Field, live (a test sets them up). */
  cells(id: number): number[] {
    return this.fields.find((f) => f.id === id)!.cells
  }

  /** The Plough: an untilled Cell becomes tilled. */
  till(x: number): boolean {
    return this.move(x, CELL.untilled, CELL.tilled)
  }

  /** The Seed Bag: a tilled Cell becomes sown. */
  sow(x: number): boolean {
    return this.move(x, CELL.tilled, CELL.sown)
  }

  /** The Tank: a sown or sprouting Cell that is dry becomes watered. */
  water(x: number): boolean {
    const c = this.at(x)
    if (c === null) return false
    const v = c.field.cells[c.index]!
    const st = cellState(v)
    if ((st !== CELL.sown && st !== CELL.sprouting) || cellWatered(v)) return false
    c.field.cells[c.index] = v | CELL_WATERED
    this.changed = true
    return true
  }

  /** The Harvester: a ripe Cell goes back to untilled. */
  harvest(x: number): boolean {
    return this.move(x, CELL.ripe, CELL.untilled)
  }

  /** A Night: every watered Cell grows one stage (sown → sprouting → ripe) and dries; the rest stay. */
  grow(): void {
    for (const f of this.fields) {
      for (let i = 0; i < f.cells.length; i++) {
        const v = f.cells[i]!
        const st = cellState(v)
        if (!cellWatered(v)) continue
        f.cells[i] = st === CELL.sown ? CELL.sprouting : st === CELL.sprouting ? CELL.ripe : st
      }
    }
    this.changed = true
  }

  snaps(): FieldSnap[] {
    return this.fields.map((f) => ({ id: f.id, fromPx: f.fromPx, toPx: f.toPx, cells: [...f.cells] }))
  }

  /** Take another World's Cells (a rebuild keeps the Fields). */
  restore(snaps: FieldSnap[]): void {
    for (const s of snaps) {
      const f = this.fields.find((ff) => ff.id === s.id)
      if (f !== undefined && s.cells.length === f.cells.length) f.cells = [...s.cells]
    }
  }

  /** True once a Cell changed since the last call. */
  takeChanged(): boolean {
    const was = this.changed
    this.changed = false
    return was
  }

  private at(x: number): { field: Field; index: number } | null {
    const c = cellAt(x)
    if (c === null) return null
    const field = this.fields.find((f) => f.id === c.field.id)
    return field === undefined ? null : { field, index: c.index }
  }

  /** The Cell under x moves from `from` to `to` (the watered flag dropped); true when it did. */
  private move(x: number, from: CellState, to: CellState): boolean {
    const c = this.at(x)
    if (c === null || cellState(c.field.cells[c.index]!) !== from) return false
    c.field.cells[c.index] = to
    this.changed = true
    return true
  }
}
