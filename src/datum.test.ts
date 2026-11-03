import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { formatDate, formatDateTime, lokalerTag, lokalIso, monatsName } from './datum'

/**
 * Das Datumsformat ist eine Zusage an den Nutzer (DD.MM.YYYY, in beiden
 * Sprachen) und steht in jedem Nachweis, den die App ausgibt. Bis zum Audit
 * lag die Regel ungetestet in einer Seitendatei — diese Faelle halten sie
 * jetzt fest.
 */

describe('formatDate', () => {
  it('schreibt DD.MM.YYYY mit fuehrenden Nullen', () => {
    expect(formatDate('2026-08-05')).toBe('05.08.2026')
    expect(formatDate('2026-12-31')).toBe('31.12.2026')
  })

  it('liest auch einen Zeitstempel', () => {
    expect(formatDate(new Date(2026, 7, 31, 13, 45).getTime())).toBe('31.08.2026')
  })

  it('behandelt ein ISO-Datum als lokalen Tag, nicht als UTC-Mitternacht', () => {
    // Ohne die Uhrzeit im Konstruktor liest der Browser YYYY-MM-DD als UTC —
    // westlich von Greenwich waere daraus der Vortag geworden.
    expect(formatDate('2026-01-01')).toBe('01.01.2026')
  })

  it('gibt Unlesbares unveraendert zurueck statt NaN.NaN.NaN', () => {
    expect(formatDate('kein Datum')).toBe('kein Datum')
    expect(formatDate('')).toBe('')
  })
})

describe('formatDateTime', () => {
  it('haengt die Uhrzeit zweistellig an', () => {
    expect(formatDateTime(new Date(2026, 7, 5, 9, 7).getTime())).toBe('05.08.2026 09:07')
  })

  it('bleibt bei Mitternacht bei 00:00', () => {
    expect(formatDateTime(new Date(2026, 7, 5, 0, 0).getTime())).toBe('05.08.2026 00:00')
  })
})

describe('monatsName', () => {
  it('nennt Monat und Jahr in der Sprache der Oberflaeche', () => {
    expect(monatsName('2026-08', 'de')).toMatch(/August 2026/)
    expect(monatsName('2026-08', 'en')).toMatch(/August 2026/)
    expect(monatsName('2026-12', 'de')).toMatch(/Dezember 2026/)
    expect(monatsName('2026-12', 'en')).toMatch(/December 2026/)
  })

  it('gibt Unsinn unveraendert zurueck', () => {
    expect(monatsName('2026-13', 'de')).toBe('2026-13')
    expect(monatsName('quatsch', 'de')).toBe('quatsch')
  })
})

/**
 * Audit 11/2026, GRD-16/TEC-03/EXM-01: „heute" war der UTC-Tag. Die CI laeuft
 * in UTC und haette den Fehler nie gesehen — deshalb setzen diese Faelle die
 * Zeitzone selbst (Node uebernimmt `process.env.TZ` zur Laufzeit) und stellen
 * sie danach zurueck.
 */
describe('lokalerTag / lokalIso in Europe/Vienna', () => {
  let vorher: string | undefined
  beforeEach(() => {
    vorher = process.env.TZ
    process.env.TZ = 'Europe/Vienna'
  })
  afterEach(() => {
    if (vorher === undefined) delete process.env.TZ
    else process.env.TZ = vorher
  })

  it('00:30 Winterzeit ist schon der neue Tag, nicht der UTC-Vortag', () => {
    const ts = Date.UTC(2026, 10, 1, 23, 30)
    expect(new Date(ts).toISOString().slice(0, 10)).toBe('2026-11-01') // die alte, falsche Lesart
    expect(lokalerTag(ts)).toBe('2026-11-02')
  })

  it('00:30 Sommerzeit ebenso — dort reicht das Fenster bis 02:00', () => {
    expect(lokalerTag(Date.UTC(2026, 6, 1, 22, 30))).toBe('2026-07-02')
  })

  it('fuehrt einstellige Monate und Tage mit Null', () => {
    expect(lokalerTag(new Date(2026, 0, 5, 12).getTime())).toBe('2026-01-05')
  })

  it('lokalIso traegt den Versatz und den lokalen Tag', () => {
    const winter = Date.UTC(2026, 10, 1, 23, 30, 5)
    expect(lokalIso(winter)).toBe('2026-11-02T00:30:05+01:00')
    expect(lokalIso(winter).slice(0, 10)).toBe('2026-11-02')
    expect(lokalIso(Date.UTC(2026, 6, 1, 22, 30))).toBe('2026-07-02T00:30:00+02:00')
  })

  it('lokalIso bezeichnet denselben Zeitpunkt wie der UTC-Stempel', () => {
    const ts = Date.UTC(2026, 10, 1, 23, 30, 5)
    expect(Date.parse(lokalIso(ts))).toBe(ts)
  })

  it('lokalIso schreibt westlich von Greenwich einen negativen Versatz', () => {
    process.env.TZ = 'America/St_Johns' // −03:30, halbe Stunde
    expect(lokalIso(Date.UTC(2026, 10, 2, 3, 0))).toBe('2026-11-01T23:30:00-03:30')
  })
})
