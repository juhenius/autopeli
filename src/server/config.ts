/** Server-side farm tunables (spec §Tunables). The sim's own groups live in src/config and arrive through `tune`. */
export interface ServerConfig {
  maxDrivers: number
  /** Ms from leaving the Farmhouse to Sunset. */
  dayLengthMs: number
  /** Fraction of the Day over which the light fades to 0 at the end. */
  duskFraction: number
  /** State broadcasts per second. */
  stateHz: number
  /** Half-width of the Farmhouse zone, px. */
  farmhouseZonePx: number
  /** Ms an empty Room keeps its Run before resetting. */
  emptyGraceMs: number
  /** Ms between heartbeat pings; a socket that misses two in a row is dropped (a sleeping iPad never closes its TCP). */
  pingMs: number
}

export const SERVER_CONFIG: ServerConfig = {
  maxDrivers: 6,
  dayLengthMs: 180_000,
  duskFraction: 0.3,
  stateHz: 30,
  farmhouseZonePx: 400,
  emptyGraceMs: 300_000,
  pingMs: 4_000,
}
