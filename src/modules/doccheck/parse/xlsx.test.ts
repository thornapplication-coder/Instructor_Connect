import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { blattZeilen, geteilteTexte, xlsxLesen } from './xlsx'

export async function xlsxBauen(): Promise<Uint8Array> {
  const zip = new JSZip()
  zip.file('xl/workbook.xml', '<workbook><sheets><sheet name="Limits" sheetId="1" r:id="rId1"/><sheet name="Leer" sheetId="2" r:id="rId2"/></sheets></workbook>')
  zip.file('xl/_rels/workbook.xml.rels', '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="/xl/worksheets/sheet2.xml"/></Relationships>')
  zip.file('xl/sharedStrings.xml', '<sst><si><t>VMO</t></si><si><r><t>Max</t></r><r><t> speed</t></r><rPh><t>x</t></rPh></si></sst>')
  zip.file(
    'xl/worksheets/sheet1.xml',
    '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1"><v>320</v></c><c r="C1" t="inlineStr"><is><t>KIAS</t></is></c></row><row r="2"><c r="A2" t="s"><v>1</v></c><c r="B2" t="b"><v>1</v></c><c r="C2"><f>SUM(B1)</f><v>320</v></c></row><row r="3"><c r="A3"/></row></sheetData></worksheet>',
  )
  zip.file('xl/worksheets/sheet2.xml', '<worksheet><sheetData/></worksheet>')
  return zip.generateAsync({ type: 'uint8array' })
}

describe('XLSX lesen (Spez. 7.4)', () => {
  it('je Blatt eine Seite mit Blattnamen, Zeilen als „A | B | C", Formeln mit Ergebnis', async () => {
    const r = await xlsxLesen(await xlsxBauen())
    expect(r.pages.map((p) => [p.label, p.text])).toEqual([
      ['Limits', 'VMO | 320 | KIAS\nMax speed | TRUE | 320'],
      ['Leer', ''],
    ])
    expect(r.tabellen).toBe(2)
  })

  it('geteilte Texte ohne phonetische Hilfen; leere Zeilen fallen weg', () => {
    expect(geteilteTexte('<sst><si><t>a</t><rPh><t>b</t></rPh></si></sst>')).toEqual(['a'])
    expect(blattZeilen('<row><c t="b"><v>0</v></c></row><row><c/></row>', [])).toEqual(['FALSE'])
  })

  it('ohne Arbeitsmappe: verständlicher Fehlercode; fehlende Teile werden toleriert', async () => {
    const zip = new JSZip()
    zip.file('x', 'x')
    await expect(xlsxLesen(await zip.generateAsync({ type: 'uint8array' }))).rejects.toThrow('DC-XLSX-INVALID')
    const z2 = new JSZip()
    z2.file('xl/workbook.xml', '<workbook><sheets><sheet r:id="rX"/></sheets></workbook>')
    const r = await xlsxLesen(await z2.generateAsync({ type: 'uint8array' }))
    expect(r.pages.map((p) => p.label)).toEqual(['Sheet1'])
  })
})
