/**
 * The input's rules, pure: keys, pointer zones and buttons come in as they
 * happen; `sample()` once per local step yields the held input. A press
 * latches so a press-and-release inside one step still registers; the
 * latches clear on sample. One-shot controls (Jump, Use) latch only on a key
 * down or a touch start, never by holding, sliding in or auto-repeat.
 */
import type { HeldInput } from '../../shared/sim/world'
import { CONTROLS, type ControlId } from './layout'

export class InputState {
  private readonly keys = new Set<ControlId>()
  private readonly pointers = new Map<number, ControlId | null>()
  private readonly buttons = new Set<ControlId>()
  private readonly latched = new Set<ControlId>()

  private static byKey(code: string): (typeof CONTROLS)[number] | undefined {
    return CONTROLS.find((c) => c.keys.includes(code))
  }

  keyDown(code: string, repeat = false): void {
    const c = InputState.byKey(code)
    if (c === undefined) return
    if (c.oneShot && repeat) return
    this.keys.add(c.id)
    this.latched.add(c.id)
  }

  keyUp(code: string): void {
    const c = InputState.byKey(code)
    if (c !== undefined) this.keys.delete(c.id)
  }

  /** A touch starts in a zone (or none). */
  pointerDown(pointerId: number, zone: ControlId | null): void {
    this.pointers.set(pointerId, zone)
    if (zone !== null) this.latched.add(zone)
  }

  /** A touch slides; a one-shot control never latches from a slide. */
  pointerMove(pointerId: number, zone: ControlId | null): void {
    if (!this.pointers.has(pointerId) || this.pointers.get(pointerId) === zone) return
    this.pointers.set(pointerId, zone)
    if (zone !== null && !CONTROLS.find((c) => c.id === zone)!.oneShot) this.latched.add(zone)
  }

  pointerUp(pointerId: number): void {
    this.pointers.delete(pointerId)
  }

  button(id: ControlId, down: boolean): void {
    if (down) this.buttons.add(id)
    else this.buttons.delete(id)
  }

  /** Held right now by a key, a touch in its zone or its button. */
  held(id: ControlId): boolean {
    if (this.keys.has(id) || this.buttons.has(id)) return true
    for (const z of this.pointers.values()) if (z === id) return true
    return false
  }

  /** This step's input; clears the press latches. */
  sample(): HeldInput {
    const out: HeldInput = {
      gas: this.held('gas') || this.latched.has('gas'),
      brake: this.held('brake') || this.latched.has('brake'),
      jump: this.latched.has('jump'),
      use: this.latched.has('use'),
      slots: [this.held('slot1'), this.held('slot2'), this.held('slot3')],
      turn: this.held('turn'),
    }
    this.latched.clear()
    return out
  }

  clear(): void {
    this.keys.clear()
    this.pointers.clear()
    this.buttons.clear()
    this.latched.clear()
  }
}
