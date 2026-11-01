import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { xlsxTabellen } from '../parse/xlsx'
import { befundeLesen, kopfzeileFinden, zielVorschlagen, zuordnungVorschlagen } from '../recheck/fremdliste'
import { remark } from '../recheck/pruefen'
import { Kern } from '../kern'
import { docxLesen } from '../parse/docx'
import { dateiLesen } from '../parse/lesen'
import type { PdfJs } from '../parse/pdf'
import { pdfBauen } from '../parse/pdfBauen'
import { absatz, lauf, SBX_FL_01, SBX_FL_01_KOPF, SBX_WORD_01_NAME, sbxFl01, sbxPage01, sbxPkg01, sbxWord01, umbrechen } from './sbx'

const standardFontDataUrl = fileURLToPath(new URL('../../../../node_modules/pdfjs-dist/standard_fonts/', import.meta.url))
const kern = () => new Kern({ pdfjs: async () => pdfjs as unknown as PdfJs, standardFontDataUrl })

describe('Abnahme Phase 2 (Nachtrag Kap. 19): Run-Eigenschaften von SBX-WORD-01 vollständig im Extrakt', async () => {
  const roh = await docxLesen(await sbxWord01())
  const w = roh.word!
  const lauf = (text: string) => w.laeufe.find((l) => l.text.includes(text))!

  it('weiß auf weiß in Tabellenzelle OHNE Schattierung: Farbe weiß, wirksamer Hintergrund weiß (Befund)', () => {
    expect(lauf('internal note')).toMatchObject({ eigenschaften: { farbe: 'FFFFFF' }, hintergrund: 'FFFFFF' })
  })

  it('weiß in der Kopfzeile einer Tabelle mit dunkler FORMATVORLAGEN-Schattierung: Hintergrund dunkel (kein Befund)', () => {
    expect(lauf('Item')).toMatchObject({ eigenschaften: { farbe: 'FFFFFF', fett: true }, hintergrund: '1F3864' })
    expect(lauf('Value').hintergrund).toBe('1F3864')
    // Datenzeile darunter: kein Band (noHBand), keine Schattierung.
    expect(lauf('VMO').hintergrund).toBe('FFFFFF')
  })

  it('verborgen, Textmarker, Schriftgröße, Sprache, noProof aus der Überschriftenvorlage', () => {
    expect(lauf('hidden remark').eigenschaften.vanish).toBe(true)
    expect(lauf('Visible text').eigenschaften.vanish).toBeUndefined()
    expect(lauf('[TBD]').eigenschaften.markierung).toBe('yellow')
    expect(lauf('Tiny text').eigenschaften.groesse).toBe(1.5)
    expect(lauf('marked as Spanish').eigenschaften.sprache).toBe('es-ES')
    expect(lauf('marked as Italian').eigenschaften.sprache).toBe('it-IT')
    // Dokumentvorgabe greift dort, wo nichts anderes steht.
    expect(lauf('Visible text').eigenschaften).toMatchObject({ sprache: 'en-GB', groesse: 11 })
    expect(lauf('1 General').eigenschaften).toMatchObject({ noProof: true, fett: true })
    expect(w.standard).toEqual({ groesse: 11, sprache: 'en-GB' })
  })

  it('Textfeld auf dem Deckblatt: Hintergrund ist die Füllung der Form, Inhalt nur einmal', () => {
    const tf = w.laeufe.filter((l) => l.text.includes('Doc No.'))
    expect(tf).toHaveLength(1)
    expect(tf[0].hintergrund).toBe('002060')
    expect(w.absaetze.find((a) => a.text.includes('Doc No.'))?.ort).toBe('textfeld')
  })

  it('Abschnitte mit ihren Kopfzeilen — auch der letzte leere mit altem Datum; ungenutzte Kopfzeile als verwaist', () => {
    expect(w.abschnitte.map((a) => a.kopf.map((k) => k.text))).toEqual([
      ['Training Manual | Edition 1 | 01.03.2026'],
      ['Training Manual | Edition 1 | 01.03.2026'],
      ['Training Manual | Edition 1 | 15.01.2025'],
    ])
    expect(w.verwaisteKopfFuss).toEqual(['word/header3.xml'])
    expect(w.absaetze.filter((a) => a.ort === 'kopf').map((a) => a.text)).toContain('Old draft header 2024')
  })

  it('Deckblatt-Fragment vor dem ersten Kapitel, Eigenschaften, Kompatibilitätsmodus', () => {
    const erstesKapitel = w.absaetze.findIndex((a) => a.ebene === 1)
    expect(w.absaetze.slice(0, erstesKapitel).some((a) => a.text === '3.8.3.')).toBe(true)
    expect(w.absaetze[erstesKapitel].stilName).toBe('heading 1')
    expect(w.eigenschaften).toEqual({ title: undefined, creator: 'A. Example', lastModifiedBy: 'B. Example', modified: '2026-03-01T10:00:00Z', seiten: 3 })
    expect(w.kompatibilitaet).toBe(14)
    // Der Dateiname mit E2R0.0 steht für den späteren Abgleich bereit.
    expect(SBX_WORD_01_NAME).toMatch(/E2R0\.0/)
  })

  it('Tabellenposition je Absatz', () => {
    expect(w.absaetze.find((a) => a.text === 'internal note do not submit')?.tabelle).toEqual({ zeile: 1, spalte: 1 })
  })
})

describe('Abnahme N5.3: SBX-PAGE-01 — Seitenangaben bei DOCX', async () => {
  const sbx = await sbxPage01()
  const seiteVon = (pages: { index: number; text: string }[], text: string) => pages.find((p) => p.text.replace(/\s+/g, ' ').includes(text))?.index

  it('ohne PDF: über das Inhaltsverzeichnis ≥ 90 % der Stichproben innerhalb ±1 Seite, gekennzeichnet „(±1)"', async () => {
    const k = kern()
    const z = await k.lesen({ id: 'p', name: 'SBX-PAGE-01.docx', daten: sbx.docx })
    expect(z.seitenQuelle).toBe('toc_mapping')
    expect(z.labels[1]).toBe('S. 2 (±1)')
    const roh = (k as unknown as { docs: Map<string, { roh: { pages: { index: number; text: string }[] } }> }).docs.get('p')!.roh
    const treffer = sbx.stichproben.filter((s) => {
      const p = seiteVon(roh.pages, s.text)
      return p !== undefined && Math.abs(p - s.seite) <= 1
    })
    expect(treffer.length / sbx.stichproben.length).toBeGreaterThanOrEqual(0.9)
  })

  it('mit Word-PDF: alle 20 Stichproben haben exakt die PDF-Seite', async () => {
    const k = kern()
    await k.lesen({ id: 'p', name: 'SBX-PAGE-01.docx', daten: sbx.docx })
    const z = await k.paaren('p', sbx.pdf)
    expect(z).toMatchObject({ seitenQuelle: 'pdf_pair', pdfPaar: { abweichung: expect.any(Number) } })
    expect(z!.pdfPaar!.abweichung).toBeLessThanOrEqual(0.02)
    expect(z!.seiten).toBe(sbx.seiten)
    const roh = (k as unknown as { docs: Map<string, { roh: { pages: { index: number; text: string }[] } }> }).docs.get('p')!.roh
    for (const s of sbx.stichproben) expect([s.text, seiteVon(roh.pages, s.text)]).toEqual([s.text, s.seite])
    // Und die Suche liefert die PDF-Seite als Bezeichnung.
    expect(k.suchen(sbx.stichproben[0].text).map((t) => t.label)).toContain(`S. ${sbx.stichproben[0].seite}`)
  })

  it('anderes PDF (> 2 % Abweichung) → Warnung, Seitenangaben bleiben beim Inhaltsverzeichnis', async () => {
    const k = kern()
    await k.lesen({ id: 'p', name: 'x.docx', daten: sbx.docx })
    const fremd = pdfBauen([{ texte: umbrechen('Something entirely different that is not in the document at all').map((t, i) => ({ text: t, x: 50, y: 800 - i * 18 })) }])
    const z = await k.paaren('p', fremd)
    expect(z).toMatchObject({ seitenQuelle: 'toc_mapping', pdfPaar: { warnung: 'abweichung' } })
  })

  it('PDF älter als das DOCX → Warnung', async () => {
    const k = kern()
    await k.lesen({ id: 'p', name: 'x.docx', daten: sbx.docx })
    // Gleicher Anfang, aber ein Jahr vor dem letzten Speichern des DOCX exportiert.
    const z = await k.paaren('p', pdfBauen([{ texte: [{ text: 'Contents', x: 50, y: 800 }] }], { datum: "D:20250101090000+01'00'" }))
    expect(z?.pdfPaar?.warnung).toBe('aelter')
  })

  it('kaputtes PDF → Warnung „lesefehler"; PDF-Paarung nur für DOCX', async () => {
    const k = kern()
    await k.lesen({ id: 'p', name: 'x.docx', daten: sbx.docx })
    expect((await k.paaren('p', new TextEncoder().encode('%PDF-1.4 kaputt')))?.pdfPaar?.warnung).toBe('lesefehler')
    await k.lesen({ id: 'q', name: 'q.pdf', daten: sbx.pdf })
    expect(await k.paaren('q', sbx.pdf)).toBeNull()
    expect(await k.paaren('fehlt', sbx.pdf)).toBeNull()
  })
})

describe('Bausteine der Testdateien', () => {
  it('lauf und absatz ohne Format, Sonderzeichen maskiert', () => {
    expect(lauf('a<b&c')).toBe('<w:r><w:t xml:space="preserve">a&lt;b&amp;c</w:t></w:r>')
    expect(absatz('X')).toBe('<w:p>X</w:p>')
  })
  it('umbrechen wortweise auf die Zeilenbreite', () => {
    expect(umbrechen('aa bb cc', 5)).toEqual(['aa bb', 'cc'])
    expect(umbrechen('', 5)).toEqual([])
  })
  it('dieselbe Eingabe ergibt dieselbe Datei', async () => {
    expect(await sbxWord01()).toEqual(await sbxWord01())
  })
})

describe('Metadaten von SBX-WORD-01: Titel neben dem Textfeld des Deckblatts', () => {
  it('Titel, Nummer aus dem Textfeld, Revision und Typ', async () => {
    const g = await dateiLesen({ name: SBX_WORD_01_NAME, daten: await sbxWord01() }, { pdfjs: async () => pdfjs as unknown as PdfJs })
    expect(g.meta).toMatchObject({ titel: 'Training Manual (synthetic)', nummer: 'SBX-WORD-01', revision: 'Edition 1 Revision 0.0', typ: 'TM' })
  })
})

describe('Abnahme N3.6: SBX-FL-01 gegen SBX-PKG-01 R0.1 (regelbasiert)', () => {
  it('Import, Zuordnung und Statusvorschläge für alle eingebauten Fälle', async () => {
    const kern = new Kern({ pdfjs: async () => { throw new Error('kein PDF erwartet') } })
    const paket = await sbxPkg01()
    for (const d of paket) await kern.lesen({ id: d.kuerzel, name: d.name, daten: d.daten, titel: d.titel, pruefen: { formal: false, word: false } })

    const [blatt, overview, listen] = await xlsxTabellen(await sbxFl01())
    expect([overview.name, listen.name]).toEqual(['Overview', 'Lists'])
    const kopf = kopfzeileFinden(blatt.zeilen)
    expect(blatt.zeilen[kopf]).toEqual(SBX_FL_01_KOPF)
    // Leere Zeile 2: Rasterzeile 1, Excel-Zeile 3
    expect([kopf, blatt.zeilenNr[kopf]]).toEqual([1, 3])
    const befunde = befundeLesen(blatt.zeilen, kopf, zuordnungVorschlagen(blatt.zeilen[kopf]), blatt.zeilenNr)
    expect([befunde[0].excelZeile, befunde[19].excelZeile]).toEqual([4, 23])
    expect(befunde).toHaveLength(20)

    const namen = paket.map((d) => ({ id: d.kuerzel, namen: [d.kuerzel, d.titel, d.name] }))
    const ergebnisse = kern.nachpruefen(befunde.map((befund) => ({ befund, ziel: zielVorschlagen(befund.dokument, namen) })))
    expect(ergebnisse.map((r, i) => `${r.ref} ${r.status} (${SBX_FL_01[i].fall})`)).toEqual(SBX_FL_01.map((f) => `${f.zeile[0]} ${f.erwartet} (${f.fall})`))

    // Restfundstelle im Nachbardokument nennt Kapitel und Seite der AKTUELLEN Revision.
    const r2 = ergebnisse[1]
    expect(r2.rest).toEqual([expect.objectContaining({ dokId: 'APX 4', kapitel: '1 Line Training' })])
    expect(r2.belegt).toEqual([expect.objectContaining({ dokId: 'TM', kapitel: '1 General' })])
    expect(ergebnisse[5].rest[0].kapitel).toBe('2 Simulator Training')
    expect(remark(r2, '2026-11-01')).toMatch(/^TEILWEISE BEHOBEN \(Re-Check 01\.11\.2026\)/)
    // Behauptung im Team-Kommentar wird überprüft, nicht übernommen.
    expect(ergebnisse[2].behauptungWiderlegt).toBe(true)
    expect(ergebnisse[16].behauptungWiderlegt).toBe(true)
    expect(ergebnisse[15].abweichung).toBe(true)
  })
})
