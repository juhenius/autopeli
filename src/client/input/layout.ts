/**
 * The controls as one table: what each is called, its glyph and keys, how it
 * is hit (a window zone with the pad as a hint, or a button that takes the
 * pointer itself), and where it sits. The pads' CSS and the zone hit-test
 * both derive from it, so rearranging the controls is editing rows.
 */

export type ControlId = 'brake' | 'gas' | 'jump' | 'use' | 'slot1' | 'slot2' | 'slot3' | 'turn'

export interface Control {
  id: ControlId
  glyph: string
  /** KeyboardEvent codes that hold it. */
  keys: string[]
  /** Fires once per press (never by holding, sliding in or auto-repeat). */
  oneShot: boolean
  /** 'zone': a region of the window counts, the pad is a hint. 'button': the element takes the pointer. */
  hit: 'zone' | 'button'
  /** The big white disc, or the small translucent button. */
  look: 'pad' | 'button'
  /** Where it sits, px past the safe-area insets: from a side or offset from the centre, and from the top or bottom. */
  at: { x: 'left' | 'right' | 'centre'; dx: number; y: 'top' | 'bottom'; dy: number }
  size: number
  /** Zone controls: the window column, and a band of px from the bottom or a fraction of the height from the top. */
  zone?: { column: 'left' | 'right' | 'centre'; band?: [number, number]; topFraction?: number }
}

const PAD = 160
const UPPER = 130
const GAP = 24
/** The upper pads' zone starts this far above the bottom (the lower pads' band) and runs this much higher. */
const UPPER_FROM = PAD + GAP + 16
const UPPER_TO = UPPER_FROM + UPPER + 40
const SMALL = 72

/** The window's columns: left of the first fraction, right of the second, centre between. */
export const COLUMNS: [number, number] = [0.35, 0.65]

export const CONTROLS: Control[] = [
  { id: 'brake', glyph: '◀', keys: ['ArrowLeft', 'KeyA'], oneShot: false, hit: 'zone', look: 'pad', at: { x: 'left', dx: GAP, y: 'bottom', dy: GAP }, size: PAD, zone: { column: 'left', band: [0, UPPER_FROM] } },
  { id: 'gas', glyph: '▶', keys: ['ArrowRight', 'KeyD'], oneShot: false, hit: 'zone', look: 'pad', at: { x: 'right', dx: GAP, y: 'bottom', dy: GAP }, size: PAD, zone: { column: 'right', band: [0, UPPER_FROM] } },
  { id: 'jump', glyph: '▲', keys: ['Space', 'ArrowUp', 'KeyW'], oneShot: true, hit: 'zone', look: 'pad', at: { x: 'right', dx: GAP + (PAD - UPPER) / 2, y: 'bottom', dy: UPPER_FROM }, size: UPPER, zone: { column: 'right', band: [UPPER_FROM, UPPER_TO] } },
  { id: 'use', glyph: 'USE', keys: ['KeyE', 'Enter'], oneShot: true, hit: 'zone', look: 'pad', at: { x: 'centre', dx: 0, y: 'top', dy: 120 }, size: 100, zone: { column: 'centre', topFraction: 0.4 } },
  { id: 'turn', glyph: '⟲', keys: ['KeyS', 'ArrowDown'], oneShot: false, hit: 'button', look: 'pad', at: { x: 'left', dx: GAP + (PAD - UPPER) / 2, y: 'bottom', dy: UPPER_FROM }, size: UPPER },
  { id: 'slot1', glyph: '1', keys: ['Digit1'], oneShot: false, hit: 'button', look: 'button', at: { x: 'centre', dx: -88, y: 'bottom', dy: GAP }, size: SMALL },
  { id: 'slot2', glyph: '2', keys: ['Digit2'], oneShot: false, hit: 'button', look: 'button', at: { x: 'centre', dx: 0, y: 'bottom', dy: GAP }, size: SMALL },
  { id: 'slot3', glyph: '3', keys: ['Digit3'], oneShot: false, hit: 'button', look: 'button', at: { x: 'centre', dx: 88, y: 'bottom', dy: GAP }, size: SMALL },
]

export const controlOf = (id: ControlId): Control => CONTROLS.find((c) => c.id === id)!

/** The zone control under a window point, or null. Bands are checked in table order, so a shared edge goes to the earlier row. */
export function zoneAt(x: number, y: number, width: number, height: number): ControlId | null {
  const column = x < width * COLUMNS[0] ? 'left' : x > width * COLUMNS[1] ? 'right' : 'centre'
  const fromBottom = height - y
  for (const c of CONTROLS) {
    const z = c.zone
    if (z === undefined || z.column !== column) continue
    if (z.band !== undefined && fromBottom >= z.band[0] && fromBottom <= z.band[1]) return c.id
    if (z.topFraction !== undefined && y < height * z.topFraction) return c.id
  }
  return null
}

/** Where a control's element sits, as CSS declarations. */
export function placement(c: Control): string {
  const { at, size } = c
  const vertical = `${at.y}: calc(env(safe-area-inset-${at.y}, 0px) + ${at.dy}px);`
  const horizontal = at.x === 'centre' ? `left: 50%; margin-left: ${at.dx - size / 2}px;` : `${at.x}: calc(env(safe-area-inset-${at.x}, 0px) + ${at.dx}px);`
  return `position: fixed; width: ${size}px; height: ${size}px; ${vertical} ${horizontal}`
}
