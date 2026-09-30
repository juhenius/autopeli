/**
 * NightOverlay: the one piece of DOM that takes taps. Shown at every Night:
 * the Fields, the Score, the name, Colour and Vehicle pickers, and "Start
 * the day" (Ready 'go'). The roster shows who is Ready. Pointer
 * events stop here so a tap never becomes a gas press.
 */
import { colourOf, DRIVER_COLOURS } from '../../shared/colours'
import { isVehicleKind, VEHICLE_KINDS } from '../../shared/sim/vehicles/index'
import type { VehicleKind } from '../../shared/sim/vehicles/spec'

const VEHICLE_ICON: Record<VehicleKind, string> = { car: '🚗', tractor: '🚜' }
import type { FarmSnapshot } from '../../shared/protocol'

const NIGHT_CSS = `
#night {
  position: fixed;
  inset: 0;
  z-index: 8;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(20, 30, 40, 0.82);
  color: #fff;
  font-family: system-ui, sans-serif;
  padding: env(safe-area-inset-top, 0px) env(safe-area-inset-right, 0px) env(safe-area-inset-bottom, 0px) env(safe-area-inset-left, 0px);
}
#night .box { text-align: center; max-width: 92vw; }
#night h1 { font-size: 34px; margin: 0 0 6px; }
#night .sub { font-size: 18px; opacity: 0.9; margin-bottom: 14px; }
#night .fields { display: flex; gap: 14px; justify-content: center; flex-wrap: wrap; margin-bottom: 16px; }
#night .field {
  background: rgba(255, 255, 255, 0.1);
  border: 3px solid rgba(255, 255, 255, 0.25);
  border-radius: 14px;
  padding: 12px 18px;
  min-width: 150px;
}
#night .field .name { font-size: 20px; font-weight: 700; }
#night .field .pct { font-size: 28px; margin-top: 4px; }
#night .field .sub { font-size: 13px; opacity: 0.75; margin-top: 4px; }
#night .btn {
  display: inline-block;
  font-size: 24px;
  font-weight: 700;
  background: #2a9d8f;
  border-radius: 14px;
  padding: 14px 34px;
  cursor: pointer;
  user-select: none;
  margin-bottom: 16px;
}
#night .btn.sel { background: #ffd166; color: #1d2b3a; }
#night .banked { font-size: 24px; margin-bottom: 12px; }
#night .roster { font-size: 18px; margin-top: 6px; }
#night .you { font-size: 16px; margin-top: 12px; opacity: 0.9; }
#night .you .rename { text-decoration: underline; cursor: pointer; margin-left: 8px; }
#night .you input { font: inherit; font-size: 18px; padding: 6px 10px; border-radius: 8px; border: none; width: 12em; max-width: 60vw; margin: 0 8px; }
#night .you .ok { display: inline-block; background: #2a9d8f; border-radius: 8px; padding: 6px 14px; cursor: pointer; }
#night .vehicles { margin-top: 12px; display: flex; justify-content: center; gap: 10px; }
#night .vehicle { padding: 8px 16px; border-radius: 10px; background: rgba(255,255,255,0.12); cursor: pointer; font-size: 18px; }
#night .vehicle.sel { background: #ffd166; color: #1d2b3a; }
#night .swatches { margin-top: 10px; display: flex; justify-content: center; gap: 10px; }
#night .swatch { width: 28px; height: 28px; border-radius: 50%; border: 3px solid transparent; cursor: pointer; }
#night .swatch.sel { border-color: #fff; }
#night .roster .d { margin: 0 10px; }
#night .roster .off { opacity: 0.4; }
#night .hint { font-size: 14px; opacity: 0.7; margin-top: 10px; }
[hidden] { display: none !important; }
`

const escapeHtml = (s: string): string => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

export class NightOverlay {
  private readonly root: HTMLDivElement
  private key = ''

  constructor(
    private readonly onChoose: (choice: string | null) => void,
    private readonly onRename: (name: string) => void,
    private readonly onColour: (colour: number) => void,
    private readonly onVehicle: (kind: VehicleKind) => void,
  ) {
    if (!document.getElementById('night-styles')) {
      const style = document.createElement('style')
      style.id = 'night-styles'
      style.textContent = NIGHT_CSS
      document.head.appendChild(style)
    }
    this.root = document.createElement('div')
    this.root.id = 'night'
    this.root.hidden = true
    for (const type of ['pointermove', 'pointercancel'] as const) {
      this.root.addEventListener(type, (e) => e.stopPropagation())
    }
    // Taps by pointer events, not click: main.ts cancels native touch events to stop Safari's zoom, and a
    // cancelled touchend never turns into a click on iOS.
    let pressed: HTMLElement | null = null
    const actionOf = (t: EventTarget | null): HTMLElement | null => (t instanceof HTMLElement ? t.closest<HTMLElement>('[data-choice], [data-rename], [data-save], [data-colour], [data-vehicle]') : null)
    this.root.addEventListener('pointerdown', (e) => {
      e.stopPropagation()
      pressed = actionOf(e.target)
    })
    this.root.addEventListener('pointerup', (e) => {
      e.stopPropagation()
      const el = actionOf(e.target)
      if (el === null || el !== pressed) return
      pressed = null
      if (el.dataset.rename !== undefined) {
        this.setEditing(true)
        return
      }
      if (el.dataset.save !== undefined) {
        this.saveName()
        return
      }
      if (el.dataset.colour !== undefined) {
        this.onColour(Number(el.dataset.colour))
        return
      }
      if (isVehicleKind(el.dataset.vehicle)) {
        this.onVehicle(el.dataset.vehicle)
        return
      }
      if (el.dataset.choice !== undefined) this.onChoose(el.classList.contains('sel') ? null : el.dataset.choice)
    })
    this.root.addEventListener('keydown', (e) => {
      if (!(e.target instanceof HTMLInputElement)) return
      e.stopPropagation()
      if (e.key === 'Enter') this.saveName()
      if (e.key === 'Escape') this.setEditing(false)
    })
    this.root.addEventListener('keyup', (e) => {
      if (e.target instanceof HTMLInputElement) e.stopPropagation()
    })
    document.body.appendChild(this.root)
  }

  /** True while the name box is open (survives re-renders; the typed text does too). */
  private editing = false

  private nameBox(): HTMLInputElement | null {
    return this.root.querySelector<HTMLInputElement>('input[name=name]')
  }

  private saveName(): void {
    const next = this.nameBox()?.value.trim().slice(0, 24) ?? ''
    this.setEditing(false)
    if (next !== '') this.onRename(next)
  }

  /** The overlay only re-renders on a Run change from outside, so a local change redraws from the last Run. */
  private setEditing(on: boolean): void {
    this.editing = on
    this.key = ''
    if (this.last !== null) this.render(this.last.run, this.last.selfId)
  }

  private last: { run: FarmSnapshot; selfId: number | null } | null = null

  hide(): void {
    this.root.hidden = true
    this.editing = false
    this.key = ''
  }

  /** Re-renders only when the visible content changes. */
  render(run: FarmSnapshot, selfId: number | null): void {
    this.last = { run, selfId }
    const key = JSON.stringify([run.phase, run.day, run.score, run.fields, this.editing, run.drivers.map((d) => [d.id, d.name, d.colour, d.vehicle, d.connected, d.ready])])
    if (key === this.key) return
    this.key = key
    this.root.hidden = false
    const self = run.drivers.find((d) => d.id === selfId) ?? null
    const typed = this.nameBox()?.value ?? self?.name ?? ''
    const wasFocused = this.nameBox() !== null && document.activeElement === this.nameBox()
    const fields = run.fields
      .map((f) => {
        const n = Math.max(1, f.cells.length)
        const pct = (pred: (c: number) => boolean): number => Math.round((100 * f.cells.filter(pred).length) / n)
        const st = (c: number): number => c & 7
        const tilled = pct((c) => st(c) >= 1)
        const sown = pct((c) => st(c) === 2 || st(c) === 3)
        const ripe = pct((c) => st(c) === 4)
        const line = ripe > 0 ? `${ripe} % ripe` : sown > 0 ? `${sown} % growing` : `${tilled} % tilled`
        return `<div class="field"><div class="name">Field ${String.fromCharCode(65 + f.id)}</div><div class="pct">${line}</div><div class="sub">${tilled} % tilled · ${sown} % growing · ${ripe} % ripe</div></div>`
      })
      .join('')
    let title = ''
    let sub = ''
    let body = ''
    const banked = `<div class="banked">🎃 ${run.score} banked</div>`
    if (run.day === 0) {
      title = 'A new farm'
      sub = 'Fetch the plough from the barn, till the fields, be home by sunset.'
      body = this.button('go', 'Start day 1', self?.ready === 'go')
    } else {
      title = `Night ${run.day}`
      sub = `Day ${run.day} done`
      body = `${banked}<div class="fields">${fields}</div>${this.button('go', `Start day ${run.day + 1}`, self?.ready === 'go')}`
    }
    const roster = run.drivers
      .map((d) => `<span class="d${d.connected ? '' : ' off'}">${d.ready !== null ? '✅ ' : '⬜ '}<span style="color:${colourOf(d.colour)}">${escapeHtml(d.name)}</span> ${VEHICLE_ICON[isVehicleKind(d.vehicle) ? d.vehicle : 'car']}</span>`)
      .join('')
    this.root.innerHTML = `<div class="box">
      <h1>${escapeHtml(title)}</h1>
      <div class="sub">${escapeHtml(sub)}</div>
      ${body}
      <div class="roster">${roster}</div>
      <div class="you">${
        this.editing
          ? `you are <input name="name" maxlength="24" autocomplete="off" autocapitalize="words" value="${escapeHtml(typed)}"><span class="ok" data-save>ok</span>`
          : `you are <b>${escapeHtml(self?.name ?? '…')}</b><span class="rename" data-rename>change name</span>`
      }</div>
      <div class="vehicles">${VEHICLE_KINDS.map((k) => `<span class="vehicle${self?.vehicle === k ? ' sel' : ''}" data-vehicle="${k}">${VEHICLE_ICON[k]} ${k === 'car' ? 'Car' : 'Tractor'}</span>`).join('')}</div>
      <div class="swatches">${DRIVER_COLOURS.map((c, i) => `<span class="swatch${self?.colour === i ? ' sel' : ''}" data-colour="${i}" style="background:${c}"></span>`).join('')}</div>
      <div class="hint">everyone must agree to go on</div>
    </div>`
    if (this.editing && (wasFocused || typed === (self?.name ?? ''))) this.nameBox()?.focus()
  }

  private button(choice: string, label: string, selected: boolean): string {
    return `<div class="btn${selected ? ' sel' : ''}" data-choice="${choice}">${selected ? '✅ ' : ''}${label}</div>`
  }

  dispose(): void {
    this.root.remove()
  }
}
