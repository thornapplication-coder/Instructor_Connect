import { describe, expect, it } from 'vitest'
import { zahl } from './zahl'

describe('zahl — Tausendertrennung nach Oberflächensprache (Audit 11/2026, TXT-17)', () => {
  it('Englisch mit Komma, wie das englische Sprachpaket („3,000 pages")', () => {
    expect(zahl(1490, 'en')).toBe('1,490')
    expect(zahl(16000, 'en')).toBe('16,000')
  })

  it('Deutsch ohne Komma als Tausendertrenner — vorher galt das auch in der englischen Oberfläche', () => {
    expect(zahl(1490, 'de')).not.toContain(',')
    expect(zahl(1490, 'de')).toMatch(/^1\s490$/)
    // Regionale Kennung zählt wie die Sprache
    expect(zahl(1490, 'de-AT')).toBe(zahl(1490, 'de'))
    // Dezimalzeichen folgt der Sprache ebenfalls
    expect(zahl(1.5, 'de')).toBe('1,5')
    expect(zahl(1.5, 'en')).toBe('1.5')
  })

  it('kleine Zahlen bleiben unverändert', () => {
    expect(zahl(12, 'de')).toBe('12')
    expect(zahl(12, 'en')).toBe('12')
  })
})
