import { describe, expect, it } from 'vitest'
import { csvBefunde } from './csv'
import { datenstand } from './datenstand'
import { eingabe } from './beispiel'
import { datenstandAus, hashAbgleich, MAX_BYTES, pruefstandAus, pruefstandLesen, pruefstandText, type Pruefstand } from './pruefstand'

describe('Prüfstand-Datei .doccheck.json (Spez. v1.1 Kap. 12)', () => {
  const d = datenstand(eingabe())
  const p = pruefstandAus(d, 'u-patrick', ['xlsx', 'csv'], '2026-11-01T09:30:00Z')

  it('Schema, Prüfer, Bewertung, Ampeln, Export-Verlauf; KEINE Dokumentinhalte', () => {
    expect(p.schema).toBe('doccheck/1')
    expect(p.reviewer).toEqual({ userId: 'u-patrick', name: 'Alex Beispiel', function: 'Head of Training' })
    expect(p.assessment).toEqual({ overall: 'not_ready', top5: d.top5, confirmedBy: '', confirmedAt: '' })
    expect(p.formalChecks).toContainEqual({ document: 'Training Manual CL30', group: 'Formal check', check: 'LEP', status: 'yellow' })
    expect(p.exports).toEqual([{ exportId: 'DC-2026-11-01-0007', formats: ['xlsx', 'csv'], ts: '2026-11-01T09:30:00Z' }])
    expect(p.documents[0]).toMatchObject({ id: 'tm', role: 'review', docType: 'TM', pages: 42 })
    expect(Object.keys(p.documents[0])).not.toContain('text')
    expect(p.findings[0]).toMatchObject({ id: 'TM-001', docId: 'tm', priority: 'High', category: 'Inconsistency', pageLabel: 'S. 3' })
  })

  it('Roundtrip: speichern → laden → derselbe Datenstand (neue Export-ID), CSV identisch', () => {
    const geladen = pruefstandLesen(pruefstandText(p))
    expect(typeof geladen).toBe('object')
    const d2 = datenstandAus(geladen as Pruefstand, '2026-11-02T08:00:00Z', 1)
    expect(d2.exportId).toBe('DC-2026-11-02-0001')
    expect(d2.befunde.map((b) => b.spalten)).toEqual(d.befunde.map((b) => b.spalten))
    expect([d2.zaehlung, d2.zuPruefen, d2.top5, d2.gesamt, d2.ampeln]).toEqual([d.zaehlung, d.zuPruefen, d.top5, d.gesamt, d.ampeln])
    expect(d2.dateiStamm).toBe('2026-11-02_Review_TM-CL30_Rev0.1')
    expect(csvBefunde(d2)).toBe(csvBefunde(d))
    // „Nicht bewertbar" übersteht den Weg über die Datei (Audit 11/2026, DC-03)
    const scan = pruefstandAus(datenstand(eingabe({ befunde: [], lesestand: { ocrSeiten: 2, ohneText: 1 } })), 'u', ['xlsx'], '2026-11-01T09:30:00Z')
    expect(scan.assessment.overall).toBe('not_assessable')
    expect(datenstandAus(pruefstandLesen(pruefstandText(scan)) as Pruefstand, '2026-11-02T08:00:00Z', 1).gesamt).toBe('notAssessable')
    // BOM wird toleriert; Top 5 nur mit vorhandenen IDs; unbekannte Ampel fällt auf nichts
    const mitBom = pruefstandLesen(`﻿${pruefstandText({ ...p, assessment: { ...p.assessment, top5: ['TM-001', 'GIBT-ES-NICHT'] } })}`) as Pruefstand
    expect(datenstandAus(mitBom, '2026-11-02', 1).top5).toEqual(['TM-001'])
  })

  it('wird abgewiesen statt geraten: kein JSON, fremdes oder neueres Schema, fehlende Felder, falsche Werte, zu groß', () => {
    const t = (x: unknown) => pruefstandLesen(JSON.stringify(x))
    expect(pruefstandLesen('{kaputt')).toBe('DC-STATE-JSON')
    expect(t(null)).toBe('DC-STATE-FORMAT')
    expect(t({ schema: 'anderes/1' })).toBe('DC-STATE-FORMAT')
    expect(t({ ...p, schema: 'doccheck/2' })).toBe('DC-STATE-VERSION')
    expect(t({ ...p, findings: undefined })).toBe('DC-STATE-FORMAT')
    expect(t({ ...p, findings: [{ ...p.findings[0], priority: 'Critical' }] })).toBe('DC-STATE-FORMAT')
    expect(t({ ...p, findings: [{ ...p.findings[0], description: 42 }] })).toBe('DC-STATE-FORMAT')
    expect(t({ ...p, findings: [null] })).toBe('DC-STATE-FORMAT')
    expect(t({ ...p, documents: [{ ...p.documents[0], role: 'admin' }] })).toBe('DC-STATE-FORMAT')
    expect(t({ ...p, formalChecks: [{ check: 'x', status: 'purple' }] })).toBe('DC-STATE-FORMAT')
    expect(t({ ...p, assessment: { ...p.assessment, overall: 'great' } })).toBe('DC-STATE-FORMAT')
    expect(pruefstandLesen(' '.repeat(MAX_BYTES + 1))).toBe('DC-STATE-SIZE')
  })

  it('Hash-Abgleich: wiedergeladen nur bei gleichem Hash, nicht bei gleichem Namen', () => {
    expect(hashAbgleich(p, [{ sha256: p.documents[0].sha256 }, { sha256: 'anders' }])).toEqual([
      { id: 'tm', titel: 'Training Manual CL30', da: true },
      { id: 'apx', titel: 'Appendix 4 – Line Training', da: false },
      { id: 'ear', titel: 'Part-ORA extract', da: false },
    ])
  })
})
