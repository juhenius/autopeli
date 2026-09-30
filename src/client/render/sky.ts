/**
 * The sky, pure: daylight from the Run's Day clock, a fixed dimness at Night,
 * and the colour and shade that go with it.
 */
import { mixColour } from '../../shared/colours'
import type { Config } from '../../shared/config'
import type { FarmSnapshot } from '../../shared/protocol'
import { daylight } from '../net/clock'

/** How light the Night is drawn, 0…1. */
export const NIGHT_LIGHT = 0.35

/** The light right now: the Day's daylight, or the Night's. */
export function skyLight(snap: FarmSnapshot | null, serverNow: number): number {
  return snap !== null && snap.phase === 'day' && snap.dayInfo !== null ? daylight(serverNow, snap.dayInfo) : NIGHT_LIGHT
}

export const skyColour = (p: Config['PALETTE'], light: number): number => mixColour(p.sky, p.skyNight, 1 - light)

/** The camera-fixed night shade's alpha for a light. */
export const shadeAlpha = (light: number): number => (1 - light) * 0.45
