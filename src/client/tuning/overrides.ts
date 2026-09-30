/**
 * Tuning-override persistence: only values differing from code defaults are
 * stored (localStorage `autopeli.tuning`, keyed by dotted path), and they are
 * applied on load only under ?debug — a normal load always plays code
 * defaults. Static-import safe: no lil-gui here.
 */
import type { Config } from '../../shared/config'
import { TUNABLES } from '../../shared/config/tunables'

export const TUNING_KEY = 'autopeli.tuning'

export type Overrides = Record<string, number>

export function getByPath(config: Config, path: string): number | undefined {
  let cur: unknown = config
  for (const key of path.split('.')) {
    if (typeof cur !== 'object' || cur === null) return undefined
    cur = (cur as Record<string, unknown>)[key]
  }
  return typeof cur === 'number' ? cur : undefined
}

export function setByPath(config: Config, path: string, value: number): void {
  const keys = path.split('.')
  const last = keys.pop()!
  let cur: unknown = config
  for (const key of keys) {
    if (typeof cur !== 'object' || cur === null) return
    cur = (cur as Record<string, unknown>)[key]
  }
  if (typeof cur === 'object' && cur !== null && typeof (cur as Record<string, unknown>)[last] === 'number') {
    ;(cur as Record<string, number>)[last] = value
  }
}

export function loadOverrides(): Overrides {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(TUNING_KEY) ?? '{}')
    if (typeof parsed !== 'object' || parsed === null) return {}
    const out: Overrides = {}
    for (const [k, v] of Object.entries(parsed)) if (typeof v === 'number') out[k] = v
    return out
  } catch {
    return {}
  }
}

export function saveOverrides(overrides: Overrides): void {
  try {
    if (Object.keys(overrides).length === 0) localStorage.removeItem(TUNING_KEY)
    else localStorage.setItem(TUNING_KEY, JSON.stringify(overrides))
  } catch {
    /* best-effort */
  }
}

export function clearOverrides(): void {
  try {
    localStorage.removeItem(TUNING_KEY)
  } catch {
    /* best-effort */
  }
}

/** Apply stored overrides onto a Config — known tunable paths only. */
export function applyOverrides(config: Config, overrides: Overrides): void {
  for (const t of TUNABLES) {
    const v = overrides[t.path]
    if (v !== undefined) setByPath(config, t.path, v)
  }
}

/** The values currently differing from code defaults, keyed by dotted path. */
export function collectOverrides(config: Config, defaults: Config): Overrides {
  const out: Overrides = {}
  for (const t of TUNABLES) {
    const cur = getByPath(config, t.path)
    if (cur !== undefined && cur !== getByPath(defaults, t.path)) out[t.path] = cur
  }
  return out
}
