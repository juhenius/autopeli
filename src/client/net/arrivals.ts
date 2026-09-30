/**
 * ArrivalBuffer: samples of one thing as they arrive from the server, drawn
 * `delayMs` behind the newest arrival by blending the two arrivals that
 * bracket that moment. Works purely from arrival order and the render
 * clock. No extrapolation: past the newest arrival the thing holds still.
 * After `fadeAfterMs` of silence it fades out. The blend is data: Vehicles
 * blend a whole pose, Tools and Produce a position and an angle. No Phaser.
 */

export const wrapAngle = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a))
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t
/** Shortest-arc angle lerp. At high wheel spin the arc between two arrivals
 * can alias (Δ > π reads backwards) — accepted; the spoke still reads spin. */
export const lerpAngle = (a: number, b: number, t: number): number => a + wrapAngle(b - a) * t

/** A position-and-angle blend; every other field takes the newer sample. */
export const blendPlaced = <T extends { x: number; y: number; a: number }>(a: T, b: T, t: number): T => ({
  ...b,
  x: lerp(a.x, b.x, t),
  y: lerp(a.y, b.y, t),
  a: lerpAngle(a.a, b.a, t),
})

export interface Arrival<T> {
  sample: T
  /** 1 while fresh; fades to 0 after `fadeAfterMs` of silence. */
  opacity: number
}

/** A faded thing takes this long to vanish, ms. */
const FADE_OUT_MS = 500
/** Arrivals kept; ~2 s at 30 Hz, plenty beyond any sane delayMs. */
const MAX_BUFFER = 64

export class ArrivalBuffer<T> {
  private readonly buffer: { at: number; sample: T }[] = []
  private readonly createdMs: number

  constructor(
    private readonly blend: (a: T, b: T, t: number) => T,
    nowMs: number,
  ) {
    this.createdMs = nowMs
  }

  push(sample: T, nowMs: number): void {
    this.buffer.push({ at: nowMs, sample })
    if (this.buffer.length > MAX_BUFFER) this.buffer.shift()
  }

  /** The newest arrival, for anything that needs the latest truth rather than the drawn one. */
  get latest(): T | null {
    return this.buffer[this.buffer.length - 1]?.sample ?? null
  }

  /** ms since the newest arrival, or since creation before any. */
  silenceMs(nowMs: number): number {
    const newest = this.buffer[this.buffer.length - 1]
    return nowMs - (newest ? newest.at : this.createdMs)
  }

  /** The sample `delayMs` ago, or null before any arrival / when fully faded. */
  sample(nowMs: number, delayMs: number, fadeAfterMs = Number.POSITIVE_INFINITY): Arrival<T> | null {
    if (this.buffer.length === 0) return null
    const silence = this.silenceMs(nowMs)
    const opacity = silence <= fadeAfterMs ? 1 : 1 - (silence - fadeAfterMs) / FADE_OUT_MS
    if (opacity <= 0) return null
    const target = nowMs - delayMs
    const first = this.buffer[0]!
    if (target <= first.at) return { sample: first.sample, opacity }
    for (let i = this.buffer.length - 1; i >= 0; i--) {
      const a = this.buffer[i]!
      if (a.at <= target) {
        const b = this.buffer[i + 1]
        if (!b) return { sample: a.sample, opacity } // past the newest: hold, never extrapolate
        const t = (target - a.at) / (b.at - a.at)
        return { sample: this.blend(a.sample, b.sample, t), opacity }
      }
    }
    return { sample: first.sample, opacity }
  }
}
