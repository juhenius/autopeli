/**
 * The Strip: the farm's one drivable stretch and what sits on it (spec
 * §Fixed facts). Pure data shared by the server (bodies, Fields) and the
 * client (props), so both agree on every x.
 */

export type PlaceKind = 'barn' | 'farmhouse' | 'well'

export interface Place {
  kind: PlaceKind
  x: number
}

export interface FieldDef {
  id: number
  fromPx: number
  toPx: number
}

export interface StripDef {
  /** Where the farm's Places end, px (no walls: the hills run on past them). */
  minPx: number
  maxPx: number
  places: Place[]
  fields: FieldDef[]
  /** Tools park in front of the Barn, this far from it toward the Farmhouse, px. */
  toolParkX: number
}

export const STRIP: StripDef = {
  minPx: -3000,
  maxPx: 6000,
  places: [
    { kind: 'well', x: -2200 },
    { kind: 'barn', x: -900 },
    { kind: 'farmhouse', x: 0 },
  ],
  fields: [
    { id: 0, fromPx: 900, toPx: 2100 },
    { id: 1, fromPx: 3200, toPx: 4400 },
  ],
  toolParkX: -700,
}

export const FARMHOUSE_X = STRIP.places.find((p) => p.kind === 'farmhouse')!.x

/** Half-width of a Place's zone (the Barn refills seed bags, the Well refills tanks), px. */
export const PLACE_ZONE_PX = 300

/** True inside the zone of the Place of that kind. */
export function inPlaceZone(kind: PlaceKind, x: number): boolean {
  const p = STRIP.places.find((q) => q.kind === kind)
  return p !== undefined && Math.abs(x - p.x) <= PLACE_ZONE_PX
}

/** World x centres the Terrain is levelled around: every Place. */
export const stripFlats = (): number[] => STRIP.places.map((p) => p.x)

/** Spans that get no Crest: every Field, so no Crest lands in the furrows. */
export const stripCrestFree = (): [number, number][] => STRIP.fields.map((f) => [f.fromPx, f.toPx])

/** Tilled cells are this wide, px; a cell id is floor(x / CELL_PX). */
export const CELL_PX = 16

/** The Field containing x, or null. */
export function fieldAt(x: number): FieldDef | null {
  for (const f of STRIP.fields) if (x >= f.fromPx && x < f.toPx) return f
  return null
}

export const fieldCells = (f: FieldDef): number => Math.max(1, Math.ceil((f.toPx - f.fromPx) / CELL_PX))

/** A Field cell's state (spec-slice2 §Cells). */
export const CELL = { untilled: 0, tilled: 1, sown: 2, sprouting: 3, ripe: 4 } as const
export type CellState = (typeof CELL)[keyof typeof CELL]
/** The watered flag rides on the cell value above the state bits. */
export const CELL_WATERED = 8
export const cellState = (v: number): CellState => (v & 7) as CellState
export const cellWatered = (v: number): boolean => (v & CELL_WATERED) !== 0

/** The Field and cell index at world x, or null outside every Field. */
export function cellAt(x: number): { field: FieldDef; index: number } | null {
  const f = fieldAt(x)
  if (f === null) return null
  return { field: f, index: Math.floor((x - f.fromPx) / CELL_PX) }
}
