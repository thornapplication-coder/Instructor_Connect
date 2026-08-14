import { describe, expect, it } from 'vitest'
import { formatDate, formatDateTime, monatsName } from './datum'

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
