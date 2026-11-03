import { describe, expect, it } from 'vitest'
import { ablehnungZeigen } from './dialogMeldung'

/**
 * Audit 11/2026, R3-DIALOGMELDUNG: Ablehnungen bei offenem Dialog standen
 * als Toast UNTER dem Dialog. Ebene 1: wohin eine Ablehnung gehört. Dass
 * sie im Dialog sichtbar ist, prüfen `components/Modal.test.tsx` (Ebene 2)
 * und `e2e/mobil.spec.ts` (am Telefon, Bottom-Sheet).
 */
describe('ablehnungZeigen', () => {
  it('erklärt ein Feld den Grund, gehört die Meldung dorthin — das erste in Anzeigereihenfolge', () => {
    expect(
      ablehnungZeigen(
        [
          ['name', false],
          ['email', true],
          ['gruppen', true],
        ],
        'Nicht angelegt',
      ),
    ).toEqual({ feld: 'email' })
  })

  it('erklärt kein Feld den Grund (Recht entzogen, anderer Tab), steht er in der Meldezeile', () => {
    expect(
      ablehnungZeigen(
        [
          ['name', false],
          ['email', false],
        ],
        'Nicht angelegt — keine Berechtigung mehr.',
      ),
    ).toEqual({ meldung: 'Nicht angelegt — keine Berechtigung mehr.' })
  })

  it('ein Dialog ohne prüfbare Felder: immer die Meldezeile', () => {
    expect(ablehnungZeigen([], 'Nicht gespeichert')).toEqual({ meldung: 'Nicht gespeichert' })
  })
})
