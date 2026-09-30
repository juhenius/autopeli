# Server-owned Run state

Status: accepted.

The Run (Days and Nights, the Day clock and Sunset, Ready, the roster of Drivers and their Seats, the Score) is shared truth every client must agree on, so the server owns the Run state machine: clients send intents (join, choose a Vehicle, Ready for a choice, Use) and receive the resulting snapshot; the server decides conflicts and keeps the Day clock on its own wall-clock. The Fields are sim state (ADR 0005) and ride along in the snapshot.

## Considered options

- **Host client** (first Driver's device runs the state machine, server forwards): rejected because a sleeping iPad would take the Run with it, and host migration is more code than a server-side state machine.
- **Replicated event log** (server only orders messages, every client applies them deterministically): rejected because it pushes every rule into the browser bundle and makes a diverged client unrecoverable without a resync protocol, which is the server-side state machine by another name.

## Consequences

- The server is stateful: `src/server/` holds the Room, which owns the Run, the World and every rule that spans them (the Day and Night choreography, rebuilds, the rejoin-by-device path that hands a dropped Driver its Seat back), unit-tested without sockets through typed intents in and an outbox out.
- Anything time-based that Drivers share (Sunset, the Respawn wait, cooldowns others can see) keys off server time, never a local step count.
- Solo play is a Room of one on the same server, so the server must be running even to play alone.
