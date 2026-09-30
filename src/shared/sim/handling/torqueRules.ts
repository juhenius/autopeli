/**
 * Torque-model rules — the pure part (Vitest): motor torque with a linear
 * speed curve so top speed emerges instead of being set, slip-based traction
 * limited by a Suspension-load grip budget, and the physical Air Control
 * mapping (gas = nose-up). See ADR 0002.
 * All units per 60 Hz step; ω in rad/step; traction as a per-step velocity
 * impulse on the Wheel body, px/step. No Phaser imports.
 */
import type { Config } from '../../config/index.ts'
import type { InputFrame } from '../input.ts'
import { clamp } from './rules.ts'

export type TorqueParams = Config['HANDLING']

/**
 * Motor spin impulse for this step, Δω rad/step. Linear motor curve: full
 * torque at ω 0 fading to zero at top speed. Brake is the same motor in
 * reverse with a weaker gear (reverseRatio) — no phases: full brake torque
 * while rolling forward, lock-up and the crawl-to-reverse transition emerge.
 */
export function motorAccel(t: TorqueParams, input: InputFrame, omega: number): number {
  if (input.brake) {
    const top = Math.max(1e-6, t.omegaMax * t.reverseRatio)
    return -t.brakeAccel * clamp(1 + omega / top, 0, 1)
  }
  if (input.gas) {
    return t.driveAccel * clamp(1 - omega / Math.max(1e-6, t.omegaMax), 0, 1)
  }
  return 0
}

/** Surface slip, px/step: Wheel contact-point speed minus ground speed along the tangent. */
export function surfaceSlip(omega: number, wheelRadius: number, vTangent: number): number {
  return omega * wheelRadius - vTangent
}

/**
 * Traction impulse on the Wheel body along the ground tangent, px/step:
 * proportional to slip, clamped by the load-dependent grip budget
 * (gripBase + gripPerLoad × spring compression). Burnout = slip demand
 * exceeding the budget; load transfer changes the budget for real.
 */
export function tractionImpulse(t: TorqueParams, slip: number, compression: number, gripScale = 1): number {
  const grip = (t.gripBase + t.gripPerLoad * Math.max(0, compression)) * gripScale
  return clamp(slip * t.slipStiff, -grip, grip)
}

/**
 * Air Control assist, physical mapping: gas = nose-up (−ω),
 * brake = nose-down (+ω); both or neither held = none.
 */
export function airTorqueDir(input: InputFrame): -1 | 0 | 1 {
  if (input.gas === input.brake) return 0
  return input.gas ? -1 : 1
}

/** Ground tangent unit vector from world slope dy/dx (y down, +x forward). */
export function groundTangent(slope: number): { x: number; y: number } {
  const inv = 1 / Math.hypot(1, slope)
  return { x: inv, y: slope * inv }
}
