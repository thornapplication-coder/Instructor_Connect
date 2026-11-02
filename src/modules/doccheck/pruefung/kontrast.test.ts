import { describe, expect, it } from 'vitest'
import { kontrast, unsichtbar } from './kontrast'

describe('Kontrast und unsichtbarer Text (N4)', () => {
  it('WCAG-Kontrast', () => {
    expect(kontrast('FFFFFF', '000000')).toBeCloseTo(21, 0)
    expect(kontrast('FFFFFF', 'FFFFFF')).toBe(1)
  })

  it('weiß auf weiß und fast-weiß auf weiß sind unsichtbar, weiß auf dunkel nicht', () => {
    expect(unsichtbar({ farbe: 'FFFFFF' }, 'FFFFFF')).toBe('farbe')
    expect(unsichtbar({ farbe: 'F2F2F2' }, 'FFFFFF')).toBe('farbe')
    expect(unsichtbar({ farbe: 'FFFFFF' }, '1F3864')).toBeNull()
    expect(unsichtbar({ farbe: '777777' }, 'FFFFFF')).toBeNull()
  })

  it('unbekannter Hintergrund: kein Farbbefund, Verborgenes bleibt einer (Audit 11/2026, FRD-04)', () => {
    expect(unsichtbar({ farbe: 'FFFFFF' }, undefined)).toBeNull()
    expect(unsichtbar({ vanish: true }, undefined)).toBe('vanish')
  })

  it('„auto" ist nie unsichtbar; verborgen und Kleinstschrift schon', () => {
    expect(unsichtbar({ farbe: 'auto' }, '000000')).toBeNull()
    expect(unsichtbar({}, 'FFFFFF')).toBeNull()
    expect(unsichtbar({ vanish: true, farbe: '000000' }, 'FFFFFF')).toBe('vanish')
    expect(unsichtbar({ groesse: 1.5 }, 'FFFFFF')).toBe('groesse')
    expect(unsichtbar({ groesse: 8 }, 'FFFFFF')).toBeNull()
  })
})
