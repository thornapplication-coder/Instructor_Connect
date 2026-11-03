import { describe, expect, it } from 'vitest'
import { istStumm, schalteStumm } from './chatMute'

/**
 * Audit 11/2026, KERN-06: Mika schaltete „SIM Defects" stumm, und Alex' Chat-
 * Info zeigte danach ebenfalls „Benachrichtigungen stumm" — das Feld lag am
 * Gruppenobjekt und galt fuer alle Mitglieder. Stummschalten ist eine
 * persoenliche Einstellung je Nutzer und Gruppe.
 */

describe('Stummschalten je Nutzer (KERN-06)', () => {
  it('wirkt nur fuer den, der umschaltet', () => {
    const neu = schalteStumm({}, 'u-michael', 'g-defects')
    expect(istStumm(neu, 'u-michael', 'g-defects')).toBe(true)
    expect(istStumm(neu, 'u-patrick', 'g-defects')).toBe(false)
    // … und nur fuer diese Gruppe.
    expect(istStumm(neu, 'u-michael', 'g-auto')).toBe(false)
  })

  it('zweimal umschalten ergibt den Ausgangszustand', () => {
    const aus = { 'u-michael': ['g-auto'] }
    const zurueck = schalteStumm(schalteStumm(aus, 'u-michael', 'g-defects'), 'u-michael', 'g-defects')
    expect(zurueck).toEqual(aus)
  })

  it('laesst die Listen anderer Nutzer unberuehrt — dieselben Objekte', () => {
    const alex = ['g-auto']
    const neu = schalteStumm({ 'u-patrick': alex }, 'u-michael', 'g-defects')
    expect(neu['u-patrick']).toBe(alex)
  })

  it('kommt ohne Liste und ohne Anmeldung zurecht', () => {
    expect(istStumm(undefined, 'u-michael', 'g-defects')).toBe(false)
    expect(istStumm({ 'u-michael': ['g-defects'] }, null, 'g-defects')).toBe(false)
    expect(schalteStumm(undefined, 'u-michael', 'g-defects')).toEqual({ 'u-michael': ['g-defects'] })
  })
})
