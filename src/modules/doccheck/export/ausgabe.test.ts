import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { xlsxTabellen } from '../parse/xlsx'
import { csvLesen } from '../referenz/liste'
import { datenstand } from './datenstand'
import { eingabe } from './beispiel'
import { ENDUNG, erzeugen, MIME, paket, type Format } from './ausgabe'
import { pruefstandLesen, type Pruefstand } from './pruefstand'

const kontext = { userId: 'u-patrick', ts: '2026-11-01T09:30:00Z', formate: ['xlsx', 'docx', 'csv', 'pptx', 'json'] as Format[] }
const text = (d: Uint8Array) => new TextDecoder().decode(d)

describe('Alle Formate aus einem Datenstand (Spez. v1.1 Kap. 10.1, 10.8 „Inhaltsabgleich")', async () => {
  const d = datenstand(eingabe())
  const ids = d.befunde.map((b) => b.id)
  const datei = Object.fromEntries(await Promise.all((['xlsx', 'docx', 'csv', 'pptx', 'json'] as Format[]).map(async (f) => [f, await erzeugen(d, f, kontext)] as const)))

  it('Dateinamen nach Kap. 10.2 mit gleichem Stamm', () => {
    expect(Object.values(datei).map((x) => x.name)).toEqual([
      '2026-11-01_Review_TM-CL30_Rev0.1.xlsx',
      '2026-11-01_Review_TM-CL30_Rev0.1_Report.docx',
      '2026-11-01_Review_TM-CL30_Rev0.1_Findings.csv',
      '2026-11-01_Review_TM-CL30_Rev0.1_Briefing.pptx',
      '2026-11-01_Review_TM-CL30_Rev0.1.doccheck.json',
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

  it('ZIP-Paket enthält alle gewählten Formate und immer den Prüfstand', async () => {
    const z = await paket(d, ['csv', 'xlsx'], kontext)
    expect(z.name).toBe('2026-11-01_Review_TM-CL30_Rev0.1_All.zip')
    const namen = Object.keys((await JSZip.loadAsync(z.daten)).files).sort()
    expect(namen).toEqual(['2026-11-01_Review_TM-CL30_Rev0.1.doccheck.json', '2026-11-01_Review_TM-CL30_Rev0.1.xlsx', '2026-11-01_Review_TM-CL30_Rev0.1_Findings.csv'])
    const json = await (await JSZip.loadAsync(z.daten)).file('2026-11-01_Review_TM-CL30_Rev0.1.doccheck.json')!.async('string')
    expect((pruefstandLesen(json) as Pruefstand).exports[0].formats).toEqual(['csv', 'xlsx', 'json'])
  })
})
