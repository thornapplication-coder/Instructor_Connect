import { describe, expect, it } from 'vitest'

/**
 * Audit 11/2026, Nachtrag L-AUSGABE#2: Die Tests liefen in der Zone der
 * Maschine — in der CI UTC. Dort ist der UTC-Tag der Ortstag, und ein
 * `toISOString().slice(0, 10)` statt `lokalerTag` fiel keinem Test auf
 * (EXM-01, GRD-16). `vitest.config.ts` setzt deshalb Europe/Vienna für jeden
 * Lauf. Dieser Test hält fest, dass die Einstellung in Ebene 1 auch
 * ankommt; `zeitzone.dom.test.ts` dasselbe für Ebene 2.
 *
 * Gegenprobe: Zeile `process.env.TZ = …` in vitest.config.ts entfernt →
 * beide Tests rot (Zone „UTC", Versatz 0).
 */
describe('Ebene 1 läuft in Wiener Ortszeit', () => {
  it('die Zone ist gesetzt — nicht die der Maschine', () => {
    expect(process.env.TZ).toBe('Europe/Vienna')
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('Europe/Vienna')
  })

  it('Mitternacht Ortszeit liegt auf dem UTC-Vortag — der Fall, den UTC verdeckt', () => {
    const mitternacht = new Date(2026, 10, 2) // 02.11.2026, 00:00 in Wien
    expect(mitternacht.getTimezoneOffset()).toBe(-60)
    expect(mitternacht.toISOString().slice(0, 10)).toBe('2026-11-01')
    // Sommerzeit: zwei Stunden, das Fenster bis 02:00
    expect(new Date(2026, 6, 1).getTimezoneOffset()).toBe(-120)
  })
})
