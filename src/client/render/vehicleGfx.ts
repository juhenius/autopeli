/**
 * VehicleGfx: the drawing of a Vehicle — rounded-rect Chassis, two Wheels
 * with the spoke line, and the slip-keyed dirt spray — with no Matter
 * bodies, posed from the streamed state each frame.
 */
import Phaser from 'phaser'
import { hexToNum } from '../../shared/colours'
import type { Config } from '../../shared/config'
import type { VehicleSpec } from '../../shared/sim/vehicles/spec'

type Palette = Config['PALETTE']


export class VehicleGfx {
  private readonly chassisGfx: Phaser.GameObjects.Graphics
  private readonly wheelGfx: [Phaser.GameObjects.Graphics, Phaser.GameObjects.Graphics]
  private readonly dirt: Phaser.GameObjects.Particles.ParticleEmitter
  private readonly spec: VehicleSpec
  /** Which spec wheel is drawn on the left: 0 when facing right. Follows setFacing's sign. */
  private leftWheel: 0 | 1 = 0
  private colour = ''

  /** The Driver's name above the Chassis (world space, never rotated). */
  private readonly label: Phaser.GameObjects.Text

  constructor(scene: Phaser.Scene, spec: VehicleSpec, palette: Palette) {
    this.label = scene.add
      .text(0, 0, '', { fontFamily: 'system-ui, sans-serif', fontSize: '15px', color: '#ffffff', stroke: '#1d2b3a', strokeThickness: 3 })
      .setOrigin(0.5, 1)
      .setDepth(3.5)
    this.spec = spec
    this.chassisGfx = scene.add.graphics().setDepth(3)
    this.setColour(palette.chassis)
    const makeWheelGfx = (radius: number): Phaser.GameObjects.Graphics => {
      const g = scene.add.graphics().setDepth(3.2) // above the Chassis: the wheels read in front of the body
      g.fillStyle(hexToNum(palette.wheel), 1)
      g.fillCircle(0, 0, radius)
      g.lineStyle(3, hexToNum(palette.wheelSpoke), 1)
      g.lineBetween(0, 0, radius - 2, 0) // the spoke, so rotation reads
      g.strokePath()
      return g
    }
    this.wheelGfx = [makeWheelGfx(spec.wheels[0].radius), makeWheelGfx(spec.wheels[1].radius)]

    // Dirt spray keyed to slip; tiny texture made once per game.
    if (!scene.textures.exists('dirt')) {
      const dg = scene.make.graphics({}, false)
      dg.fillStyle(0x6b543d, 1)
      dg.fillRect(0, 0, 4, 4)
      dg.generateTexture('dirt', 4, 4)
      dg.destroy()
    }
    this.dirt = scene.add.particles(0, 0, 'dirt', {
      speed: { min: 40, max: 140 },
      angle: { min: 200, max: 340 },
      lifespan: 350,
      gravityY: 500,
      scale: { start: 1, end: 0 },
      emitting: false,
    }).setDepth(4)
  }

  setChassisPose(x: number, y: number, rotation: number): void {
    this.chassisGfx.setPosition(x, y).setRotation(rotation)
    this.label.setPosition(x, y - 44)
  }

  /** Wheel by side (0 left, 1 right): the spec wheel drawn there follows the facing. */
  setWheelPose(side: 0 | 1, x: number, y: number, rotation: number): void {
    const i = side === 0 ? this.leftWheel : ((1 - this.leftWheel) as 0 | 1)
    this.wheelGfx[i].setPosition(x, y).setRotation(rotation)
  }

  /** Dirt spray at slipping Wheels; slips are 0 when not touching. */
  spray(
    wheelsAt: [{ x: number; y: number }, { x: number; y: number }],
    slips: [number, number],
    minSlip: number,
  ): void {
    if (minSlip <= 0) return
    for (const i of [0, 1] as const) {
      const s = Math.abs(slips[i])
      if (s < minSlip) continue
      const count = Math.min(4, Math.ceil(s / minSlip))
      const wheel = i === 0 ? this.leftWheel : ((1 - this.leftWheel) as 0 | 1)
      this.dirt.emitParticleAt(wheelsAt[i].x, wheelsAt[i].y + this.spec.wheels[wheel].radius * 0.8, count)
    }
  }

  /** Drawn facing, ±1, through 0 during the Turn. */
  setFacing(scaleX: number): void {
    this.chassisGfx.scaleX = scaleX
    if (scaleX !== 0) this.leftWheel = scaleX > 0 ? 0 : 1
  }

  /** The Chassis in the Driver's colour (redrawn only on change). */
  setColour(hex: string): void {
    if (hex === this.colour) return
    this.colour = hex
    const { body, look } = this.spec
    const g = this.chassisGfx
    g.clear()
    g.fillStyle(hexToNum(hex), 1)
    g.fillRoundedRect(-body.w / 2, -body.h / 2, body.w, body.h, 8)
    if (look.cab !== null) {
      g.fillRoundedRect(look.cab.x - look.cab.w / 2, look.cab.y - look.cab.h / 2, look.cab.w, look.cab.h, 6)
      g.fillStyle(0xffffff, 0.55)
      g.fillRoundedRect(look.cab.x - look.cab.w / 2 + 6, look.cab.y - look.cab.h / 2 + 5, look.cab.w - 12, look.cab.h * 0.5, 3)
    }
    if (look.windscreen) {
      // A windscreen near the front so the facing reads.
      g.fillStyle(0xffffff, 0.55)
      g.fillRoundedRect(body.w / 2 - 30, -body.h / 2 + 4, 20, body.h - 8, 3)
    }
    this.label.setColor(hex)
  }

  /** The name drawn above the car ('' hides it). */
  setName(name: string): void {
    if (this.label.text !== name) this.label.setText(name)
  }

  setAlpha(alpha: number): void {
    this.chassisGfx.setAlpha(alpha)
    this.label.setAlpha(alpha)
    for (const g of this.wheelGfx) g.setAlpha(alpha)
  }

  setVisible(visible: boolean): void {
    this.chassisGfx.setVisible(visible)
    this.label.setVisible(visible)
    for (const g of this.wheelGfx) g.setVisible(visible)
  }

  destroy(): void {
    this.chassisGfx.destroy()
    this.label.destroy()
    for (const g of this.wheelGfx) g.destroy()
    this.dirt.destroy()
  }
}
