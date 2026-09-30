/**
 * Turn: a button turns one Driver's Vehicle around — the drawing squashes
 * through zero and comes back facing the other way over a quarter second
 * while the bodies keep their momentum. The controls stay absolute (the right pad
 * always drives right); facing only decides the drawing and which way the
 * Rockets push, and at mid-Turn the end Slots swap (Slots.flip). The
 * animation runs here so every client draws the same squash.
 */

const FLIP_STEPS = 15

export class Turn {
  facing: 1 | -1 = 1
  /** Drawn horizontal scale of the Chassis: ±1 at rest, through 0 mid-Turn. */
  scale = 1
  private flipping = false
  private swapped = false
  private from = 0
  private wasDown = false

  /** Feed the held boolean once per step; returns 'mid' on the one step the drawing passes through zero. */
  step(down: boolean, step: number): 'mid' | null {
    if (down && !this.wasDown && !this.flipping) {
      this.facing = this.facing === 1 ? -1 : 1
      this.flipping = true
      this.swapped = false
      this.from = step
    }
    this.wasDown = down
    if (!this.flipping) return null
    const t = Math.min(1, (step - this.from) / FLIP_STEPS)
    // From −facing to +facing through 0: cos(π·t) runs 1 → −1.
    this.scale = -this.facing * Math.cos(Math.PI * t)
    let out: 'mid' | null = null
    if (t >= 0.5 && !this.swapped) {
      this.swapped = true
      out = 'mid'
    }
    if (t >= 1) {
      this.flipping = false
      this.scale = this.facing
    }
    return out
  }

  /** Which way the Wheels currently sit: the facing changes at the press, the Wheels swap at mid-Turn. */
  get wheelFacing(): 1 | -1 {
    return this.flipping && !this.swapped ? ((-this.facing) as 1 | -1) : this.facing
  }

  /** As numbers for the state message (client-side prediction): the animation's elapsed steps, not its start, since the two clocks differ. */
  snapshot(step: number): number[] {
    return [this.facing, this.flipping ? 1 : 0, this.swapped ? 1 : 0, this.flipping ? step - this.from : 0, this.wasDown ? 1 : 0, this.scale]
  }

  restore(v: number[], step: number): void {
    if (v.length < 6) return
    this.facing = v[0]! < 0 ? -1 : 1
    this.flipping = v[1] === 1
    this.swapped = v[2] === 1
    this.from = step - v[3]!
    this.wasDown = v[4] === 1
    this.scale = v[5]!
  }
}
