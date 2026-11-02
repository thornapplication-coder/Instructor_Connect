import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { Kern } from '../kern'
import type { PdfJs } from '../parse/pdf'
import { dateiLesen } from '../parse/lesen'
import { dokumentPruefen } from '../pruefung/pruefen'
import { xlsxTabellen } from '../parse/xlsx'
import { befundeLesen, kopfzeileFinden, zielVorschlagen, zuordnungVorschlagen } from '../recheck/fremdliste'
import { gruppenVorschlagen, vorbelegen } from '../paket/struktur'
import { SBX_CALC_01_FEHLER, SBX_CALC_01_NAME, SBX_CALC_01_XLSX_FEHLER, SBX_CALC_01_XLSX_NAME, SBX_EAR_01_NAME, SBX_FL_01, SBX_FORMAL_01_FEHLER, SBX_PDF_02_NAME, SBX_WORD_01_NAME, SBX_WORD_02_NAME, sbxCalc01, sbxCalc01Xlsx, sbxEar01, sbxEar01Pruefdokument, sbxFl01, sbxFormal01, sbxPdf02, sbxPkg01, sbxWord01, sbxWord02 } from './sbx'
import baseline from './baseline.json' with { type: 'json' }
import { abgleichen, bericht, bewerten, kennzahlen, SBX_EAR_01_ERWARTET, SBX_PDF_02_ERWARTET, SBX_PDF_02_FEHLALARME, SBX_PKG_01_ERWARTET, SBX_WORD_01_ERWARTET, SBX_WORD_01_FEHLALARME, SBX_WORD_02_ERWARTET, SBX_WORD_02_FEHLALARME, SCHWELLE, tabelle, type Kennzahlen } from './qualitaet'

const standardFontDataUrl = fileURLToPath(new URL('../../../../node_modules/pdfjs-dist/standard_fonts/', import.meta.url))
const kern = () => new Kern({ pdfjs: async () => pdfjs as unknown as PdfJs, standardFontDataUrl })

/** Wie viele der Fehlalarmfälle einer Datei tatsächlich gemeldet wurden. */
const fehlalarmeIn = (befunde: { pruefpunkt: string; fundstellen: { ort?: string; auszug: string }[] }[], faelle: { punkt: string; muster: RegExp }[]) =>
  faelle.filter((f) => befunde.some((b) => b.pruefpunkt === f.punkt && b.fundstellen.some((x) => f.muster.test(`${x.ort ?? ''} ${x.auszug}`)))).length

/** Alle Abnahmedateien durch den echten Prüfkern — wie im Browser, nur ohne Worker. */
async function messen(): Promise<Kennzahlen> {
  // Word-Check, Sprache, Formalprüfung: SBX-WORD-01
  const k1 = kern()
  const w = (await k1.lesen({ id: 'w', name: SBX_WORD_01_NAME, daten: await sbxWord01(), pruefen: { formal: true, word: true } })).pruefung!.befunde
  const wFehlalarme = fehlalarmeIn(w, SBX_WORD_01_FEHLALARME)
  const word = abgleichen('SBX-WORD-01', SBX_WORD_01_ERWARTET, w.map((b) => b.pruefpunkt), wFehlalarme)

  // Automatische Kapitelnummerierung: SBX-WORD-02 (Audit 11/2026, FRD-01)
  const w2 = (await k1.lesen({ id: 'w2', name: SBX_WORD_02_NAME, daten: await sbxWord02(), pruefen: { formal: true, word: true } })).pruefung!.befunde
  const word2 = abgleichen('SBX-WORD-02', SBX_WORD_02_ERWARTET, w2.map((b) => b.pruefpunkt), fehlalarmeIn(w2, SBX_WORD_02_FEHLALARME))

  // Lesereihenfolge im PDF: SBX-PDF-02 (Audit 11/2026, FRD-05)
  const p2 = (await k1.lesen({ id: 'p2', name: SBX_PDF_02_NAME, daten: sbxPdf02(), pruefen: { formal: true, word: false } })).pruefung!.befunde
  const pdf2 = abgleichen('SBX-PDF-02', SBX_PDF_02_ERWARTET, p2.map((b) => b.pruefpunkt), fehlalarmeIn(p2, SBX_PDF_02_FEHLALARME))

  // Formalprüfung: SBX-FORMAL-01
  const f = (await k1.lesen({ id: 'f', name: 'SBX-FORMAL-01.pdf', daten: sbxFormal01(), pruefen: { formal: true, word: false } })).pruefung!.befunde
  const formal = abgleichen('SBX-FORMAL-01', SBX_FORMAL_01_FEHLER, f.map((b) => b.pruefpunkt))

  // Rechnen: SBX-CALC-01
  const g = await dateiLesen({ name: SBX_CALC_01_NAME, daten: await sbxCalc01() }, { pdfjs: async () => { throw new Error('kein PDF') } }, {})
  const c = dokumentPruefen({ dokId: 'c', dokName: 'SBX-CALC-01', dateiname: SBX_CALC_01_NAME, roh: g.roh, meta: g.meta }, { formal: false, word: false, rechnen: true }).befunde.filter((b) => b.quelle === 'rechnen')
  const rechnen = abgleichen('SBX-CALC-01', SBX_CALC_01_FEHLER.map((x) => `${x.punkt}|${x.auszug}`), c.map((b) => `${b.pruefpunkt}|${b.fundstellen[0].auszug}`))
  // Dieselbe Prüfung an der Excel-Fassung (Audit 11/2026, FRD-11)
  const gx = await dateiLesen({ name: SBX_CALC_01_XLSX_NAME, daten: await sbxCalc01Xlsx() }, { pdfjs: async () => { throw new Error('kein PDF') } }, {})
  const cx = dokumentPruefen({ dokId: 'cx', dokName: 'SBX-CALC-01 XLSX', dateiname: SBX_CALC_01_XLSX_NAME, roh: gx.roh, meta: gx.meta }, { formal: false, word: false, rechnen: true }).befunde.filter((b) => b.quelle === 'rechnen')
  const rechnenX = abgleichen('SBX-CALC-01-X', SBX_CALC_01_XLSX_FEHLER.map((x) => `${x.punkt}|${x.auszug}`), cx.map((b) => `${b.pruefpunkt}|${b.fundstellen[0].auszug}`))

  // Regelwerk: SBX-EAR-01
  const k2 = kern()
  await k2.lesen({ id: 'p', name: 'review.docx', daten: await sbxEar01Pruefdokument(), pruefen: { formal: true, word: false } })
  await k2.lesen({ id: 'ear', name: SBX_EAR_01_NAME, daten: sbxEar01() })
  const e = k2.nachLesen('ear')[0].pruefung!.befunde.filter((b) => b.quelle === 'regelwerk')
  const regelwerk = abgleichen('SBX-EAR-01', SBX_EAR_01_ERWARTET, e.map((b) => b.pruefpunkt))

  // Paket und Re-Check: SBX-PKG-01 mit SBX-FL-01
  const k3 = new Kern({ pdfjs: async () => { throw new Error('kein PDF erwartet') } })
  const paket = await sbxPkg01()
  for (const d of paket) await k3.lesen({ id: d.kuerzel, name: d.name, daten: d.daten, titel: d.titel, pruefen: { formal: false, word: false } })
  const angaben = paket.map((d) => ({ id: d.kuerzel, a: vorbelegen(d.name, d.titel) }))
  const gruppen = gruppenVorschlagen(angaben)
  const struktur = paket.map((d, i) => ({ id: d.kuerzel, dokName: d.titel, kuerzel: angaben[i].a.kuerzel, ebene: angaben[i].a.ebene, gruppe: gruppen[d.kuerzel] ?? '', variante: angaben[i].a.variante, revision: d.titel.match(/R\d\.\d$/)![0], datum: '2026-10-15' }))
  const pk = k3.paketPruefen(struktur).befunde
  const paketSatz = abgleichen('SBX-PKG-01', SBX_PKG_01_ERWARTET, pk.map((b) => `${b.dokId} ${b.pruefpunkt}`))

  const [blatt] = await xlsxTabellen(await sbxFl01())
  const kopf = kopfzeileFinden(blatt.zeilen)
  const befunde = befundeLesen(blatt.zeilen, kopf, zuordnungVorschlagen(blatt.zeilen[kopf]), blatt.zeilenNr)
  const namen = paket.map((d) => ({ id: d.kuerzel, namen: [d.kuerzel, d.titel, d.name] }))
  const erg = k3.nachpruefen(befunde.map((befund) => ({ befund, ziel: zielVorschlagen(befund.dokument, namen) })))
  const mitRest = SBX_FL_01.map((x, i) => ({ x, e: erg[i] })).filter(({ x }) => x.erwartet === 'partial')

  return kennzahlen([word, word2, pdf2, formal, rechnen, rechnenX, regelwerk, paketSatz], {
    richtig: erg.filter((r, i) => r.status === SBX_FL_01[i].erwartet).length,
    gesamt: SBX_FL_01.length,
    restGefunden: mitRest.filter(({ e }) => e.rest.length > 0).length,
    restErwartet: mitRest.length,
  })
}

describe('Bewertungslogik', () => {
  it('Abgleich als Multimenge; Mehrfachmeldung desselben Fehlers ist kein Fehlalarm', () => {
    expect(abgleichen('x', ['a', 'a', 'b'], ['a', 'b', 'b', 'c'])).toEqual({ name: 'x', erwartet: 3, getroffen: 2, befunde: 4, fehlalarme: 1 })
    expect(abgleichen('x', ['a'], [], 2)).toMatchObject({ getroffen: 0, fehlalarme: 2 })
  })

  it('Kennzahlen: Quoten auf Promille gerundet; ohne Meldungen 0 % Fehlalarme, ohne Erwartung 100 %', () => {
    const k = kennzahlen([abgleichen('x', ['a', 'b', 'c'], ['a', 'b', 'z'])], { richtig: 19, gesamt: 20, restGefunden: 0, restErwartet: 0 })
    expect([k.trefferquote, k.fehlalarmquote, k.statusquote, k.restquote]).toEqual([0.667, 0.333, 0.95, 1])
    expect(kennzahlen([abgleichen('x', [], [])], { richtig: 0, gesamt: 0, restGefunden: 0, restErwartet: 0 }).fehlalarmquote).toBe(0)
  })

  it('Phase-5-Abnahme: ein eingebauter Qualitätsverlust wird erkannt („gesunken" ab 10 Prozentpunkten)', () => {
    const gut = kennzahlen([abgleichen('x', ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'], ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'])], { richtig: 20, gesamt: 20, restGefunden: 3, restErwartet: 3 })
    // ein Fehler weniger gefunden, ein Fehlalarm mehr, zwei Status falsch
    const schlecht = kennzahlen([abgleichen('x', ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'], ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'z'])], { richtig: 18, gesamt: 20, restGefunden: 3, restErwartet: 3 })
    const v = Object.fromEntries(bewerten(schlecht, gut).map((x) => [x.metrik, x.urteil]))
    expect(v).toEqual({ trefferquote: 'gesunken', statusquote: 'gesunken', restquote: 'gleich', fehlalarmquote: 'gesunken' })
    // knapp unter der Schwelle: schlechter, nicht gesunken; umgekehrt besser
    expect(bewerten({ ...gut, trefferquote: 1 - SCHWELLE + 0.01 }, gut)[0].urteil).toBe('schlechter')
    expect(bewerten(gut, schlecht).map((x) => x.urteil)).toEqual(['besser', 'besser', 'gleich', 'besser'])
  })

  it('Bericht und Tabelle', () => {
    const k = kennzahlen([abgleichen('SBX-X', ['a'], ['a'])], { richtig: 1, gesamt: 1, restGefunden: 1, restErwartet: 1 })
    expect(bericht(k)).toBe('DocCheck · Benchmark: Trefferquote 100 %, Fehlalarme 0 %, Re-Check-Status 100 %, Restfundstellen 100 %')
    expect(tabelle(k)).toMatch(/^SBX-X\s+1\/1\s+gefunden · {2}0 Fehlalarm\(e\) bei 1 Meldungen\n/)
  })
})

describe('Qualitäts-Regressionstest gegen die Baseline (Spez. v1.1 Kap. 19.1, Nachtrag Kap. 20)', () => {
  it('keine Kennzahl schlechter als festgehalten', async () => {
    const k = await messen()
    console.info(`\n${tabelle(k)}\n`)
    const v = bewerten(k, baseline)
    // Verbessert? Dann baseline.json nachziehen — sonst schützt sie den neuen Stand nicht
    const besser = v.filter((x) => x.urteil === 'besser')
    if (besser.length) console.info(`Besser als die Baseline: ${besser.map((x) => `${x.metrik} ${x.alt} → ${x.neu}`).join(', ')} — baseline.json aktualisieren.`)
    expect(v.filter((x) => x.urteil === 'schlechter' || x.urteil === 'gesunken')).toEqual([])
    // Je Satz: kein eingebauter Fehler darf verloren gehen, ohne dass es hier steht
    expect(k.saetze.map((s) => [s.name, s.getroffen, s.fehlalarme])).toEqual(baseline.saetze.map((s) => [s.name, s.getroffen, s.fehlalarme]))
  })
})
