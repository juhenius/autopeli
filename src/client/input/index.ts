/**
 * Input: the DOM adapter over the input's rules (state.ts) and the controls
 * table (layout.ts). It builds the pads and buttons from the table, feeds
 * pointer and key events to the rules, and yields the whole held input once
 * per local step. The round pads are hints, not targets: the window zones
 * count; the Slot and Turn buttons take their own pointers.
 */
import type { Config } from '../../shared/config'
import type { HeldInput } from '../../shared/sim/world'
import type { SlotFace } from '../hud/slotFace'
import { CONTROLS, placement, zoneAt, type Control, type ControlId } from './layout'
import { InputState } from './state'

export interface InputSource {
  /** Called once per local step: the held input, with the press latches cleared. */
  sample(): HeldInput
  /** Release everything (pause, a Night). */
  clear(): void
  /** What the three Slot buttons show. */
  setSlotFaces(faces: [SlotFace, SlotFace, SlotFace]): void
}

const CSS = `
.slot-n { font: bold 26px monospace; }
.slot-n-corner { position: absolute; top: 4px; left: 10px; font-size: 12px; opacity: 0.8; }
.slot-i { width: 48px; height: 48px; margin-top: 0; pointer-events: none; }
.slot-s { font: 600 11px system-ui, sans-serif; line-height: 1; margin-top: -4px; }
.ctl {
  border-radius: 50%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  user-select: none;
  -webkit-user-select: none;
  z-index: 5;
}
.ctl-pad { background: #ffffff; color: rgba(0, 0, 0, 0.55); font: 48px system-ui, sans-serif; }
.ctl-button { background: rgba(255, 255, 255, 0.25); color: #fff; font: bold 26px monospace; touch-action: none; z-index: 7; }
.ctl-zone { pointer-events: none; }
.ctl-use { font-size: 22px; font-weight: 700; letter-spacing: 1px; }
${CONTROLS.map((c) => `.ctl-${c.id} { ${placement(c)} }`).join('\n')}
`

export class TouchKeyboardInputSource implements InputSource {
  private readonly state = new InputState()
  private readonly elements = new Map<ControlId, HTMLDivElement>()
  private readonly padOn = new Map<ControlId, boolean>()
  private readonly faceKeys = ['', '', '']

  constructor(private readonly palette: Config['PALETTE']) {
    if (!document.getElementById('input-styles')) {
      const style = document.createElement('style')
      style.id = 'input-styles'
      style.textContent = CSS
      document.head.appendChild(style)
    }
    for (const c of CONTROLS) this.elements.set(c.id, this.make(c))
    window.addEventListener('pointerdown', this.onPointerDown)
    window.addEventListener('pointermove', this.onPointerMove)
    window.addEventListener('pointerup', this.onPointerEnd)
    window.addEventListener('pointercancel', this.onPointerEnd)
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
  }

  private make(c: Control): HTMLDivElement {
    const el = document.createElement('div')
    el.className = `ctl ctl-${c.look} ctl-${c.hit} ctl-${c.id}`
    el.textContent = c.glyph
    if (c.look === 'pad') el.style.opacity = String(this.palette.padOpacity)
    if (c.hit === 'button') {
      // The button takes its own pointer and never reaches the window zones.
      const held = (down: boolean) => (e: Event): void => {
        e.preventDefault()
        e.stopPropagation()
        this.state.button(c.id, down)
      }
      el.addEventListener('pointerdown', held(true))
      el.addEventListener('pointerup', held(false))
      el.addEventListener('pointercancel', held(false))
      el.addEventListener('pointerleave', held(false))
    }
    document.body.appendChild(el)
    return el
  }

  private readonly onPointerDown = (e: PointerEvent): void => {
    this.state.pointerDown(e.pointerId, zoneAt(e.clientX, e.clientY, window.innerWidth, window.innerHeight))
    try {
      document.body.setPointerCapture(e.pointerId)
    } catch {
      /* capture is best-effort */
    }
  }

  private readonly onPointerMove = (e: PointerEvent): void => {
    this.state.pointerMove(e.pointerId, zoneAt(e.clientX, e.clientY, window.innerWidth, window.innerHeight))
  }

  private readonly onPointerEnd = (e: PointerEvent): void => {
    this.state.pointerUp(e.pointerId)
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    this.state.keyDown(e.code, e.repeat)
  }

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    this.state.keyUp(e.code)
  }

  sample(): HeldInput {
    for (const c of CONTROLS) if (c.hit === 'zone') this.showPressed(c.id, this.state.held(c.id))
    return this.state.sample()
  }

  /** A pad brightens while its control is held (touched only on change). */
  private showPressed(id: ControlId, on: boolean): void {
    if (this.padOn.get(id) === on) return
    this.padOn.set(id, on)
    this.elements.get(id)!.style.opacity = String(on ? this.palette.padPressedOpacity : this.palette.padOpacity)
  }

  setSlotFaces(faces: [SlotFace, SlotFace, SlotFace]): void {
    faces.forEach((f, i) => {
      const key = `${f.icon}|${f.sub}|${f.active}`
      if (key === this.faceKeys[i]) return
      this.faceKeys[i] = key
      const el = this.elements.get(`slot${i + 1}` as ControlId)!
      el.innerHTML =
        f.icon === ''
          ? `<span class="slot-n">${i + 1}</span>`
          : `<span class="slot-n slot-n-corner">${i + 1}</span><img class="slot-i" src="${f.icon}" alt=""><span class="slot-s">${f.sub}</span>`
      el.style.background = f.active ? 'rgba(255, 224, 102, 0.55)' : 'rgba(255, 255, 255, 0.25)'
    })
  }

  clear(): void {
    this.state.clear()
    for (const c of CONTROLS) if (c.hit === 'zone') this.showPressed(c.id, false)
  }

  dispose(): void {
    window.removeEventListener('pointerdown', this.onPointerDown)
    window.removeEventListener('pointermove', this.onPointerMove)
    window.removeEventListener('pointerup', this.onPointerEnd)
    window.removeEventListener('pointercancel', this.onPointerEnd)
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    for (const el of this.elements.values()) el.remove()
  }
}
