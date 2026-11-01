import JSZip from 'jszip'
import { describe, expect, it, vi } from 'vitest'
import { xlsxTabellen } from '../parse/xlsx'
import { datenstand, LABELS } from './datenstand'
import { eingabe } from './beispiel'
import { fusszeile, spaltenName, STYLES, xlsxExport } from './xlsx'

const teile = async (d: Uint8Array) => {
  const zip = await JSZip.loadAsync(d)
  const out: Record<string, string> = {}
  for (const [p, f] of Object.entries(zip.files)) if (!f.dir) out[p] = await f.async('string')
  return out
}

describe('Excel im Projektformat (Spez. v1.1 Kap. 10.4)', async () => {
  const d = datenstand(eingabe())
  const datei = await xlsxExport(d)
  const t = await teile(datei)
  const blaetter = await xlsxTabellen(datei)

  it('vier Blätter in fester Reihenfolge; Findings = Datenstand, Zeile für Zeile', () => {
    expect(blaetter.map((b) => b.name)).toEqual(['Summary', 'Findings', 'Compliance Matrix', 'Documents & Sources'])
    const f = blaetter[1].zeilen
    expect(f[0][0]).toBe(LABELS.disclaimer)
    expect(f[1]).toEqual(LABELS.columns)
    // Leere Spalten am Zeilenende schneidet der Leser ab, Zeilenumbrüche in Zellen fasst er zu Leerzeichen
    // zusammen — die Datei selbst trägt den Umbruch (geprüft am XML unten)
    const auffuellen = (z: string[]) => z.concat(Array(24 - z.length).fill(''))
    expect(f.slice(2).map(auffuellen)).toEqual(d.befunde.map((b) => b.spalten.map((c) => c.replace(/\s*\n\s*/g, ' '))))
    expect(t['xl/worksheets/sheet2.xml']).toContain('&quot;quoted&quot;\nzweite Zeile')
  })

  it('Summary: Kennung, COUNTIFS mit mitgelieferten Ergebnissen, To verify, Gesamtbewertung als Dropdown, Top 5', () => {
    const s = t['xl/worksheets/sheet1.xml']
    expect(s).toContain(`<f>COUNTIFS('Findings'!$N:$N,&quot;Inconsistency&quot;,'Findings'!$P:$P,&quot;High&quot;)</f><v>1</v>`)
    expect(s).toContain(`<f>COUNTIF('Findings'!$T:$T,&quot;To verify*&quot;)</f><v>1</v>`)
    expect(s).toMatch(/<f>SUM\(E\d+:E\d+\)<\/f><v>5<\/v>/)
    const z = blaetter[0].zeilen
    const zeile = (k: string) => z.find((r) => r[0] === k)!
    expect(zeile('Overall assessment')[1]).toBe('Not ready for submission')
    expect(zeile('Export ID')[1]).toBe('DC-2026-11-01-0007')
    const nr = z.findIndex((r) => r[0] === 'Overall assessment') + 1
    expect(s).toContain(`sqref="B${nr}"><formula1>&quot;Ready for submission,Ready for submission after correction,Not ready for submission&quot;</formula1>`)
    const top = z.findIndex((r) => r[0] === 'Top 5 critical findings')
    expect(z.slice(top + 2, top + 7).map((r) => r[0])).toEqual(d.top5)
    expect(z.some((r) => r[2] === 'LEP' && r[3] === 'Yellow')).toBe(true)
  })

  it('Findings: Dropdowns, Prioritätsfarben je Zeile, fixierte Kopfzeile, Filter, A4 quer, Fußzeile, Drucktitel', () => {
    const s = t['xl/worksheets/sheet2.xml']
    expect(s).toContain('<dataValidations count="5">')
    expect(s).toContain('sqref="P3:P7"><formula1>&quot;High,Medium,Low&quot;</formula1>')
    expect(s).toContain('<cfRule type="expression" dxfId="0" priority="1"><formula>$P3="High"</formula></cfRule>')
    expect(s).toContain('<pane ySplit="2" topLeftCell="A3" activePane="bottomLeft" state="frozen"/>')
    expect(s).toContain('<autoFilter ref="A2:X7"/>')
    expect(s).toContain('<pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/>')
    expect(s).toContain('Page &amp;P of &amp;N')
    expect(t['xl/workbook.xml']).toContain(`<definedName name="_xlnm.Print_Titles" localSheetId="1">'Findings'!$1:$2</definedName>`)
    expect(t['xl/workbook.xml']).toContain(`<definedName name="_xlnm._FilterDatabase" localSheetId="1" hidden="1">'Findings'!$A$2:$X$7</definedName>`)
    expect(t['xl/workbook.xml']).toContain('fullCalcOnLoad="1"')
    // Reihenfolge nach CT_Worksheet
    const reihe = ['<sheetPr>', '<dimension', '<sheetViews>', '<sheetFormatPr', '<cols>', '<sheetData>', '<autoFilter', '<conditionalFormatting', '<dataValidations', '<pageMargins', '<pageSetup', '<headerFooter>']
    const pos = reihe.map((x) => s.indexOf(x))
    expect(pos.every((p) => p >= 0)).toBe(true)
    expect([...pos].sort((a, b) => a - b)).toEqual(pos)
  })

  it('Schrift Arial, Kopfzeilen in Akzentfarbe, Prioritätsfarben aus Kap. 10.3', () => {
    expect(STYLES).toContain('<name val="Arial"/>')
    expect(STYLES).toContain('<fgColor rgb="FF2563BE"/>')
    expect(STYLES).toContain('<color rgb="FFB42318"/></font><fill><patternFill><bgColor rgb="FFFDECEC"/>')
    expect(STYLES).toContain('<color rgb="FF9C5700"/></font><fill><patternFill><bgColor rgb="FFFFF4D6"/>')
    expect(fusszeile({ ...d, organisation: 'A & B' })).toContain('A &amp;&amp; B')
    expect([spaltenName(0), spaltenName(23), spaltenName(26)]).toEqual(['A', 'X', 'AA'])
  })

  it('Matrix ehrlich leer, Quellen mit Kurzhash; gleicher Datenstand → gleiche Datei', async () => {
    expect(blaetter[2].zeilen[2][0]).toMatch(/^Not generated: the compliance matrix requires the AI review/)
    const q = blaetter[3].zeilen
    expect(q[2].slice(0, 5)).toEqual(['Document under review', 'TM', 'Training Manual CL30', 'TM-CL30', 'Rev 0.1'])
    expect(q[4][0]).toBe('Library – released')
    expect(q[2][8]).toHaveLength(12)
    // Uhr zwischen zwei Läufen vorstellen — sonst fiele ein Zeitstempel nur zufällig auf
    vi.useFakeTimers({ now: new Date('2026-11-01T10:00:00Z'), toFake: ['Date'] })
    const a = await xlsxExport(d)
    vi.setSystemTime(new Date('2026-11-01T10:00:05Z'))
    const b = await xlsxExport(d)
    vi.useRealTimers()
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true)
    expect(t['xl/worksheets/sheet1.xml']).toMatch(/<mergeCells count="\d+"><mergeCell ref="B3:E3"\/>/)
  })

  it('0 Befunde: gültige Datei mit Kopf, ohne Ampel und Top 5 einen Hinweis', async () => {
    const leer = datenstand(eingabe({ befunde: [], ampeln: [] }))
    const b = await xlsxTabellen(await xlsxExport(leer))
    expect(b[1].zeilen).toHaveLength(2)
    expect(b[0].zeilen.some((r) => r[0] === 'No findings.')).toBe(true)
    const s = (await teile(await xlsxExport(leer)))['xl/worksheets/sheet1.xml']
    expect(s).not.toContain('<conditionalFormatting')
  })
})
