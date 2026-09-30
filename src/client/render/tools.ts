/**
 * ToolsView: the client's drawing of every Tool the server simulates (each
 * kind's look is in toolLooks.ts), the Ring, the rope to the owner's hitch
 * point, the three hitch points on every Vehicle (lit when occupied), the
 * deployed ramps, the Pickups and the Produce. Tool poses are lerped
 * between arrivals like Vehicles. Drawing only.
 */
import type Phaser from 'phaser'
import type { Config } from '../../shared/config'
import type { PickupState, ProduceState, RampState, ToolState, VehicleState } from '../../shared/protocol'
import { isToolKind, type ToolKind } from '../../shared/sim/tools/kinds'
import type { SlotId } from '../../shared/sim/tools/slots'
import { add, rot, type Pt } from '../../shared/sim/tools/tool'
import { isVehicleKind, specOf } from '../../shared/sim/vehicles/index'
import { hitchLocal } from '../../shared/sim/vehicles/spec'
import type { SlotFace } from '../hud/slotFace'
import { ArrivalBuffer, blendPlaced } from '../net/arrivals'
import { LOOKS } from './toolLooks'

/** The look for a kind off the wire; an unknown kind draws as the plough. */
const lookOf = (kind: string) => LOOKS[isToolKind(kind) ? kind : ('plough' as ToolKind)]

export class ToolsView {
  private readonly gfx: Phaser.GameObjects.Graphics
  private readonly tools = new Map<number, ArrivalBuffer<ToolState>>()
  private readonly produce = new Map<number, ArrivalBuffer<ProduceState>>()
  private ramps: RampState[] = []
  private pickups: PickupState[] = []
  private surfaceYAt: (x: number) => number = () => 0

  private readonly scene: Phaser.Scene
  private readonly iconCache = new Map<string, string>()

  constructor(
    scene: Phaser.Scene,
    private readonly config: Config,
  ) {
    this.scene = scene
    this.gfx = scene.add.graphics().setDepth(2.2)
  }

  /** The Slot button icon for a tool state: the same drawing as in the world, rendered once per look into a data URL. */
  private toolIcon(s: ToolState): string {
    const icon = lookOf(s.kind).icon(s, this.config.TOOL)
    const key = `${s.kind}|${icon.key}`
    const cached = this.iconCache.get(key)
    if (cached !== undefined) return cached
    // Drawn at 2× into a 112 px texture (the biggest tool is 46 px wide), shown at 48 px: crisp on a Retina screen.
    const size = 112
    const g = this.scene.make.graphics({ x: 0, y: 0 }, false)
    g.setScale(2)
    lookOf(s.kind).draw(g, icon.still, { x: size / 4, y: size / 4 }, 0, this.config.TOOL)
    const texKey = `slot-icon:${key}`
    if (this.scene.textures.exists(texKey)) this.scene.textures.remove(texKey)
    g.generateTexture(texKey, size, size)
    g.destroy()
    const url = this.scene.textures.getBase64(texKey)
    this.iconCache.set(key, url)
    return url
  }

  /** A state message arrived. */
  setSurface(surfaceYAt: (x: number) => number): void {
    this.surfaceYAt = surfaceYAt
  }

  update(states: ToolState[], produce: ProduceState[], ramps: RampState[], pickups: PickupState[] | null, nowMs: number): void {
    this.ramps = ramps
    if (pickups !== null) this.pickups = pickups
    const push = <T extends { id: number; x: number; y: number; a: number }>(map: Map<number, ArrivalBuffer<T>>, list: T[]): void => {
      const seen = new Set<number>()
      for (const s of list) {
        seen.add(s.id)
        let t = map.get(s.id)
        if (t === undefined) {
          t = new ArrivalBuffer<T>(blendPlaced, nowMs)
          map.set(s.id, t)
        }
        t.push(s, nowMs)
      }
      for (const id of [...map.keys()]) if (!seen.has(id)) map.delete(id) // gone (harvested into a Box, banked)
    }
    push(this.tools, states)
    push(this.produce, produce)
  }

  /** Hitch points of a vehicle, chassis-local, by Slot, for its drawn facing. */
  private hitchLocal(slot: number, v: { f: number; k: string }): Pt {
    return hitchLocal(specOf(isVehicleKind(v.k) ? v.k : 'car', this.config), slot as SlotId, v.f >= 0 ? 1 : -1)
  }

  /** Once per frame. `poseOf` gives a Driver's drawn Vehicle pose (for ropes and hitch points); `selfId` lights the
   * Ring of a parked Tool one of the own free Slots could hitch right now. */
  render(nowMs: number, poseOf: (driverId: number) => VehicleState | null, drawnDrivers: Iterable<[number, VehicleState]>, selfId: number | null, visibleX: [number, number]): void {
    const g = this.gfx
    g.clear()
    const delay = this.config.NET.interpDelayMs
    const occupied = new Set<string>()
    for (const t of this.tools.values()) {
      const s = t.latest
      if (s?.slot) occupied.add(`${s.slot[0]}:${s.slot[1]}`)
    }
    const own = selfId === null ? null : poseOf(selfId)
    const reach = this.config.TOOL.hitchReach
    const inReach = (c: Pt): boolean => {
      if (own === null || selfId === null) return false
      for (const slot of [1, 2, 3]) {
        if (occupied.has(`${selfId}:${slot}`)) continue
        const h = add({ x: own.cx, y: own.cy }, rot(this.hitchLocal(slot, own), own.ca))
        if (Math.hypot(c.x - h.x, c.y - h.y) <= reach) return true
      }
      return false
    }
    for (const t of this.tools.values()) {
      const s = t.sample(nowMs, delay)?.sample
      if (s === undefined) continue
      let centre = { x: s.x, y: s.y }
      let angle = s.a
      let owner: VehicleState | null = null
      if (s.slot !== null) {
        owner = poseOf(s.slot[0])
        if (owner !== null) {
          const hitch = add({ x: owner.cx, y: owner.cy }, rot(this.hitchLocal(s.slot[1], owner), owner.ca))
          if (s.state === 'raised') {
            // Rigid on the server, so rigid on the owner's drawn car: the streamed pose would lag a predicted car.
            centre = hitch
            angle = owner.ca
          } else {
            g.lineStyle(3, s.state === 'hoisting' ? 0xffe066 : 0x999999, 1).lineBetween(hitch.x, hitch.y, centre.x, centre.y)
          }
        }
      }
      lookOf(s.kind).draw(g, s, centre, angle, this.config.TOOL)
      const lit = s.slot === null && inReach(centre)
      g.lineStyle(3, lit ? 0xffe066 : 0x333333, 1).strokeCircle(centre.x, centre.y, 6)
    }
    // Deployed ramps: solid wedges.
    for (const r of this.ramps) {
      // The angle's sign is the direction the ramp rises toward; cos alone would draw every ramp rising right.
      const dir = r.angle < 0 ? -1 : 1
      const run = dir * r.len * Math.cos(Math.abs(r.angle))
      const rise = r.len * Math.abs(Math.sin(r.angle))
      g.fillStyle(0x8d99ae, 1).fillTriangle(r.x, r.y, r.x + run, r.y, r.x + run, r.y - rise)
      g.lineStyle(3, 0x4a5568, 1).lineBetween(r.x, r.y, r.x + run, r.y - rise)
    }
    // Pickups: seed packets and water drops bobbing on the surface.
    const bob = Math.sin(nowMs / 300) * 3
    for (const p of this.pickups) {
      if (p.x < visibleX[0] || p.x > visibleX[1]) continue // hundreds exist; draw the few on screen
      const y = this.surfaceYAt(p.x) - 14 + bob
      if (p.k === 'water') {
        g.fillStyle(0x3a86ff, 1).fillCircle(p.x, y + 2, 7)
        g.fillTriangle(p.x - 6, y, p.x + 6, y, p.x, y - 12)
        g.fillStyle(0xbde0fe, 1).fillCircle(p.x - 2, y, 2)
      } else {
        g.fillStyle(0xd9b36c, 1).fillRoundedRect(p.x - 7, y - 8, 14, 16, 3)
        g.fillStyle(0x6b4f2a, 1).fillCircle(p.x, y - 8, 3)
      }
    }
    // Produce.
    const r = this.config.TOOL.produceRadius
    for (const t of this.produce.values()) {
      const p = t.sample(nowMs, delay)?.sample
      if (p === undefined) continue
      g.fillStyle(0xf4a261, 1).fillCircle(p.x, p.y, r)
      g.lineStyle(2, 0xc26a2a, 1).strokeCircle(p.x, p.y, r)
      const stem = add({ x: p.x, y: p.y }, rot({ x: 0, y: -r }, p.a))
      g.fillStyle(0x3f8f3f, 1).fillCircle(stem.x, stem.y, 3)
    }
    for (const [id, v] of drawnDrivers) {
      for (const slot of [1, 2, 3]) {
        const h = add({ x: v.cx, y: v.cy }, rot(this.hitchLocal(slot, v), v.ca))
        g.fillStyle(occupied.has(`${id}:${slot}`) ? 0xffe066 : 0x222222, 1).fillCircle(h.x, h.y, 3.5)
      }
    }
  }

  /** What the three Slot buttons show for a Driver: the Tool's icon, its reading, and whether it is at work. */
  slotFaces(driverId: number): [SlotFace, SlotFace, SlotFace] {
    const out: SlotFace[] = []
    for (const slot of [1, 2, 3]) {
      let face: SlotFace = { icon: '', sub: '', active: false }
      for (const t of this.tools.values()) {
        const s = t.latest
        if (s === null || s.slot === null || s.slot[0] !== driverId || s.slot[1] !== slot) continue
        face = { icon: this.toolIcon(s), ...lookOf(s.kind).face(s, this.config.TOOL) }
      }
      out.push(face)
    }
    return out as [SlotFace, SlotFace, SlotFace]
  }

  destroy(): void {
    this.gfx.destroy()
    this.tools.clear()
  }
}
