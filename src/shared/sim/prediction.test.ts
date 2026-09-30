import { describe, expect, it } from 'vitest'
import { createConfig } from '../config/index.ts'
import { NO_INPUT, World, type HeldInput } from './world.ts'

/** Two Worlds on the same seed with no Tools: what the server and a predicting client each run. */
function pair() {
  const mk = (): World => {
    const config = createConfig()
    config.TRACK.thetaDeg = 20
    return new World(config, 11, { tools: false })
  }
  const server = mk()
  const client = mk()
  server.addDriver(1, 0)
  client.addDriver(1, 0)
  return { server, client }
}

const inputAt = (i: number): HeldInput => ({ ...NO_INPUT, gas: i >= 30, jump: i === 90 || i === 91 })

const pos = (w: World) => {
  const s = w.vehicleStates()[0]!
  return [s.cx, s.cy, s.ca, s.w[0][0], s.w[1][1]]
}

describe('prediction', () => {
  it('two Worlds fed the same inputs stay identical', () => {
    const { server, client } = pair()
    for (let i = 0; i < 240; i++) {
      server.pushInput(1, i + 1, inputAt(i))
      client.pushInput(1, i + 1, inputAt(i))
      server.step()
      client.step()
    }
    expect(pos(client)).toEqual(pos(server))
    expect(server.vehicleStates()[0]!.ack).toBe(240)
  })

  it('a diverged client snaps to the server state and replays the unacknowledged inputs back to it', () => {
    const { server, client } = pair()
    // Both run 100 steps in step; then the client sees 10 more inputs the server has not yet applied,
    // while it was wrongly braking for the last 5 of the shared ones (a stale prediction).
    for (let i = 0; i < 100; i++) {
      const held = inputAt(i)
      server.pushInput(1, i + 1, held)
      server.step()
      client.pushInput(1, i + 1, i >= 95 ? { ...held, gas: false, brake: true } : held)
      client.step()
    }
    const pending: { seq: number; held: HeldInput }[] = []
    for (let i = 100; i < 110; i++) {
      pending.push({ seq: i + 1, held: inputAt(i) })
      client.pushInput(1, i + 1, inputAt(i))
      client.step()
    }
    expect(pos(client)).not.toEqual(pos(server))
    // Reconcile: the server's state after seq 100, then replay 101…110 locally.
    const s = server.vehicleStates()[0]!
    client.restoreSim(1, s.sim, s.flipped)
    for (const p of pending) {
      client.pushInput(1, p.seq, p.held)
      client.step()
    }
    // The server catches up on the same inputs: identical.
    for (const p of pending) {
      server.pushInput(1, p.seq, p.held)
      server.step()
    }
    const a = pos(client)
    const b = pos(server)
    // Restoring bodies through Matter's setters leaves sub-pixel residue (positionPrev, contact impulses): fine, the next state corrects it.
    for (let k = 0; k < a.length; k++) expect(a[k]).toBeCloseTo(b[k]!, 1)
  })
})

describe('prediction across a Turn', () => {
  it('a reconcile from a server state taken before the swap, replayed past it, lands on the server’s result', async () => {
    const { World, NO_INPUT } = await import('./world.ts')
    const { createConfig } = await import('../config/index.ts')
    const config = createConfig()
    config.TRACK.thetaDeg = 0
    config.TRACK.crestH = 0
    for (const kind of ['car', 'tractor'] as const) {
      const server = new World(config, 5, { tools: false })
      const client = new World(config, 5, { tools: false })
      server.addDriver(1, 300, server.specFor(kind))
      client.addDriver(1, 300, client.specFor(kind))
      for (let i = 0; i < 90; i++) {
        server.step()
        client.step()
      }
      // The server's snapshot two steps after the Turn press: mid-animation, before the swap.
      const turn = { ...NO_INPUT, turn: true }
      server.pushInput(1, 1, turn)
      server.step()
      server.pushInput(1, 2, turn)
      server.step()
      const snap = server.simOf(1)
      // The client already ran the whole Turn (20 steps) and is past the swap.
      client.pushInput(1, 1, turn)
      client.step()
      for (let s = 2; s <= 20; s++) {
        client.pushInput(1, s, turn)
        client.step()
      }
      // Reconcile: restore the server's state, replay inputs 3..20; the server runs the same inputs. (Sub-pixel replay
      // residue is normal — before the Turn was synced this was 67 px on the Tractor.)
      client.restoreSim(1, snap, false)
      for (let s = 3; s <= 20; s++) {
        client.pushInput(1, s, turn)
        client.step()
        server.pushInput(1, s, turn)
        server.step()
      }
      const a = server.vehicleStates()[0]!
      const b = client.vehicleStates()[0]!
      expect(Math.abs(a.cx - b.cx), `${kind} cx`).toBeLessThan(2)
      expect(Math.abs(a.cy - b.cy), `${kind} cy`).toBeLessThan(2)
      for (const i of [0, 1] as const) {
        expect(Math.abs(a.w[i][0] - b.w[i][0]), `${kind} wheel ${i} x`).toBeLessThan(2)
        expect(Math.abs(a.w[i][1] - b.w[i][1]), `${kind} wheel ${i} y`).toBeLessThan(2)
      }
      expect(a.f).toBe(b.f)
    }
  })
})
