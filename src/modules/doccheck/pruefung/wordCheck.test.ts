import { describe, expect, it } from 'vitest'
import { LEERE_LENKUNG, type Rohdokument, type WordExtrakt } from '../parse/model'
import { stileLesen } from '../parse/wordStile'
import { teilLesen } from '../parse/wordTeil'
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

  it('sauberes Dokument ohne Verzeichnis, Überschrift und Edition: diese Punkte nicht anwendbar, nicht grün', () => {
    // Fachprüfung 01.11.2026: Grün hieß hier „geprüft, in Ordnung", obwohl es nichts zu prüfen gab
    const r = pruefe(roh(word({ absaetze: [{ nr: 0, text: 'The pilot shall check the system and the crew.', ort: 'body', teil: 'word/document.xml', sektion: 1, seiteCa: 1 }] })))
    expect(r.befunde).toEqual([])
    expect(Object.values(r.ampel).every((a) => a === 'ok' || a === 'na')).toBe(true)
    expect(r.ampel).toMatchObject({ editionRevision: 'na', felder: 'na', fragmente: 'na' })
  })

  it('sauberes Dokument MIT Verzeichnis, Überschrift und zwei Editionsangaben: alle Punkte grün', () => {
    const w = word({
      absaetze: [
        { nr: 0, text: '1 General', ort: 'body', teil: 'word/document.xml', sektion: 1, seiteCa: 1, ebene: 1 },
        { nr: 1, text: 'The pilot shall check the system and the crew.', ort: 'body', teil: 'word/document.xml', sektion: 1, seiteCa: 1 },
      ],
      toc: [{ titel: 'A', seite: 2, ebene: 1 }, { titel: 'B', seite: 5, ebene: 1 }],
    })
    const r = wordCheck({ dokId: 'd', dokName: 'D', roh: roh(w), meta: { revision: 'Edition 2' }, regeln: REGELN }, 'TM_E2R0.docx')
    expect(r.befunde).toEqual([])
    expect(Object.entries(r.ampel).filter(([, a]) => a !== 'ok')).toEqual([])
  })

  it('ohne erkennbare Dokumentsprache ist die Korrektursprache nicht anwendbar', () => {
    const r = pruefe(roh(word({ absaetze: [{ nr: 0, text: '12 34 56', ort: 'body', teil: 'word/document.xml', sektion: 1, seiteCa: 1 }] })))
    expect(r.ampel.korrektursprache).toBe('na')
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

describe('Word-Check — Textfeld mit Rahmen (Audit 11/2026, FRD-04)', () => {
  // Durch den echten Leser: Die Rahmenfarbe war vorher als Füllung gewertet.
  const textfeld = (spPr: string, text: string, farbe: string) =>
    teilLesen(`<w:p><w:r><w:drawing><wps:wsp><wps:spPr>${spPr}</wps:spPr><wps:txbx><w:txbxContent><w:p><w:r><w:rPr><w:color w:val="${farbe}"/></w:rPr><w:t>${text}</w:t></w:r></w:p></w:txbxContent></wps:txbx></wps:wsp></w:drawing></w:r></w:p>`, { teil: 'word/document.xml', ort: 'body', stile: stileLesen(''), startNr: 0 })

  it('helle Box mit Rahmen in Schriftfarbe und dunkle Box mit weißem Rahmen: kein „Invisible text"', () => {
    for (const t of [
      textfeld('<a:solidFill><a:srgbClr val="F2F2F2"/></a:solidFill><a:ln w="6350"><a:solidFill><a:srgbClr val="1F3864"/></a:solidFill></a:ln>', 'CONTROLLED COPY', '1F3864'),
      textfeld('<a:solidFill><a:srgbClr val="1F3864"/></a:solidFill><a:ln w="6350"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:ln>', 'WHITE ON NAVY', 'FFFFFF'),
      textfeld('<a:gradFill><a:gsLst><a:gs pos="0"><a:srgbClr val="FFFFFF"/></a:gs></a:gsLst></a:gradFill>', 'ON GRADIENT', 'FFFFFF'),
    ]) {
      expect(pruefe(roh(word({ absaetze: t.absaetze, laeufe: t.laeufe }))).befunde.filter((b) => b.pruefpunkt === 'unsichtbar')).toEqual([])
    }
    // Gegenstück: Füllung wirklich in Schriftfarbe — das bleibt ein Befund
    const echt = textfeld('<a:solidFill><a:srgbClr val="1F3864"/></a:solidFill>', 'HIDDEN', '1F3864')
    expect(pruefe(roh(word({ absaetze: echt.absaetze, laeufe: echt.laeufe }))).befunde.find((b) => b.pruefpunkt === 'unsichtbar')!.fundstellen[0].auszug).toBe('HIDDEN — font colour equals background (1F3864 on 1F3864)')
  })

  it('verborgener Text auf unbestimmbarem Grund nennt den Grund „unknown background"', () => {
    const t = teilLesen('<w:p><w:r><w:drawing><wps:wsp><wps:spPr><a:noFill/></wps:spPr><wps:txbx><w:txbxContent><w:p><w:r><w:rPr><w:vanish/></w:rPr><w:t>gone</w:t></w:r></w:p></w:txbxContent></wps:txbx></wps:wsp></w:drawing></w:r></w:p>', { teil: 'word/document.xml', ort: 'body', stile: stileLesen(''), startNr: 0 })
    expect(pruefe(roh(word({ absaetze: t.absaetze, laeufe: t.laeufe }))).befunde.find((b) => b.pruefpunkt === 'unsichtbar')!.fundstellen[0].auszug).toBe('gone — hidden (vanish) (auto on unknown background)')
  })
})
