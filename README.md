# Autopeli

A cooperative side-view driving game in the spirit of Hill Climb Racing, played
as a farm. A few drivers share one hilly strip with a barn, a farmhouse, a well
and two fields. Fetch the tools from the barn, till and sow the fields, water
them, harvest the pumpkins, carry them home in the box, and be back by sunset.
The feel of driving is the point; the chaos comes from the physics.

It runs in the browser (desktop or a landscape iPad, installable as a PWA) and
needs a small server, which simulates the whole world so that every car, tool
and pumpkin is real to every player.

## How it plays

- **A run** is one sitting on one strip, night after day after night. It starts
  at night: pick a name, a colour and a vehicle (the quick **car** or the slow,
  strong **tractor**), and press *go*. Everyone must be ready.
- **A day** lasts about three minutes. The sky darkens toward sunset as the
  warning; at sunset everyone is brought home. At the farmhouse, pressing *Use*
  ends the day early once everyone is home and has pressed it.
- **The tools** park in front of the barn: plough, seed bag, tank, harvester,
  box, ramp and rockets. Drive up to one and tap a slot to hitch it; tap the
  slot again to use it. Drag tools (plough, seed bag, tank, harvester) lower
  onto the ground and do their work as you drive over a field. The box takes
  the nearest pumpkin; driving it past the farmhouse banks the load. The ramp
  plants a wedge ahead of you, once. The rockets push.
- **A field** goes untilled → tilled → sown → sprouting → ripe. Growth happens
  at night, and only for cells that were watered that day. The harvester
  returns ripe cells to soil and leaves pumpkins behind.
- **Stock** runs out. The barn holds seeds and the well holds water; seed
  packets and water drops lie on the hills, denser the further you go, and any
  car that drives through one takes it home.
- **Flipping** onto your roof is a setback: a passing driver rights you, or you
  respawn in place after a wait.
- **Score** is the pumpkins banked this run.

### Controls

| Action | Touch | Keyboard |
| --- | --- | --- |
| Gas | right pad | → or D |
| Brake / reverse | left pad | ← or A |
| Jump | pad above gas | Space, ↑ or W |
| Turn around | pad above brake | S or ↓ |
| Use | top centre | E or Enter |
| Slot 1 / 2 / 3 | bottom centre | 1 / 2 / 3 |

A slot button hitches the tool within reach, or uses the tool in that slot;
hold it to drop the tool. Gas and brake are absolute (the right pad always
drives right); turning around swaps which one is the forward gear.

## Running it

Requires Node 24 (the server runs TypeScript directly with
`--experimental-transform-types`).

```sh
npm install
npm run server     # the game server on port 5174
npm run dev        # the client on http://localhost:5173, proxying /ws to the server
```

Open <http://localhost:5173/?mp=yourname>. Everyone who opens the same origin
joins the same room. Without `?mp=` a name is generated and kept on the device;
rejoining from the same device during a run takes your seat back.

Other commands:

```sh
npm test           # vitest: the simulation runs headless
npm run typecheck
npm run build      # the client into dist/
npm run preview    # serves dist/ on port 5173
```

Environment: `PORT` moves the server, `DAY_MS` shortens days for testing
sunset, `SERVER_PORT` points the client's proxy at another server.

Add `?debug` to the URL for a live tuning panel and a performance readout.
Every simulation dial is forwarded to the server for the whole room.

### Playing on an iPad over the LAN

Run the dev server with `--host` (the `dev` script already does), find the
machine's LAN address and open `http://<address>:5173/` on the iPad. Plain HTTP
is enough to play. Installing to the home screen and offline start need a
trusted HTTPS origin; `mkcert` and the `HTTPS_CERT` / `HTTPS_KEY` variables
read by `npm run preview` cover that.

## How it is built

- **Phaser 4** draws and reads input in the browser. Its physics plugin is not
  used.
- **matter-js** runs on the server: one headless world per room at 60 Hz. The
  client draws the streamed state through an interpolator and predicts its own
  car locally, so a press shows on the next frame and the server's authority
  appears only as small corrections.
- **The track** is a seeded function; the server simulates it and the client
  draws it from the same code, chunk by chunk, with no terrain bodies on the
  client.
- **Handling** is a tuned torque-and-slip model on top of the engine: top
  speed, wheelies, burnouts and the climb limit are emergent from the motor
  curve and a per-wheel grip budget.

```
src/shared/   config, the wire protocol and the whole simulation; used by both halves
src/client/   the browser: scenes, drawing, HUD, input, net client, tuning panel
src/server/   the room (membership, the run, the world), sockets and the timer
```

A test keeps the import direction: shared imports only shared; client and
server never import each other.

Docs: [`CONTEXT.md`](CONTEXT.md) is the glossary the code and the comments
use; [`docs/adr/`](docs/adr/) records the decisions and why.

## Deploying

The server is a plain Node process (`npm run server`) that needs only
`package.json`, `src/server/` and `src/shared/`; the client is the static
`dist/` from `npm run build`. Serve the build and route `/ws` to the server's
port from the same origin, as the dev proxy does.

## Licence

MIT, see [`LICENSE`](LICENSE).

## Author

Jari Helenius

[![LinkedIn][linkedin-shield]][linkedin-url]

<!-- MARKDOWN LINKS & IMAGES -->

[linkedin-shield]: https://img.shields.io/badge/-LinkedIn-black.svg?style=for-the-badge&logo=linkedin&colorB=555
[linkedin-url]: https://linkedin.com/in/jari-helenius-a445478a