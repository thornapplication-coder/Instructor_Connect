import { describe, expect, it } from 'vitest'
import {
  aktuellerStand,
  erinnerungAb,
  faelligeErinnerungen,
  nachSammlung,
  offeneEmpfehlungen,
  plusMonate,
  SANDBOX_DOKUMENTE,
  SANDBOX_EMPFEHLUNGEN,
  SANDBOX_SAMMLUNGEN,
  SANDBOX_STAENDE,
  standLabel,
} from './library'

const t = (iso: string) => Date.parse(`${iso}T08:00:00Z`)

describe('plusMonate', () => {
  it('addiert Monate über den Jahreswechsel', () => {
    expect(new Date(plusMonate(t('2025-11-05'), 12)).toISOString().slice(0, 10)).toBe('2026-11-05')
  })
  it('läuft nicht über das Monatsende hinaus (31.01. + 1 = 28.02.)', () => {
    expect(new Date(plusMonate(t('2026-01-31'), 1)).toISOString().slice(0, 10)).toBe('2026-02-28')
  })
})

describe('Revisionserinnerung (Spez. 6.10)', () => {
  const qrh = SANDBOX_DOKUMENTE.find((d) => d.id === 'd-cl30-qrh')!

  it('fällig nach dem Intervall ab Veröffentlichung', () => {
    expect(erinnerungAb(qrh)).toBe(plusMonate(qrh.veroeffentlicht, 12))
  })

  it('„Stand bestätigt" setzt die Frist zurück', () => {
    const bestaetigt = t('2026-10-30')
    expect(erinnerungAb(qrh, bestaetigt)).toBe(plusMonate(bestaetigt, 12))
    // Eine Bestätigung VOR der Veröffentlichung verlängert nichts.
    expect(erinnerungAb(qrh, t('2020-01-01'))).toBe(plusMonate(qrh.veroeffentlicht, 12))
  })

  it('Sandbox am 01.11.2026: genau die QRH ist fällig, archivierte mahnen nie', () => {
    const faellig = faelligeErinnerungen(SANDBOX_DOKUMENTE, {}, t('2026-11-01'))
    expect(faellig.map((d) => d.id)).toEqual(['d-cl30-qrh'])
  })

  it('Zeitsprung +8 Tage macht den Avionik-Guide zusätzlich fällig', () => {
    const faellig = faelligeErinnerungen(SANDBOX_DOKUMENTE, {}, t('2026-11-09'))
    expect(faellig.map((d) => d.id).sort()).toEqual(['d-cl30-avi', 'd-cl30-qrh'])
  })

  it('bestätigte Dokumente sind nicht mehr fällig', () => {
    expect(faelligeErinnerungen(SANDBOX_DOKUMENTE, { 'd-cl30-qrh': t('2026-11-01') }, t('2026-11-01'))).toEqual([])
  })
})

describe('nachSammlung', () => {
  it('folgt der Sammlungsreihenfolge, innerhalb nach Rang', () => {
    const g = nachSammlung(SANDBOX_DOKUMENTE, SANDBOX_SAMMLUNGEN)
    expect(g.map((x) => x.sammlung.id)).toEqual(['cl30', 'c560', 'easa'])
    expect(g[0].docs.map((d) => d.typ)).toEqual(['AFM', 'QRH', 'AVIONICS'])
  })

  it('leere Sammlungen erscheinen nicht', () => {
    expect(nachSammlung([], SANDBOX_SAMMLUNGEN)).toEqual([])
  })

  it('bei gleichem Rang alphabetisch', () => {
    const [a, b] = SANDBOX_DOKUMENTE.filter((d) => d.sammlung === 'c560')
    const g = nachSammlung([{ ...a, titel: 'B' }, { ...b, titel: 'A' }], SANDBOX_SAMMLUNGEN)
    expect(g[0].docs.map((d) => d.titel)).toEqual(['A', 'B'])
  })
})

describe('Bibliotheksstand', () => {
  it('nimmt den höchsten Stand, unabhängig von der Reihenfolge', () => {
    expect(aktuellerStand([...SANDBOX_STAENDE].reverse())?.nummer).toBe(3)
    expect(aktuellerStand([])).toBeUndefined()
  })

  it('Fußzeile im App-Datumsformat DD.MM.YYYY', () => {
    expect(standLabel(aktuellerStand(SANDBOX_STAENDE))).toBe('Lib 3 · 28.10.2026')
    expect(standLabel(undefined)).toBe('Lib –')
  })
})

describe('Nachprüf-Empfehlungen', () => {
  it('zählt nur offene', () => {
    const alle = [...SANDBOX_EMPFEHLUNGEN, { ...SANDBOX_EMPFEHLUNGEN[0], id: 'r-2', status: 'verworfen' as const }]
    expect(offeneEmpfehlungen(alle).map((e) => e.id)).toEqual(['r-1'])
  })
})

describe('Sandbox-Bestand', () => {
  it('enthält nur synthetische Dokumente (Spez. 19: keine echten OEM-Unterlagen)', () => {
    expect(SANDBOX_DOKUMENTE.every((d) => /synthetic/.test(d.titel) && d.nummer.startsWith('SBX-'))).toBe(true)
  })
})
