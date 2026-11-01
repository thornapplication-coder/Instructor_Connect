import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import JSZip from 'jszip'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { SBX_FORMAL_01_FEHLER, SBX_WORD_01_NAME, sbxFormal01, sbxWord01 } from '../benchmark/sbx'
import { dateiLesen } from '../parse/lesen'
import type { PdfJs } from '../parse/pdf'
import { dokumentPruefen } from './pruefen'

const standardFontDataUrl = fileURLToPath(new URL('../../../../node_modules/pdfjs-dist/standard_fonts/', import.meta.url))
const deps = { pdfjs: async () => pdfjs as unknown as PdfJs }
const pruefe = async (name: string, daten: Uint8Array) => {
  const g = await dateiLesen({ name, daten }, deps, { standardFontDataUrl })
  return dokumentPruefen({ dokId: 'd', dokName: name, dateiname: name, roh: g.roh, meta: g.meta }, { formal: true, word: true })
}
const auszuege = (p: Awaited<ReturnType<typeof pruefe>>, punkt: string) => p.befunde.filter((b) => b.pruefpunkt === punkt).flatMap((b) => b.fundstellen.map((f) => `${f.ort ?? ''} ${f.auszug}`)).join('\n')

describe('Abnahme N4.4: Word-Check an SBX-WORD-01 — alle Fälle gefunden, der Fehlalarmfall nicht', async () => {
  const p = await pruefe(SBX_WORD_01_NAME, await sbxWord01())
  const punkt = (x: string) => p.befunde.filter((b) => b.pruefpunkt === x)

  it('unsichtbarer Text: weiß in Zelle ohne Schattierung, vanish, Kleinstschrift — NICHT die dunkle Kopfzeile, NICHT das Textfeld', () => {
    const u = punkt('unsichtbar')
    expect(u).toHaveLength(1)
    expect(u[0]).toMatchObject({ prioritaet: 'High', kategorie: 'Document Control', quelle: 'word' })
    const a = auszuege(p, 'unsichtbar')
    expect(a).toContain('internal note do not submit')
    expect(a).toContain('Table row 2, column 2')
    expect(a).toContain('hidden remark')
    expect(a).toContain('Tiny text')
    expect(a).not.toMatch(/\bItem\b|\bValue\b|Doc No/)
  })

  it('Spanisch/Italienisch markierter englischer Text, noProof auf Überschriften', () => {
    expect(auszuege(p, 'korrektursprache')).toMatch(/es-ES[\s\S]*it-IT/)
    expect(auszuege(p, 'noProof')).toContain('1 General')
  })

  it('letzter leerer Abschnitt mit abweichendem Datum, ungenutzte Kopfzeile', () => {
    const a = auszuege(p, 'kopfFuss')
    expect(a).toContain('Section 3')
    expect(a).toContain('2025-01-15')
    expect(a).toContain('header3.xml')
    expect(punkt('kopfFuss')[0].prioritaet).toBe('Medium')
  })

  it('Dateiname E2R0.0 gegen Deckblatt „Edition 1"; verirrtes Fragment; Textmarker auf Platzhalter = Hoch', () => {
    expect(auszuege(p, 'editionRevision')).toContain('Edition 2, cover: Edition 1')
    expect(auszuege(p, 'fragmente')).toContain('3.8.3.')
    expect(punkt('markierung')[0].prioritaet).toBe('High')
  })

  it('Eigenschaften und Kompatibilitätsmodus', () => {
    const a = auszuege(p, 'eigenschaften')
    expect(a).toContain('Title is empty')
    expect(a).toContain('Author: A. Example')
    expect(a).toContain('Last modified by: B. Example')
    expect(auszuege(p, 'kompatibilitaet')).toContain('14')
  })

  it('Ampel: Hoch bei unsichtbarem Text', () => {
    expect(p.ampel.word.unsichtbar).toBe('bad')
    expect(p.ampel.word.felder).toBe('ok')
  })
})

describe('Abnahme N9 an SBX-WORD-01', async () => {
  const p = await pruefe(SBX_WORD_01_NAME, await sbxWord01())

  it('landessprachiger Arbeitskommentar in einer Tabellenzelle → Hoch', () => {
    const b = p.befunde.find((x) => x.pruefpunkt === 'fremdsprache')!
    expect(b.prioritaet).toBe('High')
    expect(auszuege(p, 'fremdsprache')).toMatch(/Table row 3, column 2 Bitte noch prüfen/)
    expect(p.dokumentSprache).toBe('en')
  })

  it('einzelnes landessprachiges Wort → Niedrig', () => {
    expect(auszuege(p, 'einschuebe')).toContain('Normale')
    expect(p.befunde.find((x) => x.pruefpunkt === 'einschuebe')!.prioritaet).toBe('Low')
  })

  it('drei Platzhalterformen gefunden, Unterschriftszeile nicht', () => {
    const a = auszuege(p, 'platzhalter')
    for (const x of ['AT-FFS-nnnn', 'FFS-nnn-nnn', 'NEMAL_XX', 'Instructor remarks']) expect(a).toContain(x)
    expect(a).not.toContain('Signature')
  })

  it('Adresse mit landessprachigem Straßennamen wird nicht gemeldet', () => {
    expect(auszuege(p, 'fremdsprache') + auszuege(p, 'einschuebe')).not.toContain('Hauptstraße')
  })
})

describe('Abnahme Formalprüfung an SBX-FORMAL-01 — alle eingebauten Fehler gefunden', async () => {
  const p = await pruefe('SBX-FORMAL-01.pdf', sbxFormal01())

  for (const punkt of SBX_FORMAL_01_FEHLER) {
    it(punkt, () => {
      expect(p.befunde.some((b) => b.pruefpunkt === punkt && b.quelle === 'formal')).toBe(true)
    })
  }

  it('Fundstellen nennen die Details', () => {
    expect(auszuege(p, 'revisionsstand')).toContain('Rev 1')
    expect(auszuege(p, 'lep')).toMatch(/Missing in LEP: Page 6[\s\S]*Page 9/)
    expect(auszuege(p, 'seiten')).toContain('Page 7')
    expect(auszuege(p, 'nummerierung')).toContain('2.2 missing')
    expect(auszuege(p, 'querverweise')).toContain('Chapter 7')
    expect(auszuege(p, 'querverweise')).not.toContain('Chapter 3')
    expect(auszuege(p, 'abkuerzungen')).toMatch(/Used but not in the list: QRH[\s\S]*Listed but never used: EGPWS/)
    expect(auszuege(p, 'abkuerzungen')).not.toMatch(/: (AFM|VMO)$/m)
    expect(p.befunde.find((b) => b.pruefpunkt === 'reste' && b.prioritaet === 'High')).toBeDefined()
    expect(p.befunde.find((b) => b.pruefpunkt === 'reste' && b.prioritaet === 'Medium')).toBeDefined()
  })

  it('PDF: Word-Check nicht anwendbar, alle Befunde rule-based', () => {
    expect(Object.values(p.ampel.word).every((a) => a === 'na')).toBe(true)
    expect(p.befunde.every((b) => b.verifizierung === 'Verified (rule-based)')).toBe(true)
  })
})

describe('Excel als Prüfdokument (Formulare, Checklisten)', () => {
  it('Reste, Platzhalter und Fremdsprache werden auch in XLSX gefunden, mit Blatt als Ort', async () => {
    const zip = new JSZip()
    zip.file('xl/workbook.xml', '<workbook><sheets><sheet name="Checklist" r:id="rId1"/></sheets></workbook>')
    zip.file('xl/_rels/workbook.xml.rels', '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>')
    const zeile = (n: number, a: string, b: string) => `<row r="${n}"><c t="inlineStr"><is><t>${a}</t></is></c><c t="inlineStr"><is><t>${b}</t></is></c></row>`
    zip.file(
      'xl/worksheets/sheet1.xml',
      `<worksheet><sheetData>${zeile(1, 'Item', 'Check that the crew briefing is complete and the checklist is signed.')}${zeile(2, 'Device', 'AT-FFS-nnnn')}${zeile(3, 'Remark', 'TBD')}${zeile(4, 'Note', 'Bitte noch prüfen, das ist nicht aktuell und muss geändert werden.')}${zeile(5, 'Scope', 'The instructor shall verify all items of the list with the trainee.')}</sheetData></worksheet>`,
    )
    const p = await pruefe('checklist.xlsx', await zip.generateAsync({ type: 'uint8array' }))
    expect(auszuege(p, 'reste')).toContain('Sheet Checklist')
    expect(auszuege(p, 'platzhalter')).toContain('AT-FFS-nnnn')
    expect(auszuege(p, 'fremdsprache')).toContain('Bitte noch prüfen')
    expect(p.ampel.formal.lep).toBe('na')
  })
})

describe('Schalter', () => {
  it('ausgeschaltete Prüfungen liefern nichts', async () => {
    const g = await dateiLesen({ name: 'f.pdf', daten: sbxFormal01() }, deps, { standardFontDataUrl })
    const p = dokumentPruefen({ dokId: 'd', dokName: 'f', dateiname: 'f.pdf', roh: g.roh, meta: g.meta }, { formal: false, word: false })
    expect(p).toEqual({ befunde: [], ampel: { formal: {}, word: {}, sprache: {} }, dokumentSprache: null })
  })
})
