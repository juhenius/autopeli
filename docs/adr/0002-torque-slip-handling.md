# Torque + slip Handling with code end stops

Status: accepted.

Handling is a torque + slip model applied as explicit per-step impulses inside the server's fixed step (ADR 0005). The motor applies a spin impulse with a linear speed curve (`driveAccel` fading to zero at `omegaMax`; brake is the same motor reversed through a weaker gear, `reverseRatio`), and its equal-and-opposite reaction torque tips the Chassis. Traction is a slip-proportional impulse per touching Wheel, clamped by the Grip Budget `gripBase + gripPerLoad × spring compression`; the Wheels carry **zero Matter contact friction** and every body has explicit `frictionAir`. Air Control is the Motor Reaction plus a tuned assist (`airTorque`), mapped physically: gas = nose-up. Apex gravity-shaping (`apexLift`, deliberate fakery) cancels part of gravity near a jump's apex. The Suspension's end stops are code: a chassis-local Wheel Box on each Wheel centre (travel `[minTravel, maxTravel]`, lateral `±wheelBoxX`, snap-to-rest beyond 25 px) run after each physics step, with `constraintIterations: 4` so spring and arm hold under hard landings.

The alternative, a velocity-target model (each step easing Wheel ω toward a motor target, with grip as Matter contact friction), feels on rails: wheelies and jumps come from synthetic torques rather than from the motor, and top speed is a clamp rather than an emergent limit.

## Consequences

- Top speed, brake→reverse, wheelies, burnouts, lock-skids, load transfer and the climb limit are **emergent**; the tuning dials are the motor curve and the Grip Budget (`gripBase`/`gripPerLoad` is the climb-difficulty dial).
- Matter pair friction combines as **min(a, b)**: with the Chassis at 0.3, `terrainFriction` above 0.3 changes nothing (it only shapes Chassis scrapes). Recorded because a dead dial cost a tuning session.
- Wheelies on the ground and rotation in the air are one mechanism (the Motor Reaction); `maxSpin` is the only assist cap. A Flip must feel earned: no auto-righting.
- The two-button contract: brake wins grounded; both held airborne = nothing.
- Handling drives one Vehicle per step, reading its contact, spring compressions, bodies and Facing from it; the Track slope (slip tangent only) and surface height are injected. The input it takes is the held gas and brake plus the Jump edge.
