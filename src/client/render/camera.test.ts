import { describe, expect, it } from 'vitest'
import { createConfig } from '../../shared/config'
import { follow, startFollow } from './camera'

const d = createConfig().CAMERA
const view = { width: 1000, height: 600, scrollY: 0 }

describe('the camera follow', () => {
  it('starts with the Vehicle at the anchor and pans the look-ahead toward the travel direction', () => {
    let f = startFollow(d)
    const still = follow(f, { cx: 500, cy: 300 }, view, d)
    expect(still.scrollX).toBeCloseTo(500 - 1000 * d.cameraAnchorX)
    f = still.next
    for (let i = 0; i < 400; i++) f = follow(f, { cx: 500 - i * 5, cy: 300 }, view, d).next
    expect(f.anchorX).toBeCloseTo(1 - d.cameraAnchorX, 1)
  })

  it('lerps vertically', () => {
    const r = follow(startFollow(d), { cx: 0, cy: 1000 }, view, d)
    expect(r.scrollY).toBeCloseTo((1000 - 600 * d.cameraAnchorY) * d.cameraLerpY)
  })
})
