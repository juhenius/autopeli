/**
 * One look per Tool kind: how it is drawn (the world and the Slot icon share
 * the drawing), what its icon depends on, and what its Slot button says. The
 * footprint comes from the shared kind table, so the drawn body is the
 * simulated body.
 */
import type Phaser from 'phaser'
import type { Config } from '../../shared/config'
import type { ToolState } from '../../shared/protocol'
import { TOOL_KIND, type ToolKind } from '../../shared/sim/tools/kinds'
import { add, rot, type Pt } from '../../shared/sim/tools/tool'

type Gfx = Phaser.GameObjects.Graphics
type ToolDials = Config['TOOL']

export interface ToolLook {
  /** The body around `centre` at `angle`, in the current fill colour. */
  draw(g: Gfx, s: ToolState, centre: Pt, angle: number, p: ToolDials): void
  /** The Slot icon: what it depends on beyond the kind (the cache key) and the state to draw it from (quantised, still). */
  icon(s: ToolState, p: ToolDials): { key: string; still: ToolState }
  /** The Slot button's reading and whether the Tool is at work. */
  face(s: ToolState, p: ToolDials): { sub: string; active: boolean }
}

/** A filled polygon of tool-local points around `centre` at `angle`. */
function poly(g: Gfx, centre: Pt, angle: number, pts: Pt[]): void {
  const c = pts.map((q) => add(centre, rot(q, angle)))
  g.beginPath()
  g.moveTo(c[0]!.x, c[0]!.y)
  for (let k = 1; k < c.length; k++) g.lineTo(c[k]!.x, c[k]!.y)
  g.closePath()
  g.fillPath()
}

/** A filled box of half-extents (hw, hh). */
const box = (g: Gfx, centre: Pt, angle: number, hw: number, hh: number): void =>
  poly(g, centre, angle, [
    { x: -hw, y: -hh },
    { x: hw, y: -hh },
    { x: hw, y: hh },
    { x: -hw, y: hh },
  ])

const tri = (g: Gfx, centre: Pt, angle: number, a: Pt, b: Pt, c: Pt): void => {
  const [p, q, r] = [a, b, c].map((v) => add(centre, rot(v, angle)))
  g.fillTriangle(p!.x, p!.y, q!.x, q!.y, r!.x, r!.y)
}

const half = (kind: ToolKind, p: ToolDials): { hw: number; hh: number } => {
  const fp = TOOL_KIND[kind].footprint(p)
  return { hw: fp.w / 2, hh: fp.h / 2 }
}

/** A fill level in eighths, for the icon cache. */
const eighths = (fill: number, cap: number): number => Math.round((8 * Math.min(fill, cap)) / Math.max(1, cap))
const still = (s: ToolState): ToolState => ({ ...s, f: 1, thrusting: false, slot: null })

/** The drag Tools' reading: down while lowered (at work), up otherwise. */
const dragFace = (s: ToolState): { sub: string; active: boolean } => ({ sub: s.state === 'lowered' ? 'down' : 'up', active: s.state === 'lowered' })

/** A fill band across a container from its bottom up to `level` (0…1), between the given local y's. */
function band(g: Gfx, centre: Pt, angle: number, hw: number, bottom: number, top: number, level: number, colour: number, alpha: number): void {
  if (level <= 0) return
  const y = bottom - (bottom - top) * level
  g.fillStyle(colour, alpha)
  poly(g, centre, angle, [
    { x: -hw, y },
    { x: hw, y },
    { x: hw, y: bottom },
    { x: -hw, y: bottom },
  ])
}

export const LOOKS: Record<ToolKind, ToolLook> = {
  plough: {
    draw(g, s, centre, angle, p) {
      const fp = TOOL_KIND.plough.footprint(p)
      const r = fp.w / 2
      g.fillStyle(s.digging ? 0x5c3d1e : 0x8a6d3b, 1)
      if (fp.circle) {
        g.fillCircle(centre.x, centre.y, r)
        const e = add(centre, rot({ x: r, y: 0 }, angle))
        g.lineStyle(2, 0x5c3d1e, 1).lineBetween(centre.x, centre.y, e.x, e.y)
      } else box(g, centre, angle, r, fp.h / 2)
    },
    icon: (s) => ({ key: s.digging ? 'digging' : '', still: still(s) }),
    face: dragFace,
  },
  seeds: {
    draw(g, s, centre, angle, p) {
      // A tied sack with the seeds left as a band across it.
      const { hw, hh } = half('seeds', p)
      g.fillStyle(s.digging ? 0xb08a4a : 0xd9b36c, 1)
      box(g, centre, angle, hw, hh)
      const tie = add(centre, rot({ x: 0, y: -hh }, angle))
      g.fillStyle(0x6b4f2a, 1).fillCircle(tie.x, tie.y, 4)
      band(g, centre, angle, hw - 3, hh - 3, -hh + 4, Math.min(1, s.fill / Math.max(1, p.seedCap)), 0x8c6b2e, 0.6)
    },
    icon: (s, p) => {
      const level = eighths(s.fill, p.seedCap)
      return { key: `${level}|${s.digging ? 'digging' : ''}`, still: { ...still(s), fill: Math.round((level * p.seedCap) / 8) } }
    },
    face: (s) => ({ sub: `${s.fill}`, active: s.state === 'lowered' }),
  },
  tank: {
    draw(g, s, centre, angle, p) {
      // A tank with its water level.
      const { hw, hh } = half('tank', p)
      g.fillStyle(0x9aa5b1, 1)
      box(g, centre, angle, hw, hh)
      band(g, centre, angle, hw - 3, hh - 3, -hh + 4, Math.min(1, s.fill / Math.max(1, p.tankCap)), 0x3a86ff, 0.9)
    },
    icon: (s, p) => {
      const level = eighths(s.fill, p.tankCap)
      return { key: `${level}|${s.digging ? 'digging' : ''}`, still: { ...still(s), fill: Math.round((level * p.tankCap) / 8) } }
    },
    face: (s) => ({ sub: `${s.fill}`, active: s.state === 'lowered' }),
  },
  harvester: {
    draw(g, s, centre, angle, p) {
      // A green box with teeth along its bottom edge.
      const { hw, hh } = half('harvester', p)
      g.fillStyle(s.digging ? 0x2f6f2f : 0x3f8f3f, 1)
      box(g, centre, angle, hw, hh)
      g.fillStyle(0xdddddd, 1)
      for (let k = -16; k <= 16; k += 8) tri(g, centre, angle, { x: k - 3, y: hh }, { x: k + 3, y: hh }, { x: k, y: hh + 7 })
    },
    icon: (s) => ({ key: s.digging ? 'digging' : '', still: still(s) }),
    face: dragFace,
  },
  box: {
    draw(g, s, centre, angle, p) {
      // An open crate with its load stacked inside.
      const { hw, hh } = half('box', p)
      g.fillStyle(0x9c6b3c, 1)
      box(g, centre, angle, hw, hh)
      g.fillStyle(0x6b4525, 1)
      poly(g, centre, angle, [
        { x: -hw + 5, y: -hh },
        { x: hw - 5, y: -hh },
        { x: hw - 5, y: hh - 5 },
        { x: -hw + 5, y: hh - 5 },
      ])
      for (let k = 0; k < s.load; k++) {
        const q = add(centre, rot({ x: -12 + (k % 4) * 8, y: 6 - Math.floor(k / 4) * 10 }, angle))
        g.fillStyle(0xf4a261, 1).fillCircle(q.x, q.y, 4.5)
      }
    },
    icon: (s) => ({ key: `${s.load}`, still: still(s) }),
    face: (s, p) => ({ sub: `${s.load}/${p.boxCap}`, active: false }),
  },
  ramp: {
    draw(g, s, centre, angle, p) {
      // A small wedge, rising the owner's way.
      const { hw, hh } = half('ramp', p)
      const fw = s.f >= 0 ? 1 : -1
      g.fillStyle(0x8d99ae, 1)
      tri(g, centre, angle, { x: -fw * hw, y: hh }, { x: fw * hw, y: hh }, { x: fw * hw, y: -hh })
    },
    icon: (s) => ({ key: '', still: still(s) }),
    face: () => ({ sub: 'plant', active: false }),
  },
  rockets: {
    draw(g, s, centre, angle, p) {
      // A tube with its nose the owner's way and a flame while firing.
      const { hw, hh } = half('rockets', p)
      const fw = s.f >= 0 ? 1 : -1
      if (s.thrusting) {
        const back = -fw
        g.fillStyle(0xffa500, 0.9)
        tri(g, centre, angle, { x: back * hw, y: -7 }, { x: back * (hw + 24 + Math.random() * 14), y: 0 }, { x: back * hw, y: 7 })
      }
      g.fillStyle(0xb0b0b0, 1)
      box(g, centre, angle, hw, hh)
      g.fillStyle(0xe63946, 1)
      tri(g, centre, angle, { x: fw * hw, y: -hh }, { x: fw * (hw + 8), y: 0 }, { x: fw * hw, y: hh })
    },
    icon: (s) => ({ key: '', still: still(s) }),
    face: (s) => ({ sub: s.thrusting ? '🔥' : s.cooldownS > 0 ? `${Math.ceil(s.cooldownS)} s` : 'ready', active: s.thrusting }),
  },
}
