/**
 * The Config object: every tunable record at the spec's starting values.
 * Created by the composition root (GameScene) and passed down — never
 * imported deep inside modules. Units, ranges, and the live/rebuild split
 * are documented by the descriptor table in ./tunables.ts.
 */

/** Fixed physics step, ms. Every tunable is per-step at this rate. */
export const STEP_MS = 1000 / 60
/** World scale: pixels per metre. */
export const PX_PER_M = 30
/** World x where the Chassis spawns, px. */

export function createConfig() {
  return {
    HANDLING: {
      // live
      gravityY: 0.8,
      omegaMax: 0.9, // motor top spin, rad/step (top speed emerges: ~omegaMax × wheelRadius)
      driveAccel: 0.046, // motor spin impulse at ω 0, rad/step per step
      brakeAccel: 0.05, // brake/reverse motor impulse, rad/step per step
      reverseRatio: 0.6, // reverse gear: fraction of omegaMax (weaker than forward)
      reactionScale: 1, // motor reaction torque on the Chassis (the wheelie source), × physical
      slipStiff: 0.3, // fraction of slip converted to traction impulse per step
      gripBase: 0.2, // grip budget floor while touching, px/step
      gripPerLoad: 0.15, // grip budget per px of spring compression, px/step
      airTorque: 0.0015, // Air Control assist, Chassis Δω per step (gas = nose-up)
      apexLift: 0.55, // fraction of gravity cancelled near the jump apex (0 = off)
      apexBand: 3, // |vy| below this counts as apex, px/step
      chassisAirDrag: 0.003, // Matter frictionAir on the Chassis (Wheels carry 0); 0.01 bled ~28 %/s of airborne speed
      slipFxMin: 3, // |slip| threshold for dirt spray, px/step
      jumpImpulse: 7, // Jump launch Δv, world-up, px/step (~110 px apex at gravity 0.8), fired at the keypress
      jumpReachPx: 13, // a press still jumps with a Wheel up to this far above the ground, force fading with the gap (touching = full); also the drawn kick's full extension
      jumpPitchTorque: 0.3, // Chassis pitch from an uneven launch: the touching Wheels' impulse shares act at their lever arms, × physical
      kickExtend: 6, // px/step the drawn Wheels extend after a launch (every Jump shows the full kick)
      kickHold: 2, // steps the full extension is held before returning
      kickRetract: 5, // px/step the drawn Wheels return to rest afterwards
      jumpCooldown: 20, // steps between Jumps
      landingPitch: 0, // Landing Pitch garnish, Chassis Δω per px compression — 0: the Wheel Box transfers impulses physically now
      landingWindow: 20, // steps after touchdown that Landing Pitch acts
      chassisInertiaScale: 2, // Chassis spin-weight: 1 = physical, 4 = Matter's hidden default (×4 inertia)
      contactGrace: 3,
      maxSpin: 0.09,
      maxSpeed: 25,
      terrainFriction: 0.9, // Matter pair friction is min(a, b); Chassis is 0.3, so only values ≤ 0.3 change scrapes
      // rebuild — changing one recreates the World on the same seed
      springStiffness: 0.05,
      springDamping: 0.15,
      minTravel: 30, // box floor: wheel bottoms out tucked 10 px behind the body, contact patch still 8 px below it (v1's 12 was inside the body)
      maxTravel: 68, // box extension cap (rest travel is 55; ~13 px of droop)
      wheelBoxX: 10, // box lateral half-width around the hub — kills the trailing-arm mirror flip
      anchorY: -25,
      armX: 30,
      armY: 30,
      chassisWidth: 120,
      chassisHeight: 30,
      chassisDensity: 0.002,
      wheelRadius: 18,
      wheelSpacing: 42,
      wheelDrop: 30,
      wheelDensity: 0.003,
      wheelRestitution: 0.05,
    },
    TRACK: {
      // all rebuild
      wavelength: 900,
      thetaDeg: 40, // target max slope, deg (the same everywhere: the Strip has no difficulty ramp)
      crestH: 100,
      crestL: 200,
      crestCell: 1024,
      crestP: 0.45, // Crest probability per cell
      segLen: 32,
      slab: 44,
      overlap: 4,
      chamfer: 4,
      placeFlatPx: 900, // Terrain levelled around a Place: flat within half, blended over the rest, px
    },
    CAMERA: {
      // live
      cameraAnchorX: 0.35,
      cameraAnchorY: 0.55,
      cameraLerpY: 0.1,
      lookAheadMinDx: 0.8, // px per frame the Vehicle must move before the look-ahead pans to that side
      anchorLerpX: 0.03, // how fast the anchor glides to the look-ahead side, per frame
    },
    NET: {
      // live — client-only: how the server's state is drawn
      interpDelayMs: 50, // render delay behind the newest state for other Vehicles and Tools, ms (state arrives at 30 Hz)
      predict: 1, // 1 = the own Vehicle is predicted locally and reconciled with the server, 0 = drawn like the others
      smoothing: 0.85, // per-frame retention of the visual correction offset (0 = snap, 0.95 = slow glide)
      snapPx: 200, // a correction larger than this snaps instead of gliding (respawns, teleports)
      fadeAfterMs: 3000, // silence before a Vehicle fades out
      dropAfterMs: 10000, // silence before a Driver leaves the roster
    },
    TOOL: {
      // Tools (farm spec §Fixed facts): the plough box and the rockets, hitched on a rope
      size: 40, // rebuild: plough box side / circle diameter, px
      circle: 0, // rebuild: 1 = the plough is a circle, 0 = a box
      density: 0.0005, // rebuild: Matter density of a Tool (Chassis is 0.002; 0.001 felt too heavy in the playtest)
      friction: 0.6, // rebuild: Matter friction of a Tool
      hitchReach: 80, // live: a Ring within this of a hitch point can be hitched (the roof Slot sits ~60 above a parked Ring), px
      rodLength: 90, // live: rope rest length when lowered, px
      rodStiffness: 0.05, // live: rope stiffness when lowered / hoisting (small = bungee)
      rodDamping: 0.05, // live: rope damping
      raisedStiffness: 0.5, // live: stiffness of the pins holding a raised Tool at the hitch point
      hoistPxPerStep: 3, // live: how fast the rope reels in when raising, px/step
      rope: 1, // live: 1 = pulls only when stretched (rope), 0 = also pushes (rod)
      rocketAtHitch: 1, // live: 1 = rocket thrust acts at the Slot's hitch point (a top Slot pitches the nose down), 0 = at the Chassis centre
      rocketThrust: 0.35, // live: rocket Δv per step while firing, on the whole Vehicle, px/step²
      rocketBurstS: 2, // live: seconds a burst lasts
      rocketCooldownS: 5, // live: seconds after a burst before the next
      digAccel: 0.06, // live: soil resistance while the lowered plough is on the ground and moving, as a deceleration of the whole Vehicle, px/step² (fades in over the first 3 px/step so a rig can start)
      digSuction: 2, // live: downward share of the soil force (keeps the plough on the ground), × digAccel
      digReach: 6, // live: a drag tool counts as in the ground with its lowest point this close above the surface, px
      seedDrag: 0.3, // live: the seed bag's ground resistance as a fraction of digAccel
      harvestDrag: 0.7, // live: the harvester's ground resistance as a fraction of digAccel
      perProduceCells: 5, // live: harvested cells per Produce dropped
      produceRadius: 14, // rebuild: a Produce body's radius, px
      produceDensity: 0.001, // live: a Produce body's Matter density (Chassis is 0.002): the Box's load weighs this much per item; halved after the playtest
      boxCap: 8, // live: Produce a Box holds at most
      seedCap: 80, // live: cells one seed bag fill sows
      tankCap: 80, // live: cells one tank fill waters
      seedStock0: 80, // live: the Barn's seed stock at the start of a Run (one bag)
      waterStock0: 80, // live: the Well's water stock at the start of a Run (one tank)
      pickupNearPx: 2000, // live: pickup cluster spacing next to the Farmhouse, px
      pickupFarPx: 600, // live: pickup cluster spacing at pickupFarDistPx and beyond, px
      pickupFarDistPx: 4000, // live: distance from home where the clusters are densest, px
      pickupCluster: 3, // live: pickups per cluster, about
      upgradeEveryPx: 30000, // live: a rockets or ramp Tool lies on the hills about this often, px (30 000 = 1 km)
      pickupRadiusPx: 40, // live: a Vehicle within this of a pickup takes it, px
      waterMass: 0.06, // live: the tank's extra Matter mass per dose of water (80 doses ≈ eight Produce)
      rampLength: 260, // live: a deployed ramp's slope length, px
      rampAngleDeg: 22, // live: a deployed ramp's rise angle, deg
      rampAheadPx: 160, // live: the ramp's low end lands this far ahead of the Chassis, px
    },
    /** The Tractor (farm slice 5): scales on the Car's HANDLING numbers. Wheel and body numbers rebuild; the motor and spin scales are live. */
    TRACTOR: {
      motorScale: 2.5, // live: × driveAccel/brakeAccel on its one driven wheel (the rear)
      spinScale: 0.3, // live: × omegaMax; top speed ≈ omegaMax × spinScale × rearRadius (≈ 52 % of the Car’s at 0.3 × 30 px)
      reactionScale: 0.15, // live: × the motor reaction torque (the big wheel's inertia is ~8× the Car's; at 1 it loops)
      gripScale: 1.6, // live: × the grip budget (gripBase + gripPerLoad × load) of its wheels: the puller digs in
      densityScale: 1.5, // rebuild: × chassisDensity
      rearRadius: 30, // rebuild: the driven rear wheel, px
      frontRadius: 15, // rebuild: the free front wheel, px
      chassisWidth: 110, // rebuild: px
      chassisHeight: 34, // rebuild: px
    },
    FLIP: {
      // live
      flipGrace: 20, // consecutive roof-contact steps → flipped
      flipRespawnS: 20, // seconds flipped before the Vehicle respawns upright in place
      rescueRangePx: 150, // a passing Driver within this rights a flipped Vehicle
    },
    /** Colours and opacities. Not in the tuning panel. */
    PALETTE: {
      sky: '#8ECAE6',
      terrainFill: '#4A7C3F',
      terrainLine: '#2F5A2A',
      terrainLineWidth: 3,
      chassis: '#E63946',
      wheel: '#222222',
      wheelSpoke: '#888888',
      padOpacity: 0.25,
      padPressedOpacity: 0.6,
      skyNight: '#1b2440',
    },
  }
}

export type Config = ReturnType<typeof createConfig>
