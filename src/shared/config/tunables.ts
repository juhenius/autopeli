/**
 * One row per tunable. This table drives the ?debug tuning panel and is the
 * units/range documentation for Config (PALETTE is deliberately absent).
 *
 * group 'live': applies next step.
 * group 'rebuild': bodies/Track are recreated; changing one rebuilds the World
 * on the current seed.
 */
export interface Tunable {
  /** Dotted path into Config, e.g. 'HANDLING.omegaMax'. */
  path: string
  min: number
  max: number
  step: number
  group: 'live' | 'rebuild'
}

export const TUNABLES: Tunable[] = [
  // HANDLING — live
  { path: 'HANDLING.gravityY', min: 0, max: 2, step: 0.05, group: 'live' }, // Matter world gravity y
  { path: 'HANDLING.omegaMax', min: 0, max: 2, step: 0.01, group: 'live' }, // motor top spin, rad/step
  { path: 'HANDLING.driveAccel', min: 0, max: 0.1, step: 0.001, group: 'live' }, // motor impulse at ω 0, rad/step²
  { path: 'HANDLING.brakeAccel', min: 0, max: 0.15, step: 0.001, group: 'live' }, // brake/reverse impulse, rad/step²
  { path: 'HANDLING.reverseRatio', min: 0, max: 1, step: 0.05, group: 'live' }, // reverse top = omegaMax × this
  { path: 'HANDLING.reactionScale', min: 0, max: 3, step: 0.05, group: 'live' }, // Chassis reaction torque, × physical
  { path: 'HANDLING.slipStiff', min: 0, max: 1, step: 0.01, group: 'live' }, // slip → traction impulse fraction
  { path: 'HANDLING.gripBase', min: 0, max: 1, step: 0.01, group: 'live' }, // grip floor while touching, px/step
  { path: 'HANDLING.gripPerLoad', min: 0, max: 0.5, step: 0.005, group: 'live' }, // grip per px compression, px/step
  { path: 'HANDLING.airTorque', min: 0, max: 0.02, step: 0.0005, group: 'live' }, // Air Control assist, rad/step²
  { path: 'HANDLING.apexLift', min: 0, max: 1, step: 0.05, group: 'live' }, // gravity cancelled near apex, 0 = off
  { path: 'HANDLING.apexBand', min: 0, max: 8, step: 0.5, group: 'live' }, // |vy| apex window, px/step
  { path: 'HANDLING.chassisAirDrag', min: 0, max: 0.05, step: 0.001, group: 'live' }, // Matter frictionAir on Chassis
  { path: 'HANDLING.slipFxMin', min: 0, max: 10, step: 0.5, group: 'live' }, // dirt-spray slip threshold, px/step
  { path: 'HANDLING.jumpImpulse', min: 0, max: 15, step: 0.5, group: 'live' }, // Jump Δv, world-up, px/step
  { path: 'HANDLING.jumpReachPx', min: 0, max: 150, step: 2, group: 'live' }, // Wheel gap a press still jumps from, and the drawn kick's extension, px
  { path: 'HANDLING.jumpPitchTorque', min: 0, max: 1.5, step: 0.05, group: 'live' }, // pitch from an uneven launch, × physical
  { path: 'HANDLING.kickExtend', min: 1, max: 20, step: 1, group: 'live' }, // visible extension speed after a launch, px/step
  { path: 'HANDLING.kickHold', min: 0, max: 60, step: 1, group: 'live' }, // steps the kick is held after the launch
  { path: 'HANDLING.kickRetract', min: 0.5, max: 20, step: 0.5, group: 'live' }, // return to rest, px/step
  { path: 'HANDLING.jumpCooldown', min: 0, max: 120, step: 1, group: 'live' }, // steps between Jumps
  { path: 'HANDLING.landingPitch', min: 0, max: 0.005, step: 0.0001, group: 'live' }, // Chassis Δω per px compression on one-Wheel landings
  { path: 'HANDLING.landingWindow', min: 0, max: 60, step: 1, group: 'live' }, // steps after touchdown Landing Pitch acts
  { path: 'HANDLING.chassisInertiaScale', min: 1, max: 6, step: 0.25, group: 'live' }, // Chassis spin-weight; 1 physical, 4 Matter default
  { path: 'HANDLING.contactGrace', min: 0, max: 30, step: 1, group: 'live' }, // steps a Wheel still counts as touching
  { path: 'HANDLING.maxSpin', min: 0, max: 0.3, step: 0.005, group: 'live' }, // clamp on Handling's Chassis ω, rad/step
  { path: 'HANDLING.maxSpeed', min: 5, max: 60, step: 1, group: 'live' }, // safety cap on |velocity|, px/step
  { path: 'HANDLING.terrainFriction', min: 0, max: 2, step: 0.05, group: 'live' }, // pair friction is min(a, b); Chassis is 0.3
  // HANDLING — rebuild
  { path: 'HANDLING.springStiffness', min: 0.01, max: 1, step: 0.005, group: 'rebuild' }, // suspension spring stiffness
  { path: 'HANDLING.springDamping', min: 0, max: 1, step: 0.01, group: 'rebuild' }, // suspension spring damping
  { path: 'HANDLING.minTravel', min: 0, max: 60, step: 1, group: 'rebuild' }, // wheel-box floor (0 disables), px
  { path: 'HANDLING.maxTravel', min: 40, max: 120, step: 1, group: 'rebuild' }, // wheel-box extension cap, px
  { path: 'HANDLING.wheelBoxX', min: 0, max: 30, step: 1, group: 'rebuild' }, // wheel-box lateral half-width, px
  { path: 'HANDLING.anchorY', min: -80, max: 0, step: 1, group: 'rebuild' }, // spring anchor y, chassis-local px
  { path: 'HANDLING.armX', min: 0, max: 80, step: 1, group: 'rebuild' }, // trailing-arm anchor inset, px
  { path: 'HANDLING.armY', min: 0, max: 80, step: 1, group: 'rebuild' }, // trailing-arm anchor y, chassis-local px
  { path: 'HANDLING.chassisWidth', min: 40, max: 240, step: 2, group: 'rebuild' }, // px
  { path: 'HANDLING.chassisHeight', min: 10, max: 80, step: 2, group: 'rebuild' }, // px (chamfer stays 8)
  { path: 'HANDLING.chassisDensity', min: 0.0005, max: 0.01, step: 0.0005, group: 'rebuild' }, // Matter density
  { path: 'HANDLING.wheelRadius', min: 6, max: 48, step: 1, group: 'rebuild' }, // px
  { path: 'HANDLING.wheelSpacing', min: 10, max: 100, step: 1, group: 'rebuild' }, // ± from chassis centre, px
  { path: 'HANDLING.wheelDrop', min: 0, max: 80, step: 1, group: 'rebuild' }, // wheel rest y below chassis centre, px
  { path: 'HANDLING.wheelDensity', min: 0.0005, max: 0.01, step: 0.0005, group: 'rebuild' }, // Matter density
  { path: 'HANDLING.wheelRestitution', min: 0, max: 1, step: 0.01, group: 'rebuild' }, // Matter restitution
  // TRACK — all rebuild
  { path: 'TRACK.wavelength', min: 200, max: 3000, step: 50, group: 'rebuild' }, // value-noise base period W, px
  { path: 'TRACK.thetaDeg', min: 0, max: 60, step: 1, group: 'rebuild' }, // target max slope, deg
  { path: 'TRACK.crestH', min: 0, max: 300, step: 10, group: 'rebuild' }, // Crest height, px
  { path: 'TRACK.crestL', min: 50, max: 600, step: 10, group: 'rebuild' }, // Crest rise length, px
  { path: 'TRACK.crestCell', min: 256, max: 4096, step: 128, group: 'rebuild' }, // one Crest at most per cell, px
  { path: 'TRACK.crestP', min: 0, max: 1, step: 0.05, group: 'rebuild' }, // Crest probability per cell
  { path: 'TRACK.segLen', min: 8, max: 64, step: 4, group: 'rebuild' }, // segment length, px (16 per Chunk)
  { path: 'TRACK.slab', min: 10, max: 100, step: 2, group: 'rebuild' }, // slab thickness, px
  { path: 'TRACK.overlap', min: 0, max: 16, step: 1, group: 'rebuild' }, // extra slab length at joints, px
  { path: 'TRACK.chamfer', min: 0, max: 12, step: 1, group: 'rebuild' }, // slab corner radius, px
  { path: 'TRACK.placeFlatPx', min: 200, max: 3000, step: 50, group: 'rebuild' }, // levelled radius around a Place, px
  // TOOL — the plough box and the rockets on a rope
  { path: 'TOOL.size', min: 10, max: 120, step: 2, group: 'rebuild' }, // plough box side / circle diameter, px
  { path: 'TOOL.circle', min: 0, max: 1, step: 1, group: 'rebuild' }, // 1 = circle, 0 = box
  { path: 'TOOL.density', min: 0.0002, max: 0.02, step: 0.0001, group: 'rebuild' }, // Matter density
  { path: 'TOOL.friction', min: 0, max: 2, step: 0.05, group: 'rebuild' }, // Matter friction
  { path: 'TOOL.hitchReach', min: 4, max: 120, step: 1, group: 'live' }, // hitch capture distance, px
  { path: 'TOOL.rodLength', min: 0, max: 300, step: 5, group: 'live' }, // rope rest length when lowered, px
  { path: 'TOOL.rodStiffness', min: 0.005, max: 1, step: 0.005, group: 'live' }, // rope stiffness
  { path: 'TOOL.rodDamping', min: 0, max: 0.5, step: 0.01, group: 'live' }, // rope damping
  { path: 'TOOL.raisedStiffness', min: 0.05, max: 1, step: 0.05, group: 'live' }, // hold at the hitch point when raised
  { path: 'TOOL.hoistPxPerStep', min: 0.5, max: 20, step: 0.5, group: 'live' }, // reel-in speed when raising
  { path: 'TOOL.rope', min: 0, max: 1, step: 1, group: 'live' }, // 1 = rope (pull only), 0 = rod
  { path: 'TOOL.rocketAtHitch', min: 0, max: 1, step: 1, group: 'live' }, // thrust at the hitch point (1) or the Chassis centre (0)
  { path: 'TOOL.rocketThrust', min: 0, max: 1.5, step: 0.05, group: 'live' }, // rocket Δv per step, px/step²
  { path: 'TOOL.rocketBurstS', min: 0.2, max: 6, step: 0.1, group: 'live' }, // burst length, s
  { path: 'TOOL.rocketCooldownS', min: 0, max: 20, step: 0.5, group: 'live' }, // cooldown after a burst, s
  { path: 'TOOL.digAccel', min: 0, max: 0.6, step: 0.01, group: 'live' }, // soil resistance, Vehicle deceleration px/step²
  { path: 'TOOL.digSuction', min: 0, max: 4, step: 0.1, group: 'live' }, // downward share of the soil force
  { path: 'TOOL.digReach', min: 0, max: 30, step: 1, group: 'live' }, // lowest point within this above the surface counts as digging, px
  { path: 'TOOL.seedDrag', min: 0, max: 1, step: 0.05, group: 'live' }, // seed bag resistance × digAccel
  { path: 'TOOL.harvestDrag', min: 0, max: 1, step: 0.05, group: 'live' }, // harvester resistance × digAccel
  { path: 'TOOL.perProduceCells', min: 1, max: 20, step: 1, group: 'live' }, // harvested cells per Produce
  { path: 'TOOL.produceRadius', min: 6, max: 40, step: 1, group: 'rebuild' }, // Produce radius, px
  { path: 'TOOL.produceDensity', min: 0.0002, max: 0.02, step: 0.0002, group: 'live' }, // Produce density
  { path: 'TOOL.boxCap', min: 1, max: 30, step: 1, group: 'live' }, // Produce a Box holds
  { path: 'TOOL.seedCap', min: 5, max: 400, step: 5, group: 'live' }, // cells per seed bag fill
  { path: 'TOOL.tankCap', min: 5, max: 400, step: 5, group: 'live' }, // cells per tank fill
  { path: 'TOOL.seedStock0', min: 0, max: 500, step: 10, group: 'live' }, // Barn seed stock at Run start
  { path: 'TOOL.waterStock0', min: 0, max: 500, step: 10, group: 'live' }, // Well water stock at Run start
  { path: 'TOOL.pickupNearPx', min: 50, max: 2000, step: 10, group: 'live' }, // cluster spacing at home, px
  { path: 'TOOL.pickupFarPx', min: 30, max: 1000, step: 10, group: 'live' }, // cluster spacing far out, px
  { path: 'TOOL.pickupFarDistPx', min: 500, max: 12000, step: 100, group: 'live' }, // where it is densest, px
  { path: 'TOOL.pickupCluster', min: 1, max: 20, step: 1, group: 'live' }, // pickups per cluster
  { path: 'TOOL.pickupRadiusPx', min: 10, max: 120, step: 2, group: 'live' }, // take radius, px
  { path: 'TOOL.upgradeEveryPx', min: 5000, max: 100000, step: 1000, group: 'live' }, // a rockets or ramp Tool on the hills about this often, px
  { path: 'TRACTOR.motorScale', min: 0.5, max: 6, step: 0.1, group: 'live' }, // × motor impulse on the rear wheel
  { path: 'TRACTOR.spinScale', min: 0.1, max: 2, step: 0.02, group: 'live' }, // × omegaMax (top speed)
  { path: 'TRACTOR.reactionScale', min: 0, max: 2, step: 0.05, group: 'live' }, // × motor reaction torque on the chassis
  { path: 'TRACTOR.gripScale', min: 0.5, max: 4, step: 0.1, group: 'live' }, // × grip budget (traction)
  { path: 'TRACTOR.densityScale', min: 0.5, max: 4, step: 0.1, group: 'rebuild' }, // × chassis density
  { path: 'TRACTOR.rearRadius', min: 10, max: 48, step: 1, group: 'rebuild' }, // px
  { path: 'TRACTOR.frontRadius', min: 6, max: 30, step: 1, group: 'rebuild' }, // px
  { path: 'TRACTOR.chassisWidth', min: 60, max: 200, step: 2, group: 'rebuild' }, // px
  { path: 'TRACTOR.chassisHeight', min: 16, max: 60, step: 2, group: 'rebuild' }, // px
  { path: 'TOOL.waterMass', min: 0, max: 1, step: 0.01, group: 'live' }, // tank mass per dose
  { path: 'TOOL.rampLength', min: 100, max: 500, step: 10, group: 'live' }, // ramp slope length, px
  { path: 'TOOL.rampAngleDeg', min: 5, max: 45, step: 1, group: 'live' }, // ramp rise angle, deg
  { path: 'TOOL.rampAheadPx', min: 50, max: 400, step: 10, group: 'live' }, // ramp placement ahead, px
  // NET — live: how the server's state is drawn
  { path: 'NET.interpDelayMs', min: 0, max: 500, step: 10, group: 'live' }, // render delay behind the newest state, ms
  { path: 'NET.predict', min: 0, max: 1, step: 1, group: 'live' }, // own Vehicle predicted (1) or interpolated (0)
  { path: 'NET.smoothing', min: 0, max: 0.98, step: 0.01, group: 'live' }, // correction glide per frame
  { path: 'NET.snapPx', min: 20, max: 1000, step: 10, group: 'live' }, // corrections beyond this snap
  { path: 'NET.fadeAfterMs', min: 500, max: 10000, step: 100, group: 'live' }, // silence before a Vehicle fades, ms
  { path: 'NET.dropAfterMs', min: 1000, max: 60000, step: 500, group: 'live' }, // silence before a Driver drops, ms
  // CAMERA — live
  { path: 'CAMERA.cameraAnchorX', min: 0, max: 1, step: 0.05, group: 'live' }, // Chassis x as fraction of view width
  { path: 'CAMERA.cameraAnchorY', min: 0, max: 1, step: 0.05, group: 'live' }, // Chassis y as fraction of view height
  { path: 'CAMERA.cameraLerpY', min: 0.01, max: 1, step: 0.01, group: 'live' }, // vertical lerp per step
  { path: 'CAMERA.lookAheadMinDx', min: 0, max: 5, step: 0.1, group: 'live' }, // px/frame before the look-ahead pans
  { path: 'CAMERA.anchorLerpX', min: 0.005, max: 0.5, step: 0.005, group: 'live' }, // anchor glide per frame
  { path: 'FLIP.flipGrace', min: 1, max: 120, step: 1, group: 'live' }, // consecutive roof-contact steps → flipped
  { path: 'FLIP.flipRespawnS', min: 1, max: 60, step: 1, group: 'live' }, // seconds flipped before the in-place respawn
  { path: 'FLIP.rescueRangePx', min: 0, max: 600, step: 10, group: 'live' }, // Rescue range, px
]
