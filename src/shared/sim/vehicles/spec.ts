/**
 * Vehicle spec: a vehicle as plain data (farm slice 5). The Car and the
 * Tractor are two specs; a future block builder compiles its grid into this
 * same shape, so the sim, the server, the predictor and the renderer never
 * learn about the grid. Exactly two Wheels in this slice (the state message,
 * the handling and the prediction assume two).
 *
 * Everything is in the facing-right frame: wheel 0 is the rear (x < 0),
 * wheel 1 the front, Slot 1 the rear hitch, Slot 3 the front. The Turn
 * mirrors the physical vehicle (Vehicle.mirror), so "rear" follows the
 * facing for every vehicle — the Car's identical wheels make it invisible.
 */
import type { Config } from '../../config/index.ts'
import type { SlotId } from '../tools/slots.ts'

export type VehicleKind = 'car' | 'tractor'

export interface Pt {
  x: number
  y: number
}

export interface WheelSpec {
  /** Rest position, chassis-local px (y down). The suspension geometry shifts with y. */
  x: number
  y: number
  radius: number
  /** Gets the motor; a wheel that does not still brakes through traction. */
  driven: boolean
  /** Fraction of the motor impulse this wheel gets (the Car: 1 each, as before). */
  motorShare: number
}

export interface VehicleSpec {
  kind: VehicleKind
  /** The one collision box, centred on the Chassis body; the look may add drawing-only parts. */
  body: { w: number; h: number; densityScale: number }
  wheels: [WheelSpec, WheelSpec]
  /** Hitch points by Slot, chassis-local, facing right. */
  hitch: Record<SlotId, Pt>
  look: { windscreen: boolean; cab: { x: number; y: number; w: number; h: number } | null }
  /** × HANDLING.driveAccel and brakeAccel. */
  motorScale: number
  /** × HANDLING.omegaMax (top speed ≈ omegaMax × spinScale × wheel radius). */
  spinScale: number
  /** × the motor reaction torque on the Chassis (a big driven wheel's reaction would flip a vehicle at 1). */
  reactionScale: number
  /** × the grip budget of every wheel (HANDLING.gripBase and gripPerLoad). */
  gripScale: number
}

/** The Car: the original vehicle, still read from the HANDLING rebuild group so the panel tunes it. */
export function carSpec(h: Config['HANDLING']): VehicleSpec {
  const halfW = h.chassisWidth / 2
  const halfH = h.chassisHeight / 2
  return {
    kind: 'car',
    body: { w: h.chassisWidth, h: h.chassisHeight, densityScale: 1 },
    wheels: [
      { x: -h.wheelSpacing, y: h.wheelDrop, radius: h.wheelRadius, driven: true, motorShare: 1 },
      { x: h.wheelSpacing, y: h.wheelDrop, radius: h.wheelRadius, driven: true, motorShare: 1 },
    ],
    hitch: { 1: { x: -halfW, y: 0 }, 2: { x: 0, y: -halfH - 10 }, 3: { x: halfW, y: 0 } },
    look: { windscreen: true, cab: null },
    motorScale: 1,
    spinScale: 1,
    reactionScale: 1,
    gripScale: 1,
  }
}

/** A Slot's hitch point for a facing: mirrored, the end Slots swap places (Slot 1 stays the left one). */
export function hitchLocal(spec: VehicleSpec, slot: SlotId, facing: 1 | -1): Pt {
  if (facing === 1) return spec.hitch[slot]
  const src = spec.hitch[slot === 1 ? 3 : slot === 3 ? 1 : 2]
  return { x: -src.x, y: src.y }
}
