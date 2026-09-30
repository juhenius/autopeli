/**
 * The server's entry: plain Node + ws on port 5174. Sockets, the heartbeat
 * and the timer live here; everything the messages mean lives in the Room
 * (membership, the Run, the physics). Run with `npm run server` (Node 24
 * with --experimental-transform-types, so the sim's parameter properties
 * load).
 */
import { randomInt } from 'node:crypto'
import { WebSocketServer, type WebSocket } from 'ws'
import { parseClientMsg } from '../shared/protocol.ts'
import { SERVER_CONFIG } from './config.ts'
import { Room, type Outbound } from './room.ts'

const PORT = Number(process.env.PORT ?? 5174)
/** Custom close code carried alongside the 'replaced' reason: the same device joined again. */
const CLOSE_REPLACED = 4001
/** Custom close code carried alongside the 'room-full' reason. */
const CLOSE_ROOM_FULL = 4000
/** Timer period for the loop; the Room's accumulator does the fixed stepping. */
const LOOP_MS = 4

// DAY_MS shortens Days for testing Sunset (never set in deployment).
const cfg = process.env.DAY_MS ? { ...SERVER_CONFIG, dayLengthMs: Number(process.env.DAY_MS) } : SERVER_CONFIG
const room = new Room(cfg, () => randomInt(0, 0x100000000))
const sockets = new Map<number, WebSocket>()
/** Heartbeat: each open socket's check returns false once it has answered no ping since the last round. */
const liveness = new Map<WebSocket, () => boolean>()
setInterval(() => {
  for (const [ws, check] of liveness) {
    if (check()) ws.ping()
    else ws.terminate()
  }
}, SERVER_CONFIG.pingMs)

/** What the Room asked for: each message stringified once and sent to its members, sockets closed, lines logged. */
function deliver(out: Outbound[]): void {
  for (const o of out) {
    if (o.kind === 'send') {
      const json = JSON.stringify(o.msg)
      for (const id of o.to) sockets.get(id)?.send(json)
    } else if (o.kind === 'close') {
      const ws = sockets.get(o.to)
      sockets.delete(o.to)
      ws?.close(CLOSE_REPLACED, o.reason)
    } else console.log(o.line)
  }
}

const wss = new WebSocketServer({ port: PORT, host: '0.0.0.0' })

wss.on('connection', (ws) => {
  let id: number | null = null
  let alive = true
  liveness.set(ws, () => {
    if (!alive) return false
    alive = false
    return true
  })
  ws.on('close', () => liveness.delete(ws))

  ws.on('message', (data) => {
    const msg = parseClientMsg(String(data))
    if (msg === null) return
    const now = Date.now()
    if (msg.t === 'join') {
      if (id !== null) return
      const res = room.join(msg.name, msg.token, msg.colour, msg.vehicle, now)
      if (res.ok) {
        id = res.id
        sockets.set(id, ws)
      }
      deliver(res.out)
      if (!res.ok) ws.close(CLOSE_ROOM_FULL, res.reason)
      return
    }
    if (id === null) return
    switch (msg.t) {
      case 'input':
        room.input(id, msg)
        break
      case 'vehicle':
        deliver(room.vehicle(id, msg.kind, now))
        break
      case 'ready':
        deliver(room.ready(id, msg.choice, now))
        break
      case 'tune':
        deliver(room.tune(msg.path, msg.value))
        break
      case 'restart':
        deliver(room.restart())
        break
    }
  })

  ws.on('pong', () => {
    alive = true
  })
  ws.on('close', () => {
    if (id === null) return
    // A Seat taken over by a rejoin was already closed and forgotten; its late close changes nothing.
    if (sockets.get(id) === ws) sockets.delete(id)
    deliver(room.leave(id, Date.now()))
  })

  ws.on('error', () => ws.close())
})

setInterval(() => deliver(room.tick(Date.now())), LOOP_MS)

console.log(`[server] listening on ws://0.0.0.0:${PORT}`)
