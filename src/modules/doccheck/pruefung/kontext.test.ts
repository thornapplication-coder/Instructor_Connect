import { describe, expect, it } from 'vitest'
import { LEERE_LENKUNG, type Rohdokument } from '../parse/model'
import { absaetze, befund, fundstelle, kurz, MAX_FUNDSTELLEN, REGELN, seiteFinder, seitenName } from './kontext'

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

  it('kurz, fundstelle, befund (Fundstellen gedeckelt)', () => {
    expect(kurz('a'.repeat(200), 10)).toBe(`${'a'.repeat(9)}…`)
    expect(fundstelle({ text: 'x', seite: '1', ort: 'o' })).toEqual({ seite: '1', ort: 'o', auszug: 'x' })
    expect(fundstelle({ text: 'x' })).toEqual({ auszug: 'x' })
    const b = befund({ dokId: 'd', dokName: 'D', roh: roh(), meta: {}, regeln: REGELN }, { quelle: 'formal', pruefpunkt: 'p', kategorie: 'Editorial', prioritaet: 'Low', text: 't', fundstellen: Array.from({ length: 40 }, () => ({ auszug: 'a' })) })
    expect(b.fundstellen).toHaveLength(MAX_FUNDSTELLEN)
    expect(b).toMatchObject({ dokId: 'd', status: 'Open', verifizierung: 'Verified (rule-based)' })
  })
})
