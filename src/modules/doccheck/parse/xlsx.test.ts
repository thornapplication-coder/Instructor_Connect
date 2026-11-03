import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { blattRaster, blattZeilen, geteilteTexte, rasterZeilen, xlsxLesen, xlsxTabellen, zahlformateLesen, zahlZeigen } from './xlsx'

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

  it('abgebrochen: nach dem nächsten entpackten Teil DC-ABORTED (Audit 11/2026, DC-01)', async () => {
    const c = new AbortController()
    c.abort()
    await expect(xlsxLesen(await xlsxBauen(), undefined, c.signal)).rejects.toThrow('DC-ABORTED')
  })

  it('großes Blatt (300 000 Zellen) ohne Stapelüberlauf; Randspalten fallen weg', () => {
    const raster = Array.from({ length: 30000 }, (_, i) => ['', ...Array.from({ length: 10 }, (_, k) => `${i}-${k}`)])
    const z = rasterZeilen(raster)
    expect(z).toHaveLength(30000)
    expect(z[0]).toBe('0-0 | 0-1 | 0-2 | 0-3 | 0-4 | 0-5 | 0-6 | 0-7 | 0-8 | 0-9')
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

  it('Raster mit Excel-Zeilennummern: leere Zeilen fallen weg, die Nummern bleiben (fürs Rückschreiben)', async () => {
    const nr: number[] = []
    const xml = '<row r="1"><c r="A1" t="inlineStr"><is><t>Titel</t></is></c></row><row r="2"/><row r="5"><c r="C5"><v>7</v></c></row><row><c r="A6"><v>8</v></c></row>'
    expect(blattRaster(xml, [], nr)).toEqual([['Titel'], ['', '', '7'], ['8']])
    expect(nr).toEqual([1, 5, 6])
    const [limits] = await xlsxTabellen(await xlsxBauen())
    expect(limits.zeilenNr).toEqual([1, 2])
  })
})

describe('Werte wie in Excel angezeigt, Leerzellen an ihrem Platz (Audit 11/2026, FRD-11)', () => {
  /** Mappe wie aus LibreOffice: eigene Formate dd.mm.yyyy (165), [h]:mm (167), 0% (168), 0.0 (166). */
  async function stundenMappe(date1904 = false): Promise<Uint8Array> {
    const zip = new JSZip()
    zip.file('xl/workbook.xml', `<workbook>${date1904 ? '<workbookPr date1904="1"/>' : '<workbookPr/>'}<sheets><sheet name="Flights" r:id="rId1"/><sheet name="Monthly" r:id="rId2"/></sheets></workbook>`)
    zip.file('xl/_rels/workbook.xml.rels', '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>')
    zip.file('xl/sharedStrings.xml', '<sst><si><t>Date</t></si><si><t>Lesson</t></si><si><t>Dual</t></si><si><t>Mutual</t></si><si><t>Total</t></si><si><t>FI-01</t></si><si><t>Progress</t></si><si><t>Record</t></si></sst>')
    zip.file(
      'xl/styles.xml',
      '<styleSheet><numFmts count="4"><numFmt numFmtId="165" formatCode="dd\\.mm\\.yyyy"/><numFmt numFmtId="166" formatCode="0.0"/><numFmt numFmtId="167" formatCode="[h]:mm"/><numFmt numFmtId="168" formatCode="0%"/></numFmts>' +
        '<cellStyleXfs count="1"><xf numFmtId="0"/></cellStyleXfs><cellXfs count="6"><xf numFmtId="0"/><xf numFmtId="165"/><xf numFmtId="166"/><xf numFmtId="167"/><xf numFmtId="168"/><xf numFmtId="20"/></cellXfs></styleSheet>',
    )
    // Spalte A leer (Rand), Mutual (F) in Zeile 4 leer
    zip.file(
      'xl/worksheets/sheet1.xml',
      '<worksheet><sheetData><row r="1"><c r="B1" t="s"><v>7</v></c></row>' +
        '<row r="3"><c r="B3" t="s"><v>0</v></c><c r="C3" t="s"><v>1</v></c><c r="D3" t="s"><v>2</v></c><c r="E3" t="s"><v>3</v></c><c r="F3" t="s"><v>4</v></c></row>' +
        '<row r="4"><c r="B4" s="1"><v>46083</v></c><c r="C4" t="s"><v>5</v></c><c r="D4" s="2"><v>1</v></c><c r="E4" s="2"/><c r="F4" s="2"><f>D4+E4</f><v>1</v></c></row>' +
        '<row r="5"><c r="B5" t="s"><v>6</v></c><c r="C5" s="4"><v>0.53</v></c><c r="D5" s="5"><v>0.75</v></c></row></sheetData></worksheet>',
    )
    zip.file('xl/worksheets/sheet2.xml', '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>4</v></c><c r="B1" s="3"><v>0.583333333333333</v></c><c r="C1" s="3"><v>1.5</v></c></row></sheetData></worksheet>')
    return zip.generateAsync({ type: 'uint8array' })
  }

  it('Datum, Zeit, Prozent und Dezimalstellen wie angezeigt; leere Zelle bleibt an ihrem Platz; leere Randspalte fällt weg', async () => {
    const r = await xlsxLesen(await stundenMappe())
    expect(r.pages[0].text.split('\n')).toEqual(['Record', '', 'Date | Lesson | Dual | Mutual | Total', '02.03.2026 | FI-01 | 1.0 |  | 1.0', 'Progress | 53% | 18:00 |  | '])
    expect(r.pages[1].text).toBe('Total | 14:00 | 36:00')
  })

  it('1904-Datumssystem (ältere Mac-Dateien)', async () => {
    expect((await xlsxLesen(await stundenMappe(true))).pages[0].text).toContain('03.03.2030 | FI-01')
  })

  it('Formatcodes je Zellformat: eigene vor eingebauten, unbekannte ohne Format', () => {
    expect(zahlformateLesen('<numFmts><numFmt numFmtId="200" formatCode="0.000"/></numFmts><cellStyleXfs><xf numFmtId="14"/></cellStyleXfs><cellXfs><xf numFmtId="0"/><xf numFmtId="200"/><xf numFmtId="14"/><xf numFmtId="49"/><xf/></cellXfs>')).toEqual([undefined, '0.000', 'dd.mm.yyyy', undefined, undefined])
  })

  it('zahlZeigen: Datum (auch mit Zeit, vor März 1900), Zeiten, Prozent, Nachkommastellen, Rest bleibt Wert', () => {
    expect(zahlZeigen('46083', 'dd.mm.yyyy')).toBe('02.03.2026')
    expect(zahlZeigen('46083.5', 'm/d/yy h:mm')).toBe('02.03.2026 12:00')
    expect([zahlZeigen('1', 'dd.mm.yyyy'), zahlZeigen('59', 'dd.mm.yyyy'), zahlZeigen('61', 'dd.mm.yyyy')]).toEqual(['01.01.1900', '28.02.1900', '01.03.1900'])
    expect(zahlZeigen('46083', 'mmm-yy')).toBe('02.03.2026')
    expect([zahlZeigen('0.5833333', 'h:mm'), zahlZeigen('0.375', 'hh:mm'), zahlZeigen('1.25', 'h:mm'), zahlZeigen('0.5', 'h:mm AM/PM')]).toEqual(['14:00', '09:00', '6:00', '12:00'])
    expect([zahlZeigen('1.5', '[h]:mm'), zahlZeigen('0.0104166', '[h]:mm:ss'), zahlZeigen('0.0104166667', 'mm:ss'), zahlZeigen('0.0104166667', '[mm]:ss')]).toEqual(['36:00', '0:15:00', '15:00', '15:00'])
    // Rundung über Mitternacht hinweg: 23:59:59,9 → nächster Tag 00:00
    expect(zahlZeigen('46083.99999', 'dd.mm.yyyy hh:mm')).toBe('03.03.2026 00:00')
    expect([zahlZeigen('0.53', '0%'), zahlZeigen('0.5345', '0.0%'), zahlZeigen('0.5', '0.00%')]).toEqual(['53%', '53.5%', '50.00%'])
    expect([zahlZeigen('1', '0.0'), zahlZeigen('1234.5', '#,##0.00'), zahlZeigen('1.256', '#.##'), zahlZeigen('2', '0'), zahlZeigen('1.5', '#,##0')]).toEqual(['1.0', '1234.50', '1.26', '2', '2'])
    expect(zahlZeigen('1.5', '"h "0.0;[Red]-0.0')).toBe('1.5')
    // Unbekannt, Text, Bruch, Exponent, negativ als Zeit, kein Format: gespeicherter Wert ohne Gleitkommarest
    expect([zahlZeigen('0.30000000000000004', undefined), zahlZeigen('0.30000000000000004', 'General'), zahlZeigen('5', '@'), zahlZeigen('0.5', '# ?/?'), zahlZeigen('12000', '0.00E+00'), zahlZeigen('-0.5', 'h:mm'), zahlZeigen('7', '[Red]')]).toEqual(['0.3', '0.3', '5', '0.5', '12000', '-0.5', '7'])
    expect([zahlZeigen('', 'dd.mm.yyyy'), zahlZeigen('abc', '0.0')]).toEqual(['', 'abc'])
  })

  it('rasterZeilen: einzelne Werte sind Text, Zeilen mit Werten volle Breite, Lücken in den Excel-Zeilen als Leerzeile', () => {
    expect(rasterZeilen([['', 'Titel'], ['', 'a', '', 'c'], ['', 'x', 'y']], [1, 3, 4])).toEqual(['Titel', '', 'a |  | c', 'x | y | '])
    expect(rasterZeilen([])).toEqual([])
    expect(rasterZeilen([['a', 'b']])).toEqual(['a | b'])
  })

  it('Datumszelle vom Typ „d" (ISO) im Hausformat; ohne Zahlformate bleibt der Rasterwert roh (Fremd-/Referenzlisten)', () => {
    expect(blattRaster('<row r="1"><c r="A1" t="d"><v>2026-03-02T00:00:00</v></c><c r="B1" s="1"><v>46083</v></c></row>', [], undefined, { codes: [undefined, 'dd.mm.yyyy'] })).toEqual([['02.03.2026', '02.03.2026']])
    expect(blattRaster('<row r="1"><c r="A1" s="1"><v>46083</v></c></row>', [])).toEqual([['46083']])
  })
})
