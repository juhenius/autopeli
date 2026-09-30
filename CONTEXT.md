# Autopeli

A 2D side-view arcade driving game in the spirit of Hill Climb Racing, played as a cooperative farm: a few Drivers on one hilly Strip fetch Tools from the Barn, till the Fields and are home by Sunset. The feel of driving is the product; the chaos comes from the physics.

## Language

### Vehicle

**Vehicle**:
The player-controlled unit as a whole: one Chassis, its Wheels, and the Suspension joining them, built from a Vehicle Spec. Each Driver chooses one at Night: the Car or the Tractor.
_Avoid_: player, rig

**Vehicle Spec**:
A Vehicle as plain data: the Chassis box, two Wheels (rest position, radius, driven, motor share), the three hitch points, the look, and motor, spin and reaction scales. In the facing-right frame; the Turn mirrors it.
_Avoid_: Blueprint, template, model

**Car**:
The quick Vehicle: symmetric, both Wheels driven.
_Avoid_: Default vehicle

**Tractor**:
The puller: a low Chassis with a cab, a big driven rear Wheel and a small free front one; heavier, more motor, about half the Car's top speed. The rear Wheel follows the facing.
_Avoid_: Truck

**Colour**:
A Driver's swatch (one of eight), chosen on the Night overlay like the name: the Chassis, the Vehicle label and the roster name wear it.
_Avoid_: Team, skin

**Chassis**:
The single rigid body of the Vehicle that everything else attaches to.
_Avoid_: Body, hull, frame

**Wheel**:
A round rigid body of the Vehicle that contacts the Terrain and can be driven by the motor.
_Avoid_: Tyre, tire

**Suspension**:
The set of constraints joining each Wheel to the Chassis, giving the Vehicle its springiness.
_Avoid_: Springs, joints, axle

**Handling**:
The tuned layer of custom behaviour (torque, grip, speed cap, mid-air rotation, stability) applied on top of the physics engine to make the Vehicle feel arcade-like rather than realistic.
_Avoid_: Physics tuning, vehicle model

**Air Control**:
The Handling rule that lets the player rotate the Chassis while no Wheel touches the Terrain, using the same two buttons as driving: gas = nose-up, brake = nose-down — the Motor Reaction plus a tuned assist.
_Avoid_: Mid-air torque, flip control

**Motor Reaction**:
The motor's equal-and-opposite torque on the Chassis: gas tips the nose up, brake tips it down — the source of wheelies on the ground and the physical core of Air Control in the air.
_Avoid_: Drive Reaction, wheelie torque

**Speed Cap**:
The motor's emergent top spin: drive torque fades to zero as the Wheels approach omegaMax. Free-rolling downhill and jumps may exceed it.
_Avoid_: Max speed, velocity limit, terminal velocity

**Jump**:
The Handling rule that launches the Vehicle at the instant of the jump control: one straight-up velocity impulse, full strength with a Wheel on the ground and fading with the closer Wheel's gap to the ground until nothing beyond the reach distance, with a short cooldown. The Wheels' pushes set the pitch: a level takeoff stays level, a one-Wheel takeoff tips the Chassis. Touch: the pad above gas; desktop: Space, W or up arrow.
_Avoid_: Hop, boost, bunny hop, stomp

**Kick**:
The Jump's drawn flourish: the Wheel sprites kick straight down and return over a few steps. Drawing only, never physics.
_Avoid_: Stomp, reach, extension

**Slip**:
Per-Wheel difference between the Wheel's contact-surface speed and its ground speed along the Terrain tangent; positive is wheelspin, negative is a skid. Drives traction and the dirt spray.
_Avoid_: Drift, wheelspin, skid ratio

**Grip Budget**:
The traction limit of one Wheel for one step: a floor plus a load term from its Suspension compression. Slip demanding more than the budget is a burnout or a skid — and the budget is the climb-difficulty dial.
_Avoid_: Friction, traction limit, downforce

**Wheel Box**:
The chassis-local region a Wheel centre may occupy, enforced in code after each physics step — the Suspension's end stops. The momentum it stops is handed to the Chassis at the Wheel's position, so off-centre bottom-outs pitch the Vehicle naturally.
_Avoid_: Bump stop, travel clamp, fender

**Facing**:
Which way a Vehicle points, right or left, set by the Turn. It decides the drawing, which Wheel is the rear, which pad is the forward gear, which way the Rockets push and which way a Ramp is planted.
_Avoid_: Direction, heading, side

### World

**Terrain**:
The ground surface the Vehicle drives on: hills, slopes, jumps, and uneven stretches, with physical collision.
_Avoid_: Ground, map, level geometry

**Chunk**:
One generated piece of Terrain; the Track is produced and disposed of Chunk by Chunk as the Vehicle advances.
_Avoid_: Segment, tile, section

**Track**:
The seeded elevation function the Terrain is built from: hills the same everywhere, levelled around every Place, Crests on top. The same seed yields the same Track; the server simulates it and the client draws it from the same function.
_Avoid_: Level, stage, map, route

**Strip**:
The farm's one drivable stretch: the Track with the Places on it, driven both ways, open at both ends so the hills run on for anyone who just wants to drive. One Strip per Run.
_Avoid_: Map, level, world, route

**Place**:
Something that sits at a fixed x on the Strip: the Barn, the Farmhouse, a Field. The Terrain is levelled around buildings.
_Avoid_: Location, node, point of interest

**Zone**:
The stretch of Strip around a Place where the Place acts: the Farmhouse's banks a Box and takes a Use as Ready, the Barn's fills Seed Bags, the Well's fills Tanks.
_Avoid_: Trigger, area, radius

**Farmhouse**:
The Place the Drivers start at and come home to at Sunset; inside its Zone, every Driver pressing Use ends the Day early.
_Avoid_: Home base, spawn, checkpoint

**Barn**:
The Place the seven Tools park in front of at the start of a Run: plough, seed bag, tank, harvester, box, ramp, rockets. It holds the seed Stock; its Zone tops up Seed Bags.
_Avoid_: Shed, garage, depot

**Field**:
A stretch of the Strip between two posts, made of Cells. The Night shows each Field's tilled, growing and ripe percentages.
_Avoid_: Plot, patch, farmland

**Cell**:
One 16 px slice of a Field with a state: untilled, tilled, sown, sprouting, ripe, plus a watered flag. Drag Tools change it, a Night grows it one stage only if it was watered that Day (sown → sprouting → ripe) and clears the flag, the Harvester returns it to untilled.
_Avoid_: Tile, square, plot

**Well**:
The Place beyond the Barn that holds the water Stock: any Tank inside its Zone, parked or hitched, tops up from it. Filling is driving past.
_Avoid_: Pond, water source, tap

**Stock**:
What a store holds: seeds in the Barn, water in the Well. Starts at one fill each, no cap; Pickups add to it on the spot, Tools in the Zone drain it. Shown in the Day HUD.
_Avoid_: Inventory, supply, reserve

**Pickup**:
A seed packet or a water drop lying on the hills, in clusters that get denser the further from the Farmhouse, never in a Place's flat or a Field, a fresh set every Day, laid further as anyone drives further (the hills never run out). Any Vehicle that drives through one takes it, and it lands in its Stock at once.
_Avoid_: Loot, drop, collectible, resource

**Upgrade**:
A rockets or ramp Tool lying on the hills, about every kilometre each way, alternating, laid as Vehicles drive out. Hitched like any Tool; a ramp is spent on use, rockets keep their cooldown. Per Run, not per Day.
_Avoid_: Power-up, loot

**Tank**:
The drag Tool that waters: lowered and dragged over sown or sprouting Cells it waters them one dose each until dry; inside the Well's Zone it tops up from the water Stock. Its mass grows with its water, so a full Tank is a heavy tow. Starts empty.
_Avoid_: Water cart, sprinkler, barrel

**Flip**:
The upper half of the Chassis resting on the Terrain for longer than a brief grace period. A flipped Driver stays put until Rescued by another Driver, or is Respawned upright after a longer wait. Touching the Terrain with the Chassis's underside or tail is not a Flip.
_Avoid_: Crash, death, game over, wipeout, turn

**Respawn**:
A Vehicle put back upright on a free spot: a flipped Driver after the wait, and everyone at the Farmhouse when a Day ends. A Respawn drops whatever the Vehicle was carrying.
_Avoid_: Reset, restart, revive

**Crest**:
A deliberate sharp feature of the Track — a rise ending in a sudden drop — placed to launch the Vehicle. Crests face both ways: half of them launch a Vehicle driving left.
_Avoid_: Kicker, ramp, cliff

### Farm

**Run**:
One sitting on one Strip, from the first Night on, Day after Day. Nothing is saved between Runs; a new one starts when the Room has been empty past its grace.
_Avoid_: Season (reserved for summer and winter, should they come), game, session, campaign

**Day**:
The driving phase of a Run, from leaving the Farmhouse until Sunset or until every Driver is home and has pressed Use. Tunable length, about three minutes.
_Avoid_: Round, turn, level

**Sunset**:
The end of a Day's daylight. The sky darkens over the last part of the Day — the dusk — as the warning; daylight is the level of that fade, 1 until the dusk begins, 0 at Sunset. At Sunset every Driver is brought home; Tools stay where they were left.
_Avoid_: Bedtime, timer, night clock, curfew

**Night**:
The phase between Days: Produce at the Farmhouse is banked, the Fields grow one stage, everyone is brought home, and the overlay shows the Fields and the Score; a single Ready ('go') starts the next Day. A Run begins in its first Night.
_Avoid_: Rest, break, intermission, camp

**Ready**:
The Room's rule for every decision that moves the Run on (start the Day, end it early): each Driver presses for a choice, and the Run moves only when every connected Driver is Ready on the same choice.
_Avoid_: Vote, confirm, OK, lock in, majority

**Use**:
The third control, next to gas and brake: the context action. At the Farmhouse it is Ready to end the Day.
_Avoid_: Action button, interact, A button

**Tool**:
A world object with a Ring at its centre, simulated by the server like everything else: parked it collides with every Vehicle and rolls where it likes; hitched it hangs on a rope from a Slot. Kinds: the Plough, the Seed Bag, the Tank, the Harvester, the Box, the Ramp and the Rockets.
_Avoid_: Item, implement, attachment, power

**Ring**:
The point at a Tool's centre the rope takes; a Slot can hitch a parked Tool whose Ring is within reach of its hitch point.
_Avoid_: Hook, eye, handle

**Hitch**:
Joining a parked Tool to a Slot: the Tool's Ring must be within reach of the Slot's hitch point, the point on the Chassis the rope or the rigid hold takes. Tap the Slot to hitch, hold to drop.
_Avoid_: Attach, mount, pick up

**Slot**:
One of three hitch points on a Vehicle — 1 the left end, 2 the top, 3 the right end — each with its own control: tap to hitch the Tool in reach or use the Tool in the Slot, hold to drop it.
_Avoid_: Mount, socket, attachment point

**Plough**:
The first drag Tool: lowered and dragged on the ground it tills untilled Cells, the ground resisting. Drag Tools are raised (rigid at the Slot) or lowered (on the rope).
_Avoid_: Blade, cultivator

**Seed Bag**:
The drag Tool that sows: dragged over tilled Cells it makes them sown, one seed each, until it runs out; inside the Barn's Zone it tops up from the seed Stock.
_Avoid_: Seeder, sack, planter

**Harvester**:
The drag Tool that harvests: dragged over ripe Cells it returns them to untilled and drops one Produce beside it every five Cells.
_Avoid_: Reaper, combine, cutter

**Produce**:
A round body a harvest leaves on the ground (a pumpkin); it rolls and can be pushed, taken into a Box, or left where it lies.
_Avoid_: Crop, item, pumpkin (in code), cargo

**Box**:
The carrying Tool: an open crate, rigid in any Slot, never lowered. Use takes the nearest Produce within reach into it, up to a cap, and every item makes it heavier, so a full Box on the roof is top-heavy. Driving it past the Farmhouse banks and empties it. Hold drops it with its load.
_Avoid_: Cart, trailer, basket, container

**Bank**:
Turning Produce into Score: a Box inside the Farmhouse's Zone empties into the Score at once, and at Night loose Produce in the Zone counts too.
_Avoid_: Deliver, cash in, deposit

**Ramp**:
The single-use Tool: rigid in a Slot, Use plants a solid wedge ahead of the Vehicle the facing way, then the Tool is gone for the Run.
_Avoid_: Jump, kicker, launcher

**Score**:
Produce banked this Run. Shown in the Day HUD and the Night.
_Avoid_: Points, money, gold

**Rockets**:
The Tool that pushes: used, it fires a burst along the Chassis axis the facing way, applied at its Slot's hitch point, then cools down. Never lowered.
_Avoid_: Booster, thruster, jetpack

**Turn**:
The control that turns a Vehicle around: the drawing squashes through zero and comes back facing the other way, momentum kept, the end Slots swap, and at the mid-point the Wheels change sides in the physics (so a Tractor's big Wheel is always behind). Gas and brake stay absolute — the right pad always drives right — but the gears follow the Facing: the pad in the facing direction is the forward gear, the other the slower reverse gear.
_Avoid_: Flip, mirror, U-turn (as names for the Turn)

**Rescue**:
One Driver driving past another's flipped Vehicle, which rights it. The fast way out of a Flip; the slow way is waiting for the Respawn.
_Avoid_: Revive, help, tow, unflip

### Multiplayer

**Driver**:
The human at the controls of one Vehicle. Each connected person is one Driver, shown by a display name; the same device rejoining during a Run takes its Seat back, name and all. In the sim, a Driver is the seat: the Vehicle and everything that drives it (the held input, Handling, the Turn, the Slots, the Flip).
_Avoid_: Player, user, participant

**Seat**:
A Driver's place in a Run, keyed to the device: a rejoin from the same device takes the Seat over, and its old connection is dropped.
_Avoid_: Session, token (in prose), account

**Room**:
The shared space a set of Drivers occupy together: one Strip, one server-simulated world, one Run. Every Vehicle is real to every other.
_Avoid_: Lobby, session, match

**Server**:
The server: it owns the Room, the Run's state and the physics. Clients send held inputs and Ready choices and draw what it streams (ADR 0005).
_Avoid_: Host, backend, game server
