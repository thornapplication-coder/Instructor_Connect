import { describe, expect, it } from 'vitest'
import { LEERE_LENKUNG, type Rohdokument } from '../parse/model'
import { REGELN } from './kontext'
import { abschnitte, kapitelNummern, kreise, nurVerweis, uebungsNummern, verweiseIn, verweisPruefung, vorhanden } from './verweise'

describe('Verweise erkennen (N7)', () => {
  it('mit Dokument, mit Schlüsselwort, intern mit „see"', () => {
    const v = (s: string) => verweiseIn(s).map((x) => [x.dok ?? '', x.nummer ?? '', x.uebung])
    expect(v('See TM 1.11.2 and APX 5, Chapter 4.')).toEqual([['TM', '1.11.2', false], ['APX 5', '4', false]])
    expect(v('refer to Annex 9 and OMM 3.3.8; Appendix 2A')).toEqual([['Annex 9', '', false], ['OMM', '3.3.8', false], ['Appendix 2A', '', false]])
    expect(v('see 1.4.1.1, chapter 4, exercise 3.8.3.5')).toEqual([['', '1.4.1.1', false], ['', '4', false], ['', '3.8.3.5', true]])
  })

  it('kein Verweis: „see 4" ohne Schlüsselwort, Daten, „tm" klein, Zahl direkt hinter Kürzel ohne Punkt', () => {
    expect(verweiseIn('see 4 pilots; dated 01.11.2026; chapter 2026.1; the tm unit; ANX 2B 16 hours')).toEqual([expect.objectContaining({ dok: 'ANX 2B' })])
    expect(verweiseIn('ANX 2B 16 hours')[0].nummer).toBeUndefined()
  })
})

describe('Ziele', () => {
  const pages = [{ index: 1, text: '1 General\n1.4.1.1 The PIC shall …\nRev 01.11.2026 text\n3.8.3.5 | Steep turns\n3.8.3.6 | Stalls\n2.1 | kein Kapitel' }]
  it('Kapitel aus Gliederung und nummerierten Absätzen; Übungen aus Tabellen', () => {
    expect([...kapitelNummern(pages, [{ titel: '1 General' }, { titel: 'Annex' }])].sort()).toEqual(['1', '1.4.1.1'])
    expect([...uebungsNummern(pages)]).toEqual(['3.8.3.5', '3.8.3.6'])
    expect(vorhanden('1.4', new Set(['1.4.1.1']), new Set())).toBe(true)
    expect(vorhanden('1.5', new Set(['1.4']), new Set(['1.5.1']))).toBe(false)
    expect(vorhanden('3.8.3.5', new Set(), new Set(['3.8.3.5']))).toBe(true)
  })

  it('Abschnitte, „nur Verweis", Kreise', () => {
    const a = abschnitte([{ index: 1, text: 'Vorwort\n1 A\nSee 2.1.\n2.1 B\nSee 1.1.\nNo heading\n' }], [{ titel: '1 A' }, { titel: '2.1 B' }, { titel: 'Annex' }])
    expect(a).toEqual([{ nummer: '1', titel: '1 A', text: 'See 2.1.\n' }, { nummer: '2.1', titel: '2.1 B', text: 'See 1.1.\nNo heading\n' }])
    expect(nurVerweis(a[0])?.nummer).toBe('2.1')
    expect(nurVerweis({ nummer: '1', titel: '', text: 'See 2.1 and see 3.1.' })).toBeNull()
    expect(nurVerweis({ nummer: '1', titel: '', text: `${'word '.repeat(30)}see 2.1` })).toBeNull()
    expect(kreise(new Map([['a', 'b'], ['b', 'a'], ['c', 'a'], ['d', 'e']]))).toEqual([['a', 'b']])
  })
})

describe('Prüfung je Dokument', () => {
  const roh = (text: string, outline: { titel: string; ebene: number; vonSeite: number }[] = []): Rohdokument => ({ format: 'docx', pages: [{ index: 1, text }], outline, lenkung: LEERE_LENKUNG, ocrKandidaten: [], tabellen: 0 })
  const k = (r: Rohdokument) => ({ dokId: 'd', dokName: 'D', roh: r, meta: {}, regeln: REGELN })

  it('Übungsverweise gegen die eigene Liste; Kapitelverweise bleiben der Formalprüfung', () => {
    const r = verweisPruefung(k(roh('3.8.3.5 | Steep turns\nPractise exercise 3.8.3.9 and exercise 3.8.3.5. See chapter 9. Refer to APX 5, exercise 1.1.1.')))
    expect(r.befunde.map((b) => b.text)).toEqual(['Reference to exercise 3.8.3.9 — no such exercise in the reference list of this document.'])
    expect(r.ampel).toEqual({ uebung: 'wait', zirkel: 'na' })
  })

  it('Zirkel im Dokument; ohne Liste und Gliederung nicht anwendbar', () => {
    const o = [{ titel: '1 A', ebene: 1, vonSeite: 1 }, { titel: '2 B', ebene: 1, vonSeite: 1 }]
    const r = verweisPruefung(k(roh('1 A\nSee chapter 2.\n2 B\nSee chapter 1.', o)))
    expect(r.befunde).toEqual([expect.objectContaining({ pruefpunkt: 'zirkel', text: 'Circular reference without content: 1 → 2 → 1.' })])
    expect(verweisPruefung(k(roh('nichts'))).ampel).toEqual({ uebung: 'na', zirkel: 'na' })
  })
})
