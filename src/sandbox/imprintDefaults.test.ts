import { describe, expect, it } from 'vitest'
import { imprintHash, IMPRINT_DE, IMPRINT_EN, IMPRINT_LEGACY_HASHES } from './imprintDefaults'

/**
 * Impressum ab Werk (Audit 11/2026, TEC-18: lag außerhalb beider
 * Testwachen). Es beschreibt, was die App tut — und versprach schon einmal
 * eine Kontolöschung, die es nicht gab, und verschwieg Logbuch und DocCheck
 * (KERN-13, TXT-04/05). Festgehalten wird, was sich mechanisch prüfen lässt:
 * Jede Kachel der Startseite steht in Abschnitt 2, in beiden Sprachen.
 */
const startseite = import.meta.glob('../pages/Home.tsx', { query: '?raw', import: 'default', eager: true })['../pages/Home.tsx'] as string

/** Kachelnamen aus `TILES` der Startseite — keine zweite Liste, die veraltet. */
const kacheln = [...(startseite.match(/const TILES = \[([\s\S]*?)\] as const/)?.[1] ?? '').matchAll(/label: '([^']+)'/g)].map((m) => m[1])

/** Aufzählungspunkte in Abschnitt 2 („Zweck und Module" / „Purpose and modules"). */
function moduleInAbschnitt2(text: string): string[] {
  const abschnitt = text.split(/^# /m).find((s) => s.startsWith('2.')) ?? ''
  return [...abschnitt.matchAll(/^- ([^:]+):/gm)].map((m) => m[1].trim().toLowerCase())
}

describe('Impressum ab Werk', () => {
  it('findet die Kacheln der Startseite (sonst prüfte der Test ins Leere)', () => {
    expect(kacheln).toContain('Grading Tool')
    expect(kacheln).toContain('DocCheck')
    expect(kacheln.length).toBeGreaterThanOrEqual(9)
  })

  it.each([
    ['DE', IMPRINT_DE],
    ['EN', IMPRINT_EN],
  ])('%s: jede Kachel der Startseite und das Admin Panel sind in Abschnitt 2 genannt', (_, text) => {
    const genannt = moduleInAbschnitt2(text)
    const fehlt = [...kacheln, 'Admin Panel'].filter((k) => !genannt.includes(k.toLowerCase()))
    expect(fehlt).toEqual([])
  })

  it('beide Sprachen haben dieselbe Gliederung', () => {
    const nummern = (t: string) => [...t.matchAll(/^# (\d+)\./gm)].map((m) => m[1])
    expect(nummern(IMPRINT_DE)).toEqual(nummern(IMPRINT_EN))
    expect(nummern(IMPRINT_DE).length).toBeGreaterThanOrEqual(10)
  })

  it('die aktuelle Fassung ist keine der abgelösten — sonst überschriebe migrateState sie bei jedem Start', () => {
    expect(IMPRINT_LEGACY_HASHES).not.toContain(imprintHash(IMPRINT_DE))
    expect(IMPRINT_LEGACY_HASHES).not.toContain(imprintHash(IMPRINT_EN))
  })
})
