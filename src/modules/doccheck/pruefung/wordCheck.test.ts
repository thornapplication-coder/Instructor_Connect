import { describe, expect, it } from 'vitest'
import { LEERE_LENKUNG, type Rohdokument, type WordExtrakt } from '../parse/model'
import { REGELN } from './kontext'
import { ausDateiname, editionVon, WORD_PUNKTE, wordCheck } from './wordCheck'

const word = (w: Partial<WordExtrakt>): WordExtrakt => ({ absaetze: [], laeufe: [], abschnitte: [], verwaisteKopfFuss: [], standard: {}, eigenschaften: { title: 'T' }, toc: [], ...w })
const roh = (w?: WordExtrakt): Rohdokument => ({ format: w ? 'docx' : 'pdf', pages: [{ index: 1, text: 'The pilot shall check the system and the crew.' }], outline: [], lenkung: LEERE_LENKUNG, ocrKandidaten: [], tabellen: 0, ...(w ? { word: w } : {}) })
const pruefe = (r: Rohdokument, name = 'x.docx', titel?: string) => wordCheck({ dokId: 'd', dokName: 'D', roh: r, meta: { titel }, regeln: REGELN }, name)

describe('Word-Check — Bausteine', () => {
  it('Edition/Revision aus Dateiname und Text', () => {
    expect(ausDateiname('TM_E2R0.0.docx')).toEqual({ edition: 2, revision: '0.0' })
    expect(ausDateiname('TM e1-r3.docx')).toEqual({ edition: 1, revision: '3' })
    expect(ausDateiname('TM.docx')).toEqual({})
    expect(editionVon('Edition 3')).toBe(3)
    expect(editionVon('Ed. 4')).toBe(4)
    expect(editionVon(undefined)).toBeUndefined()
  })

  it('ohne Word-Extrakt (PDF/XLSX) ist alles nicht anwendbar', () => {
    const r = pruefe(roh())
    expect(r.befunde).toEqual([])
    expect(Object.values(r.ampel).every((a) => a === 'na')).toBe(true)
    expect(Object.keys(r.ampel)).toEqual([...WORD_PUNKTE])
  })

  it('sauberes Dokument: alle Punkte grün', () => {
    const r = pruefe(roh(word({ absaetze: [{ nr: 0, text: 'The pilot shall check the system and the crew.', ort: 'body', teil: 'word/document.xml', sektion: 1, seiteCa: 1 }] })))
    expect(r.befunde).toEqual([])
    expect(Object.values(r.ampel).every((a) => a === 'ok')).toBe(true)
  })

  it('abweichender Titel, unplausibles Inhaltsverzeichnis, Standardsprache, nur verwaiste Kopfzeile', () => {
    const r = pruefe(
      roh(
        word({
          eigenschaften: { title: 'Old title' },
          standard: { sprache: 'de-AT' },
          absaetze: [{ nr: 0, text: 'The pilot shall check the system and the crew.', ort: 'body', teil: 'word/document.xml', sektion: 1, seiteCa: 1 }],
          toc: [{ titel: 'A', seite: 5, ebene: 1 }, { titel: 'B', seite: 2, ebene: 1 }],
          verwaisteKopfFuss: ['word/header9.xml'],
        }),
      ),
      'x.docx',
      'New title',
    )
    const p = Object.fromEntries(r.befunde.map((b) => [b.pruefpunkt, b]))
    expect(p.eigenschaften.fundstellen[0].auszug).toContain('differs from cover')
    expect(p.felder.prioritaet).toBe('Low')
    expect(p.korrektursprache.text).toContain('default style is set to de-AT')
    expect(p.kopfFuss).toMatchObject({ prioritaet: 'Low' })
    expect(p.kopfFuss.text).toContain('Unused')
  })

  it('Textmarker ohne Platzhalter ist Niedrig; Kopfzeilen-Edition gegen Deckblatt', () => {
    const r = pruefe(
      roh(
        word({
          absaetze: [{ nr: 0, text: 'note', ort: 'body', teil: 'word/document.xml', sektion: 1, seiteCa: 1 }, { nr: 1, text: 'Edition 3', ort: 'kopf', teil: 'word/header1.xml', sektion: 1, seiteCa: 1 }],
          laeufe: [{ absatz: 0, text: 'note', eigenschaften: { markierung: 'yellow' }, hintergrund: 'FFFFFF' }],
          abschnitte: [{ nr: 1, kopf: [{ typ: 'default', teil: 'word/header1.xml', text: 'Edition 3' }], fuss: [] }],
        }),
      ),
    )
    expect(r.befunde.find((b) => b.pruefpunkt === 'markierung')!.prioritaet).toBe('Low')
    const zweiter = wordCheck({ dokId: 'd', dokName: 'D', roh: roh(word({ abschnitte: [{ nr: 1, kopf: [{ typ: 'default', teil: 'word/header1.xml', text: 'Edition 3' }], fuss: [] }] })), meta: { revision: 'Edition 2' }, regeln: REGELN }, 'x.docx')
    expect(zweiter.befunde.find((b) => b.pruefpunkt === 'editionRevision')!.fundstellen[0].auszug).toBe('Edition 3, cover: Edition 2')
  })
})
