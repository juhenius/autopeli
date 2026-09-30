/**
 * Handling rules — the pure part (Vitest): contact bookkeeping and the
 * grounded/airborne decision. The motor, traction and Air Control formulas
 * live in ./torqueRules.ts. All units per 60 Hz step. No Phaser imports.
 */
import type { Config } from '../../config/index.ts'

export type HandlingParams = Config['HANDLING']

export const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v

export interface RulesState {
  /** Steps ticked so far. */
  step: number
  /** Step of each Wheel's last raw contact. */
  lastContact: [number, number]
}

export const createRulesState = (): RulesState => ({
  step: 0,
  lastContact: [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY],
})

/** Advance the contact bookkeeping one step. */
export function tick(state: RulesState, wheelTouching: [boolean, boolean]): RulesState {
  const step = state.step + 1
  return {
    step,
    lastContact: [
      wheelTouching[0] ? step : state.lastContact[0],
      wheelTouching[1] ? step : state.lastContact[1],
    ],
  }
}

/** A Wheel counts as touching for contactGrace steps after its last raw contact. */
export function wheelCountsTouching(state: RulesState, p: HandlingParams, i: 0 | 1): boolean {
  return state.step - state.lastContact[i] <= p.contactGrace
}

/** Grounded = either Wheel counts as touching; airborne = neither. */
export function isGrounded(state: RulesState, p: HandlingParams): boolean {
  return wheelCountsTouching(state, p, 0) || wheelCountsTouching(state, p, 1)
}
