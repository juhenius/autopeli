/**
 * One Driver's Flip lifecycle: a pure reducer stepped once per World step.
 * `flipGrace` consecutive roof-contact steps → `flipped`; a Rescue or the
 * Respawn countdown → back to `driving`, and the World respawns the Vehicle
 * upright on that transition.
 */
import type { Config } from '../../config/index.ts'

export type FlipPhase = 'driving' | 'flipped'

export interface FlipState {
  phase: FlipPhase
  /** Seconds until the Respawn (phase flipped only). */
  respawnRemaining: number
  /** Consecutive roofContact steps so far. */
  flipSteps: number
}

export interface FlipObs {
  roofContact: boolean
  /** Another Driver passed within Rescue range this step. */
  rescued: boolean
}

export function createFlipState(): FlipState {
  return { phase: 'driving', respawnRemaining: 0, flipSteps: 0 }
}

/** One step. `dtMs` is the fixed step in ms; `p` is the live FLIP config record. */
export function flipStep(state: FlipState, obs: FlipObs, dtMs: number, p: Config['FLIP']): FlipState {
  if (state.phase === 'flipped') {
    const remaining = state.respawnRemaining - dtMs / 1000
    if (obs.rescued || remaining <= 1e-9) return { phase: 'driving', respawnRemaining: 0, flipSteps: 0 }
    return { ...state, respawnRemaining: remaining }
  }
  const flipSteps = obs.roofContact ? state.flipSteps + 1 : 0
  if (flipSteps >= p.flipGrace) return { phase: 'flipped', respawnRemaining: p.flipRespawnS, flipSteps }
  return { ...state, flipSteps }
}
