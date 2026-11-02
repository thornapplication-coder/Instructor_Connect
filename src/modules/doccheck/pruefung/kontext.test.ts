import { describe, expect, it } from 'vitest'
import { LEERE_LENKUNG, type Rohdokument } from '../parse/model'
import { abkuerzungenIn, absaetze, befund, fundstelle, kurz, MAX_FUNDSTELLEN, REGELN, seiteFinder, seitenName, verwendeteAbkuerzungen } from './kontext'

const roh = (extra: Partial<Rohdokument> = {}): Rohdokument => ({ format: 'pdf', pages: [{ index: 1, text: 'Erste Zeile\nZweite Zeile' }, { index: 2, label: 'P-2', text: 'Battery limits apply' }], outline: [], lenkung: LEERE_LENKUNG, ocrKandidaten: [], tabellen: 0, ...extra })

describe('Prüfkontext', () => {
  it('Seitenname: gedruckt, sonst Nummer; Fundstelle über Vergleichsform', () => {
    expect(seitenName({ index: 3 })).toBe('3')
    expect(seitenName({ index: 3, label: 'A-1' })).toBe('A-1')
    const f = seiteFinder(roh())
    expect(f('battery  LIMITS')).toBe('P-2')
    expect(f('ab')).toBeUndefined()
    expect(f('gibt es nicht')).toBeUndefined()
  })

  it('Absätze: PDF zeilenweise, XLSX mit Blatt, DOCX mit Ort', () => {
    expect(absaetze(roh()).map((a) => [a.text, a.seite])).toEqual([['Erste Zeile', '1'], ['Zweite Zeile', '1'], ['Battery limits apply', 'P-2']])
    expect(absaetze(roh({ format: 'xlsx', pages: [{ index: 1, label: 'Blatt', text: 'A | B' }] }))[0].ort).toBe('Sheet Blatt')
    const w = absaetze(roh({
      word: {
        absaetze: [
          { nr: 0, text: 'Battery limits apply', ort: 'body', teil: 'word/document.xml', sektion: 1, seiteCa: 1, tabelle: { zeile: 0, spalte: 1 } },
          { nr: 1, text: 'Kopf', ort: 'kopf', teil: 'word/header1.xml', sektion: 1, seiteCa: 1 },
          { nr: 2, text: 'Fuss', ort: 'fuss', teil: 'word/footer1.xml', sektion: 1, seiteCa: 1 },
          { nr: 3, text: 'Box', ort: 'textfeld', teil: 'word/document.xml', sektion: 1, seiteCa: 1 },
          { nr: 4, text: '  ', ort: 'body', teil: 'word/document.xml', sektion: 1, seiteCa: 1 },
        ],
        laeufe: [], abschnitte: [], verwaisteKopfFuss: [], standard: {}, eigenschaften: {}, toc: [],
      },
    }))
    expect(w.map((a) => [a.ort, a.seite])).toEqual([['Table row 1, column 2', 'P-2'], ['Header (header1.xml)', undefined], ['Footer (footer1.xml)', undefined], ['Text box', undefined]])
  })

  it('DOCX-Zellen tragen Tabellenort, Vorlage und die erste Zelle ihrer Zeile', () => {
    const z = (nr: number, text: string, zeile: number, spalte: number, extra = {}) => ({ nr, text, ort: 'body' as const, teil: 'word/document.xml', sektion: 1, seiteCa: 1, tabelle: { zeile, spalte }, ...extra })
    const w = absaetze(roh({
      word: {
        absaetze: [
          z(0, 'SERA', 0, 0), z(1, 'Standardised European Rules of the Air', 0, 1), z(2, 'note', 0, 2),
          // Erste Zelle leer: kein Kürzel
          z(3, ' ', 1, 0), z(4, 'Leer davor', 1, 1),
          { nr: 5, text: 'Table 1 Limits', ort: 'body', teil: 'word/document.xml', sektion: 1, seiteCa: 1, stilName: 'caption' },
        ],
        laeufe: [], abschnitte: [], verwaisteKopfFuss: [], standard: {}, eigenschaften: {}, toc: [],
      },
    }))
    expect(w.map((a) => [a.text, a.inTabelle, a.ersteZelle, a.stilName])).toEqual([
      ['SERA', true, undefined, undefined],
      ['Standardised European Rules of the Air', true, 'SERA', undefined],
      ['note', true, 'SERA', undefined],
      ['Leer davor', true, undefined, undefined],
      ['Table 1 Limits', undefined, undefined, 'caption'],
    ])
  })

  it('Abkürzungen: Hinweiswörter und Regelkennungen zählen nicht (Audit 11/2026, FRD-16)', () => {
    expect(abkuerzungenIn('NOTE: This manual does not replace the OM. Do NOT taxi; CAUTION and WARNING apply.')).toEqual(['OM'])
    // Platzhalter meldet die Restprüfung — nicht noch einmal als Kürzel
    expect(abkuerzungenIn('Criteria TBD, phone XXX, see the MEL.')).toEqual(['MEL'])
    // „AMC1 FCL.930.FI" und „FCL.905.FI": vorher blieb nach dem CAS-Filter „FI" übrig
    expect(abkuerzungenIn('in accordance with FCL.930.FI and AMC1 FCL.930.FI, see FCL.905.FI. The FI and the HT sign.')).toEqual(['FI', 'HT'])
    // Einheiten, Kennungsteile und CAS-Meldungen wie bisher
    expect(abkuerzungenIn('Use the AFM at 120 KIAS. Device SBX-REF-01. BATT 1 OFF BUS.')).toEqual(['AFM'])
    expect([...verwendeteAbkuerzungen(roh({ pages: [{ index: 1, text: 'NOTE: AFM' }, { index: 2, label: 'P-2', text: 'QRH and AFM' }] }), new Set([0]))]).toEqual([['QRH', 'P-2'], ['AFM', 'P-2']])
  })

  it('kurz, fundstelle, befund (Fundstellen gedeckelt)', () => {
    expect(kurz('a'.repeat(200), 10)).toBe(`${'a'.repeat(9)}…`)
    expect(fundstelle({ text: 'x', seite: '1', ort: 'o' })).toEqual({ seite: '1', ort: 'o', auszug: 'x' })
    expect(fundstelle({ text: 'x' })).toEqual({ auszug: 'x' })
    const b = befund({ dokId: 'd', dokName: 'D', roh: roh(), meta: {}, regeln: REGELN }, { quelle: 'formal', pruefpunkt: 'p', kategorie: 'Editorial', prioritaet: 'Low', text: 't', fundstellen: Array.from({ length: 40 }, () => ({ auszug: 'a' })), anleitung: 'reste' })
    expect(b.fundstellen).toHaveLength(MAX_FUNDSTELLEN)
    // Die Handlungsanweisung geht unverändert durch — sie ist die „Proposed Correction" (Audit 11/2026, EXP-06)
    expect(b).toMatchObject({ dokId: 'd', status: 'Open', verifizierung: 'Verified (rule-based)', anleitung: 'reste' })
  })
})
