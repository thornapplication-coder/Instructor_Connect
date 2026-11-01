import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { SBX_FL_01, SBX_FL_01_WERTE, sbxFl01 } from '../benchmark/sbx'
import { blattRaster } from '../parse/xlsx'
import {
  ausgabeName,
  dimensionErweitern,
  GEAENDERTE_TEILE,
  inlineZelle,
  listenWerte,
  neuBerechnen,
  rueckschreiben,
  spaltenBreite,
  spaltenName,
  stilMitUmbruch,
  werteVorschlagen,
  zaehlformelnAktualisieren,
  zeileBearbeiten,
  zelleLesen,
  zelleSetzen,
  zellStil,
} from './rueckschreiben'

const teile = async (d: Uint8Array) => {
  const zip = await JSZip.loadAsync(d)
  const out: Record<string, string> = {}
  for (const [p, f] of Object.entries(zip.files)) if (!f.dir) out[p] = await f.async('string')
  return out
}

describe('Zellen auf XML-Ebene', () => {
  it('Spaltennamen über Z hinaus', () => {
    expect([0, 25, 26, 51, 701, 702].map(spaltenName)).toEqual(['A', 'Z', 'AA', 'AZ', 'ZZ', 'AAA'])
  })

  it('Inline-String: maskiert, Zeilenumbruch bleibt, verbotene Steuerzeichen fallen weg', () => {
    expect(inlineZelle('J4', 'a < b & „c"\nd\u0007', 5)).toBe('<c r="J4" s="5" t="inlineStr"><is><t xml:space="preserve">a &lt; b &amp; „c"\nd</t></is></c>')
    expect(inlineZelle('A1', 'x')).toBe('<c r="A1" t="inlineStr"><is><t xml:space="preserve">x</t></is></c>')
  })

  it('setzt und ersetzt in Spaltenreihenfolge; unberührte Zellen bleiben Zeichen für Zeichen; spans fällt weg', () => {
    const z = '<row r="4" spans="1:9" ht="20"><c r="A4" s="2" t="s"><v>0</v></c><c r="G4" s="2" t="s"><v>7</v></c></row>'
    const neu = zelleSetzen(zelleSetzen(z, inlineZelle('J4', 'R', 6)), inlineZelle('G4', 'Closed', 2))
    expect(neu).toBe('<row r="4" ht="20"><c r="A4" s="2" t="s"><v>0</v></c><c r="G4" s="2" t="inlineStr"><is><t xml:space="preserve">Closed</t></is></c><c r="J4" s="6" t="inlineStr"><is><t xml:space="preserve">R</t></is></c></row>')
    expect(zelleSetzen('<row r="2"/>', inlineZelle('B2', 'x'))).toBe('<row r="2"><c r="B2" t="inlineStr"><is><t xml:space="preserve">x</t></is></c></row>')
    // Einfügen VOR einer vorhandenen Zelle
    expect(zelleSetzen('<row r="1"><c r="C1"/></row>', '<c r="A1"/>')).toBe('<row r="1"><c r="A1"/><c r="C1"/></row>')
  })

  it('Zeile bearbeiten: vorhandene, fehlende (an der richtigen Stelle) und leeres sheetData', () => {
    const b = '<sheetData><row r="1"><c r="A1"/></row><row r="3"><c r="A3"/></row></sheetData>'
    expect(zeileBearbeiten(b, 3, (z) => z.replace('A3"', 'A3" s="1"'))).toContain('<row r="3"><c r="A3" s="1"/></row>')
    expect(zeileBearbeiten(b, 2, (z) => z)).toBe('<sheetData><row r="1"><c r="A1"/></row><row r="2"/><row r="3"><c r="A3"/></row></sheetData>')
    expect(zeileBearbeiten(b, 9, (z) => z)).toBe('<sheetData><row r="1"><c r="A1"/></row><row r="3"><c r="A3"/></row><row r="9"/></sheetData>')
    expect(zeileBearbeiten('<sheetData/>', 1, (z) => z)).toBe('<sheetData><row r="1"/></sheetData>')
    // r="1" darf nicht r="14" treffen
    expect(zeileBearbeiten('<sheetData><row r="14"/></sheetData>', 1, (z) => z)).toBe('<sheetData><row r="1"/><row r="14"/></sheetData>')
  })

  it('Zelle lesen und Stil', () => {
    expect(zelleLesen('<row><c r="A1" s="3"><v>1</v></c></row>', 'A1')).toBe('<c r="A1" s="3"><v>1</v></c>')
    expect(zelleLesen('<row/>', 'A1')).toBeNull()
    expect(zellStil('<c r="A1" s="3"/>')).toBe(3)
    expect(zellStil('<c r="A1"/>')).toBeUndefined()
  })
})

describe('Blattrahmen und Formatvorlagen', () => {
  it('dimension wird erweitert, nie verkleinert', () => {
    expect(dimensionErweitern('<dimension ref="A1:I23"/>', 9)).toBe('<dimension ref="A1:J23"/>')
    expect(dimensionErweitern('<dimension ref="A1"/>', 2)).toBe('<dimension ref="A1:C1"/>')
    expect(dimensionErweitern('<dimension ref="A1:Z9"/>', 3)).toBe('<dimension ref="A1:Z9"/>')
  })

  it('Spaltenbreite: neuer Eintrag, ohne <cols> und mit geteiltem Bereich', () => {
    expect(spaltenBreite('<cols><col min="1" max="1" width="6"/></cols><sheetData/>', 9, 95)).toBe('<cols><col min="1" max="1" width="6"/><col min="10" max="10" width="95" customWidth="1"/></cols><sheetData/>')
    expect(spaltenBreite('<sheetFormatPr/><sheetData/>', 0, 95)).toBe('<sheetFormatPr/><cols><col min="1" max="1" width="95" customWidth="1"/></cols><sheetData/>')
    expect(spaltenBreite('<cols><col min="8" max="12" width="18" style="2"/></cols>', 9, 95)).toBe(
      '<cols><col min="8" max="9" width="18" style="2"/><col min="10" max="10" width="95" customWidth="1"/><col min="11" max="12" width="18" style="2"/></cols>',
    )
  })

  it('neue Formatierung wird angehängt, vorhandene Indizes bleiben; Ausrichtung ersetzt', () => {
    const st = '<styleSheet><cellXfs count="2"><xf numFmtId="0" fontId="0"/><xf numFmtId="0" fontId="1" borderId="1" applyAlignment="1"><alignment vertical="center"/><protection locked="0"/></xf></cellXfs></styleSheet>'
    const r = stilMitUmbruch(st, 1)
    expect(r.index).toBe(2)
    expect(r.styles).toBe(
      '<styleSheet><cellXfs count="3"><xf numFmtId="0" fontId="0"/><xf numFmtId="0" fontId="1" borderId="1" applyAlignment="1"><alignment vertical="center"/><protection locked="0"/></xf><xf numFmtId="0" fontId="1" borderId="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/><protection locked="0"/></xf></cellXfs></styleSheet>',
    )
    expect(stilMitUmbruch(st, undefined).styles).toContain('<xf numFmtId="0" fontId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs>')
    expect(stilMitUmbruch('<cellXfs count="0"></cellXfs>', 5).styles).toContain('<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1">')
    expect(() => stilMitUmbruch('<styleSheet/>', 0)).toThrow('DC-XLSX-STYLES')
  })

  it('Neuberechnung: calcChain weg, fullCalcOnLoad gesetzt — mit und ohne vorhandenes calcPr', () => {
    const r = neuBerechnen(
      '<workbook><sheets/><calcPr calcId="1" fullCalcOnLoad="0"/></workbook>',
      '<Relationships><Relationship Id="rId6" Type="x/calcChain" Target="calcChain.xml"/><Relationship Id="rId1" Type="x/worksheet" Target="a"/></Relationships>',
      '<Types><Override PartName="/xl/calcChain.xml" ContentType="c"/><Override PartName="/xl/workbook.xml" ContentType="w"/></Types>',
    )
    expect(r).toEqual({
      workbook: '<workbook><sheets/><calcPr calcId="1" fullCalcOnLoad="1"/></workbook>',
      rels: '<Relationships><Relationship Id="rId1" Type="x/worksheet" Target="a"/></Relationships>',
      typen: '<Types><Override PartName="/xl/workbook.xml" ContentType="w"/></Types>',
    })
    expect(neuBerechnen('<workbook><sheets/></workbook>', '', '').workbook).toBe('<workbook><sheets/><calcPr fullCalcOnLoad="1"/></workbook>')
    expect(neuBerechnen('<workbook><sheets/><extLst/></workbook>', '', '').workbook).toBe('<workbook><sheets/><calcPr fullCalcOnLoad="1"/><extLst/></workbook>')
  })
})

describe('Werteliste der Status-Spalte', () => {
  it('aus x14-Dropdown mit Bezug auf das versteckte Blatt (SBX-FL-01)', async () => {
    const d = await sbxFl01()
    expect(await listenWerte(d, 'Findings', 6, 4, [])).toEqual(SBX_FL_01_WERTE)
    // Zelle außerhalb des Dropdown-Bereichs → vorhandene Werte
    expect(await listenWerte(d, 'Findings', 1, 4, ['TM', ' TM', 'APX 4', ''])).toEqual(['TM', 'APX 4'])
    expect(await listenWerte(d, 'Fehlt', 0, 1, [])).toEqual([])
  })

  it('klassische Datenüberprüfung mit Literal-Liste, Bereich im eigenen Blatt, unbekannte Bezüge', async () => {
    const zip = new JSZip()
    zip.file('xl/workbook.xml', '<workbook><sheets><sheet name="L" r:id="r1"/></sheets></workbook>')
    zip.file('xl/_rels/workbook.xml.rels', '<Relationships><Relationship Id="r1" Target="/xl/worksheets/s.xml"/></Relationships>')
    zip.file(
      'xl/worksheets/s.xml',
      '<worksheet><sheetData><row r="1"><c r="E1" t="inlineStr"><is><t>Ja</t></is></c><c r="F1" t="inlineStr"><is><t>Nein</t></is></c></row></sheetData><dataValidations count="3"><dataValidation type="list" sqref="A2:A9 C2"><formula1>"Open, Done"</formula1></dataValidation><dataValidation type="list" sqref="B2:B9"><formula1>$E$1:$F$1</formula1></dataValidation><dataValidation type="list" sqref="D2"><formula1>Status</formula1></dataValidation></dataValidations></worksheet>',
    )
    const d = await zip.generateAsync({ type: 'uint8array' })
    expect(await listenWerte(d, 'L', 2, 2, [])).toEqual(['Open', 'Done'])
    expect(await listenWerte(d, 'L', 1, 5, [])).toEqual(['Ja', 'Nein'])
    // benannter Bereich: nicht auflösbar → vorhandene Werte
    expect(await listenWerte(d, 'L', 3, 2, ['x'])).toEqual(['x'])
    const leer = new JSZip()
    leer.file('a', 'a')
    await expect(listenWerte(await leer.generateAsync({ type: 'uint8array' }), 'L', 0, 1, [])).rejects.toThrow('DC-XLSX-INVALID')
  })

  it('Statuszuordnung nach Synonymen; Nicht prüfbar lässt die Zelle stehen', () => {
    expect(werteVorschlagen(SBX_FL_01_WERTE)).toEqual({ resolved: 'Closed', partial: 'In Review', open: 'Open', justify: 'Open', unverifiable: null })
    expect(werteVorschlagen(['Offen', 'In Bearbeitung', 'Erledigt', 'Begründung erforderlich'])).toEqual({ resolved: 'Erledigt', partial: 'In Bearbeitung', open: 'Offen', justify: 'Begründung erforderlich', unverifiable: null })
    expect(werteVorschlagen(['Completed 2026'])).toMatchObject({ resolved: 'Completed 2026', open: null })
  })
})

describe('Zählformeln', () => {
  const quelle = { name: 'F', raster: [['', 'Closed'], ['', 'open'], ['', 'Closed']], nr: [4, 5, 6] }
  const blatt = (f: string, v = '9', a = '') => `<row r="1"><c r="A1" t="inlineStr"><is><t>Open</t></is></c><c r="B1"${a}><f>${f}</f><v>${v}</v></c></row>`

  it('COUNTIF mit Zellbezug, Text, ganzer Spalte; Groß-/Kleinschreibung egal', () => {
    expect(zaehlformelnAktualisieren(blatt('COUNTIF(F!$B$4:$B$6,A1)'), 'O', quelle, [])).toContain('<v>1</v>')
    expect(zaehlformelnAktualisieren(blatt('COUNTIF(F!B:B,&quot;Closed&quot;)', '0', ' t="str"'), 'O', quelle, [])).toBe(blatt('COUNTIF(F!B:B,&quot;Closed&quot;)', '2'))
    expect(zaehlformelnAktualisieren(blatt('COUNTIF(B4:B5,"closed")'), 'F', quelle, [])).toContain('<v>1</v>')
  })

  it('was sich nicht sicher auswerten lässt, bleibt stehen', () => {
    for (const f of ['SUM(F!B:B)', 'COUNTIF(X!B:B,"Closed")', 'COUNTIF(F!B:B,"Clo*")', 'COUNTIF(F!B:B,Status)', 'COUNTIF(F!A4:B6,"Closed")']) {
      expect(zaehlformelnAktualisieren(blatt(f), 'O', quelle, [])).toBe(blatt(f))
    }
    expect(zaehlformelnAktualisieren(blatt('COUNTIF(F!B:B,5)'), 'O', quelle, [])).toContain('<v>0</v>')
  })
})

describe('Round-Trip SBX-FL-01 (Nachtrag 6.5 Abnahme)', () => {
  it('nur erlaubte Teile ändern sich; Dropdowns, bedingte Formatierung, verbundene Zellen und Diagramm bleiben', async () => {
    const orig = await sbxFl01()
    const vorher = await teile(orig)
    const r = await rueckschreiben(orig, {
      blatt: 'Findings',
      kopfZeile: 3,
      statusSpalte: 6,
      remarkTitel: 'Remark Re-Check 01.11.2026',
      zeilen: [
        { excelZeile: 5, status: 'In Review', remark: 'TEILWEISE BEHOBEN (Re-Check 01.11.2026): …\n• APX 4 · 1 Line Training' },
        { excelZeile: 19, status: 'Closed', remark: 'BEHOBEN (Re-Check 01.11.2026)' },
        { excelZeile: 8, status: null, remark: 'NICHT PRÜFBAR' },
      ],
    })
    const nachher = await teile(r.daten)

    // Unveränderte Teile: byte-gleich (Inhalt der ZIP-Einträge)
    const erlaubt = new Set([...GEAENDERTE_TEILE, 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml'])
    for (const p of Object.keys(vorher)) if (!erlaubt.has(p)) expect(nachher[p], p).toBe(vorher[p])
    expect(new Set(r.geaendert)).toEqual(erlaubt)
    expect(nachher['xl/calcChain.xml']).toBeUndefined()
    expect(nachher['xl/workbook.xml']).toContain('<calcPr calcId="191029" fullCalcOnLoad="1"/>')

    // Im geänderten Blatt bleiben die heiklen Bereiche Zeichen für Zeichen
    const s1v = vorher['xl/worksheets/sheet1.xml']
    const s1 = nachher['xl/worksheets/sheet1.xml']
    for (const re of [/<extLst>[\s\S]*<\/extLst>/, /<mergeCells[\s\S]*?<\/mergeCells>/, /<conditionalFormatting[\s\S]*?<\/conditionalFormatting>/, /<sheetViews>[\s\S]*?<\/sheetViews>/, /<autoFilter[^>]*\/>/]) {
      expect(s1.match(re)![0]).toBe(s1v.match(re)![0])
    }
    // Vorhandene Formatierungen bleiben, eine neue (Umbruch) kommt dazu
    expect(nachher['xl/styles.xml']).toContain('<cellXfs count="5">')
    expect(nachher['xl/styles.xml'].replace(/<cellXfs[\s\S]*<\/cellXfs>/, '')).toBe(vorher['xl/styles.xml'].replace(/<cellXfs[\s\S]*<\/cellXfs>/, ''))

    // Inhalt: Kopf, Remark-Spalte J, Status nur wo gesetzt
    const nr: number[] = []
    const raster = blattRaster(s1, [], nr)
    const zeile = (n: number) => raster[nr.indexOf(n)]
    expect(zeile(3)[9]).toBe('Remark Re-Check 01.11.2026')
    expect(zelleLesen(s1, 'J3')).toContain('s="1"')
    expect(zelleLesen(s1, 'J5')).toContain('s="4"')
    expect(zelleLesen(s1, 'G5')).toBe('<c r="G5" s="2" t="inlineStr"><is><t xml:space="preserve">In Review</t></is></c>')
    expect(zelleLesen(s1, 'G8')).toBe(zelleLesen(s1v, 'G8'))
    expect(s1).toContain('<dimension ref="A1:J23"/>')
    expect(s1).toContain('<col min="10" max="10" width="95" customWidth="1"/>')

    // Zählformeln zeigen die neuen Werte auch ohne Neuberechnung
    const zahl = (w: string) => SBX_FL_01.filter((f) => f.zeile[6] === w).length
    const ov = nachher['xl/worksheets/sheet2.xml']
    const v = (ref: string) => Number(zelleLesen(ov, ref)!.match(/<v>(\d+)<\/v>/)![1])
    expect([v('B2'), v('B3'), v('B4'), v('B5')]).toEqual([zahl('Open') - 1, zahl('In Review') + 1, zahl('Closed'), zahl('Closed')])
  })

  it('ohne Status-Spalte nur Remarks; unbekanntes Blatt ist ein Fehler; Ausgabename mit Datum', async () => {
    const orig = await sbxFl01()
    const r = await rueckschreiben(orig, { blatt: 'Findings', kopfZeile: 3, remarkTitel: 'R', zeilen: [{ excelZeile: 4, status: 'Closed', remark: 'x' }] })
    const s1 = (await teile(r.daten))['xl/worksheets/sheet1.xml']
    expect(zelleLesen(s1, 'G4')).toContain('t="s"')
    expect(r.geaendert).not.toContain('xl/worksheets/sheet2.xml')
    const ohne = await rueckschreiben(orig, { blatt: 'Findings', kopfZeile: 3, remarkTitel: 'R', zeilen: [] })
    expect(ohne.geaendert).not.toContain('xl/styles.xml')
    await expect(rueckschreiben(orig, { blatt: 'X', kopfZeile: 1, remarkTitel: 'R', zeilen: [] })).rejects.toThrow('DC-XLSX-SHEET')
    expect(ausgabeName('SBX-FL-01.XLSX', '2026-11-01T10:00:00Z')).toBe('SBX-FL-01_recheck_2026-11-01.xlsx')
  })
})
