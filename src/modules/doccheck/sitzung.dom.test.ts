import { describe, expect, it } from 'vitest'
import { fuerNutzer, lesenZustand, neu, setzen } from './sitzung'
import { hinweisMerken, hinweisOffen } from './hinweis'

describe('Abmelden räumt die Sitzung des Tabs (Browser)', () => {
  it('ic-abmelden verwirft Dokumente UND die Bestätigung des Hinweisdialogs (Audit 11/2026, SEC-05)', () => {
    fuerNutzer('u-a')
    setzen((z) => neu(z, { id: 'd1', rolle: 'review', name: 'SBX-TM.docx', groesse: 1 }))
    hinweisMerken(sessionStorage, 'u-a')
    sessionStorage.setItem('dc-notice-seen', '1')
    sessionStorage.setItem('fremd', 'bleibt')
    expect(hinweisOffen(sessionStorage, 'u-a')).toBe(false)

    window.dispatchEvent(new Event('ic-abmelden'))

    expect(lesenZustand()).toMatchObject({ nutzer: null, docs: [] })
    // Der nächste Nutzer — oder A nach erneutem Anmelden — sieht den Hinweis wieder
    expect(hinweisOffen(sessionStorage, 'u-a')).toBe(true)
    expect(sessionStorage.getItem('dc-notice-seen')).toBeNull()
    expect(sessionStorage.getItem('fremd')).toBe('bleibt')
  })
})
