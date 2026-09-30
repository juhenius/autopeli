/**
 * The Tractor (farm slice 5): a low body with a cab, a big driven rear wheel
 * and a small free front one, heavier and stronger than the Car, slower.
 * Built from HANDLING (the Car's numbers, suspension) and the TRACTOR scales.
 * The motor and spin scales are read live through getters, so the panel
 * tunes them without a rebuild.
 */
import type { Config } from '../../config/index.ts'
import type { VehicleSpec } from './spec.ts'

export function tractorSpec(h: Config['HANDLING'], t: Config['TRACTOR']): VehicleSpec {
  // Both wheels touch the same ground line: the front rests at the Car's drop, the rear's centre sits higher by the radius difference.
  const frontY = h.wheelDrop
  const rearY = frontY + t.frontRadius - t.rearRadius
  const rearX = -h.wheelSpacing
  const frontX = h.wheelSpacing + 8
  const halfW = t.chassisWidth / 2
  const halfH = t.chassisHeight / 2
  const cab = { x: -8, y: -halfH - 14, w: 44, h: 30 }
  return {
    kind: 'tractor',
    body: { w: t.chassisWidth, h: t.chassisHeight, densityScale: t.densityScale },
    wheels: [
      { x: rearX, y: rearY, radius: t.rearRadius, driven: true, motorShare: 1 },
      { x: frontX, y: frontY, radius: t.frontRadius, driven: false, motorShare: 0 },
    ],
    // The rear hitch sits behind and above the big wheel, the front one on the bumper, the roof one on the hood in front
    // of the cab (on the cab it was over 100 px off the ground, past hitchReach of anything parked).
    hitch: {
      1: { x: rearX - t.rearRadius - 6, y: rearY - 10 },
      2: { x: cab.x + cab.w / 2 + 14, y: -halfH - 10 },
      3: { x: halfW, y: 0 },
    },
    look: { windscreen: false, cab },
    get motorScale() {
      return t.motorScale
    },
    get spinScale() {
      return t.spinScale
    },
    get reactionScale() {
      return t.reactionScale
    },
    get gripScale() {
      return t.gripScale
    },
  }
}
