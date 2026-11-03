import JSZip from 'jszip'
import { describe, expect, it, vi } from 'vitest'
import { xlsxTabellen } from '../parse/xlsx'
import { csvLesen } from '../referenz/liste'
import { datenstand } from './datenstand'
import { eingabe } from './beispiel'
import { ENDUNG, erzeugen, exportFehler, MIME, paket, type Format } from './ausgabe'
import { datenstandAus, pruefstandAus, pruefstandLesen, type Pruefstand } from './pruefstand'

const kontext = { userId: 'u-patrick', ts: '2026-11-01T09:30:00Z', formate: ['xlsx', 'docx', 'csv', 'pptx', 'json'] as Format[] }
const text = (d: Uint8Array) => new TextDecoder().decode(d)

describe('Alle Formate aus einem Datenstand (Spez. v1.1 Kap. 10.1, 10.8 „Inhaltsabgleich")', async () => {
  const d = datenstand(eingabe())
  const ids = d.befunde.map((b) => b.id)
  const datei = Object.fromEntries(await Promise.all((['xlsx', 'docx', 'csv', 'pptx', 'json'] as Format[]).map(async (f) => [f, await erzeugen(d, f, kontext)] as const)))

  it('Dateinamen nach Kap. 10.2 mit gleichem Stamm', () => {
    // Bewusst geändert: Das Beispiel hat zwei Prüfdokumente, der Stamm nennt das zweite mit (Audit 11/2026, EXP-08)
    expect(Object.values(datei).map((x) => x.name)).toEqual([
      '2026-11-01_Review_TM-CL30-plus-1_Rev0.1.xlsx',
      '2026-11-01_Review_TM-CL30-plus-1_Rev0.1_Report.docx',
      '2026-11-01_Review_TM-CL30-plus-1_Rev0.1_Findings.csv',
      '2026-11-01_Review_TM-CL30-plus-1_Rev0.1_Briefing.pptx',
      '2026-11-01_Review_TM-CL30-plus-1_Rev0.1.doccheck.json',
    ])
    expect(datei.csv.mime).toBe(MIME.csv)
    expect(Object.keys(ENDUNG)).toHaveLength(5)
  })

  it('IDs und Zahlen in allen Formaten identisch', async () => {
    // TextDecoder entfernt das BOM selbst — dass es da ist, zeigen die ersten drei Bytes
    expect([...datei.csv.daten.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
    expect(csvLesen(text(datei.csv.daten)).slice(1).map((z) => z[0])).toEqual(ids)
    expect((await xlsxTabellen(datei.xlsx.daten))[1].zeilen.slice(2).map((z) => z[0])).toEqual(ids)
    expect((pruefstandLesen(text(datei.json.daten)) as Pruefstand).findings.map((f) => f.id)).toEqual(ids)
    const wort = (await (await JSZip.loadAsync(datei.docx.daten)).file('word/document.xml')!.async('string')).replace(/<[^>]+>/g, '')
    // Word gruppiert nach Kapitel — gleiche Menge, und jede ID genau einmal in der Befundtabelle
    for (const id of ids) expect(wort.split(id).length - 1).toBeGreaterThanOrEqual(1)
    const folie5 = await (await JSZip.loadAsync(datei.pptx.daten)).file('ppt/slides/slide5.xml')!.async('string')
    expect(d.top5.filter((id) => folie5.includes(id))).toEqual(d.top5)
    const summary = (await xlsxTabellen(datei.xlsx.daten))[0].zeilen
    const total = summary.find((z) => z[0] === 'Total')!
    expect(total.slice(1, 5)).toEqual(['2', '2', '1', '5'])
  })

  it('der eingestellte CSV-Trenner erreicht die Befund-CSV, auch im ZIP-Paket (Spez. 10.6; Audit 11/2026, EXP-17)', async () => {
    expect(text(datei.csv.daten).split('\r\n')[0]).toMatch(/^"ID";"Document";/)
    const komma = await erzeugen(d, 'csv', { ...kontext, csvTrenner: ',' })
    expect(text(komma.daten).split('\r\n')[0]).toMatch(/^"ID","Document",/)
    const z = await JSZip.loadAsync((await paket(d, ['csv'], { ...kontext, csvTrenner: ',' })).daten)
    expect((await z.file('2026-11-01_Review_TM-CL30-plus-1_Rev0.1_Findings.csv')!.async('string')).split('\r\n')[0]).toMatch(/"ID","Document",/)
  })

  it('ZIP-Paket enthält alle gewählten Formate und immer den Prüfstand', async () => {
    const z = await paket(d, ['csv', 'xlsx'], kontext)
    expect(z.name).toBe('2026-11-01_Review_TM-CL30-plus-1_Rev0.1_All.zip')
    const namen = Object.keys((await JSZip.loadAsync(z.daten)).files).sort()
    expect(namen).toEqual(['2026-11-01_Review_TM-CL30-plus-1_Rev0.1.doccheck.json', '2026-11-01_Review_TM-CL30-plus-1_Rev0.1.xlsx', '2026-11-01_Review_TM-CL30-plus-1_Rev0.1_Findings.csv'])
    const json = await (await JSZip.loadAsync(z.daten)).file('2026-11-01_Review_TM-CL30-plus-1_Rev0.1.doccheck.json')!.async('string')
    expect((pruefstandLesen(json) as Pruefstand).exports[0].formats).toEqual(['csv', 'xlsx', 'json'])
  })

  it('ZIP aus geladenem Prüfstand: der Prüfstand darin behält dessen Herkunft (Audit 11/2026, EXP-15)', async () => {
    // Vorher legte das ZIP einen Prüfstand mit der ID des Exportierenden und neuem Anlagedatum hinein
    const geladen = pruefstandAus(d, 'u-patrick', ['json'], '2026-11-01T09:30:00Z')
    const d2 = datenstandAus(geladen, '2026-11-02T08:00:00+01:00', 1, '1.23.0')
    const z = await paket(d2, ['csv'], { userId: 'u-christian', ts: '2026-11-02T08:00:00+01:00', herkunft: geladen })
    const zip = await JSZip.loadAsync(z.daten)
    const json = pruefstandLesen(await zip.file(`${d2.dateiStamm}.doccheck.json`)!.async('string')) as Pruefstand
    expect([json.reviewer.userId, json.createdAt, json.app.version, json.app.sourceAppVersion]).toEqual(['u-patrick', '2026-11-01T09:30:00Z', '1.23.0', '1.22.0'])
    expect(json.exports.map((x) => x.exportId)).toEqual(['DC-2026-11-01-0007', 'DC-2026-11-02-0001'])
  })
})

/**
 * Audit 11/2026, TEC-19: Offline scheiterten Excel, Word, PowerPoint und
 * ZIP mit „Der Export konnte nicht erzeugt werden." — ihre Bibliothek kommt
 * erst beim ersten Export übers Netz. Die Meldung sagt jetzt „einmal Netz
 * nötig; CSV und Prüfstand gehen offline", und das muss stimmen.
 */
describe('Export ohne Netz (TEC-19)', () => {
  const MODUL = 'Failed to fetch dynamically imported module: https://x/assets/xlsx-a1b2.js'

  it('Ladefehler offline → „netz", mit Netz → „neuLaden"; ein Fehler im Code bleibt „fehler"', () => {
    // Bewusst geändert (Gegenprüfung P7): Mit Netz hieß ein Ladefehler ebenfalls „netz" — „gerade ist
    // keins da", obwohl Netz da war. Chromium hatte den gescheiterten Abruf gespeichert: Einmal offline
    // auf „Word" geklickt, scheiterten danach mit Netz Word UND Excel bei jedem Klick, bis die Seite neu lud
    for (const m of [MODUL, 'error loading dynamically imported module: https://x/assets/docx-a1.js', 'Importing a module script failed.']) {
      expect(exportFehler(new TypeError(m), false)).toBe('netz')
      expect(exportFehler(new TypeError(m), true)).toBe('neuLaden')
    }
    // Ohne Angabe fragt sie das Gerät (ladefehler.ts) — Node gilt als online
    expect(exportFehler(new TypeError(MODUL))).toBe('neuLaden')
    // Der nackte Netzfehler zählt nur offline — online wäre er ein anderer Fehler
    expect(exportFehler(new TypeError('Failed to fetch'), false)).toBe('netz')
    expect(exportFehler(new TypeError('Failed to fetch'), true)).toBe('fehler')
    expect(exportFehler(new TypeError("Cannot read properties of undefined (reading 'befunde')"), false)).toBe('fehler')
    expect(exportFehler(new Error('DC-STATE-FORMAT'), false)).toBe('fehler')
    expect(exportFehler(undefined, false)).toBe('fehler')
  })

  it('CSV und Prüfstand laden keine Bibliothek; Excel und ZIP reichen den Ladefehler unverpackt an den Knopf', async () => {
    vi.resetModules()
    // Word und PowerPoint: Das Nachladen selbst scheitert
    const weg = () => {
      throw new TypeError(MODUL)
    }
    vi.doMock('./docx', weg)
    vi.doMock('./pptx', weg)
    // Excel: scheitert mit der Meldung des Browsers — so muss sie beim Knopf ankommen
    vi.doMock('./xlsx', () => ({ xlsxExport: () => Promise.reject(new TypeError(MODUL)) }))
    try {
      const a = await import('./ausgabe')
      const d = datenstand(eingabe())
      expect((await a.erzeugen(d, 'csv', kontext)).name).toMatch(/_Findings\.csv$/)
      expect((await a.erzeugen(d, 'json', kontext)).name).toMatch(/\.doccheck\.json$/)
      expect(a.exportFehler(await a.erzeugen(d, 'xlsx', kontext).catch((e: unknown) => e), false)).toBe('netz')
      expect(a.exportFehler(await a.paket(d, ['csv', 'xlsx'], kontext).catch((e: unknown) => e), false)).toBe('netz')
      // Word/PowerPoint scheitern ebenfalls — nie mit einem Download
      await expect(a.erzeugen(d, 'docx', kontext)).rejects.toThrow()
      await expect(a.erzeugen(d, 'pptx', kontext)).rejects.toThrow()
      expect((await a.paket(d, ['csv'], kontext)).name).toMatch(/_All\.zip$/)
    } finally {
      vi.doUnmock('./docx')
      vi.doUnmock('./pptx')
      vi.doUnmock('./xlsx')
      vi.resetModules()
    }
  })
})
