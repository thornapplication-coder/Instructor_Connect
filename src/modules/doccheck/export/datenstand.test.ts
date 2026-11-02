import { describe, expect, it } from 'vitest'
import { dateiStamm, datenstand, exportId, fussText, gesamtVorschlag, kennung, LABELS, seitenZahl } from './datenstand'
import { dok, eingabe } from './beispiel'
import { VOLL_GELESEN } from '../pruefung/befund'

describe('Export-Datenstand (Spez. v1.1 Kap. 10.1, 10.2)', () => {
  const d = datenstand(eingabe())

  it('Export-ID, Dateinamen-Stamm, Datum ISO', () => {
    expect(d.exportId).toBe('DC-2026-11-01-0007')
    expect(exportId('2026-01-02', 0)).toBe('DC-2026-01-02-0001')
    expect(d.datum).toBe('2026-11-01')
    expect(d.dateiStamm).toBe('2026-11-01_Review_TM-CL30_Rev0.1')
    expect(dateiStamm('2026-11-01', null)).toBe('2026-11-01_Review_Package_RevNA')
    expect(dateiStamm('2026-11-01', dok('x', 'review', { name: 'Ops Manual (draft).docx', revision: 'Revision 2' }))).toBe('2026-11-01_Review_Ops-Manual-draft_Rev2')
    expect(dateiStamm('2026-11-01', dok('x', 'review', { name: '', titel: '' }))).toBe('2026-11-01_Review_Document_RevNA')
  })

  it('Sortierung Dokument → Seite → Priorität; IDs eindeutig über Dokumente, Paket zuletzt', () => {
    expect(d.befunde.map((b) => [b.id, b.spalten[1], b.spalten[5], b.prioritaet])).toEqual([
      ['TM-001', 'Training Manual CL30', 'S. 3', 'High'],
      ['TM-002', 'Training Manual CL30', 'S. 3', 'Medium'],
      ['TM-003', 'Training Manual CL30', 'S. 12', 'Low'],
      // zweites Dokument mit gleichem Typ bekommt ein eigenes Präfix
      ['TM2-001', 'Appendix 4 – Line Training', 'S. 2', 'High'],
      ['PKG-001', 'Package', '', 'Medium'],
    ])
    expect(new Set(d.befunde.map((b) => b.id)).size).toBe(d.befunde.length)
  })

  it('Spalten: 24 in fester Reihenfolge; Korrektur englisch aus dem Sprachpaket; weitere Dokumente', () => {
    expect(LABELS.columns).toHaveLength(24)
    for (const b of d.befunde) expect(b.spalten).toHaveLength(24)
    const tm1 = d.befunde[0].spalten
    expect(tm1[3]).toBe('Rev 0.1 / 2026-10-01')
    expect(tm1[4]).toBe('2.1 Hours')
    expect(tm1[13]).toBe('Inconsistency')
    expect(tm1[17]).toMatch(/^[A-Z]/)
    expect(tm1[17]).not.toBe('')
    expect(tm1.slice(19)).toEqual(['Verified (rule-based)', 'New', '', '', 'Open'])
    expect(d.befunde[3].spalten[18]).toBe('Training Manual CL30')
    expect(d.befunde[2].spalten[17]).toBe('')
  })

  it('Zählung Category × Priority, To verify, Top 5, Gesamtbewertung', () => {
    expect(d.zaehlung.Inconsistency).toEqual({ High: 1, Medium: 1, Low: 0 })
    expect(d.zaehlung.Gap.High).toBe(1)
    expect(Object.values(d.zaehlung).flatMap((x) => Object.values(x)).reduce((a, b) => a + b, 0)).toBe(5)
    expect(d.zuPruefen).toBe(1)
    expect(d.top5).toEqual(['TM-001', 'TM2-001', 'TM-002', 'PKG-001', 'TM-003'])
    expect(d.gesamt).toBe('notReady')
    expect(gesamtVorschlag([{ prioritaet: 'Low' }], VOLL_GELESEN)).toBe('afterCorrection')
    expect(gesamtVorschlag([], VOLL_GELESEN)).toBe('ready')
  })

  it('Seiten ohne Textebene: „Not assessable – text recognition pending", nie „Ready" (Audit 11/2026, DC-03)', () => {
    // Ein Scan ohne OCR hat keine Befunde und ging als „Ready for submission" in den Export
    const scan = { ocrSeiten: 1, ohneText: 1 }
    expect(gesamtVorschlag([], scan)).toBe('notAssessable')
    expect(gesamtVorschlag([{ prioritaet: 'Low' }], scan)).toBe('notAssessable')
    expect(gesamtVorschlag([], { ocrSeiten: 0, ohneText: 1 })).toBe('notAssessable')
    // Ein offener Hoch-Befund sagt sicher „nicht bereit", gleich was ungelesen ist
    expect(gesamtVorschlag([{ prioritaet: 'High' }], scan)).toBe('notReady')
    const s = datenstand(eingabe({ befunde: [], lesestand: scan }))
    expect(s.gesamt).toBe('notAssessable')
    expect(LABELS.overall.notAssessable).toBe('Not assessable – text recognition pending')
    expect(Object.fromEntries(kennung(s))['Overall assessment']).toBe('Not assessable – text recognition pending')
  })

  it('Ampeln mit englischen Namen; Kennungsblock und Fußzeile', () => {
    expect(d.ampeln).toContainEqual({ dokument: 'Training Manual CL30', gruppe: 'Formal check', punkt: 'LEP', ampel: 'wait' })
    expect(d.ampeln).toContainEqual(expect.objectContaining({ gruppe: 'Word check', ampel: 'bad' }))
    const k = Object.fromEntries(kennung(d))
    expect(k).toMatchObject({ Organisation: 'Example ATO', 'Review type': 'Initial review', 'Overall assessment': 'Not ready for submission', 'Export ID': 'DC-2026-11-01-0007', Disclaimer: 'AI-assisted review – expert approval required' })
    expect(k['Document under review']).toBe('Training Manual CL30 · TM-CL30 · Rev 0.1 · 2026-10-01')
    expect(k['Master documents used']).toMatch(/^1 /)
    expect(fussText(d)).toBe('Example ATO · DocCheck Review · Training Manual CL30 Rev 0.1 · DC-2026-11-01-0007')
    // Ohne Organisation: nichts erfunden, Feld fehlt
    const ohne = datenstand(eingabe({ organisation: '  ', dokumente: [] }))
    expect(kennung(ohne).map(([key]) => key)).not.toContain('Organisation')
    expect(fussText(ohne)).toBe('DocCheck Review · Package · DC-2026-11-01-0007')
    expect(Object.fromEntries(kennung(ohne))['Document under review']).toBe('—')
  })

  it('0 Befunde: leere Liste, „ready", keine Top 5', () => {
    const leer = datenstand(eingabe({ befunde: [] }))
    expect([leer.befunde, leer.top5, leer.gesamt, leer.zuPruefen]).toEqual([[], [], 'ready', 0])
  })

  it('Seitenzahlen aus Bezeichnungen', () => {
    expect([seitenZahl('S. 12'), seitenZahl('ca. 3'), seitenZahl('6-04-15 Page 2'), seitenZahl(undefined)]).toEqual([12, 3, 6, Number.MAX_SAFE_INTEGER])
  })
})
