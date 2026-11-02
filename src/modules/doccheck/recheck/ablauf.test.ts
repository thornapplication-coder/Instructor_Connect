import { describe, expect, it } from 'vitest'
import { formatDateTime } from '../../../datum'
import { csvLesen, LISTE_MAX_MB } from '../referenz/liste'
import type { SitzungsDok } from '../sitzung'
import { sbxFl01 } from '../benchmark/sbx'
import { auftraege, bestaetigen, bestaetigenMit, nachLauf, neueBefunde, neuesBlatt, remarkBestaetigt, korrekturen, kannZurueckschreiben, paketStand, rueckschreibAuftrag, blattWaehlen, csvExport, dokNamen, listeLesen, sammelKandidaten, zaehlen, zeilen, zielAendern, zieleAuffrischen, zuordnungAendern, zuruecknehmen, type ReCheckSitzung } from './ablauf'
import { befundPruefen, remark } from './pruefen'
import { PROFIL_KEY } from './profil'
import type { Befund } from '../pruefung/befund'

const ablage = () => {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m }
}
const dok = (id: string, typ: string, titel: string, x: Partial<SitzungsDok> = {}): SitzungsDok => ({
  id, rolle: 'review', name: `${id}.docx`, groesse: 1, status: 'fertig', felder: { typ, titel, nummer: '', revision: '1', datum: '', rang: '' }, erkannt: [],
  z: { meta: { titel } } as never, ...x,
})
const docs = [dok('tm', 'TM', 'Training Manual'), dok('apx', '', 'Appendix 4'), dok('m', 'AFM', 'Master', { rolle: 'master' }), dok('l', 'X', 'liest', { status: 'liest' })]

// RFC 4180: Anführungszeichen im Feld verdoppelt, Feld in Anführungszeichen.
const LISTE = 'No.;Area;Finding;Status\n1;TM;"Delete ""Revsion""";Closed\n2;APX 4;"Delete ""TBD""";Open\n3;OSD;"Delete ""x""";Open\n'
const laden = async (a = ablage()) => blattWaehlen('fl.csv', await listeLesen('fl.csv', new TextEncoder().encode(LISTE)), 0, docs, a)

const paket = [
  { id: 'tm', titel: 'Training Manual', pages: [{ index: 1, text: 'The Revsion history.' }] },
  { id: 'apx', titel: 'Appendix 4', pages: [{ index: 1, text: 'Nothing here.' }] },
]
const pruefen = (r: ReCheckSitzung): ReCheckSitzung => ({ ...r, ergebnisse: auftraege(r, ablage()).map((a) => befundPruefen(a.befund, a.ziel, paket)) })

describe('Re-Check-Ablauf (N3.1)', () => {
  it('liest XLSX (alle nichtleeren Blätter) und CSV; andere Formate werden abgewiesen', async () => {
    expect((await listeLesen('SBX-FL-01.xlsx', await sbxFl01())).map((b) => b.name)).toEqual(['Findings', 'Overview', 'Lists'])
    expect(await listeLesen('leer.csv', new Uint8Array())).toEqual([])
    await expect(listeLesen('x.pdf', new Uint8Array())).rejects.toThrow('DC-RECHECK-FORMAT')
  })

  it('übergroße Fremdliste wird vor dem Lesen abgewiesen — sie liest im Hauptfenster (Audit 11/2026, SEC-01)', async () => {
    await expect(listeLesen('fl.xlsx', new Uint8Array(LISTE_MAX_MB * 1024 * 1024 + 1))).rejects.toThrow('DC-LISTE-GROSS')
    expect(await listeLesen('fl.csv', new TextEncoder().encode('No;Finding\n1;x'))).toHaveLength(1)
  })

  it('nur fertige Prüfdokumente kommen als Ziel infrage — mit allen Namen, unter denen eine Liste sie nennt', () => {
    expect(dokNamen(docs)).toEqual([
      { id: 'tm', titel: 'Training Manual', namen: ['TM', 'Training Manual', 'tm.docx', 'Training Manual'] },
      { id: 'apx', titel: 'Appendix 4', namen: ['Appendix 4', 'apx.docx', 'Appendix 4'] },
    ])
    expect(dokNamen([dok('n', '', '', { z: undefined })])).toEqual([{ id: 'n', titel: 'n.docx', namen: ['n.docx'] }])
  })

  it('Blatt wählen: Kopfzeile, Zuordnung, Befunde und Dokumentziele werden vorgeschlagen', async () => {
    const r = await laden()
    expect(r).toMatchObject({ kopf: 0, zuordnung: { id: 0, dokument: 1, befund: 2, status: 3 }, ausProfil: false, ergebnisse: null, sprache: 'de' })
    expect(r.befunde).toHaveLength(3)
    expect(r.ziele).toEqual({ TM: { art: 'dok', ids: ['tm'] }, 'APX 4': { art: 'dok', ids: ['apx'] }, OSD: { art: 'fehlt' } })
    expect(blattWaehlen('x', [], 3, docs, ablage()).befunde).toEqual([])
  })

  it('bestätigte Zuordnung wird zum Listenprofil und beim nächsten Import verwendet', async () => {
    const a = ablage()
    const r = zuordnungAendern(await laden(a), 'status', null, docs)
    expect(r.zuordnung.status).toBeUndefined()
    auftraege(r, a)
    expect(a.m.has(PROFIL_KEY)).toBe(true)
    const wieder = await laden(a)
    expect(wieder.ausProfil).toBe(true)
    expect(wieder.zuordnung.status).toBeUndefined()
    // Ohne Kopfzeile (leeres Blatt) wird nichts gespeichert.
    const b = ablage()
    auftraege({ ...r, blaetter: [{ name: 'x', zeilen: [] }] }, b)
    expect(b.m.size).toBe(0)
  })

  it('eine Spalte gehört nur einer Rolle; Ändern verwirft Ergebnis und Bestätigungen', async () => {
    const r = pruefen(await laden())
    const neu = zuordnungAendern(bestaetigen(r, [1], 'u', 1), 'kommentar', 3, docs)
    expect(neu.zuordnung).toEqual({ id: 0, dokument: 1, befund: 2, kommentar: 3 })
    expect(neu).toMatchObject({ ergebnisse: null, bestaetigt: {} })
  })

  it('Paketstand ändert sich mit Text, OCR und Seitenquelle — nicht mit Masterdokumenten', () => {
    const z = (zeichen: number) => ({ zeichen, ocrSeiten: 0, seitenQuelle: 'approx' }) as never
    const a = paketStand([dok('tm', 'TM', 'T', { z: z(10) }), dok('m', '', 'M', { rolle: 'master', z: z(5) })])
    expect(a).toBe('tm:10:0:approx')
    expect(paketStand([dok('tm', 'TM', 'T', { z: z(11) })])).not.toBe(a)
    expect(paketStand([dok('tm', 'TM', 'T', { z: undefined })])).toBe('')
  })

  it('Dokumentziel ändern und nach neuem Upload fehlende Quellen nachziehen', async () => {
    const r = zielAendern(await laden(), 'OSD', { art: 'paket' })
    expect(r.ziele.OSD).toEqual({ art: 'paket' })
    const fehlt = zielAendern(r, 'OSD', { art: 'fehlt' })
    expect(zieleAuffrischen(fehlt, docs)).toBe(fehlt)
    const mitOsd = zieleAuffrischen(fehlt, [...docs, dok('osd', 'OSD', 'Operational Suitability Data')])
    expect(mitOsd.ziele.OSD).toEqual({ art: 'dok', ids: ['osd'] })
    expect(mitOsd.ziele.TM).toEqual(fehlt.ziele.TM)
  })

  it('Ergebnisse filtern und zählen', async () => {
    const r = pruefen(await laden())
    expect(zaehlen(r)).toEqual({ resolved: 1, partial: 0, open: 1, unverifiable: 1, justify: 0 })
    const alle = { status: 'alle' as const, dok: 'alle', nurAbweichung: false }
    expect(zeilen(r, alle)).toHaveLength(3)
    expect(zeilen(r, { ...alle, status: 'open' }).map((z) => z.befund.ref)).toEqual(['1'])
    expect(zeilen(r, { ...alle, dok: 'APX 4' }).map((z) => z.befund.ref)).toEqual(['2'])
    // #1: Team „Closed", Prüfung „Not resolved"; #2: Team „Open", Prüfung „Resolved"
    expect(zeilen(r, { ...alle, nurAbweichung: true }).map((z) => z.befund.ref)).toEqual(['1', '2'])
    expect(zeilen(await laden(), alle)).toEqual([])
    expect(zaehlen(await laden()).resolved).toBe(0)
  })

  it('Einzel- und Sammelbestätigung; Sammel nur für „Resolved"', async () => {
    const r = pruefen(await laden())
    expect(bestaetigen(await laden(), [1], 'u', 1).bestaetigt).toEqual({})
    expect(sammelKandidaten(r)).toEqual([2])
    const b = bestaetigen(r, [...sammelKandidaten(r), 1, 99], 'u-p', 5)
    expect(b.bestaetigt).toEqual({ 2: { status: 'resolved', von: 'u-p', at: 5, vorschlag: 'resolved' }, 1: { status: 'open', von: 'u-p', at: 5, vorschlag: 'open' } })
    expect(sammelKandidaten(b)).toEqual([])
    expect(zuruecknehmen(b, 1).bestaetigt).toEqual({ 2: { status: 'resolved', von: 'u-p', at: 5, vorschlag: 'resolved' } })
  })

  it('„Erneut prüfen" behält Bestätigungen, deren Vorschlag gleich blieb, und zählt die übrigen (UX-Prüfung 01.11.2026)', async () => {
    const r = pruefen(await laden())
    const b = bestaetigen(r, [1, 2], 'u-p', 5)
    // gleicher Lauf: nichts geht verloren
    const gleich = nachLauf(b, r.ergebnisse!, 'neu')
    expect(gleich.aufgehoben).toBe(0)
    expect(Object.keys(gleich.r.bestaetigt)).toEqual(['1', '2'])
    expect(gleich.r.geprueftGegen).toBe('neu')
    // Zeile 2 hat jetzt einen anderen Vorschlag, Zeile 1 fehlt ganz
    const anders = r.ergebnisse!.filter((e) => e.zeile === 2).map((e) => ({ ...e, status: 'partial' as const }))
    const n = nachLauf(b, anders, 'neu')
    expect(n.aufgehoben).toBe(2)
    expect(n.r.bestaetigt).toEqual({})
    // abweichend bestätigt: maßgeblich ist der Vorschlag von damals, nicht der bestätigte Status
    const mit = bestaetigenMit(r, 2, 'u-p', 6, 'open', 'Fix not accepted by CMM') as ReCheckSitzung
    expect(nachLauf(mit, r.ergebnisse!, 'x').r.bestaetigt[2]).toMatchObject({ status: 'open', vorschlag: 'resolved' })
  })

  it('CSV-Export: englischer Kopf, Remark in gewählter Sprache, bestätigt von UND am (N11)', async () => {
    const am = Date.UTC(2026, 10, 1, 9, 30)
    const r = bestaetigen(pruefen(await laden()), [2], 'u-p', am)
    const zeilenCsv = csvLesen(csvExport(r, '2026-11-01', (id) => (id === 'u-p' ? 'Alex' : id)))
    expect(zeilenCsv[0]).toEqual(['Row', 'No.', 'Document', 'Page (list)', 'Team status', 'Proposed status', 'Deviation', 'Confirmed status', 'Confirmed by', 'Confirmed on', 'Justification', 'Remark'])
    expect(zeilenCsv[1].slice(0, 10)).toEqual(['2', '1', 'TM', '', 'Closed', 'Not resolved', 'yes', '', '', ''])
    expect(zeilenCsv[1][11]).toMatch(/^NICHT BEHOBEN \(Re-Check 01\.11\.2026\)/)
    expect(zeilenCsv[2].slice(5, 10)).toEqual(['Resolved', 'yes', 'Resolved', 'Alex', formatDateTime(am)])
    expect(csvLesen(csvExport({ ...r, sprache: 'en' }, '2026-11-01', String))[3][11]).toMatch(/^NOT VERIFIABLE/)
    expect(csvExport({ ...r, ergebnisse: null }, '2026-11-01', String).split('\n').filter(Boolean)).toHaveLength(1)
  })

  it('CSV-Export nennt bei XLSX die Excel-Zeile, nicht die Rasterzeile', async () => {
    const d = await sbxFl01()
    const r = pruefen(blattWaehlen('SBX-FL-01.xlsx', await listeLesen('SBX-FL-01.xlsx', d), 0, docs, ablage(), d))
    expect(csvLesen(csvExport(r, '2026-11-01', String))[1][0]).toBe('4')
  })

  it('Rückschreiben: nur bei XLSX mit Original; nur bestätigte Zeilen, Excel-Zeilennummern, Status nach Werteliste', async () => {
    expect(kannZurueckschreiben(pruefen(await laden()))).toBe(false)
    const d = await sbxFl01()
    const roh = blattWaehlen('SBX-FL-01.xlsx', await listeLesen('SBX-FL-01.xlsx', d), 0, docs, ablage(), d)
    expect(kannZurueckschreiben(roh)).toBe(false)
    const r = bestaetigen(pruefen(roh), [roh.befunde[0].zeile, roh.befunde[2].zeile], 'u', 1)
    expect(kannZurueckschreiben(r)).toBe(true)
    const werte = { resolved: 'Closed', partial: 'In Review', open: 'Open', justify: null, unverifiable: null }
    const a = rueckschreibAuftrag(r, werte, '2026-11-01T09:00:00Z')
    expect(a).toMatchObject({ blatt: 'Findings', kopfZeile: 3, statusSpalte: 6, remarkTitel: 'Remark Re-Check 01.11.2026' })
    expect(a.zeilen.map((z) => [z.excelZeile, z.status])).toEqual([[4, werte[r.bestaetigt[roh.befunde[0].zeile].status]], [6, werte[r.bestaetigt[roh.befunde[2].zeile].status]]])
    expect(a.zeilen[0].remark).toMatch(/\(Re-Check 01\.11\.2026\)/)
    const en = rueckschreibAuftrag({ ...r, sprache: 'en', zuordnung: { ...r.zuordnung, status: undefined } }, werte, '2026-11-01')
    expect(en.remarkTitel).toBe('Remark re-check 2026-11-01')
    expect(en.statusSpalte).toBeUndefined()
    // CSV-Befunde ohne Excel-Zeile werden übersprungen
    expect(rueckschreibAuftrag({ ...r, befunde: r.befunde.map(({ excelZeile: _x, ...b }) => b), blaetter: [{ ...r.blaetter[0] }] }, werte, '2026-11-01').zeilen).toEqual([])
  })

  it('Korrekturen für die Fix-Propagation: nur, was im Zieldokument behoben ist, und nur bei Dokumentzielen', async () => {
    const roh = pruefen(await laden())
    // Unbestätigt: keine Korrektur — erst eine Person macht aus dem Vorschlag eine Feststellung (N11)
    expect(korrekturen(roh)).toEqual([])
    const r = bestaetigen(roh, roh.befunde.map((b) => b.zeile), 'u', 1)
    // #1 TM: Revsion noch da → keine Korrektur; #2 APX 4: TBD weg → Korrektur; #3 OSD: Quelle fehlt
    expect(korrekturen(r)).toEqual([{ ref: '2', dokId: 'apx', weg: 'TBD' }])
    // Paketweites Ziel: kein einzelnes Dokument, dessen Geschwister zu prüfen wären (Ergebnisse bleiben stehen)
    expect(korrekturen({ ...r, ziele: { ...r.ziele, 'APX 4': { art: 'paket' } } })).toEqual([])
    expect(korrekturen(undefined)).toEqual([])
    expect(korrekturen({ ...r, ergebnisse: null })).toEqual([])
  })

  it('Sammelbestätigung nimmt „Resolved" ohne Nachweis aus', async () => {
    const r = pruefen(await laden())
    const ohneNachweis = { ...r, ergebnisse: r.ergebnisse!.map((e) => (e.status === 'resolved' ? { ...e, grund: 'nurAbwesend' as const } : e)) }
    expect(sammelKandidaten(r).length).toBeGreaterThan(0)
    expect(sammelKandidaten(ohneNachweis)).toEqual([])
  })

  it('Einzelbestätigung mit eigenem Status: Begründung Pflicht bei Abweichung und bei „justify" (N11)', async () => {
    const r = pruefen(await laden())
    const e1 = r.ergebnisse!.find((e) => e.zeile === 1)! // Vorschlag: Not resolved
    expect(bestaetigenMit(r, 1, 'u', 5, 'resolved', '  ')).toBe('begruendungFehlt')
    expect(bestaetigenMit(r, 99, 'u', 5, 'resolved', 'x')).toBe('unbekannt')
    const gleich = bestaetigenMit(r, 1, 'u', 5, e1.status, '') as ReCheckSitzung
    expect(gleich.bestaetigt[1]).toEqual({ status: e1.status, von: 'u', at: 5, vorschlag: e1.status })
    expect(bestaetigenMit(r, 1, 'u', 5, 'justify', 'kurz')).toBe('begruendungFehlt')
    const anders = bestaetigenMit(r, 1, 'u', 5, 'resolved', 'Wording changed in Rev 2, approved by HT') as ReCheckSitzung
    expect(anders.bestaetigt[1]).toEqual({ status: 'resolved', von: 'u', at: 5, vorschlag: e1.status, begruendung: 'Wording changed in Rev 2, approved by HT' })
    // Remark und Export tragen die Abweichung
    expect(remarkBestaetigt(e1, anders.bestaetigt[1], '2026-11-01', 'de')).toMatch(/\nAbweichend bestätigt als „Resolved" – Begründung: Wording changed in Rev 2, approved by HT$/)
    expect(remarkBestaetigt(e1, anders.bestaetigt[1], '2026-11-01', 'en')).toMatch(/\nConfirmed as "Resolved" \(deviating from the proposal\) – justification: Wording/)
    expect(remarkBestaetigt(e1, { status: e1.status, von: 'u', at: 1, begruendung: 'Siehe Protokoll' }, '2026-11-01', 'de')).toMatch(/\nBestätigt – Begründung: Siehe Protokoll$/)
    expect(remarkBestaetigt(e1, { status: e1.status, von: 'u', at: 1, begruendung: 'Seen' }, '2026-11-01', 'en')).toMatch(/\nConfirmed – justification: Seen$/)
    expect(remarkBestaetigt(e1, undefined, '2026-11-01', 'de')).toBe(remark(e1, '2026-11-01', 'de'))
    expect(csvLesen(csvExport(anders, '2026-11-01', String))[1][10]).toBe('Wording changed in Rev 2, approved by HT')
  })

  it('Blatt „New findings": Spalten der Liste, Status aus deren Werteliste, Zusatzspalten rechts (N3.1 Schritt 6)', async () => {
    const r = pruefen(await laden())
    const befund = { id: 'C-01', quelle: 'rechnen', pruefpunkt: 'summen', kategorie: 'Inconsistency', prioritaet: 'High', dokId: 'apx', dokName: 'Appendix 4', text: 'Table total does not match', fundstellen: [{ seite: 'ca. 1', auszug: 'TOTAL | 16:00' }], verifizierung: 'Verified (rule-based)', status: 'Open' } as Befund
    const n = neueBefunde(r, [befund])
    expect(n.ausgenommen).toBe(0)
    expect(n.liste[0].nr).toBe(String(Math.max(...r.befunde.map((b) => Number(b.ref) || 0)) + 1))
    const werte = { resolved: 'Closed', partial: 'In Review', open: 'Open', justify: null, unverifiable: null }
    const blatt = neuesBlatt({ ...r, sprache: 'en' }, n.liste, werte, '2026-11-01T10:00:00Z')
    const z = r.zuordnung
    const breite = Math.max(...r.blaetter[r.blatt].zeilen.map((x) => x.length))
    expect(blatt.name).toBe('New findings')
    expect(blatt.zusatzKopf).toEqual(['Priority', 'Category', 'Verification'])
    expect(blatt.zeilen[0]).toMatchObject({ [z.id!]: n.liste[0].nr, [z.befund!]: 'Table total does not match', [z.status!]: 'Open', [breite]: 'High', [breite + 1]: 'Inconsistency', [breite + 2]: 'Verified (rule-based)' })
    expect(blatt.prio).toEqual({ spalte: breite, hoch: 'High', mittel: 'Medium', niedrig: 'Low' })
    expect(blatt.titel).toBe('New findings – re-check 2026-11-01 – fl.csv')
    // Liste MIT Prioritätsspalte: dorthin, keine Zusatzspalte; ohne „offen"-Wert bleibt der Status leer
    const mitPrio = neuesBlatt({ ...r, zuordnung: { ...z, prioritaet: 0 } }, n.liste, { ...werte, open: null }, '2026-11-01')
    expect(mitPrio.name).toBe('Neue Findings')
    expect(mitPrio.zusatzKopf).toEqual(['Category', 'Verification'])
    expect(mitPrio.zeilen[0][0]).toBe('High')
    expect(mitPrio.zeilen[0][z.status!]).toBeUndefined()
    // Auftrag: Blatt nur, wenn es Zeilen hat
    expect(rueckschreibAuftrag({ ...r, blaetter: [{ ...r.blaetter[0], zeilenNr: r.blaetter[0].zeilen.map((_, i) => i + 1) }] }, werte, '2026-11-01', blatt).neu).toBe(blatt)
    expect(rueckschreibAuftrag({ ...r, blaetter: [{ ...r.blaetter[0], zeilenNr: r.blaetter[0].zeilen.map((_, i) => i + 1) }] }, werte, '2026-11-01', { ...blatt, zeilen: [] }).neu).toBeUndefined()
  })
})
