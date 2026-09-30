/**
 * What this device remembers between visits: the Driver's name, the token
 * that names the device to the server (a rejoin under it takes the old Seat
 * over), the Colour and the Vehicle for the next Day. Every read survives a
 * private window, where nothing is saved.
 */
import { defaultColour, DRIVER_COLOURS } from '../shared/colours'
import { isVehicleKind } from '../shared/sim/vehicles/index'
import type { VehicleKind } from '../shared/sim/vehicles/spec'

const NAME_KEY = 'autopeli.name'
const TOKEN_KEY = 'autopeli.token'
const COLOUR_KEY = 'autopeli.colour'
const VEHICLE_KEY = 'autopeli.vehicle'

const read = (key: string): string | null => {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

const write = (key: string, value: string): void => {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* private mode: it lives for this session only */
  }
}

const freshName = (): string => `Driver-${Math.random().toString(36).slice(2, 5).toUpperCase()}`

/** The Driver's name: `?mp=<name>` wins, else the saved one, else a fresh one that is saved. */
export function deviceName(params: URLSearchParams): string {
  const fromUrl = params.get('mp')?.trim()
  if (fromUrl) return fromUrl.slice(0, 24)
  const saved = read(NAME_KEY)
  if (saved) return saved
  const name = freshName()
  write(NAME_KEY, name)
  return name
}

export const saveName = (name: string): void => write(NAME_KEY, name)

/** The device's token for the server, made once and kept. */
export function deviceToken(): string {
  const saved = read(TOKEN_KEY)
  if (saved) return saved
  const token = crypto.randomUUID()
  write(TOKEN_KEY, token)
  return token
}

/** The device's Colour (an index into DRIVER_COLOURS), defaulting from the token. */
export function deviceColour(token: string): number {
  const saved = Number(read(COLOUR_KEY))
  if (Number.isInteger(saved) && saved >= 0 && saved < DRIVER_COLOURS.length) return saved
  return defaultColour(token)
}

export const saveColour = (colour: number): void => write(COLOUR_KEY, String(colour))

export function deviceVehicle(): VehicleKind {
  const saved = read(VEHICLE_KEY)
  return isVehicleKind(saved) ? saved : 'car'
}

export const saveVehicle = (kind: VehicleKind): void => write(VEHICLE_KEY, kind)
