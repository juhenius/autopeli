/**
 * Slots: where Tools attach to one Driver's car. Slot 1 is the left end,
 * 2 the roof, 3 the right end. One control per Slot: a tap attaches the
 * parked Tool whose Ring is within reach, or uses the Tool in the Slot; a
 * hold (half a second) drops it. The controls arrive as held booleans and
 * are edge-detected here per step. A Turn swaps the end Slots.
 */
import type { Body } from '../physics.ts'
import { add, rot, type Pt, type Tool } from './tool.ts'

export type SlotId = 1 | 2 | 3
export const SLOT_IDS: SlotId[] = [1, 2, 3]

/** Steps a control must be held to count as a hold (0.5 s at 60 Hz). */
const HOLD_STEPS = 30

type SlotEvent = 'tap' | 'hold'

/** One control: rising edge starts a press; release before HOLD_STEPS is a tap; reaching it is a hold (once). */
class SlotControl {
  private downAt: number | null = null
  private held = false
  private wasDown = false

  /** Feed the held boolean once per step; returns the event this step, if any. */
  step(down: boolean, step: number): SlotEvent | null {
    let ev: SlotEvent | null = null
    if (down && !this.wasDown) {
      this.downAt = step
      this.held = false
    } else if (!down && this.wasDown) {
      if (!this.held) ev = 'tap'
      this.downAt = null
    } else if (down && this.downAt !== null && !this.held && step - this.downAt >= HOLD_STEPS) {
      this.held = true
      ev = 'hold'
    }
    this.wasDown = down
    return ev
  }
}

export class Slots {
  private readonly inSlot: Partial<Record<SlotId, Tool>> = {}
  private readonly controls: Record<SlotId, SlotControl> = { 1: new SlotControl(), 2: new SlotControl(), 3: new SlotControl() }

  /** `hitch` is the Vehicle's: chassis-local by Slot, following its facing. */
  constructor(private readonly hitch: (s: SlotId) => Pt) {}

  /** Chassis-local hitch point of a Slot. */
  hitchLocal(s: SlotId): Pt {
    return this.hitch(s)
  }

  hitchWorld(s: SlotId, chassis: Body): Pt {
    return add(chassis.position, rot(this.hitchLocal(s), chassis.angle))
  }

  get(s: SlotId): Tool | undefined {
    return this.inSlot[s]
  }

  put(s: SlotId, tool: Tool): void {
    this.inSlot[s] = tool
  }

  remove(s: SlotId): Tool | undefined {
    const t = this.inSlot[s]
    delete this.inSlot[s]
    return t
  }

  all(): Tool[] {
    return SLOT_IDS.map((s) => this.inSlot[s]).filter((t): t is Tool => t !== undefined)
  }

  /** Feed the three held booleans; returns this step's events. */
  step(held: [boolean, boolean, boolean], step: number): { slot: SlotId; ev: SlotEvent }[] {
    const out: { slot: SlotId; ev: SlotEvent }[] = []
    for (const s of SLOT_IDS) {
      const ev = this.controls[s].step(held[s - 1]!, step)
      if (ev !== null) out.push({ slot: s, ev })
    }
    return out
  }

  /** A Turn: the end Slots swap. Returns the tools that moved with their new Slot. */
  flip(): { tool: Tool; slot: SlotId }[] {
    const left = this.inSlot[1]
    const right = this.inSlot[3]
    delete this.inSlot[1]
    delete this.inSlot[3]
    const moved: { tool: Tool; slot: SlotId }[] = []
    if (left !== undefined) {
      this.inSlot[3] = left
      moved.push({ tool: left, slot: 3 })
    }
    if (right !== undefined) {
      this.inSlot[1] = right
      moved.push({ tool: right, slot: 1 })
    }
    return moved
  }
}
