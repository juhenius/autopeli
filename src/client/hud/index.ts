/**
 * DOM HUD for the Day: Day number, the daylight bar, the Farmhouse prompt
 * (here / ready counts, "press USE"), the FLIPPED panel with the respawn
 * countdown, the Slot readout, edge name labels for off-screen Drivers, and
 * transient notices. The canvas draws only the world; all of this lives
 * above it with pointer-events: none — the Night overlay (night.ts) is the
 * only DOM that takes taps.
 */

/** One off-screen Driver's edge label. */
export interface DriverLabel {
  name: string
  side: 'left' | 'right'
}

/** Everything the Day HUD shows, computed per frame by the composition root. */
export interface HudFrame {
  day: number
  /** Produce banked this Run. */
  score: number
  /** The stores: seeds in the Barn, water in the Well. */
  stocks: [number, number]
  /** Metres to the Farmhouse, signed: negative means home is to the left. */
  homeM: number
  /** 0…1 daylight factor. */
  daylight: number
  /** Seconds to Sunset. */
  secondsLeft: number
  /** Farmhouse prompt: null away from home. */
  home: { here: number; ready: number; total: number; selfReady: boolean } | null
  flipped: { respawnIn: number } | null
}

const HUD_CSS = `
#hud {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 6;
  color: #ffffff;
  font-family: system-ui, sans-serif;
  text-shadow:
    -2px -2px 0 rgba(20, 30, 40, 0.9), 2px -2px 0 rgba(20, 30, 40, 0.9),
    -2px 2px 0 rgba(20, 30, 40, 0.9), 2px 2px 0 rgba(20, 30, 40, 0.9);
}
.hud-top {
  position: absolute;
  top: calc(env(safe-area-inset-top, 0px) + 10px);
  left: 0;
  right: 0;
  text-align: center;
  font-size: 30px;
  font-weight: 700;
}
.hud-sun {
  position: absolute;
  top: calc(env(safe-area-inset-top, 0px) + 54px);
  left: 50%;
  transform: translateX(-50%);
  width: 260px;
  height: 10px;
  border-radius: 5px;
  background: rgba(20, 30, 40, 0.55);
  overflow: hidden;
}
.hud-sun-fill { height: 100%; background: #ffd166; border-radius: 5px; width: 100%; }
.hud-sun-label {
  position: absolute;
  top: calc(env(safe-area-inset-top, 0px) + 66px);
  left: 50%;
  transform: translateX(-50%);
  font-size: 15px;
  font-weight: 600;
  opacity: 0.9;
  text-shadow: 0 1px 2px rgba(20, 30, 40, 0.9);
}
.hud-home {
  position: absolute;
  top: calc(env(safe-area-inset-top, 0px) + 18px);
  right: calc(env(safe-area-inset-right, 0px) + 20px);
  font-size: 20px;
  font-weight: 600;
}
.hud-panel {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
  background: rgba(20, 30, 40, 0.65);
  border-radius: 16px;
  padding: 28px 48px;
}
.hud-panel-title { font-size: 40px; font-weight: 700; }
.hud-panel-sub { font-size: 20px; margin-top: 14px; }
.hud-prompt {
  position: absolute;
  bottom: calc(env(safe-area-inset-bottom, 0px) + 200px);
  left: 50%;
  transform: translateX(-50%);
  text-align: center;
  font-size: 24px;
  font-weight: 700;
  background: rgba(20, 30, 40, 0.65);
  border-radius: 12px;
  padding: 12px 24px;
  white-space: nowrap;
}
.hud-prompt.ready { background: rgba(42, 157, 143, 0.75); }
.hud-driver {
  position: absolute;
  font-size: 16px;
  font-weight: 600;
  text-shadow: 0 1px 2px rgba(20, 30, 40, 0.9);
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.hud-driver-left { left: calc(env(safe-area-inset-left, 0px) + 12px); }
.hud-driver-right { right: calc(env(safe-area-inset-right, 0px) + 12px); text-align: right; }
.hud-notice {
  position: absolute;
  bottom: calc(env(safe-area-inset-bottom, 0px) + 116px); /* above the Slot buttons' row */
  left: 50%;
  transform: translateX(-50%);
  font-size: 18px;
  font-weight: 600;
  background: rgba(20, 30, 40, 0.65);
  border-radius: 10px;
  padding: 8px 18px;
  white-space: nowrap;
}
[hidden] { display: none !important; }
`

export class Hud {
  private readonly root: HTMLDivElement
  private readonly dayEl: HTMLSpanElement
  private readonly sunFillEl: HTMLDivElement
  private readonly sunLabelEl: HTMLDivElement
  private readonly homeEl: HTMLDivElement
  private homeKey = ''
  private readonly panelEl: HTMLDivElement
  private readonly panelTitleEl: HTMLDivElement
  private readonly panelSubEl: HTMLDivElement
  private readonly promptEl: HTMLDivElement
  private readonly noticeEl: HTMLDivElement
  private noticeTimer: ReturnType<typeof setTimeout> | null = null
  private readonly driversEl: HTMLDivElement
  private driversKey = ''

  // Last rendered values, so a per-frame render touches the DOM only on change.
  private dayKey = ''
  private sunWidth = -1
  private sunLabel = ''
  private panelKey = ''
  private promptKey = ''

  constructor() {
    if (!document.getElementById('hud-styles')) {
      const style = document.createElement('style')
      style.id = 'hud-styles'
      style.textContent = HUD_CSS
      document.head.appendChild(style)
    }
    this.root = document.createElement('div')
    this.root.id = 'hud'
    this.root.innerHTML = `
      <div class="hud-top"><span class="hud-day"></span></div>
      <div class="hud-sun"><div class="hud-sun-fill"></div></div>
      <div class="hud-sun-label"></div>
      <div class="hud-home"></div>
      <div class="hud-panel" hidden>
        <div class="hud-panel-title"></div>
        <div class="hud-panel-sub"></div>
      </div>
      <div class="hud-prompt" hidden></div>
      <div class="hud-notice" hidden></div>
      <div class="hud-drivers"></div>`
    document.body.appendChild(this.root)
    this.dayEl = this.root.querySelector('.hud-day')!
    this.sunFillEl = this.root.querySelector('.hud-sun-fill')!
    this.sunLabelEl = this.root.querySelector('.hud-sun-label')!
    this.homeEl = this.root.querySelector('.hud-home')!
    this.panelEl = this.root.querySelector('.hud-panel')!
    this.panelTitleEl = this.root.querySelector('.hud-panel-title')!
    this.panelSubEl = this.root.querySelector('.hud-panel-sub')!
    this.promptEl = this.root.querySelector('.hud-prompt')!
    this.noticeEl = this.root.querySelector('.hud-notice')!
    this.driversEl = this.root.querySelector('.hud-drivers')!
  }

  /** Off-screen Drivers as name labels at the screen edge, stacked per edge. */
  renderDrivers(labels: DriverLabel[]): void {
    const key = labels.map((l) => `${l.side}:${l.name}`).join('|')
    if (key === this.driversKey) return
    this.driversKey = key
    this.driversEl.replaceChildren()
    const counts = { left: 0, right: 0 }
    for (const l of labels) {
      const el = document.createElement('div')
      el.className = `hud-driver hud-driver-${l.side}`
      el.textContent = l.name
      el.style.top = `calc(env(safe-area-inset-top, 0px) + 88px + ${counts[l.side] * 26}px)`
      counts[l.side]++
      this.driversEl.appendChild(el)
    }
  }

  /** Transient bottom-centre toast; replaces any current one. `ms` 0 = sticky. */
  showNotice(text: string, ms = 4000): void {
    this.noticeEl.textContent = text
    this.noticeEl.hidden = false
    if (this.noticeTimer !== null) clearTimeout(this.noticeTimer)
    this.noticeTimer = null
    if (ms > 0) {
      this.noticeTimer = setTimeout(() => {
        this.noticeEl.hidden = true
        this.noticeTimer = null
      }, ms)
    }
  }

  hideNotice(): void {
    if (this.noticeTimer !== null) clearTimeout(this.noticeTimer)
    this.noticeTimer = null
    this.noticeEl.hidden = true
  }

  /** Show or hide the whole Day HUD (hidden under the Night overlay). */
  setVisible(visible: boolean): void {
    this.root.hidden = !visible
  }

  render(f: HudFrame): void {
    const dayKey = `${f.day}/${f.score}/${f.stocks[0]}/${f.stocks[1]}`
    if (dayKey !== this.dayKey) {
      this.dayKey = dayKey
      this.dayEl.textContent = `Day ${f.day} · 🎃 ${f.score} · 🌱 ${f.stocks[0]} · 💧 ${f.stocks[1]}`
    }
    const width = Math.round(f.daylight * 100)
    if (width !== this.sunWidth) {
      this.sunWidth = width
      this.sunFillEl.style.width = `${width}%`
    }
    const sunLabel =
      f.daylight < 1 ? `Sunset in ${f.secondsLeft} s` : `${Math.floor(f.secondsLeft / 60)}:${String(f.secondsLeft % 60).padStart(2, '0')} of daylight`
    if (sunLabel !== this.sunLabel) {
      this.sunLabel = sunLabel
      this.sunLabelEl.textContent = sunLabel
    }
    const homeM = Math.round(Math.abs(f.homeM))
    const homeKey = homeM < 10 ? 'home' : `${f.homeM < 0 ? '←' : '→'} ${homeM}`
    if (homeKey !== this.homeKey) {
      this.homeKey = homeKey
      this.homeEl.textContent = homeM < 10 ? '🏠 home' : `🏠 ${f.homeM < 0 ? '←' : '→'} ${homeM} m`
    }
    const panelKey = f.flipped === null ? '' : `flip:${Math.ceil(f.flipped.respawnIn)}`
    if (panelKey !== this.panelKey) {
      this.panelKey = panelKey
      this.panelEl.hidden = f.flipped === null
      if (f.flipped !== null) {
        this.panelTitleEl.textContent = 'FLIPPED'
        this.panelSubEl.textContent = `a friend can flip you back · respawn in ${Math.ceil(f.flipped.respawnIn)} s`
      }
    }
    let promptText = ''
    let promptReady = false
    if (f.home !== null) {
      const h = f.home
      if (h.total <= 1) promptText = h.selfReady ? 'Home · ending the day…' : 'Home · press USE to end the day'
      else if (h.here < h.total) promptText = `Home · ${h.here}/${h.total} here` + (h.selfReady ? ' · waiting…' : ' · press USE to end the day')
      else promptText = h.selfReady ? `Home · everyone here · ${h.ready}/${h.total} ready` : `Home · everyone here · press USE to end the day (${h.ready}/${h.total})`
      promptReady = h.selfReady
    }
    if (promptText !== this.promptKey) {
      this.promptKey = promptText
      this.promptEl.hidden = promptText === ''
      this.promptEl.textContent = promptText
      this.promptEl.classList.toggle('ready', promptReady)
    }
  }

  dispose(): void {
    this.root.remove()
  }
}
