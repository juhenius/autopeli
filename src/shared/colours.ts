/**
 * Driver colours: eight curated swatches. A Driver's colour is
 * an index into this list — a device preference sent with the join, drawn on
 * the Chassis, the Vehicle label and the roster. The default is picked by the
 * device token, so two Drivers rarely start alike.
 */
export const DRIVER_COLOURS = ['#E63946', '#F4A261', '#FFD166', '#06D6A0', '#4CC9F0', '#7B61FF', '#F72585', '#F1FAEE'] as const

export const colourOf = (index: number): string => DRIVER_COLOURS[((Math.round(index) % DRIVER_COLOURS.length) + DRIVER_COLOURS.length) % DRIVER_COLOURS.length]!

/** A stable default from any string (the device token). */
export function defaultColour(token: string): number {
  let h = 0
  for (let i = 0; i < token.length; i++) h = (h * 31 + token.charCodeAt(i)) >>> 0
  return h % DRIVER_COLOURS.length
}

/** '#rrggbb' as a number, for Phaser's fills. */
export const hexToNum = (hex: string): number => parseInt(hex.slice(1), 16)

/** Linear blend of two '#rrggbb' colours as a number, t = 0 → a. */
export function mixColour(a: string, b: string, t: number): number {
  const ca = hexToNum(a)
  const cb = hexToNum(b)
  const ch = (shift: number): number => Math.round(((ca >> shift) & 0xff) * (1 - t) + ((cb >> shift) & 0xff) * t)
  return (ch(16) << 16) | (ch(8) << 8) | ch(0)
}
