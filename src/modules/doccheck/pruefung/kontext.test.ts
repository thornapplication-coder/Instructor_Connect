import { describe, expect, it } from 'vitest'
import { abschnittsPfade } from '../parse/gliederung'
import { LEERE_LENKUNG, type Rohdokument, type WortAbsatz } from '../parse/model'
import { abkuerzungenIn, absaetze, befund, fundstelle, kurz, MAX_FUNDSTELLEN, REGELN, seiteFinder, seitenKapitel, seitenName, teilOrt, verwendeteAbkuerzungen, wortKapitel } from './kontext'

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

/**
 * Bis 11/2026 trug keine Fundstelle ein Kapitel: Unter „Chapter / Section"
 * stand im Export meist nichts, sonst „Table row 2, column 3" oder
 * „docProps/core.xml" (Audit 11/2026, Nachtrag TXT#1).
 */
describe('Kapitel der Fundstelle: letzte Überschrift VOR ihr (Audit 11/2026, Nachtrag TXT#1)', () => {
  const a = (nr: number, text: string, extra: Partial<WortAbsatz> = {}): WortAbsatz => ({ nr, text, ort: 'body', teil: 'word/document.xml', sektion: 1, seiteCa: 1, ...extra })

  it('DOCX: Gliederungsebene der Vorlage, nicht Verzeichnis; Kopf-/Fußzeile und Fußnote ohne Kapitel', () => {
    const alle = [
      a(0, 'Training Manual'),
      // Verzeichniseintrag — auch mit Ebene kein Kapitel
      a(1, '2 Scope 3', { toc: 1, ebene: 1 }),
      a(2, '1  General', { ebene: 1 }),
      a(3, 'Text', { tabelle: { zeile: 0, spalte: 1 } }),
      a(4, 'Box', { ort: 'textfeld' }),
      a(5, 'Kopf', { ort: 'kopf', teil: 'word/header1.xml' }),
      a(6, '2 Scope', { ebene: 1 }),
      a(7, 'Mehr'),
      // Fußnoten stehen im Extrakt am Ende, ihr Anker ist unbekannt — nicht das letzte Kapitel raten
      a(8, 'Note', { ort: 'fussnote', teil: 'word/footnotes.xml' }),
      a(9, 'X'.repeat(300), { ebene: 2 }),
    ]
    const k = wortKapitel(alle)
    expect(k.slice(0, 9)).toEqual([undefined, undefined, '1 General', '1 General', '1 General', undefined, '2 Scope', '2 Scope', undefined])
    // Eine falsch formatierte „Überschrift" kann ein ganzer Absatz sein
    expect(k[9]!.length).toBeLessThanOrEqual(100)
    expect(k[9]!.endsWith('…')).toBe(true)
  })

  it('DOCX ohne Umbruchmarken (eine Seite): je Absatz das eigene Kapitel, nicht das letzte der Seite', () => {
    const r = roh({
      format: 'docx',
      pages: [{ index: 1, label: 'ca. 1', text: '1 General\nThe XXX limits.\n2 Fuel\nReserve TBD.', sectionPath: ['2 Fuel'] }],
      outline: [{ titel: '1 General', ebene: 1, vonSeite: 1 }, { titel: '2 Fuel', ebene: 1, vonSeite: 1 }],
      word: { absaetze: [a(0, '1 General', { ebene: 1 }), a(1, 'The XXX limits.'), a(2, '2 Fuel', { ebene: 1 }), a(3, 'Reserve TBD.'), a(4, 'Rev 2', { ort: 'kopf', teil: 'word/header1.xml' })], laeufe: [], abschnitte: [], verwaisteKopfFuss: [], standard: {}, eigenschaften: {}, toc: [] },
    })
    const w = absaetze(r)
    expect(w.map((x) => [x.text, x.kapitel, x.ort])).toEqual([
      ['1 General', '1 General', undefined],
      ['The XXX limits.', '1 General', undefined],
      ['2 Fuel', '2 Fuel', undefined],
      ['Reserve TBD.', '2 Fuel', undefined],
      ['Rev 2', undefined, 'Header (header1.xml)'],
    ])
    expect(fundstelle(w[1])).toEqual({ seite: 'ca. 1', kapitel: '1 General', auszug: 'The XXX limits.' })
    // Am Seitentext (Rechenprüfung) dieselben Überschriften
    expect(seitenKapitel(r)).toEqual([['1 General', '1 General', '2 Fuel', '2 Fuel']])
  })

  it('PDF: Gliederung des Seitentexts, über Seitengrenzen fort; Verzeichniseinträge mit Punktlinie sind kein Kapitel', () => {
    const texte = ['Contents\n1 General ........ 2\n2 Fuel ........ 3\nForeword text', '1 General\nText A\n2 Fuel', 'Text C']
    // Die Gliederung entsteht wie beim Lesen — sie führt die Verzeichniseinträge mit
    const { outline } = abschnittsPfade(texte)
    expect(outline.map((o) => o.titel)).toContain('1 General ........ 2')
    const r = roh({ pages: texte.map((text, i) => ({ index: i + 1, text })), outline })
    expect(absaetze(r).map((x) => [x.text, x.kapitel])).toEqual([
      ['Contents', undefined],
      ['1 General ........ 2', undefined],
      ['2 Fuel ........ 3', undefined],
      ['Foreword text', undefined],
      ['1 General', '1 General'],
      ['Text A', '1 General'],
      ['2 Fuel', '2 Fuel'],
      ['Text C', '2 Fuel'],
    ])
  })

  it('XLSX: Blätter haben kein Kapitel, ihr Ort ist das Blatt; ohne Gliederung kein Kapitel', () => {
    const x = roh({ format: 'xlsx', pages: [{ index: 1, label: 'Hours', text: '1 General\nA | 1' }], outline: [{ titel: '1 General', ebene: 1, vonSeite: 1 }] })
    expect(absaetze(x).map((z) => [z.kapitel, z.ort])).toEqual([[undefined, 'Sheet Hours'], [undefined, 'Sheet Hours']])
    expect(seitenKapitel(x)).toEqual([[undefined, undefined]])
    expect(seitenKapitel({ format: 'docx', pages: [{ index: 1, text: '1 General\nA' }] })).toEqual([[undefined, undefined]])
  })

  it('Kopf-/Fußzeile: wie Word sie nennt, der ZIP-Teil nur in Klammern', () => {
    expect(teilOrt('word/footer1.xml')).toBe('Footer (footer1.xml)')
    expect(teilOrt('word/header9.xml')).toBe('Header (header9.xml)')
    expect(teilOrt('word/header2.xml', 'first')).toBe('first-page header (header2.xml)')
    expect(teilOrt('word/footer3.xml', 'even')).toBe('even-page footer (footer3.xml)')
    expect(teilOrt('word/footer1.xml', 'default')).toBe('default footer (footer1.xml)')
  })
})
