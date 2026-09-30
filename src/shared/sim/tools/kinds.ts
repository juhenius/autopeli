/**
 * The Tool kinds as data: what the sim's body and the client's drawing both
 * read, so a kind's shape is typed once. The rules (what a kind does when
 * used or dragged) stay in tool.ts; the live dials stay in the config.
 */
import type { Config } from '../../config/index.ts'

export type ToolKind = 'plough' | 'seeds' | 'tank' | 'harvester' | 'box' | 'ramp' | 'rockets'

/** Every kind, in the order they park in front of the Barn. */
export const TOOL_KINDS: ToolKind[] = ['plough', 'seeds', 'tank', 'harvester', 'box', 'ramp', 'rockets']

export const isToolKind = (v: unknown): v is ToolKind => typeof v === 'string' && (TOOL_KINDS as string[]).includes(v)

/** A Tool's body around its Ring, px: a chamfered box, or a circle of diameter w. */
export interface Footprint {
  w: number
  h: number
  chamfer: number
  circle: boolean
}

export interface ToolKindDef {
  /** The body; the plough's follows the two rebuild dials. */
  footprint: (p: Config['TOOL']) => Footprint
  /** A drag Tool: lowered and dragged on the ground it takes the soil force and works the Field cell under it. The rest are rigid in a Slot, never lowered. */
  drag: boolean
  /** The drag Tool's share of digAccel: the plough's whole, the others' dial. */
  dragShare: 'seedDrag' | 'harvestDrag' | null
  /** Runs out and tops up from this store's Stock inside its Place's Zone (`fill`). */
  store: 'seed' | 'water' | null
}

export const TOOL_KIND: Record<ToolKind, ToolKindDef> = {
  plough: { footprint: (p) => ({ w: p.size, h: p.size, chamfer: 4, circle: p.circle >= 1 }), drag: true, dragShare: null, store: null },
  seeds: { footprint: () => ({ w: 34, h: 30, chamfer: 8, circle: false }), drag: true, dragShare: 'seedDrag', store: 'seed' },
  tank: { footprint: () => ({ w: 46, h: 32, chamfer: 6, circle: false }), drag: true, dragShare: 'seedDrag', store: 'water' },
  harvester: { footprint: () => ({ w: 44, h: 26, chamfer: 3, circle: false }), drag: true, dragShare: 'harvestDrag', store: null },
  box: { footprint: () => ({ w: 44, h: 30, chamfer: 3, circle: false }), drag: false, dragShare: null, store: null },
  ramp: { footprint: () => ({ w: 46, h: 18, chamfer: 2, circle: false }), drag: false, dragShare: null, store: null },
  rockets: { footprint: () => ({ w: 44, h: 16, chamfer: 6, circle: false }), drag: false, dragShare: null, store: null },
}

/** The store a `fill` draws on: its Place's Zone, its Stock and its cap dial. */
export const STORE = {
  seed: { zone: 'barn', cap: 'seedCap' },
  water: { zone: 'well', cap: 'tankCap' },
} as const
