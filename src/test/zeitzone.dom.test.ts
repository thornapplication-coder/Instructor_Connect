import { describe, expect, it } from 'vitest'

/**
 * Gegenstück zu `zeitzone.test.ts` für Ebene 2 (jsdom): Auch Ansichten und
 * Speicher rechnen mit Tagen (Logbuch, Entwürfe, Druckkopf), und ihr Projekt
 * hat eigene Einstellungen in vitest.config.ts — eine Zone, die nur in
 * Ebene 1 ankäme, fiele dort nicht auf (Audit 11/2026, Nachtrag L-AUSGABE#2).
 */
describe('Ebene 2 läuft in Wiener Ortszeit', () => {
  it('Zone und Versatz wie in Ebene 1', () => {
    expect(typeof window).toBe('object') // wirklich die jsdom-Umgebung
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('Europe/Vienna')
    expect(new Date(2026, 10, 2).toISOString()).toBe('2026-11-01T23:00:00.000Z')
  })
})
