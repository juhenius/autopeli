/**
 * The camera follow, pure: the own Vehicle sits at an anchor fraction of the
 * view, and the look-ahead pans to the side the Vehicle is travelling
 * toward; the vertical follow lerps.
 */
import type { Config } from '../../shared/config'

export interface Follow {
  /** Where the Vehicle sits across the view, 0…1; glides toward the look-ahead side. */
  anchorX: number
  prevOwnX: number | null
}

export const startFollow = (d: Config['CAMERA']): Follow => ({ anchorX: d.cameraAnchorX, prevOwnX: null })

/** One frame of follow: the next state and where the view scrolls to. */
export function follow(
  f: Follow,
  own: { cx: number; cy: number },
  view: { width: number; height: number; scrollY: number },
  d: Config['CAMERA'],
): { next: Follow; scrollX: number; scrollY: number } {
  const dx = f.prevOwnX === null ? 0 : own.cx - f.prevOwnX
  const target = dx > d.lookAheadMinDx ? d.cameraAnchorX : dx < -d.lookAheadMinDx ? 1 - d.cameraAnchorX : f.anchorX
  const anchorX = f.anchorX + (target - f.anchorX) * d.anchorLerpX
  const targetY = own.cy - view.height * d.cameraAnchorY
  return {
    next: { anchorX, prevOwnX: own.cx },
    scrollX: own.cx - view.width * anchorX,
    scrollY: view.scrollY + (targetY - view.scrollY) * d.cameraLerpY,
  }
}
