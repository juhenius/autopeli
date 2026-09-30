/**
 * Server-clock helpers, pure: the server's wall-clock is the authority
 * (ADR 0004); the client only estimates its offset from the `now` stamp on
 * every server message. The daylight curve mirrors the server's.
 */
import type { FarmDayInfo } from '../../shared/protocol'

/** Estimates server time from the latest `now` stamp received. */
export class ServerClock {
  private offset = 0

  /** Called with the server's `now` at receipt; RTT/2 error is fine for a minutes-long Day. */
  sync(serverNow: number, localNow = Date.now()): void {
    this.offset = serverNow - localNow
  }

  now(localNow = Date.now()): number {
    return localNow + this.offset
  }
}

/** Daylight factor 0…1: 1 until `duskMs` before Sunset, then a linear fade to 0 at `end`. */
export function daylight(now: number, day: Pick<FarmDayInfo, 'end' | 'duskMs'>): number {
  const remaining = day.end - now
  if (remaining <= 0) return 0
  if (day.duskMs <= 0 || remaining >= day.duskMs) return 1
  return remaining / day.duskMs
}

/** Seconds until Sunset, floored at 0. */
export const secondsLeft = (now: number, day: Pick<FarmDayInfo, 'end'>): number => Math.max(0, Math.ceil((day.end - now) / 1000))
