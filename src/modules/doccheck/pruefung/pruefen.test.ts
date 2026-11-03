import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import JSZip from 'jszip'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { SBX_CALC_01_NAME, SBX_CALC_01_XLSX_NAME, SBX_EAR_01_NAME, SBX_FORMAL_01_FEHLER, SBX_PDF_02_NAME, SBX_WORD_01_NAME, SBX_WORD_02_NAME, sbxCalc01, sbxCalc01Xlsx, sbxEar01, sbxEar01Pruefdokument, sbxFormal01, sbxPage01, sbxPdf02, sbxPkg01, sbxWord01, sbxWord02 } from '../benchmark/sbx'
import { dateiLesen } from '../parse/lesen'
import type { PdfJs } from '../parse/pdf'
import { LEERE_LENKUNG } from '../parse/model'
import { pdfBauen, textSeite } from '../parse/pdfBauen'
import { dok, eingabe } from '../export/beispiel'
import { datenstand } from '../export/datenstand'
import de from '../i18n/de.json'
import en from '../i18n/en.json'
import { paketPruefen, type Mitglied } from '../paket/pruefen'
import { gruppenVorschlagen, vorbelegen } from '../paket/struktur'
import type { ReferenzListe } from '../referenz/liste'
import type { Befund } from './befund'
import { dokumentPruefen, textAuswertbar } from './pruefen'
import { regelIndex } from './regelwerk'

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
    // Revision nur im Fuß ist keine Variante von Edition/Datum im Kopf (Audit 11/2026, FRD-09)
    expect(a).not.toContain('footer1.xml')
    expect(punkt('kopfFuss')[0].prioritaet).toBe('Medium')
  })

  it('Dateiname E2R0.0 gegen Deckblatt „Edition 1"; verirrtes Fragment; Textmarker auf Platzhalter = Hoch', () => {
    expect(auszuege(p, 'editionRevision')).toContain('Edition 2, cover: Edition 1')
    // Nur das Fragment — die Werte der Lenkungstabelle daneben nicht (Audit 11/2026, FRD-10)
    expect(auszuege(p, 'fragmente').trim()).toBe('3.8.3.')
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
    // SBX-WORD-01 hat kein Inhaltsverzeichnis — Felder sind nicht anwendbar, nicht grün
    expect(p.ampel.word.felder).toBe('na')
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

  it('landessprachige Auflösung neben ihrem Kürzel ist ein Eigenname — der Arbeitskommentar in derselben Tabelle bleibt (Audit 11/2026, FRD-17)', () => {
    expect(auszuege(p, 'fremdsprache')).not.toContain('Sandbox-Flugschule')
    expect(p.befunde.find((x) => x.pruefpunkt === 'fremdsprache')!.text).toBe('Text in a language other than the document language (en) in 1 paragraph, which looks like a working comment.')
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
    // Kurzform ohne Schlüsselwort: tot gemeldet, gültig nicht (Audit 11/2026, FRD-14)
    expect(auszuege(p, 'querverweise')).toContain('see 9.4 — target not found')
    expect(auszuege(p, 'querverweise')).not.toContain('see 2.1')
    expect(auszuege(p, 'abkuerzungen')).toMatch(/Used but not in the list: QRH[\s\S]*Listed but never used: EGPWS/)
    // „NOTE:" ist kein Kürzel (Audit 11/2026, FRD-16)
    expect(auszuege(p, 'abkuerzungen')).not.toContain('NOTE')
    expect(auszuege(p, 'abkuerzungen')).not.toMatch(/: (AFM|VMO)$/m)
    expect(p.befunde.find((b) => b.pruefpunkt === 'reste' && b.prioritaet === 'High')).toBeDefined()
    expect(p.befunde.find((b) => b.pruefpunkt === 'reste' && b.prioritaet === 'Medium')).toBeDefined()
  })

  it('Variante „Page n of 7" mit LEP-Tabelle: dieselben Fehler, nicht jede Seite fehlend (Audit 11/2026, FRD-07)', async () => {
    const v = await pruefe('SBX-FORMAL-01.pdf', sbxFormal01('vonGesamt'))
    expect(v.befunde.map((b) => b.pruefpunkt).sort()).toEqual(p.befunde.map((b) => b.pruefpunkt).sort())
    expect(auszuege(v, 'lep').split('\n').map((z) => z.trim())).toEqual(['Missing in LEP: Page 6', 'Listed in LEP but not in document: 9', 'Page 5: LEP 2 / 2026-03-01, page Rev 1 / 2026-03-01'])
  })

  it('PDF: Word-Check nicht anwendbar, alle Befunde rule-based', () => {
    expect(Object.values(p.ampel.word).every((a) => a === 'na')).toBe(true)
    expect(p.befunde.every((b) => b.verifizierung === 'Verified (rule-based)')).toBe(true)
  })
})

/**
 * Alle Befunde aller Abnahmedateien — mit Referenzlisten, dem Regelwerk
 * SBX-EAR-01 und der Paketprüfung über SBX-PKG-01 samt einer bestätigten
 * Korrektur, damit jede Prüfart mitredet, deren Befunde in die Exporte
 * gehen. Die Fälle selbst prüfen die Abnahmetests; hier geht es um das,
 * was JEDER Befund mitbringen muss.
 */
async function alleAbnahmeBefunde(): Promise<Befund[]> {
  const page01 = await sbxPage01()
  const paket = await sbxPkg01()
  const dateien: [string, Uint8Array][] = [
    [SBX_WORD_01_NAME, await sbxWord01()],
    [SBX_WORD_02_NAME, await sbxWord02()],
    [SBX_PDF_02_NAME, sbxPdf02()],
    ['SBX-FORMAL-01.pdf', sbxFormal01()],
    ['SBX-FORMAL-01-V.pdf', sbxFormal01('vonGesamt')],
    [SBX_CALC_01_NAME, await sbxCalc01()],
    [SBX_CALC_01_XLSX_NAME, await sbxCalc01Xlsx()],
    [SBX_EAR_01_NAME, sbxEar01()],
    ['SBX-EAR-01_Review.docx', await sbxEar01Pruefdokument()],
    ['SBX-PAGE-01.docx', page01.docx],
    ['SBX-PAGE-01.pdf', page01.pdf],
    ...paket.map((d): [string, Uint8Array] => [d.name, d.daten]),
  ]
  const gelesen = new Map<string, Awaited<ReturnType<typeof dateiLesen>>>()
  for (const [name, daten] of dateien) gelesen.set(name, await dateiLesen({ name, daten }, deps, { standardFontDataUrl }))
  const index = regelIndex([{ titel: SBX_EAR_01_NAME, pages: gelesen.get(SBX_EAR_01_NAME)!.roh.pages }])
  // Je Art eine Liste: Ein Registereintrag passt mit falscher Revision, alle
  // anderen Dokumente fehlen im Register; „check list" steht im TM von
  // SBX-PKG-01, „AT.ATO.106" hat die Bauart der bekannten Kennung.
  const referenzen: ReferenzListe[] = [
    { id: 'reg', name: 'Register.xlsx', art: 'register', eintraege: [{ dokument: 'SBX-FORMAL-01', revision: 'Rev 9' }] },
    { id: 'abk', name: 'Abbreviations.xlsx', art: 'abkuerzungen', eintraege: [{ abk: 'ATO', bedeutung: 'Approved Training Organisation' }] },
    { id: 'glo', name: 'Glossary.xlsx', art: 'glossar', eintraege: [{ soll: 'checklist', varianten: ['check list'] }] },
    { id: 'ken', name: 'Approvals.csv', art: 'kennungen', eintraege: [{ kennung: 'AT.ATO.107' }] },
  ]
  const befunde = dateien.flatMap(([name]) => {
    const g = gelesen.get(name)!
    return dokumentPruefen({ dokId: name, dokName: name, dateiname: name, roh: g.roh, meta: g.meta }, { formal: true, word: true, rechnen: true }, undefined, referenzen, index).befunde
  })
  const angaben = paket.map((d) => vorbelegen(d.name, d.titel))
  const gruppen = gruppenVorschlagen(paket.map((d, i) => ({ id: d.kuerzel, a: angaben[i] })))
  const mitglieder: Mitglied[] = paket.map((d, i) => {
    const g = gelesen.get(d.name)!
    return { id: d.kuerzel, dokName: d.titel, kuerzel: angaben[i].kuerzel, ebene: angaben[i].ebene, gruppe: gruppen[d.kuerzel] ?? '', variante: angaben[i].variante, revision: d.titel.match(/R\d\.\d$/)![0], datum: '2026-10-15', pages: g.roh.pages, outline: g.roh.outline }
  })
  // „recieve" gilt in Annex 2A als bestätigt korrigiert — 2B hat es noch (Fix-Propagation)
  return [...befunde, ...paketPruefen(mitglieder, [{ ref: 'F-008', dokId: 'ANX 2A', weg: 'recieve' }]).befunde]
}

describe('Befunde aller Abnahmedateien — was jeder Befund in den Export mitbringt', async () => {
  const befunde = await alleAbnahmeBefunde()

  it('der Sammeltest sieht alle Prüfarten, deren Befunde aus Abnahmedateien kommen', () => {
    // Sonst prüfte er still nichts. Übungs- und Zirkelverweise je Dokument
    // kommen in keiner Abnahmedatei vor — verweise.test.ts prüft sie.
    expect(befunde.length).toBeGreaterThan(60)
    expect([...new Set(befunde.map((b) => b.quelle))].sort()).toEqual(['formal', 'paket', 'rechnen', 'referenz', 'regelwerk', 'sprache', 'word'])
  })

  it('englische Texte: kein „(s)", kein „another language than", keine Kongruenzfehler, keine doppelte Revision (Audit 11/2026, TXT-07/UID-14)', () => {
    // „another language than the document (en)" war der Germanismus; „other than the document language" ist richtig
    expect(befunde.map((b) => b.text).filter((t) => /\(s\)|another language than|than the document \(|revision rev|\b1 of them look\b|\b1 \w+ (?:are|look)\b/i.test(t))).toEqual([])
  })

  it('jeder Befund hat eine Handlungsanweisung — englisch als „Proposed Correction" im Export, deutsch in der Oberfläche (Audit 11/2026, EXP-06)', () => {
    // Vorher fehlte sie bei Rechen-, Verweis-, Regelwerks- und allen
    // Paketbefunden; die Spalte blieb in Excel, Word, CSV und auf Folie 5 leer.
    const ohne = befunde.filter((b) => !b.anleitung || !(en.anleitung as Record<string, string>)[b.anleitung] || !(de.anleitung as Record<string, string>)[b.anleitung])
    expect(ohne.map((b) => `${b.quelle}/${b.pruefpunkt}: ${b.text}`)).toEqual([])
    // Und sie kommt im Datenstand an, aus dem alle Exporte entstehen (Spalte 18)
    const d = datenstand(eingabe({ dokumente: [...new Set(befunde.map((b) => b.dokId))].map((id) => dok(id, 'review')), befunde, ampeln: [] }))
    expect(d.befunde).toHaveLength(befunde.length)
    expect(d.befunde.filter((b) => !b.spalten[17]).map((b) => b.spalten[16])).toEqual([])
  })

  it('Paketbefunde: je Lage die Anweisung, die sie behebt — nicht eine je Prüfpunkt', () => {
    // „liste" meldet einen fehlenden Anhang, einen falschen Titel und einen
    // fehlenden Listeneintrag; „verweise" ein fehlendes Ziel, ein fehlendes
    // Dokument und einen Zirkel. Jeder wird anders behoben.
    const paket = befunde.filter((b) => b.quelle === 'paket').map((b) => `${b.dokId} ${b.pruefpunkt} ${b.anleitung}`).sort()
    expect(paket).toEqual([
      'ANX 2B gegenfassung gegenfassung',
      'ANX 2B geschwister geschwisterAbsatz',
      'ANX 2B geschwister geschwisterSchreibweise',
      'ANX 2B hierarchie hierarchie',
      'ANX 2B propagation propagation',
      'ANX 3 liste listeTitel',
      'APX 5 stand paketStand',
      'TM liste listeFehlt',
      'TM liste listeNachtragen',
      'TM verweise paketVerweisFehlt',
      'TM verweise paketVerweisZiel',
      'TM verweise paketVerweisZiel',
      'TM verweise zirkel',
    ])
  })

  it('Registerabgleich: fehlender Eintrag und abweichende Revision haben je ihre Anweisung (Audit 11/2026, DC-16)', () => {
    const reg = befunde.filter((b) => b.pruefpunkt === 'register')
    expect(reg.filter((b) => b.text.startsWith('Document not found')).every((b) => b.anleitung === 'registerFehlt')).toBe(true)
    expect(reg.filter((b) => b.text.startsWith('Revision or date does not match')).map((b) => [b.dokId, b.anleitung])).toEqual([
      ['SBX-FORMAL-01.pdf', 'register'],
      ['SBX-FORMAL-01-V.pdf', 'register'],
    ])
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
    const p = dokumentPruefen({ dokId: 'd', dokName: 'f', dateiname: 'f.pdf', roh: g.roh, meta: g.meta }, { formal: false, word: false, rechnen: false })
    // Auch die Rechenprüfung (N6) und die Verweise (N7, mit der Formalprüfung) bleiben aus.
    expect(p).toEqual({ befunde: [], ampel: { formal: {}, word: {}, sprache: {}, referenz: {}, rechnen: {}, verweis: {}, regelwerk: {} }, dokumentSprache: null })
  })
})

describe('Scan ohne Textebene: nichts Prüfbares → „nicht anwendbar", nicht grün (Audit 11/2026, DC-03)', () => {
  const alleAn = { formal: true, word: true, rechnen: true }
  const pruefeRoh = (roh: Parameters<typeof dokumentPruefen>[0]['roh']) => dokumentPruefen({ dokId: 'd', dokName: 'scan', dateiname: 'scan.pdf', roh, meta: {} }, alleAn, undefined, [{ id: 'reg', name: 'Register', art: 'register', eintraege: [{ dokument: 'scan' }] }], regelIndex([]))
  const ampeln = (p: ReturnType<typeof dokumentPruefen>) => Object.entries(p.ampel).flatMap(([g, a]) => Object.entries(a ?? {}).map(([punkt, x]) => ({ g, punkt, x })))

  it('nur OCR-Kandidaten: kein Text-Prüfpunkt grün — vorher Reste, Platzhalter, Einheiten, doppelte Wörter', async () => {
    // Die Scanseite trägt nur eine Seitenzahl — das ist kein Inhalt
    const daten = pdfBauen([{ texte: textSeite(['3']), bild: true }, { texte: [], bild: true }])
    const g = await dateiLesen({ name: 'scan.pdf', daten }, deps, { standardFontDataUrl })
    expect(g.roh.ocrKandidaten).toEqual([1, 2])
    expect(textAuswertbar(g.roh)).toBe(false)
    const p = dokumentPruefen({ dokId: 'd', dokName: 'scan', dateiname: 'scan.pdf', roh: g.roh, meta: g.meta }, alleAn)
    expect(p.ohneText).toBe(true)
    expect(p.befunde).toEqual([])
    for (const [gruppe, punkt] of [['formal', 'reste'], ['sprache', 'platzhalter'], ['rechnen', 'einheiten'], ['rechnen', 'doppelt']] as const) expect((p.ampel[gruppe] as Record<string, string>)[punkt]).toBe('na')
    expect(ampeln(p).filter((a) => a.x === 'ok')).toEqual([])
  })

  it('leeres Dokument ebenso; Befunde bleiben, der Registerabgleich (Metadaten) auch', () => {
    const roh = { format: 'pdf' as const, pages: [{ index: 1, text: '  ' }], outline: [], lenkung: LEERE_LENKUNG, ocrKandidaten: [], tabellen: 0 }
    const p = pruefeRoh(roh)
    expect(p.ohneText).toBe(true)
    // Der Dateiname „scan" steht im Register — das hängt nicht am Seitentext
    expect(p.ampel.referenz.register).toBe('ok')
    expect(ampeln(p).filter((a) => a.x === 'ok')).toEqual([{ g: 'referenz', punkt: 'register', x: 'ok' }])
    // Ein Befund ohne Text (z. B. offene Änderung) bleibt sichtbar und gelb/rot
    const mitAenderung = pruefeRoh({ ...roh, lenkung: { ...LEERE_LENKUNG, aenderungen: [{ art: 'ins', text: 'x' }] } })
    expect(mitAenderung.ampel.formal.reste).toBe('bad')
  })

  it('Word-Check bleibt: er liest den Word-Extrakt, nicht den Seitentext', async () => {
    const roh = { format: 'docx' as const, pages: [{ index: 1, text: '' }], outline: [], lenkung: LEERE_LENKUNG, ocrKandidaten: [], tabellen: 0, word: { absaetze: [], laeufe: [], abschnitte: [], verwaisteKopfFuss: [], standard: {}, eigenschaften: { title: 'T' }, toc: [] } }
    const p = pruefeRoh(roh)
    expect(p.ampel.word.unsichtbar).toBe('ok')
    expect(p.ampel.word.eigenschaften).toBe('ok')
  })

  it('mit Text: unverändert, kein ohneText-Feld; nach der Texterkennung wieder bewertbar', async () => {
    const g = await dateiLesen({ name: 'f.pdf', daten: pdfBauen([{ texte: textSeite(['Training Manual', 'The crew shall check the flaps.']) }, { texte: [], bild: true }]) }, deps, { standardFontDataUrl })
    expect(textAuswertbar(g.roh)).toBe(true)
    const p = dokumentPruefen({ dokId: 'd', dokName: 'f', dateiname: 'f.pdf', roh: g.roh, meta: g.meta }, alleAn)
    expect('ohneText' in p).toBe(false)
    expect(p.ampel.formal.reste).toBe('ok')
    // Wie kern.ocrEinspielen: Text da, Seite kein Kandidat mehr
    const scan = { ...g.roh, pages: [{ index: 1, text: '' }, { index: 2, text: 'Scanned page text TBD' }], ocrKandidaten: [2] }
    expect(textAuswertbar(scan)).toBe(false)
    expect(textAuswertbar({ ...scan, ocrKandidaten: [] })).toBe(true)
  })
})
