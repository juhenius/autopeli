/**
 * GameScene: the composition root of the client, and only a renderer since
 * the farm (ADR 0005): the server runs the physics. It connects, sends the
 * held inputs, hands every message to the Roster (which draws the Vehicles),
 * draws the Track from the same seeded function the server simulates, moves
 * the camera and the sky, and feeds the HUD and the Night overlay. No fixed
 * step, no bodies.
 */
import Phaser from 'phaser'
import { hexToNum } from '../../shared/colours'
import { createConfig, PX_PER_M, STEP_MS, type Config } from '../../shared/config'
import type { FarmSnapshot, InputMsg } from '../../shared/protocol'
import { stripCrestFree, stripFlats } from '../../shared/sim/strip'
import { createTrack, type Track } from '../../shared/sim/track'
import type { VehicleKind } from '../../shared/sim/vehicles/spec'
import { NO_INPUT, type HeldInput } from '../../shared/sim/world'
import { deviceColour, deviceName, deviceToken, deviceVehicle, saveColour, saveName, saveVehicle } from '../device'
import { Hud, type HudFrame } from '../hud'
import { NightOverlay } from '../hud/night'
import { TouchKeyboardInputSource, type InputSource } from '../input'
import { NetClient, serverUrl, type NetStatus, type StateMsg } from '../net/client'
import { secondsLeft, ServerClock } from '../net/clock'
import { follow, startFollow, type Follow } from '../render/camera'
import { PlacesView } from '../render/places'
import { shadeAlpha, skyColour, skyLight } from '../render/sky'
import { TerrainView } from '../render/terrain'
import { ToolsView } from '../render/tools'
import { VehicleGfx } from '../render/vehicleGfx'
import { Roster } from '../roster'
import { applyOverrides, getByPath, loadOverrides, setByPath } from '../tuning/overrides'

/** Local fixed steps per frame at most (a stall must not become a burst). */
const MAX_STEPS = 4

export class GameScene extends Phaser.Scene {
  readonly config: Config
  seed = 0
  private readonly debugMode: boolean
  private readonly name: string

  private hud!: Hud
  private night!: NightOverlay
  private inputSource!: InputSource
  private nightShade!: Phaser.GameObjects.Rectangle
  private roster!: Roster
  private net: NetClient | null = null
  private snap: FarmSnapshot | null = null
  private readonly clock = new ServerClock()
  private track: Track | null = null
  private terrain: TerrainView | null = null
  private places: PlacesView | null = null
  private toolsView: ToolsView | null = null
  private cam!: Follow
  private acc = 0
  private paused = false
  private portrait!: MediaQueryList
  private online = false
  private wasJoined = false
  private readonly frameMs: number[] = []
  private stateCount = 0
  private stateWindowStart = performance.now()
  private stateHz = 0
  private stocks: [number, number] = [0, 0]

  constructor() {
    super('game')
    const params = new URLSearchParams(location.search)
    this.debugMode = params.has('debug')
    this.name = deviceName(params)
    this.config = createConfig()
    if (this.debugMode) applyOverrides(this.config, loadOverrides())
  }

  create(): void {
    this.inputSource = new TouchKeyboardInputSource(this.config.PALETTE)
    this.hud = new Hud()
    this.roster = new Roster(this.config, (spec) => new VehicleGfx(this, spec, this.config.PALETTE))
    this.cam = startFollow(this.config.CAMERA)
    this.night = new NightOverlay(
      (choice) => this.net?.sendReady(choice),
      (name) => this.rename(name),
      (colour) => this.recolour(colour),
      (kind) => this.chooseVehicle(kind),
    )
    this.cameras.main.setBackgroundColor(this.config.PALETTE.sky)
    // Night: a camera-fixed shade whose alpha follows (1 − daylight).
    this.nightShade = this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, hexToNum(this.config.PALETTE.skyNight), 0)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(9)
    this.hud.showNotice('Connecting…', 0)
    this.connectNet()

    // Pause: portrait overlay (CSS in index.html) or document hidden.
    this.portrait = matchMedia('(orientation: portrait)')
    this.portrait.addEventListener('change', this.syncPause)
    document.addEventListener('visibilitychange', this.syncPause)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.portrait.removeEventListener('change', this.syncPause)
      document.removeEventListener('visibilitychange', this.syncPause)
      this.net?.close()
    })

    // The tuning panel chunk (with lil-gui) loads only with ?debug — out of the normal bundle and precache.
    if (this.debugMode) {
      void import('../tuning/panel').then((m) => m.mountTuningPanel(this))
      ;(window as unknown as { __scene: GameScene }).__scene = this // headless test hook
    }
  }

  /** The Vehicle for the next Day: saved on the device, told to the server (no rejoin needed). */
  private chooseVehicle(kind: VehicleKind): void {
    saveVehicle(kind)
    this.net?.sendVehicle(kind)
  }

  /** A new Colour, saved like the name, then a fresh join with it. */
  private recolour(colour: number): void {
    saveColour(colour)
    location.reload()
  }

  /** A new name, saved for next time, then a fresh join under it (the installed app has no URL to carry it). */
  private rename(next: string): void {
    if (next === this.name) return
    saveName(next)
    const url = new URL(location.href)
    url.searchParams.delete('mp')
    location.replace(url.toString())
  }

  private readonly syncPause = (): void => {
    const shouldPause = this.portrait.matches || document.hidden
    if (shouldPause === this.paused) return
    this.paused = shouldPause
    if (shouldPause) {
      this.inputSource.clear()
      this.sendHeld(NO_INPUT) // release everything on the server too
    } else this.acc = 0
  }

  // ---- Server ----

  private connectNet(): void {
    const token = deviceToken()
    this.net = new NetClient(serverUrl(location), this.name, token, deviceColour(token), deviceVehicle(), {
      onWelcome: (selfId, seed, drivers, tunables) => {
        this.roster.welcome(selfId, this.name, drivers)
        this.setSeed(seed)
        // The server's dials are the truth for the Room; take them into the panel's config.
        for (const t of tunables) setByPath(this.config, t.path, t.value)
      },
      onJoined: (d) => this.roster.joined(d),
      onLeft: (id) => this.roster.left(id),
      onRun: (run, now) => this.onRun(run, now),
      onState: (state) => this.onState(state),
      onStatus: (status) => this.onNetStatus(status),
    })
  }

  /** A new seed (a fresh Run): the Track and every drawn thing start over. */
  private setSeed(seed: number): void {
    if (this.seed === seed && this.track !== null) return
    this.seed = seed
    this.terrain?.destroy()
    this.places?.destroy()
    this.track = createTrack(this.config.TRACK, stripFlats(), stripCrestFree())
    this.terrain = new TerrainView(this, this.config, this.track, seed)
    this.places = new PlacesView(this, this.track, seed)
    this.toolsView?.destroy()
    this.toolsView = new ToolsView(this, this.config)
    this.toolsView.setSurface((x) => this.terrain?.surfaceYAt(x) ?? 0)
    this.roster.newRun(seed)
  }

  private onNetStatus(status: NetStatus): void {
    if (status === 'joined') {
      this.online = true
      this.wasJoined = true
      this.hud.hideNotice()
      return
    }
    this.online = false
    this.inputSource.clear()
    if (status === 'room-full') {
      this.hud.showNotice('Room full — try again later', 0)
      return
    }
    if (status === 'replaced') {
      this.roster.clear()
      this.hud.showNotice('You joined from another tab or device — this one is out', 0)
      return
    }
    if (status === 'closed') {
      this.roster.clear()
      this.hud.renderDrivers([])
      this.hud.showNotice(this.wasJoined ? 'Disconnected — reconnecting…' : 'No server — retrying…', 0)
    }
  }

  private onRun(run: FarmSnapshot, now: number): void {
    this.clock.sync(now)
    this.snap = run
    this.setSeed(run.seed)
    this.roster.run(run)
    this.places?.setFields(run.fields)
    if (run.phase !== 'day') {
      this.night.render(run, this.roster.self)
      this.hud.setVisible(false)
      this.inputSource.clear()
      this.sendHeld(NO_INPUT) // let go on the server too
      return
    }
    this.night.hide()
    this.hud.setVisible(true)
  }

  private onState(state: StateMsg): void {
    const now = performance.now()
    this.stateCount++
    if (now - this.stateWindowStart >= 1000) {
      this.stateHz = (this.stateCount * 1000) / (now - this.stateWindowStart)
      this.stateCount = 0
      this.stateWindowStart = now
    }
    this.roster.state(state, now)
    this.toolsView?.update(state.tools, state.produce, state.ramps, state.pickups, now)
    this.stocks = state.stocks
  }

  // ---- Input ----

  /** One local fixed step: sample the controls, predict with them, send them numbered. */
  private localStep(): void {
    this.sendHeld(this.inputSource.sample())
  }

  private sendHeld(held: HeldInput): void {
    const msg: InputMsg = { seq: this.roster.step(held), ...held }
    this.net?.sendInput(msg)
  }

  // ---- Frame ----

  update(_time: number, delta: number): void {
    const t0 = performance.now()
    if (this.online && this.snap?.phase === 'day' && !this.paused) {
      this.acc = Math.min(this.acc + delta, STEP_MS * MAX_STEPS)
      while (this.acc >= STEP_MS) {
        this.acc -= STEP_MS
        this.localStep()
      }
    }
    this.roster.decay()
    const now = performance.now()
    const drawn = this.roster.draw(now)
    const cam = this.cameras.main
    const own = this.roster.own(now)
    if (own !== null) {
      const f = follow(this.cam, own, { width: cam.width, height: cam.height, scrollY: cam.scrollY }, this.config.CAMERA)
      this.cam = f.next
      cam.scrollX = f.scrollX
      cam.scrollY = f.scrollY
    }
    this.terrain?.stream(cam.scrollX + cam.width / 2)
    this.toolsView?.render(now, (id) => drawn.find(([i]) => i === id)?.[1] ?? null, drawn, this.roster.self, [cam.scrollX - 100, cam.scrollX + cam.width + 100])
    this.renderSkyAndHud(own)
    this.frameMs.push(performance.now() - t0)
    if (this.frameMs.length > 120) this.frameMs.shift()
  }

  private renderSkyAndHud(own: { cx: number; flipped: boolean; respawnS: number } | null): void {
    const snap = this.snap
    if (snap === null) return
    const cam = this.cameras.main
    const serverNow = this.clock.now()
    const light = skyLight(snap, serverNow)
    cam.setBackgroundColor(skyColour(this.config.PALETTE, light))
    this.nightShade.setAlpha(shadeAlpha(light))

    if (snap.phase !== 'day' || snap.dayInfo === null) return
    const margin = 40
    this.hud.renderDrivers(this.roster.labels(cam.scrollX - margin, cam.scrollX + cam.width + margin))

    const self = snap.drivers.find((d) => d.id === this.roster.self)
    const connected = snap.drivers.filter((d) => d.connected)
    const frame: HudFrame = {
      day: snap.day,
      score: snap.score,
      stocks: this.stocks,
      homeM: own === null ? 0 : (snap.farmhouseX - own.cx) / PX_PER_M,
      daylight: light,
      secondsLeft: secondsLeft(serverNow, snap.dayInfo),
      home:
        self?.home === true
          ? {
              here: connected.filter((d) => d.home).length,
              ready: connected.filter((d) => d.ready === 'home').length,
              total: connected.length,
              selfReady: self.ready === 'home',
            }
          : null,
      flipped: own?.flipped ? { respawnIn: own.respawnS } : null,
    }
    this.hud.render(frame)
    if (this.roster.self !== null && this.toolsView) this.inputSource.setSlotFaces(this.toolsView.slotFaces(this.roster.self))
  }

  // ---- Tuning host ----

  tunableChanged(path: string): void {
    const value = getByPath(this.config, path)
    if (value === undefined) return
    if (path.startsWith('TRACK.')) {
      // The Track is drawn from the same params: redraw once the server has rebuilt.
      this.track = createTrack(this.config.TRACK, stripFlats(), stripCrestFree())
      this.terrain?.destroy()
      this.places?.destroy()
      this.terrain = new TerrainView(this, this.config, this.track, this.seed)
      this.places = new PlacesView(this, this.track, this.seed)
    }
    if (!path.startsWith('NET.') && !path.startsWith('CAMERA.')) this.net?.sendTune(path, value)
  }

  restart(): void {
    this.net?.sendRestart()
  }

  readout(): { lines: string[]; overBudget: boolean } {
    const avg = this.frameMs.length ? this.frameMs.reduce((a, b) => a + b, 0) / this.frameMs.length : 0
    const max = this.frameMs.length ? Math.max(...this.frameMs) : 0
    const own = this.roster.self === null ? null : this.roster.latest(this.roster.self)
    const snap = this.snap
    return {
      lines: [
        `frame ${avg.toFixed(1)} ms (max ${max.toFixed(1)}) · state ${this.stateHz.toFixed(0)} Hz · delay ${this.config.NET.interpDelayMs} ms · chunks ${this.terrain?.chunkCount ?? 0}`,
        this.roster.predictionReadout(),
        `seed ${this.seed} · ${snap?.phase ?? '—'} · day ${snap?.day ?? 0} · drivers ${this.roster.size}`,
        own === null ? 'no state yet' : `x ${own.cx.toFixed(0)} y ${own.cy.toFixed(0)} · ${own.flipped ? 'flipped' : 'driving'} · slip ${own.s[0].toFixed(1)}/${own.s[1].toFixed(1)}`,
      ],
      overBudget: avg > 16.7,
    }
  }
}
