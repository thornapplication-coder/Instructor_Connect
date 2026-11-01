import { describe, expect, it } from 'vitest'
import type { SitzungsDok } from '../sitzung'
import type { Befund } from '../pruefung/befund'
import { befund } from './beispiel'
import { exportDokumente, exportEingabe, LAUF_KEY, naechsteLaufnummer } from './ausSitzung'
import { datenstand } from './datenstand'

const felder = { typ: 'TM', titel: 'Training Manual', nummer: 'TM-1', revision: 'Rev 1', datum: '2026-10-01', rang: '2' }
const doc = (id: string, rolle: 'review' | 'master', x: Partial<SitzungsDok> = {}, befunde: Befund[] = []): SitzungsDok =>
  ({
    id, rolle, name: `${id}.docx`, groesse: 1, status: 'fertig', felder, erkannt: [],
    z: { seiten: 5, sha256: `h-${id}`, pruefung: rolle === 'review' ? { befunde, ampel: { formal: { lep: 'ok' }, word: {}, sprache: { platzhalter: 'wait' }, referenz: {} } } : undefined },
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
      datum: '2026-11-01T10:00:00Z', laufnummer: 2, appVersion: '1.22.0', organisation: '', pruefer: { name: 'A', funktion: 'B' }, bibliothek: 'Sandbox',
    })
    expect(e.befunde.map((b) => [b.id, b.dokName])).toEqual([['F-01', 'Training Manual'], ['P-01', 'paket']])
    expect(e.ampeln).toEqual([{ dokId: 'r', gruppen: { formal: { lep: 'ok' }, sprache: { platzhalter: 'wait' } } }])
    expect(datenstand(e).befunde.map((b) => b.id)).toEqual(['TM-001', 'PKG-001'])
  })

  it('Laufnummer je Tag: zählt hoch, beginnt am nächsten Tag neu, übersteht kaputte oder fehlende Ablage', () => {
    const a = ablage()
    expect([naechsteLaufnummer(a, '2026-11-01T08:00Z'), naechsteLaufnummer(a, '2026-11-01T09:00Z'), naechsteLaufnummer(a, '2026-11-02T08:00Z')]).toEqual([1, 2, 1])
    a.m.set(LAUF_KEY, '{kaputt')
    expect(naechsteLaufnummer(a, '2026-11-02')).toBe(1)
    const wirft = { getItem: () => { throw new Error('x') }, setItem: () => { throw new Error('x') } }
    expect(naechsteLaufnummer(wirft, '2026-11-02')).toBe(1)
  })
})
