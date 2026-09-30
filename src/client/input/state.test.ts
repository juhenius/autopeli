import { describe, expect, it } from 'vitest'
import { InputState } from './state'

describe('the input rules', () => {
  it('a key held reads as gas; a press and release inside one step still counts once', () => {
    const s = new InputState()
    s.keyDown('ArrowRight')
    expect(s.sample().gas).toBe(true)
    expect(s.sample().gas).toBe(true)
    s.keyUp('ArrowRight')
    expect(s.sample().gas).toBe(false)
    s.keyDown('KeyA')
    s.keyUp('KeyA')
    expect(s.sample().brake).toBe(true)
    expect(s.sample().brake).toBe(false)
  })

  it('Jump and Use fire once per press: never on auto-repeat, never while held', () => {
    const s = new InputState()
    s.keyDown('Space')
    expect(s.sample().jump).toBe(true)
    expect(s.sample().jump).toBe(false)
    s.keyDown('Space', true)
    expect(s.sample().jump).toBe(false)
    s.keyUp('Space')
    s.keyDown('Enter')
    expect(s.sample().use).toBe(true)
    expect(s.sample().use).toBe(false)
  })

  it('a touch in a zone holds it; sliding into gas latches it, sliding into Jump does not', () => {
    const s = new InputState()
    s.pointerDown(1, 'brake')
    expect(s.sample().brake).toBe(true)
    s.pointerMove(1, 'gas')
    const f = s.sample()
    expect(f.gas).toBe(true)
    expect(f.brake).toBe(false)
    s.pointerMove(1, 'jump')
    expect(s.sample().jump).toBe(false)
    s.pointerUp(1)
    s.pointerDown(2, 'jump')
    expect(s.sample().jump).toBe(true)
  })

  it('the Slot and Turn buttons are held, and clear() lets go of everything', () => {
    const s = new InputState()
    s.button('slot2', true)
    s.button('turn', true)
    s.keyDown('Digit3')
    expect(s.sample()).toMatchObject({ slots: [false, true, true], turn: true })
    s.clear()
    expect(s.sample()).toMatchObject({ slots: [false, false, false], turn: false, gas: false })
  })
})
