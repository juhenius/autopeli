/**
 * PoseInterpolator: one Vehicle's arrivals (an ArrivalBuffer whose blend is
 * the whole pose: Chassis, Wheels, kick and the drawn facing; slip, the
 * Flip and the prediction fields take the newer sample).
 */
import type { VehicleState } from '../../shared/protocol'
import { ArrivalBuffer, lerp, lerpAngle, type Arrival } from './arrivals'

export function lerpPose(a: VehicleState, b: VehicleState, t: number): VehicleState {
  const wheel = (i: 0 | 1): [number, number, number] => [
    lerp(a.w[i][0], b.w[i][0], t),
    lerp(a.w[i][1], b.w[i][1], t),
    lerpAngle(a.w[i][2], b.w[i][2], t),
  ]
  return {
    id: b.id,
    k: b.k,
    cx: lerp(a.cx, b.cx, t),
    cy: lerp(a.cy, b.cy, t),
    ca: lerpAngle(a.ca, b.ca, t),
    w: [wheel(0), wheel(1)],
    s: b.s,
    kick: lerp(a.kick, b.kick, t),
    f: lerp(a.f, b.f, t),
    flipped: b.flipped,
    respawnS: b.respawnS,
    ack: b.ack,
    sim: b.sim,
  }
}

export type PoseSample = Arrival<VehicleState>

export class PoseInterpolator extends ArrivalBuffer<VehicleState> {
  constructor(nowMs: number) {
    super(lerpPose, nowMs)
  }
}
