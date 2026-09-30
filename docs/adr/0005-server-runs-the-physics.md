# The server runs the physics

Status: accepted. ADR-0004 stands: the server owns the Run state.

The farm needs Tools that any Driver can pick up, drop and tow, Vehicles
that can push each other, and one set of furrows everyone sees. Under client-owned physics each of those needs an ownership
protocol and stays approximate. So the server runs one headless Matter world
per Room at 60 Hz (`src/shared/sim/`, plain `matter-js` 0.20, the same Phaser
vendors), clients send held inputs and Ready choices, and every client —
the own Vehicle included — draws the streamed state through an interpolator. The Track is drawn on the client from the same
seeded function the server simulates, with no bodies.

## Considered options

- **Client-authoritative with object ownership** (each tool simulated by the
  nearest Driver, streamed like a pose; Vehicles never collide, a soft push fakes
  bumping): a day less work, but every later physical thing needs the same
  ownership dance and car contact stays fake. Rejected because the farm's
  whole point is shared physical objects.
- **Client-side prediction** for the own Vehicle on top of server authority:
  built the same day (`src/client/net/prediction.ts`). The client runs the same
  World with only its own Vehicle, sends every input numbered, and on each
  server state snaps to the Vehicle's full physical state and replays the
  inputs the server has not acknowledged; the correction is kept as a visual
  offset that decays over a few frames (`NET.smoothing`), and a correction
  beyond `NET.snapPx` snaps (respawns). Other Vehicles and towed Tools are not in
  the local World, so their effects arrive as corrections. `NET.predict` 0
  falls back to drawing the own car like the others.

## Consequences

- With prediction on, a press reaches the drawing on the next local step;
  the server's authority shows only as corrections (sub-pixel while driving
  alone, larger when a rope or another car acts on you). With it off, a
  press shows about one server step plus `NET.interpDelayMs` later.
- The server is a physics process: Node 24 with
  `--experimental-transform-types` (the sim uses parameter properties), sim
  imports carry `.ts` extensions for Node's resolver, ~80 bodies at 60 Hz.
  The Pi copes.
- Every dial belongs to the server: the tuning panel forwards changes with
  `tune`; a rebuild-group dial rebuilds the server's world for the whole Room.
- The sim is testable without a browser: vitest drives a Vehicle, tills a
  Field, Turns a car, all headless.
- Solo play needs the server running (ADR-0004).
- Phaser's Matter plugin is unused; the client bundle keeps Phaser for
  drawing and input only.
