import type { Config } from '../../config/index.ts'
import { carSpec, type VehicleKind, type VehicleSpec } from './spec.ts'
import { tractorSpec } from './tractor.ts'

export const VEHICLE_KINDS: VehicleKind[] = ['car', 'tractor']

export const isVehicleKind = (v: unknown): v is VehicleKind => v === 'car' || v === 'tractor'

/** The spec for a kind, from the current config (the panel's numbers). */
export function specOf(kind: VehicleKind, config: Config): VehicleSpec {
  return kind === 'tractor' ? tractorSpec(config.HANDLING, config.TRACTOR) : carSpec(config.HANDLING)
}
