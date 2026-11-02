import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { Kern } from './kern'
import type { PdfJs } from './parse/pdf'
import { pdfBauen, textSeite } from './parse/pdfBauen'
import { befundeLesen, kopfzeileFinden, zuordnungVorschlagen } from './recheck/fremdliste'
import { neueBefundeFuer } from './recheck/neueBefunde'

const standardFontDataUrl = fileURLToPath(new URL('../../../node_modules/pdfjs-dist/standard_fonts/', import.meta.url))
const kern = () => new Kern({ pdfjs: async () => pdfjs as unknown as PdfJs, standardFontDataUrl })
const pdf = (zeilen: string[], weitere: { bild?: boolean }[] = []) => pdfBauen([{ texte: textSeite(zeilen) }, ...weitere.map((w) => ({ texte: [], ...w }))])

describe('Kern — Lesen, Suchen, Entfernen', () => {
  it('liest, fasst zusammen und macht das Dokument durchsuchbar', async () => {
    const k = kern()
    const fort: number[] = []
    const z = await k.lesen({ id: 'd1', name: 'afm.pdf', daten: pdf(['Airplane Flight Manual', 'BATT 1 OFF BUS', 'Rev. 4']) }, (n) => fort.push(n))
    expect(z).toMatchObject({ id: 'd1', format: 'pdf', seiten: 1, ocrSeiten: 0, meta: { revision: 'Rev 4', typ: 'AFM' } })
    expect(z.sha256).toHaveLength(64)
    expect(fort).toEqual([1])
    expect(k.suchen('BATT 1 OFF BUS')[0]).toMatchObject({ docId: 'd1', docTitle: 'Airplane Flight Manual', exakt: true })
    expect(k.seitenText('d1', 1)).toContain('BATT 1 OFF BUS')
    expect(k.seitenText('d1', 9)).toBeNull()
    expect(k.seitenText('x', 1)).toBeNull()
    k.entfernen('d1')
    expect(k.anzahl).toBe(0)
    expect(k.suchen('BATT 1 OFF BUS')).toEqual([])
  })

  it('übergebener Titel geht vor; Titeländerung erscheint in den Treffern', async () => {
    const k = kern()
    await k.lesen({ id: 'd', name: 'x.pdf', titel: 'Mein PLM', daten: pdf(['hydraulic pressure check']) })
    expect(k.suchen('hydraulic')[0].docTitle).toBe('Mein PLM')
    k.titelSetzen('d', 'PLM CL30')
    k.titelSetzen('d', 'PLM CL30')
    k.titelSetzen('fehlt', 'x')
    expect(k.suchen('hydraulic')[0].docTitle).toBe('PLM CL30')
  })

  it('Abbrechen während des Lesens → DC-ABORTED, nichts wird aufgenommen', async () => {
    const k = kern()
    const daten = pdfBauen(Array.from({ length: 30 }, (_, i) => ({ texte: textSeite([`page ${i}`]) })))
    const lauf = k.lesen({ id: 'gross', name: 'g.pdf', daten }, (n) => n === 2 && k.abbrechen('gross'))
    await expect(lauf).rejects.toThrow('DC-ABORTED')
    expect(k.anzahl).toBe(0)
    k.abbrechen('gibt-es-nicht')
  })

  it('OCR-Ergebnis ersetzt den Seitentext, markiert die Seite und landet im Index', async () => {
    const k = kern()
    const z = await k.lesen({ id: 's', name: 's.pdf', daten: pdf(['Cover page with enough text here'], [{ bild: true }]) })
    expect(z.ocrKandidaten).toEqual([2])
    const neu = k.ocrEinspielen('s', [{ n: 2, text: 'Scanned   AMC1 ORA.ATO.230\n\n\n\nend' }, { n: 99, text: 'x' }])
    expect(neu).toMatchObject({ ocrSeiten: 1, ocrKandidaten: [] })
    expect(k.seitenText('s', 2)).toBe('Scanned AMC1 ORA.ATO.230\n\nend')
    expect(k.suchen('AMC1 ORA.ATO.230')[0]).toMatchObject({ seite: 2 })
    k.ocrEinspielen('s', [{ n: 2, text: 'ohne Regel' }])
    expect(k.suchen('AMC1 ORA.ATO.230')).toEqual([])
    expect(k.ocrEinspielen('fehlt', [])).toBeNull()
  })

  it('Lesefehler kommen als Code an und hinterlassen nichts', async () => {
    const k = kern()
    await expect(k.lesen({ id: 'x', name: 'x.txt', daten: new Uint8Array([1, 2]) })).rejects.toThrow('DC-FORMAT')
    expect(k.anzahl).toBe(0)
  })
})

describe('Kern — regelbasierte Prüfung nach dem Einlesen', () => {
  it('Prüfdokument wird geprüft, Sitzungs-Master nicht; OCR prüft neu', async () => {
    const k = kern()
    const z = await k.lesen({ id: 'r', name: 'r.pdf', daten: pdf(['Training Manual', 'Battery limits: TBD.'], [{ bild: true }]), pruefen: { formal: true, word: true } })
    expect(z.pruefung?.befunde.some((b) => b.pruefpunkt === 'reste')).toBe(true)
    const m = await k.lesen({ id: 'm', name: 'm.pdf', daten: pdf(['TBD']) })
    expect(m.pruefung).toBeUndefined()
    const neu = k.ocrEinspielen('r', [{ n: 2, text: 'Error! Reference source not found.' }])
    expect(neu?.pruefung?.befunde.some((b) => b.pruefpunkt === 'reste' && b.prioritaet === 'High')).toBe(true)
    const aus = await k.lesen({ id: 'x', name: 'x.pdf', daten: pdf(['TBD here']), pruefen: { formal: false, word: false } })
    expect(aus.pruefung).toBeUndefined()
  })
})

describe('Kern — Prüfschalter wirken auf geladene Dokumente (Audit 11/2026, DC-12)', () => {
  it('pruefenSetzen({formal:false,…}) entfernt die Formalbefunde, wieder an bringt sie zurück; Master bleiben ungeprüft', async () => {
    const k = kern()
    const daten = pdf(['Training Manual', 'Battery limits: TBD.', 'See chapter 9.9 for details.'])
    const z = await k.lesen({ id: 'r', name: 'r.pdf', daten, pruefen: { formal: true, word: true, rechnen: true } })
    expect(z.pruefung?.befunde.some((b) => b.quelle === 'formal' || b.quelle === 'verweis')).toBe(true)
    await k.lesen({ id: 'm', name: 'm.pdf', daten: pdf(['Master TBD']) })
    const aus = k.pruefenSetzen({ formal: false, word: true, rechnen: true })
    // Nur das Prüfdokument kommt zurück — der Master hat keine Prüfung
    expect(aus.map((x) => x.id)).toEqual(['r'])
    expect(aus[0].pruefung?.befunde.filter((b) => b.quelle === 'formal' || b.quelle === 'verweis')).toEqual([])
    // Der Word-Schalter steht noch: Sprache/Platzhalter laufen weiter, die Formalampel ist leer
    expect(aus[0].pruefung?.ampel.formal).toEqual({})
    expect(Object.keys(aus[0].pruefung!.ampel.sprache).length).toBeGreaterThan(0)
    // Derselbe Stand noch einmal prüft nichts neu
    expect(k.pruefenSetzen({ formal: false, word: true, rechnen: true })).toEqual([])
    // Alles aus: keine Prüfung mehr — die Oberfläche sagt dann „abgeschaltet"
    expect(k.pruefenSetzen({ formal: false, word: false, rechnen: false })[0].pruefung).toBeUndefined()
    const wieder = k.pruefenSetzen({ formal: true, word: true, rechnen: true })
    expect(wieder[0].pruefung?.befunde.some((b) => b.quelle === 'formal')).toBe(true)
  })

  it('ein Dokument, das während des Umschaltens noch gelesen wird, nimmt den neuen Stand an', async () => {
    const k = kern()
    k.pruefenSetzen({ formal: false, word: false, rechnen: false })
    // Der Auftrag trägt noch den alten Stand (alles an)
    const z = await k.lesen({ id: 'r', name: 'r.pdf', daten: pdf(['Training Manual', 'Battery limits: TBD.']), pruefen: { formal: true, word: true, rechnen: true } })
    expect(z.pruefung).toBeUndefined()
    const m = await k.lesen({ id: 'm', name: 'm.pdf', daten: pdf(['Master TBD']) })
    expect(m.pruefung).toBeUndefined()
  })
})

describe('Kern — Referenzlisten', () => {
  it('neue Listen prüfen alle Prüfdokumente neu, Sitzungs-Master nicht', async () => {
    const k = kern()
    await k.lesen({ id: 'r', name: 'r.pdf', daten: pdf(['Before takeoff check the flaps and the system.']), pruefen: { formal: false, word: false } })
    await k.lesen({ id: 'm', name: 'm.pdf', daten: pdf(['takeoff']) })
    const z = k.referenzenSetzen([{ id: 'g', name: 'g', art: 'glossar', eintraege: [{ soll: 'take-off', varianten: ['takeoff'] }] }])
    expect(z.map((x) => x.id)).toEqual(['r'])
    expect(z[0].pruefung?.befunde.map((b) => b.pruefpunkt)).toEqual(['glossar'])
    expect(k.referenzenSetzen([])[0].pruefung).toBeUndefined()
  })
})

describe('Kern — Re-Check: jedes Auszugsformat „Treffer — Kontext" unter der Dublettenregel (N10.3)', () => {
  it('Glossar- und Platzhalterbefund an einer Restfundstelle stehen nicht auf „Neue Findings" (Audit 11/2026, Nachtrag DCF#2)', async () => {
    // Die Lücke aus DC-04 betraf nicht nur „Reste": Auch Glossar und Platzhalter
    // schreiben „<Treffer> — <ganzer Absatz>", der Rest ist ein Fenster mit „…".
    // Mit dem alten Enthaltensein stand „check list" zweimal in der Liste.
    const k = kern()
    await k.lesen({
      id: 'TM',
      name: 'TM.pdf',
      daten: pdf(['Training Manual', 'The crew shall complete the check list before engine start.', 'Report deviations on form OPS_XX after the flight.', 'The takeoff briefing is given by the PF.']),
      // Platzhalter (N9) laufen mit dem Word-Check
      pruefen: { formal: true, word: true, rechnen: false },
    })
    const eigene = k.referenzenSetzen([{ id: 'g', name: 'glossar.csv', art: 'glossar', eintraege: [{ soll: 'checklist', varianten: ['check list'] }, { soll: 'take-off', varianten: ['takeoff'] }] }])[0].pruefung!.befunde
    expect(eigene.filter((b) => b.pruefpunkt === 'glossar')).toHaveLength(2)
    expect(eigene.some((b) => b.pruefpunkt === 'platzhalter')).toBe(true)
    const zeilen = [
      ['No.', 'Area', 'Finding', 'Status'],
      ['1', 'TM', 'Replace "check list" with "checklist".', 'Closed'],
      ['2', 'TM', 'Replace "OPS_XX" with "OPS-12".', 'Closed'],
    ]
    const kopf = kopfzeileFinden(zeilen)
    const befunde = befundeLesen(zeilen, kopf, zuordnungVorschlagen(zeilen[kopf]))
    const ziele = { TM: { art: 'dok' as const, ids: ['TM'] } }
    const erg = k.nachpruefen(befunde.map((befund) => ({ befund, ziel: ziele.TM })))
    // Voraussetzung: beide offen, mit Rest im TM
    expect(erg.map((e) => [e.status, e.rest.length > 0])).toEqual([['open', true], ['open', true]])
    const neu = neueBefundeFuer(eigene, erg, befunde.map((b) => b.ref), ziele)
    const texte = neu.liste.map((n) => n.befund)
    expect(texte.some((t) => t.includes('"checklist"'))).toBe(false)
    expect(texte.some((t) => /placeholder/i.test(t))).toBe(false)
    // Was die Liste nicht kennt, bleibt ein neuer Befund
    expect(texte.some((t) => t.includes('"take-off"'))).toBe(true)
    expect(neu.ausgenommen).toBe(2)
  })
})
