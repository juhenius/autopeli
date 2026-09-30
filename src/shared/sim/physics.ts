/**
 * The Physics seam: the slice of Matter the sim uses, over plain matter-js
 * so the same code runs in Node (the server, vitest) and in the browser.
 * One instance is one world. No Phaser anywhere in `src/sim/`.
 */
import Matter from 'matter-js'

export type Body = Matter.Body
export type Constraint = Matter.Constraint
export type BodyOptions = Matter.IChamferableBodyDefinition
export type ConstraintOptions = Omit<Matter.IConstraintDefinition, 'bodyA' | 'bodyB' | 'length' | 'stiffness'>

/** The slice of Matter's Body module callers mutate bodies with (Handling, clamps, Tools). Declared here
 * because @types/matter-js lags 0.20: setPosition / setAngle take the updateVelocity flag. */
export interface BodyModule {
  setVelocity(body: Body, velocity: { x: number; y: number }): void
  setAngularVelocity(body: Body, velocity: number): void
  setPosition(body: Body, position: { x: number; y: number }, updateVelocity?: boolean): void
  setAngle(body: Body, angle: number, updateVelocity?: boolean): void
  applyForce(body: Body, position: { x: number; y: number }, force: { x: number; y: number }): void
  setInertia(body: Body, inertia: number): void
  setMass(body: Body, mass: number): void
}

export interface PairLike {
  isActive: boolean
  bodyA: Body
  bodyB: Body
  collision: { supports: { x: number; y: number }[]; supportCount?: number }
}

export class Physics {
  readonly engine: Matter.Engine
  /** Matter's Body module. */
  readonly Body: BodyModule = Matter.Body as unknown as BodyModule

  constructor(gravityY: number) {
    // Matter's default 2 constraint iterations let the suspension stretch badly
    // under hard landings (wheel-through-body escapes); 4 stiffens spring + arm.
    this.engine = Matter.Engine.create({ constraintIterations: 4 })
    this.engine.gravity.y = gravityY
  }

  setGravity(y: number): void {
    this.engine.gravity.y = y
  }

  /** A fresh negative collision group: bodies sharing it never collide with each other. */
  nextGroup(): number {
    return Matter.Body.nextGroup(true)
  }

  rectangle(x: number, y: number, w: number, h: number, options?: BodyOptions): Body {
    const b = Matter.Bodies.rectangle(x, y, w, h, options)
    Matter.Composite.add(this.engine.world, b)
    return b
  }

  circle(x: number, y: number, r: number, options?: BodyOptions): Body {
    const b = Matter.Bodies.circle(x, y, r, options)
    Matter.Composite.add(this.engine.world, b)
    return b
  }

  fromVertices(x: number, y: number, verts: { x: number; y: number }[], options?: BodyOptions): Body {
    const b = Matter.Bodies.fromVertices(x, y, [verts], options)
    Matter.Composite.add(this.engine.world, b)
    return b
  }

  /** `length` undefined = the current distance between the points (a rod at rest). */
  constraint(bodyA: Body, bodyB: Body, length: number | undefined, stiffness: number, options: ConstraintOptions = {}): Constraint {
    const c = Matter.Constraint.create({ bodyA, bodyB, stiffness, ...options, ...(length === undefined ? {} : { length }) })
    Matter.Composite.add(this.engine.world, c)
    return c
  }

  remove(body: Body | Body[]): void {
    Matter.Composite.remove(this.engine.world, body)
  }

  removeConstraint(c: Constraint): void {
    Matter.Composite.remove(this.engine.world, c)
  }

  /** The engine's active collision pairs from the last step. */
  get pairs(): PairLike[] {
    return (this.engine.pairs as unknown as { list: PairLike[] }).list
  }

  allBodies(): Body[] {
    return Matter.Composite.allBodies(this.engine.world)
  }

  /** One fixed step of `ms` (Matter warns above 16.667). */
  step(ms: number): void {
    Matter.Engine.update(this.engine, ms)
  }

  dispose(): void {
    Matter.Composite.clear(this.engine.world, false)
    Matter.Engine.clear(this.engine)
  }
}
