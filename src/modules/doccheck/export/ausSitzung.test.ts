import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { feldSetzen, fertig, LEER, neu, type SitzungsDok } from '../sitzung'
import type { Zusammenfassung } from '../kern'
import type { Befund } from '../pruefung/befund'
import { befund } from './beispiel'
import { befundIdsAusSitzung, befundTabelle, exportBefunde, exportDokumente, exportEingabe, exportZeitpunkt, LAUF_KEY, naechsteLaufnummer, pflichtLuecken, prueferAus } from './ausSitzung'
import app from '../../../i18n/en.json' with { type: 'json' }
import appDe from '../../../i18n/de.json' with { type: 'json' }
import { befundSchluessel, datenstand, kennung, LABELS } from './datenstand'

const felder = { typ: 'TM', titel: 'Training Manual', nummer: 'TM-1', revision: 'Rev 1', datum: '2026-10-01', rang: '2' }
const doc = (id: string, rolle: 'review' | 'master', x: Partial<SitzungsDok> = {}, befunde: Befund[] = []): SitzungsDok =>
  ({
    id, rolle, name: `${id}.docx`, groesse: 1, status: 'fertig', felder, erkannt: [],
    z: { seiten: 5, sha256: `h-${id}`, ocrKandidaten: [], pruefung: rolle === 'review' ? { befunde, ampel: { formal: { lep: 'ok' }, word: {}, sprache: { platzhalter: 'wait' }, referenz: {} } } : undefined },
    ...x,
  }) as unknown as SitzungsDok

const ablage = () => {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m }
}

describe('Sitzung → Export-Datenstand', () => {
  it('nur fertig gelesene Dokumente; Prüfdokumente zuerst; Uploads als Sitzungsdokument mit Rang', () => {
    const d = exportDokumente([doc('m', 'master'), doc('r', 'review'), doc('x', 'review', { status: 'liest' }), doc('y', 'review', { z: undefined })])
    expect(d.map((x) => [x.id, x.rolle, x.rang])).toEqual([['r', 'review', ''], ['m', 'session', '2']])
    expect(d[0]).toMatchObject({ typ: 'TM', titel: 'Training Manual', seiten: 5, sha256: 'h-r' })
  })

  it('Befunde nur von Prüfdokumenten, mit Dokumentnamen; Paketbefunde dazu; leere Ampelgruppen fallen weg', () => {
    const e = exportEingabe({
      docs: [doc('r', 'review', {}, [befund('F-01', 'r')]), doc('m', 'master')],
      paketBefunde: [befund('P-01', 'paket')],
      paketGeprueft: true,
      datum: '2026-11-01T10:00:00Z', laufnummer: 2, appVersion: '1.22.0', organisation: '', pruefer: { name: 'A', funktion: 'B' }, bibliothek: 'Sandbox',
    })
    expect(e.befunde.map((b) => [b.id, b.dokName])).toEqual([['F-01', 'Training Manual'], ['P-01', 'paket']])
    expect(e.ampeln).toEqual([{ dokId: 'r', gruppen: { formal: { lep: 'ok' }, sprache: { platzhalter: 'wait' } } }])
    expect(datenstand(e).befunde.map((b) => b.id)).toEqual(['TM-001', 'PKG-001'])
    expect(e.lesestand).toEqual({ ocrSeiten: 0, ohneText: 0 })
  })

  it('Scan ohne Texterkennung: Lesestand geht mit, der Export sagt „nicht bewertbar" (Audit 11/2026, DC-03)', () => {
    // Vorher: 0 Befunde → „Ready for submission" im Excel des Prüfers
    const scan = doc('s', 'review', {})
    scan.z = { ...scan.z!, ocrKandidaten: [1], pruefung: { ...scan.z!.pruefung!, ohneText: true } }
    // Ein Master-Scan zählt nicht — bewertet werden die Prüfdokumente
    const master = doc('m', 'master')
    master.z = { ...master.z!, ocrKandidaten: [1, 2] }
    const e = exportEingabe({ docs: [scan, master], paketBefunde: [], paketGeprueft: false, datum: '2026-11-01T10:00:00Z', laufnummer: 1, appVersion: '1.22.0', organisation: '', pruefer: { name: 'A', funktion: 'B' }, bibliothek: 'Sandbox' })
    expect(e.lesestand).toEqual({ ocrSeiten: 1, ohneText: 1 })
    expect(datenstand(e).gesamt).toBe('notAssessable')
  })

  it('Paketmodus: Prüfdokumente nach Paketstruktur, das ranghöchste ist Hauptdokument (Audit 11/2026, EXP-08)', () => {
    // Vorher: Upload-Reihenfolge — der zuerst geladene Annex ohne Befund stand auf Deckblatt, Fußzeile und im Dateinamen
    const angaben = (kuerzel: string, ebene: number) => ({ paket: { kuerzel, ebene, gruppe: '', variante: '', erkannt: false } })
    const docs = [
      doc('anx', 'review', { ...angaben('ANX 2A', 3), felder: { ...felder, typ: '', titel: 'Annex 2A', nummer: '' } }),
      doc('m', 'master'),
      doc('apx10', 'review', { ...angaben('APX 10', 2), felder: { ...felder, typ: '', titel: 'Appendix 10', nummer: '' } }, [befund('F-01', 'apx10')]),
      doc('apx4', 'review', { ...angaben('APX 4', 2), felder: { ...felder, typ: '', titel: 'Appendix 4', nummer: '' } }),
      doc('tm', 'review', angaben('TM', 1), [befund('F-01', 'tm', { prioritaet: 'Low' })]),
    ]
    expect(exportDokumente(docs, true).map((x) => x.id)).toEqual(['tm', 'apx4', 'apx10', 'anx', 'm'])
    // Ohne Paketmodus bleibt die Reihenfolge des Hochladens
    expect(exportDokumente(docs).map((x) => x.id)).toEqual(['anx', 'apx10', 'apx4', 'tm', 'm'])
    const basis = { docs, paketBefunde: [], paketGeprueft: true, datum: '2026-11-01T10:00:00Z', laufnummer: 1, appVersion: '1', organisation: '', pruefer: { name: '', funktion: '' }, bibliothek: '' }
    const d = datenstand(exportEingabe({ ...basis, paketModus: true }))
    expect(d.haupt?.id).toBe('tm')
    expect(d.dateiStamm).toBe('2026-11-01_Review_TM-1-plus-3_Rev1')
    expect(Object.fromEntries(kennung(d))['Document under review']).toMatch(/^Training Manual · TM-1 · Rev 1 · 2026-10-01 \+ 3 further documents/)
    // Befunde und Ampeln folgen derselben Reihenfolge
    expect(d.befunde.map((b) => b.id)).toEqual(['TM-001', 'DOC2-001'])
    expect([...new Set(d.ampeln.map((a) => a.dokument))]).toEqual(['Training Manual', 'Appendix 4', 'Appendix 10', 'Annex 2A'])
    expect(datenstand(exportEingabe(basis)).haupt?.id).toBe('anx')
  })

  it('Befund-IDs der Oberfläche = IDs des Exports aus derselben Sitzung, auch im Paketmodus (Audit 11/2026, DC-10/UID-07/TXT-03)', () => {
    // Vorher: Tabelle „F-01" je Dokument, Export „TM-001"/„DOC2-001" — der Befund aus dem Bericht war am Bildschirm nicht zu finden
    const angaben = (kuerzel: string, ebene: number) => ({ paket: { kuerzel, ebene, gruppe: '', variante: '', erkannt: false } })
    const mit = (b: Befund) => ({ ...b, text: `${b.dokId} ${b.id}` })
    const docs = [
      doc('anx', 'review', { ...angaben('ANX 2A', 3), felder: { ...felder, typ: '', titel: 'Annex 2A', nummer: '' } }, [mit(befund('F-01', 'anx'))]),
      doc('m', 'master'),
      doc('tm', 'review', angaben('TM', 1), [mit(befund('F-01', 'tm')), mit(befund('C-01', 'tm', { quelle: 'rechnen', prioritaet: 'High' }))]),
      doc('apx', 'review', { ...angaben('APX 4', 2), felder: { ...felder, typ: '', titel: 'Appendix 4', nummer: '' } }, [mit(befund('F-01', 'apx'))]),
      // Noch nicht fertig gelesen: weder im Export noch in der Tabelle
      doc('liest', 'review', { status: 'liest' }, [mit(befund('F-01', 'liest'))]),
    ]
    const paketBefunde = [mit(befund('P-01', 'anx', { quelle: 'paket' }))]
    const basis = { docs, paketBefunde, paketGeprueft: true, datum: '2026-11-01T10:00:00Z', laufnummer: 1, appVersion: '1', organisation: '', pruefer: { name: '', funktion: '' }, bibliothek: '' }
    for (const paketModus of [false, true]) {
      const ids = befundIdsAusSitzung({ docs, paketModus, paketBefunde })
      const s = datenstand(exportEingabe({ ...basis, paketModus }))
      // Jede Zeile der Tabelle (exportBefunde) hat ihre ID, und es ist die der Exportzeile mit demselben Befund
      const tabelle = exportBefunde(docs, paketBefunde)
      expect(tabelle.map((b) => b.dokId)).toEqual(['anx', 'tm', 'tm', 'apx', 'anx'])
      for (const b of tabelle) expect(s.befunde.find((x) => x.id === ids.get(befundSchluessel(b)))?.spalten[16]).toBe(b.text)
      expect(ids.size).toBe(s.befunde.length)
    }
    // Die IDs folgen der Export-Reihenfolge: ohne Paketmodus die des Hochladens (Annex DOC1), im
    // Paketmodus die Paketstruktur (Appendix auf Ebene 2 vor dem Annex auf Ebene 3 → DOC1)
    const id = (paketModus: boolean, dokId: string, regel: string) => befundIdsAusSitzung({ docs, paketModus, paketBefunde }).get(befundSchluessel({ dokId, id: regel }))
    expect([id(false, 'anx', 'F-01'), id(false, 'apx', 'F-01'), id(false, 'anx', 'P-01')]).toEqual(['DOC1-001', 'DOC2-001', 'DOC1-002'])
    expect([id(true, 'anx', 'F-01'), id(true, 'apx', 'F-01'), id(true, 'anx', 'P-01')]).toEqual(['DOC2-001', 'DOC1-001', 'DOC2-002'])
    // Seite gleich, High vor Medium: C-01 vor F-01
    expect([id(true, 'tm', 'C-01'), id(true, 'tm', 'F-01')]).toEqual(['TM-001', 'TM-002'])

    // Die Tabelle: wichtigste zuerst, bei gleicher Priorität in Export-Reihenfolge wie „Top 5" im
    // Bericht — vorher nach Dokumentname und Prüfpunkt, mit Export-IDs stand „DOC4-002" vor „DOC4-001"
    // (Gegenprüfung Audit 11/2026, DC-10). Ein Low im TM, damit sich das von der Export-Reihenfolge unterscheidet.
    const mitLow = docs.map((d) => (d.id === 'tm' ? doc('tm', 'review', angaben('TM', 1), [mit(befund('F-01', 'tm', { prioritaet: 'Low' })), mit(befund('C-01', 'tm', { quelle: 'rechnen', prioritaet: 'High' }))]) : d))
    for (const paketModus of [false, true]) {
      const zeilen = befundTabelle({ docs: mitLow, paketModus, paketBefunde })
      const s = datenstand(exportEingabe({ ...basis, docs: mitLow, paketModus }))
      expect(zeilen.map((z) => z.id)).toEqual(s.top5)
      const ids = befundIdsAusSitzung({ docs: mitLow, paketModus, paketBefunde })
      for (const z of zeilen) expect(ids.get(befundSchluessel(z.befund))).toBe(z.id)
    }
    expect(befundTabelle({ docs: mitLow, paketModus: true, paketBefunde }).map((z) => z.id)).toEqual(['TM-001', 'DOC1-001', 'DOC2-001', 'DOC2-002', 'TM-002'])
    expect(befundTabelle({ docs: mitLow, paketModus: false, paketBefunde }).map((z) => z.id)).toEqual(['TM-001', 'DOC1-001', 'DOC1-002', 'DOC2-001', 'TM-002'])
  })

  it('Prüfer: Funktion nur, wenn eingetragen — nie die App-Rolle (Audit 11/2026, EXP-13)', () => {
    // Vorher setzte Export.tsx die englische App-Rolle: „Reviewed by: Alex Beispiel, Superadmin"
    const rollen = [...Object.values(app.roles), ...Object.values(appDe.roles)]
    for (const role of ['superadmin', 'group_admin', 'training_admin', 'member'] as const) {
      const p = prueferAus({ name: 'Alex Beispiel', role } as { name: string })
      expect(p).toEqual({ name: 'Alex Beispiel', funktion: '' })
      expect(rollen).not.toContain(p.funktion)
    }
    expect(prueferAus({ name: ' Alex Beispiel ' }, '  Head of Training ')).toEqual({ name: 'Alex Beispiel', funktion: 'Head of Training' })
    expect(prueferAus({ name: 'A' }, '   ')).toEqual({ name: 'A', funktion: '' })
    expect(prueferAus(null)).toEqual({ name: '', funktion: '' })
    expect(prueferAus(undefined, 'Head of Training')).toEqual({ name: '', funktion: 'Head of Training' })
    // In der Kennung steht dann nur der Name, ohne angehängte Rolle
    const d = datenstand(exportEingabe({ docs: [doc('r', 'review')], paketBefunde: [], paketGeprueft: false, datum: '2026-11-01T10:00:00Z', laufnummer: 1, appVersion: '1', organisation: '', pruefer: prueferAus({ name: 'Alex Beispiel' }), bibliothek: '' }))
    expect(Object.fromEntries(kennung(d))['Reviewed by']).toBe('Alex Beispiel')
  })

  it('Laufnummer je Tag: zählt hoch, beginnt am nächsten Tag neu, übersteht kaputte oder fehlende Ablage', () => {
    const a = ablage()
    expect([naechsteLaufnummer(a, '2026-11-01T08:00Z'), naechsteLaufnummer(a, '2026-11-01T09:00Z'), naechsteLaufnummer(a, '2026-11-02T08:00Z')]).toEqual([1, 2, 1])
    a.m.set(LAUF_KEY, '{kaputt')
    expect(naechsteLaufnummer(a, '2026-11-02')).toBe(1)
    const wirft = { getItem: () => { throw new Error('x') }, setItem: () => { throw new Error('x') } }
    expect(naechsteLaufnummer(wirft, '2026-11-02')).toBe(1)
  })

  it('„Checks performed" nennt nur, was lief: keine abgeschaltete Prüfung, das Paket nur im Paketmodus (Audit 11/2026, EXP-01/DC-12)', () => {
    // Vorher eine feste Liste: Formal- und Word-Check auch abgeschaltet, „References between documents" auch ohne Paket
    const nurFormal = doc('r', 'review')
    nurFormal.z = { ...nurFormal.z!, pruefung: { befunde: [], ampel: { formal: { lep: 'ok' }, word: {}, sprache: {}, referenz: {}, rechnen: {}, verweis: { zirkel: 'ok' }, regelwerk: {} } } } as never
    const basis = { paketBefunde: [], datum: '2026-11-01T10:00:00Z', laufnummer: 1, appVersion: '1.22.0', organisation: '', pruefer: { name: 'A', funktion: 'B' }, bibliothek: 'Sandbox' }
    const d = datenstand(exportEingabe({ ...basis, docs: [nurFormal], paketGeprueft: false }))
    expect(d.pruefungen).toEqual([LABELS.checks.formal, LABELS.checks.verweis])
    const k = Object.fromEntries(kennung(d))['Checks performed']
    expect(k).not.toMatch(/Word|Language|Calculations|Package|between documents|Regulatory|Reference lists/)
    // Mit Rechenprüfung, Word-Check, Referenzlisten, Regelwerk und Paket: alle, in fester Reihenfolge
    const voll = doc('v', 'review')
    voll.z = { ...voll.z!, pruefung: { befunde: [], ampel: { formal: { lep: 'ok' }, word: { unsichtbar: 'ok' }, sprache: { platzhalter: 'ok' }, referenz: { register: 'ok' }, rechnen: { summen: 'na' }, verweis: {}, regelwerk: { gueltig: 'ok' } } } } as never
    const alle = datenstand(exportEingabe({ ...basis, docs: [voll], paketGeprueft: true })).pruefungen
    expect(alle).toEqual(['formal', 'word', 'sprache', 'referenz', 'rechnen', 'regelwerk', 'paket'].map((g) => (LABELS.checks as Record<string, string>)[g]))
    // Abgeschaltete Rechenprüfung erscheint nicht (Abnahme P7)
    const ohneRechnen = doc('o', 'review')
    ohneRechnen.z = { ...ohneRechnen.z!, pruefung: { befunde: [], ampel: { formal: { lep: 'ok' }, word: { unsichtbar: 'ok' }, sprache: {}, referenz: {} } } } as never
    expect(datenstand(exportEingabe({ ...basis, docs: [ohneRechnen], paketGeprueft: false })).pruefungen.join()).not.toContain('Calculations')
    // Ohne geprüftes Dokument und ohne Paket: nichts erfunden
    const leer = datenstand(exportEingabe({ ...basis, docs: [], paketGeprueft: false }))
    expect(Object.fromEntries(kennung(leer))['Checks performed']).toBe(LABELS.noChecks)
  })
})

/**
 * Audit 11/2026, DC-17: Die Dokumentkarte warnte „Revision ist Pflicht.",
 * der Export-Reiter nicht — der Bericht ging ohne Revision hinaus, der
 * Dateiname trug „RevNA". `pflichtLuecken` nennt dem Reiter die Dokumente.
 */
describe('Pflichtangabe Revision vor dem Export (Spez. 11.2)', () => {
  const zf = (id: string, meta: Partial<Zusammenfassung['meta']> = {}): Zusammenfassung =>
    ({ id, format: 'docx', seiten: 3, zeichen: 10, ocrKandidaten: [], ocrSeiten: 0, tabellen: 0, sha256: 'h' + id, meta, duplikat: null, labels: [], outline: [], lenkung: {}, seitenQuelle: 'approx', pruefung: { befunde: [], ampel: { formal: {}, word: {}, sprache: {} } } }) as unknown as Zusammenfassung

  it('ohne Revision → genannt, mit Titel und als Hauptdokument; mit Revision → nicht', () => {
    const ohne = doc('r', 'review', { felder: { ...felder, revision: '  ' } })
    expect(pflichtLuecken([ohne])).toEqual([{ id: 'r', name: 'Training Manual', felder: ['revision'], haupt: true }])
    expect(pflichtLuecken([doc('r', 'review')])).toEqual([])
    // Ohne Titel der Dateiname — so heißt das Dokument auch im Export
    expect(pflichtLuecken([doc('x', 'review', { felder: { ...felder, titel: '', revision: '' } })]).map((l) => l.name)).toEqual(['x.docx'])
    // Was wirklich in den Export geht: Dateiname „…_RevNA", Revisionsspalte leer
    const d = datenstand(exportEingabe({ docs: [ohne], paketBefunde: [], paketGeprueft: false, datum: '2026-11-01T10:00:00Z', laufnummer: 1, appVersion: '1', organisation: '', pruefer: { name: '', funktion: '' }, bibliothek: '' }))
    expect(d.dateiStamm).toBe('2026-11-01_Review_TM-1_RevNA')
  })

  it('Revision aus dem Dateinamen zählt (revisionAusDateiname über `fertig`); ein geleertes Feld ist wieder eine Lücke', () => {
    let z = neu(LEER, { id: 'a', rolle: 'review', name: 'TM_E2R0.1.docx', groesse: 1 })
    z = fertig(z, 'a', zf('a', { titel: 'Training Manual' }))
    expect(pflichtLuecken(z.docs)).toEqual([])
    // Das Feld zählt, nicht der Dateiname: In den Export kommt nur das Feld
    z = feldSetzen(z, 'a', 'revision', '')
    expect(pflichtLuecken(z.docs).map((l) => l.id)).toEqual(['a'])
    // Ohne Revision im Dokument UND im Dateinamen → Lücke gleich nach dem Lesen
    let y = neu(LEER, { id: 'b', rolle: 'review', name: 'Training Manual.docx', groesse: 1 })
    y = fertig(y, 'b', zf('b', { titel: 'Training Manual' }))
    expect(pflichtLuecken(y.docs)).toEqual([{ id: 'b', name: 'Training Manual', felder: ['revision'], haupt: true }])
  })

  it('nur Prüfdokumente, die in den Export gehen; „haupt" folgt der Export-Reihenfolge, auch im Paketmodus', () => {
    const leer = { ...felder, revision: '' }
    const angaben = (kuerzel: string, ebene: number) => ({ paket: { kuerzel, ebene, gruppe: '', variante: '', erkannt: false } })
    const docs = [
      doc('anx', 'review', { ...angaben('ANX 2A', 3), felder: { ...leer, titel: 'Annex 2A' } }),
      // Master ohne Revision: Karte warnt, aber Spez. 11.2 meint Prüfdokumente, der Dateiname nennt sie nie
      doc('m', 'master', { felder: { ...leer, titel: 'OM-A' } }),
      // Noch nicht gelesen bzw. nicht lesbar: kommt nicht in den Export, also keine Lücke DARIN
      doc('liest', 'review', { status: 'liest', felder: leer }),
      doc('kaputt', 'review', { status: 'fehler', z: undefined, felder: leer }),
      doc('tm', 'review', { ...angaben('TM', 1), felder: { ...felder, titel: 'Training Manual' } }),
    ]
    // Hochlade-Reihenfolge: der Annex ist Hauptdokument — sein „RevNA" stünde im Dateinamen
    expect(pflichtLuecken(docs)).toEqual([{ id: 'anx', name: 'Annex 2A', felder: ['revision'], haupt: true }])
    // Paketmodus: das TM (mit Revision) führt, der Annex fehlt nur im Bericht
    expect(pflichtLuecken(docs, true)).toEqual([{ id: 'anx', name: 'Annex 2A', felder: ['revision'], haupt: false }])
    expect(datenstand(exportEingabe({ docs, paketModus: true, paketBefunde: [], paketGeprueft: true, datum: '2026-11-01T10:00:00Z', laufnummer: 1, appVersion: '1', organisation: '', pruefer: { name: '', funktion: '' }, bibliothek: '' })).dateiStamm).toBe('2026-11-01_Review_TM-1-plus-1_Rev1')
    expect(pflichtLuecken([])).toEqual([])
  })
})

/**
 * Audit 11/2026, EXM-01: Die CI läuft in UTC und hätte den Vortag nie
 * gesehen — die Fälle setzen die Zeitzone selbst und stellen sie zurück.
 */
describe('Exportdatum in Ortszeit (Europe/Vienna)', () => {
  let vorher: string | undefined
  beforeEach(() => {
    vorher = process.env.TZ
    process.env.TZ = 'Europe/Vienna'
  })
  afterEach(() => {
    if (vorher === undefined) delete process.env.TZ
    else process.env.TZ = vorher
  })

  it('00:30 am 02.11.: Datum, Laufnummer, Export-ID und Dateiname tragen den 02.11., nicht den UTC-Vortag', () => {
    const a = ablage()
    // Letzter Export am Abend des 01.11. (Ortszeit)
    expect(exportZeitpunkt(Date.UTC(2026, 10, 1, 21, 0), a)).toEqual({ datum: '2026-11-01T22:00:00+01:00', laufnummer: 1 })
    // 00:30 Wien = 23:30 UTC des Vortags — vorher zählte die Nummer am 01.11. weiter (→ 2)
    const z = exportZeitpunkt(Date.UTC(2026, 10, 1, 23, 30), a)
    expect(z).toEqual({ datum: '2026-11-02T00:30:00+01:00', laufnummer: 1 })
    expect(naechsteLaufnummer(a, '2026-11-02T00:45:00+01:00')).toBe(2)
    const d = datenstand(exportEingabe({ docs: [doc('r', 'review')], paketBefunde: [], paketGeprueft: false, datum: z.datum, laufnummer: z.laufnummer, appVersion: '1', organisation: '', pruefer: { name: '', funktion: '' }, bibliothek: '' }))
    expect([d.exportId, d.datum, d.dateiStamm]).toEqual(['DC-2026-11-02-0001', '2026-11-02', '2026-11-02_Review_TM-1_Rev1'])
  })
})
