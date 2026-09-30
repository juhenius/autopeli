/**
 * NetClient: the one WebSocket to the server. Connects when constructed,
 * joins with the Driver's name, reconnects with backoff after any close except
 * room-full, and surfaces everything as plain-data callbacks — the
 * composition root decides what any of it means. No Phaser.
 */
import {
  inputMsg,
  joinMsg,
  parseServerMsg,
  readyMsg,
  vehicleMsg,
  restartMsg,
  tuneMsg,
  type FarmSnapshot,
  type InputMsg,
  type DriverInfo,
  type ServerMsg,
  type TunedEntry,
} from '../../shared/protocol'

export type NetStatus = 'connecting' | 'joined' | 'room-full' | 'replaced' | 'closed'

export type StateMsg = Extract<ServerMsg, { t: 'state' }>

export interface NetCallbacks {
  onWelcome(selfId: number, seed: number, drivers: DriverInfo[], tunables: TunedEntry[]): void
  onJoined(driver: DriverInfo): void
  onLeft(id: number): void
  /** Every Run snapshot, including the one inside welcome. `now` is server ms at send time. */
  onRun(run: FarmSnapshot, now: number): void
  /** The world state at stateHz. */
  onState(state: StateMsg): void
  /** Fired on every status change, including the initial failure paths. */
  onStatus(status: NetStatus): void
}

/** The server's close code for a full Room (reason string 'room-full'). */
const CLOSE_ROOM_FULL = 4000
/** The server's close code when the same device joined again elsewhere (reason 'replaced'). */
const CLOSE_REPLACED = 4001
/** No message from the server for this long while joined: the socket is dead (a sleeping iPad), reconnect. */
const STALE_MS = 6000
const RECONNECT_MIN_MS = 1000
const RECONNECT_MAX_MS = 8000

/** Same-origin server URL: `/ws` on the page's host, `wss:` when the page is
 * HTTPS. The dev server (vite.config.ts) proxies `/ws` to the server on 5174;
 * in production the reverse proxy in front of the static build does. */
export const serverUrl = (loc: { protocol: string; host: string }): string =>
  `${loc.protocol === 'https:' ? 'wss' : 'ws'}://${loc.host}/ws`

export class NetClient {
  private socket: WebSocket | null = null
  private currentStatus: NetStatus = 'connecting'
  private closedByUs = false
  private retryMs = RECONNECT_MIN_MS
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private readonly url: string
  private readonly name: string
  private readonly token: string
  private readonly colour: number
  private readonly vehicle: string
  private readonly cb: NetCallbacks
  private lastMsgAt = 0

  constructor(url: string, name: string, token: string, colour: number, vehicle: string, cb: NetCallbacks) {
    this.url = url
    this.name = name
    this.token = token
    this.colour = colour
    this.vehicle = vehicle
    this.cb = cb
    this.open()
    setInterval(() => this.watchdog(), 1000)
  }

  /** A joined socket that has gone quiet is closed here, which triggers the usual reconnect. */
  private watchdog(): void {
    if (this.socket === null || this.currentStatus !== 'joined') return
    if (Date.now() - this.lastMsgAt > STALE_MS) this.socket.close()
  }

  private open(): void {
    this.setStatus('connecting')
    const socket = new WebSocket(this.url)
    this.socket = socket
    socket.onopen = () => socket.send(joinMsg(this.name, this.token, this.colour, this.vehicle))
    socket.onmessage = (e) => {
      this.lastMsgAt = Date.now()
      this.onMessage(String(e.data))
    }
    socket.onclose = (e) => {
      if (this.socket !== socket) return
      this.socket = null
      if (e.code === CLOSE_ROOM_FULL || e.reason === 'room-full') {
        this.setStatus('room-full')
        return
      }
      if (e.code === CLOSE_REPLACED || e.reason === 'replaced') {
        this.setStatus('replaced')
        return
      }
      this.setStatus('closed')
      if (!this.closedByUs) this.scheduleReconnect()
    }
    socket.onerror = () => {
      /* onclose always follows */
    }
  }

  private scheduleReconnect(): void {
    if (this.retryTimer !== null) return
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null
      this.open()
    }, this.retryMs)
    this.retryMs = Math.min(RECONNECT_MAX_MS, this.retryMs * 2)
  }

  private onMessage(raw: string): void {
    const msg = parseServerMsg(raw)
    if (msg === null) return
    switch (msg.t) {
      case 'welcome':
        this.retryMs = RECONNECT_MIN_MS
        this.setStatus('joined')
        this.cb.onWelcome(msg.id, msg.seed, msg.drivers, msg.tunables)
        this.cb.onRun(msg.run, msg.now)
        return
      case 'joined':
        this.cb.onJoined({ id: msg.id, name: msg.name })
        return
      case 'left':
        this.cb.onLeft(msg.id)
        return
      case 'run':
        this.cb.onRun(msg.run, msg.now)
        return
      case 'state':
        this.cb.onState(msg)
    }
  }

  get status(): NetStatus {
    return this.currentStatus
  }

  private setStatus(s: NetStatus): void {
    if (s === this.currentStatus) return
    this.currentStatus = s
    this.cb.onStatus(s)
  }

  private send(raw: string): void {
    if (this.socket !== null && this.socket.readyState === WebSocket.OPEN && this.currentStatus === 'joined') {
      this.socket.send(raw)
    }
  }

  sendInput(h: InputMsg): void {
    this.send(inputMsg(h))
  }

  sendVehicle(kind: string): void {
    this.send(vehicleMsg(kind))
  }

  sendReady(choice: string | null): void {
    this.send(readyMsg(choice))
  }

  sendTune(path: string, value: number): void {
    this.send(tuneMsg(path, value))
  }

  sendRestart(): void {
    this.send(restartMsg())
  }

  close(): void {
    this.closedByUs = true
    if (this.retryTimer !== null) clearTimeout(this.retryTimer)
    this.socket?.close()
  }
}
