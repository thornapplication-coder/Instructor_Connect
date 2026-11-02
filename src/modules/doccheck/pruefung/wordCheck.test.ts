import { describe, expect, it } from 'vitest'
import { LEERE_LENKUNG, type Rohdokument, type WordExtrakt } from '../parse/model'
import { stileLesen } from '../parse/wordStile'
import { teilLesen } from '../parse/wordTeil'
import { REGELN } from './kontext'
import { ausDateiname, editionVon, kopfFussVarianten, revisionVon, WORD_PUNKTE, wordCheck } from './wordCheck'

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
    // Einzahl ohne „(s)" (Audit 11/2026, TXT-07)
    expect(r.befunde.find((b) => b.pruefpunkt === 'markierung')!.text).toBe('[Word check] 1 highlighted passage.')
    const zweiter = wordCheck({ dokId: 'd', dokName: 'D', roh: roh(word({ abschnitte: [{ nr: 1, kopf: [{ typ: 'default', teil: 'word/header1.xml', text: 'Edition 3' }], fuss: [] }] })), meta: { revision: 'Edition 2' }, regeln: REGELN }, 'x.docx')
    expect(zweiter.befunde.find((b) => b.pruefpunkt === 'editionRevision')!.fundstellen[0].auszug).toBe('Edition 3, cover: Edition 2')
  })
})

describe('Word-Check — Kopf-/Fußzeilen je Merkmal (Audit 11/2026, FRD-09)', () => {
  type Teil = WordExtrakt['abschnitte'][number]['kopf'][number]
  const teil = (teilName: string, text: string): Teil => ({ typ: 'default', teil: `word/${teilName}`, text })
  const abschnitt = (nr: number, kopf: Teil[], fuss: Teil[]) => ({ nr, kopf, fuss })
  const kf = (abschnitte: WordExtrakt['abschnitte']) => pruefe(roh(word({ abschnitte }))).befunde.filter((b) => b.pruefpunkt === 'kopfFuss')

  it('Revision im Kopf, Datum im Fuß: kein Befund — vorher „2 variants"', () => {
    expect(kf([abschnitt(1, [teil('header1.xml', 'Revision 2')], [teil('footer1.xml', '15.03.2026')])])).toEqual([])
    // wie im Prüferdokument: Edition und Revision oben, ISO-Datum unten, über zwei Abschnitte
    const oben = teil('header1.xml', 'Edition 1 Revision 2 | 1')
    const unten = teil('footer1.xml', '2026-03-15')
    expect(kf([abschnitt(1, [oben], [unten]), abschnitt(2, [oben], [unten])])).toEqual([])
    // „Rev 2" und „Revision 02" sind dieselbe Revision
    expect(kf([abschnitt(1, [teil('header1.xml', 'Rev 2')], []), abschnitt(2, [teil('header2.xml', 'Revision 02')], [])])).toEqual([])
  })

  it('zwei Abschnitte mit verschiedenem Fußdatum → Medium; die Fundstelle nennt das Merkmal', () => {
    const b = kf([abschnitt(1, [], [teil('footer1.xml', '15.03.2026')]), abschnitt(2, [], [teil('footer2.xml', '01.01.2025')])])
    expect(b.map((x) => [x.prioritaet, x.text])).toEqual([['Medium', '[Word check] Headers/footers differ between sections (date 2026-03-15 / 2025-01-01), including sections that are not visible.']])
    // Ohne Mehrheit stehen beide da
    expect(b[0].fundstellen.map((f) => [f.ort, f.auszug])).toEqual([
      ['Section 1, footer1.xml (default)', '15.03.2026 → date 2026-03-15'],
      ['Section 2, footer2.xml (default)', '01.01.2025 → date 2025-01-01'],
    ])
  })

  it('mit Mehrheit: nur der Abweichler, mit dem Wert der anderen', () => {
    const fuss = teil('footer1.xml', 'Rev 3 | 15.03.2026')
    const b = kf([abschnitt(1, [], [fuss]), abschnitt(2, [], [fuss]), abschnitt(3, [], [teil('footer3.xml', 'Rev 2 | 15.03.2026')])])
    expect(b[0].fundstellen.map((f) => f.auszug)).toEqual(['Rev 2 | 15.03.2026 → revision 2 (other sections: 3)'])
  })

  it('Bausteine: Revision ohne Edition; nur Merkmale mit mehr als einem Wert', () => {
    expect([revisionVon('Edition 1 Revision 2'), revisionVon('Rev. 0.1'), revisionVon('Edition 3'), revisionVon('Revised procedures'), revisionVon('Rev 2A')]).toEqual(['2', '0.1', undefined, undefined, '2A'])
    const v = kopfFussVarianten([{ text: 'Edition 1 | 01.03.2026' }, { text: 'Edition 2 | 01.03.2026' }, { text: 'Revision 4' }])
    expect([...v.keys()]).toEqual(['edition'])
  })
})

describe('Word-Check — Befundtexte in Einzahl und Mehrzahl (Audit 11/2026, TXT-07)', () => {
  it('Textmarker auf Platzhaltern, noProof, unsichtbarer Text: kein „(s)", keine falsche Kongruenz', () => {
    const lauf = (absatz: number, text: string, eigenschaften: WordExtrakt['laeufe'][number]['eigenschaften']) => ({ absatz, text, eigenschaften, hintergrund: 'FFFFFF' })
    const absaetze = [0, 1, 2].map((nr) => ({ nr, text: `Text ${nr} [TBD]`, ort: 'body' as const, teil: 'word/document.xml', sektion: 1, seiteCa: 1 }))
    const texte = (laeufe: WordExtrakt['laeufe']) => Object.fromEntries(pruefe(roh(word({ absaetze, laeufe }))).befunde.map((b) => [b.pruefpunkt, b.text]))
    expect(texte([lauf(0, '[TBD]', { markierung: 'yellow', noProof: true, vanish: true })])).toMatchObject({
      markierung: '[Word check] 1 highlighted passage, on a placeholder.',
      noProof: '[Word check] "Do not check spelling or grammar" is set on 1 run (5 characters). Word reports no errors there.',
      unsichtbar: '[Word check] Invisible text in 1 place: content is part of the submitted file but not visible on screen or in print.',
    })
    const drei = texte([lauf(0, '[TBD]', { markierung: 'yellow' }), lauf(1, 'Text', { markierung: 'yellow' }), lauf(2, 'more', { markierung: 'yellow' })])
    expect(drei.markierung).toBe('[Word check] 3 highlighted passages, 1 of them on a placeholder.')
    expect(texte([lauf(0, '[TBD]', { markierung: 'yellow' }), lauf(1, '[TBC]', { markierung: 'yellow' })]).markierung).toBe('[Word check] 2 highlighted passages, 2 of them on placeholders.')
  })
})

describe('Word-Check — Fragmente vor dem ersten Kapitel (Audit 11/2026, FRD-10)', () => {
  const absatz = (nr: number, text: string, extra: Partial<WordExtrakt['absaetze'][number]> = {}): WordExtrakt['absaetze'][number] => ({ nr, text, ort: 'body', teil: 'word/document.xml', sektion: 1, seiteCa: 1, ...extra })
  // Lenkungstabelle des Deckblatts: Beschriftung | Wert
  const lenkung = [['Edition', '1'], ['Revision', '2'], ['Effective date', '15.03.2026']].flatMap(([a, b], zeile) => [absatz(zeile * 2, a, { tabelle: { zeile, spalte: 0 } }), absatz(zeile * 2 + 1, b, { tabelle: { zeile, spalte: 1 } })])
  const fragmente = (davor: WordExtrakt['absaetze']) => {
    const r = pruefe(roh(word({ absaetze: [...davor, absatz(20, '1 General', { ebene: 1 }), absatz(21, 'The pilot shall check the system and the crew.')] })))
    return { befunde: r.befunde.filter((b) => b.pruefpunkt === 'fragmente'), ampel: r.ampel.fragmente }
  }

  it('Werte der Lenkungstabelle sind kein Fragment — vorher „3 stray fragment(s)"', () => {
    expect(fragmente(lenkung)).toEqual({ befunde: [], ampel: 'ok' })
  })

  it('ein einzelner Absatz „3.8.3." vor Kapitel 1 bleibt Medium, die Tabelle daneben nicht', () => {
    const r = fragmente([...lenkung, absatz(10, '3.8.3.')])
    expect(r.befunde.map((b) => [b.prioritaet, b.text, b.fundstellen.map((f) => f.auszug)])).toEqual([['Medium', '[Word check] 1 stray fragment before the first chapter (cover/title page).', ['3.8.3.']]])
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
