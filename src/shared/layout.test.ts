import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/** The three halves of src/ and the one rule between them: shared imports nothing above it, client and server never meet. */
const ROOT = join(__dirname, '..')

function tsFiles(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...tsFiles(p))
    else if (name.endsWith('.ts')) out.push(p)
  }
  return out
}

function offenders(half: string, forbidden: string[]): string[] {
  const bad: string[] = []
  for (const f of tsFiles(join(ROOT, half))) {
    const src = readFileSync(f, 'utf8')
    for (const m of src.matchAll(/from\s+'(\.[^']*)'/g)) {
      const target = join(f, '..', m[1]!)
      for (const word of forbidden) if (target.includes(`/src/${word}/`)) bad.push(`${f.slice(ROOT.length + 1)} → ${m[1]}`)
    }
  }
  return bad
}

describe('src layout', () => {
  it('shared imports only shared', () => expect(offenders('shared', ['client', 'server'])).toEqual([]))
  it('client never imports server', () => expect(offenders('client', ['server'])).toEqual([]))
  it('server never imports client', () => expect(offenders('server', ['client'])).toEqual([]))
})
