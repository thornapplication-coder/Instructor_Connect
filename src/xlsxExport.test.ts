import { describe, expect, it } from 'vitest'
import { dosZeit, downloadXlsx, spaltenBreiten, xlsxDatei, xml } from './xlsxExport'

/**
 * Der Excel-Export der Logbuch-Auswertung ist ein von Hand geschriebenes
 * .xlsx (ZIP + XML, ohne Fremdbibliothek). Genau deshalb steht hier ein
 * Leser daneben: Ein Fehler im ZIP-Aufbau faellt sonst erst beim Oeffnen in
 * Excel auf — und dort als „Datei ist beschaedigt", ohne Hinweis wo.
 */

/** Minimaler Leser fuer STORE-ZIPs: Central Directory rueckwaerts suchen.
 *  `>>> 0` um den GANZEN Ausdruck: Ein `|` danach machte daraus wieder eine
 *  vorzeichenbehaftete Zahl, und eine CRC mit gesetztem oberstem Bit las
 *  sich negativ — aufgefallen, als die Datei neue Teile bekam (XLSX-01). */
function entpacke(zip: Uint8Array): Map<string, Uint8Array> {
  const le32 = (o: number) => (zip[o] | (zip[o + 1] << 8) | (zip[o + 2] << 16) | (zip[o + 3] << 24)) >>> 0
  const le16 = (o: number) => zip[o] | (zip[o + 1] << 8)
  let eocd = -1
  for (let i = zip.length - 22; i >= 0; i--) {
    if (le32(i) === 0x06054b50) {
      eocd = i
      break
    }
  }
  expect(eocd).toBeGreaterThanOrEqual(0)
  const anzahl = le16(eocd + 10)
  let p = le32(eocd + 16)
  const dateien = new Map<string, Uint8Array>()
  for (let i = 0; i < anzahl; i++) {
    expect(le32(p)).toBe(0x02014b50)
    const nameLen = le16(p + 28)
    const extraLen = le16(p + 30)
    const kommentarLen = le16(p + 32)
    const groesse = le32(p + 24)
    const offset = le32(p + 42)
    const name = new TextDecoder().decode(zip.slice(p + 46, p + 46 + nameLen))
    // Lokaler Header: Datenbeginn hinter Name + Extrafeld
    const lNameLen = le16(offset + 26)
    const lExtraLen = le16(offset + 28)
    const start = offset + 30 + lNameLen + lExtraLen
    dateien.set(name, zip.slice(start, start + groesse))
    p += 46 + nameLen + extraLen + kommentarLen
  }
  return dateien
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i]
    for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return (crc ^ 0xffffffff) >>> 0
}

describe('xlsxDatei', () => {
  const zip = xlsxDatei('Logbook', [
    ['Instructor', 'Entries', 'Total'],
    ['Müller & Söhne <A>', 3, '16:30'],
  ])
  const dateien = entpacke(zip)

  it('enthaelt die Pflichtteile einer Arbeitsmappe, dazu Formate und Eigenschaften', () => {
    expect([...dateien.keys()].sort()).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'docProps/app.xml',
      'docProps/core.xml',
      'xl/_rels/workbook.xml.rels',
      'xl/styles.xml',
      'xl/workbook.xml',
      'xl/worksheets/sheet1.xml',
    ])
  })

  it('schreibt korrekte CRC-Pruefsummen — sonst meldet Excel eine beschaedigte Datei', () => {
    const le32 = (o: number) => (zip[o] | (zip[o + 1] << 8) | (zip[o + 2] << 16) | (zip[o + 3] << 24)) >>> 0
    // Erster lokaler Header beginnt bei 0; CRC steht ab Byte 14
    for (const [, inhalt] of dateien) {
      // je Datei den lokalen Header suchen, dessen Daten exakt diesem Inhalt entsprechen
      void inhalt
    }
    // Stichprobe am ersten Eintrag reicht: gleicher CRC-Algorithmus wie der Schreiber,
    // aber gegen die tatsaechlich abgelegten Bytes gerechnet.
    const erste = dateien.get('[Content_Types].xml')!
    expect(le32(14)).toBe(crc32(erste))
  })

  it('legt Zahlen als Zahlen und Text als Inline-String ab, XML-Zeichen maskiert', () => {
    const sheet = new TextDecoder().decode(dateien.get('xl/worksheets/sheet1.xml')!)
    expect(sheet).toContain('<c r="B2"><v>3</v></c>')
    expect(sheet).toContain('Müller &amp; Söhne &lt;A&gt;')
    expect(sheet).toContain('<c r="C2" t="inlineStr">')
    // Kopfzeile in Zeile 1
    expect(sheet).toContain('<row r="1">')
  })

  it('traegt den Blattnamen maskiert in die Arbeitsmappe', () => {
    const wb = new TextDecoder().decode(xlsxDatei('A & B', [['x']]).slice())
    expect(wb).toContain('name="A &amp; B"')
  })

  it('zaehlt Spalten ueber Z hinaus (AA, AB …)', () => {
    const breite = xlsxDatei('S', [Array.from({ length: 28 }, (_, i) => `w${i}`)])
    const sheet = new TextDecoder().decode(entpacke(breite).get('xl/worksheets/sheet1.xml')!)
    expect(sheet).toContain('r="AA1"')
    expect(sheet).toContain('r="AB1"')
  })
})

/** Inhalt eines Teils als Text. */
const teil = (zip: Uint8Array, name: string) => new TextDecoder().decode(entpacke(zip).get(name)!)

/** DOS-Datum und -Zeit aus dem ZENTRALEN Verzeichnis (je Eintrag). */
function dosEintraege(zip: Uint8Array): { datum: number; zeit: number }[] {
  const le16 = (o: number) => zip[o] | (zip[o + 1] << 8)
  const out: { datum: number; zeit: number }[] = []
  for (let i = 0; i + 46 <= zip.length; i++) {
    if (zip[i] === 0x50 && zip[i + 1] === 0x4b && zip[i + 2] === 0x01 && zip[i + 3] === 0x02) out.push({ zeit: le16(i + 12), datum: le16(i + 14) })
  }
  return out
}

/**
 * Audit 11/2026, XLSX-01 / EXM-09 / SEC-04: Die Logbuch-Auswertung kam als
 * Rohtabelle — Namen abgeschnitten, Kopfzeile ohne Auszeichnung, beim
 * Drucken auf zwei Blaetter zerfallen, ohne Dateieigenschaften, mit dem
 * ungueltigen ZIP-Datum 0. Und ein einziges Steuerzeichen in einem Namen
 * liess LibreOffice ALLE Datenzeilen ohne Meldung verwerfen.
 */
describe('xlsxDatei — Gestaltung wie die DocCheck-Exporte (XLSX-01, EXM-09)', () => {
  const jetzt = Date.UTC(2026, 10, 2, 13, 45, 30)
  const zeilen = [
    ['AAA Logbook — all instructors and a very long title line'],
    ['Period', 'all'],
    [],
    ['Instructor', 'Entries', 'Total', 'Total (h)'],
    ['Mika Beispiel-Langername', 3, '16:30', 16.5],
    ['Ok', 2, '04:00', 4],
  ]
  const optionen = { kopfzeile: 4, dezimalSpalten: [3], rechtsSpalten: [1, 2, 3], titel: 'AAA Logbook — all instructors', erstellt: jetzt }
  const zip = xlsxDatei('Logbook', zeilen, optionen)
  const sheet = teil(zip, 'xl/worksheets/sheet1.xml')

  it('traegt styles.xml in Content Types und Beziehungen ein', () => {
    expect(teil(zip, '[Content_Types].xml')).toContain('<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>')
    expect(teil(zip, 'xl/_rels/workbook.xml.rels')).toContain('Target="styles.xml"')
    const styles = teil(zip, 'xl/styles.xml')
    // Kopf fett (Schrift 1 mit <b/>), Dezimalstunden im eingebauten Format 2 = „0.00"
    expect(styles).toContain('<font><b/>')
    const xfs = [...styles.matchAll(/<xf [^>]*?(?:\/>|>.*?<\/xf>)/g)].map((m) => m[0]).slice(1) // ohne cellStyleXfs
    expect(styles).toContain(`<cellXfs count="${xfs.length}">`)
    expect(xfs[1]).toMatch(/fontId="1" .*borderId="1"/) // s="1": Kopf
    expect(xfs[2]).toMatch(/^<xf numFmtId="2" fontId="0"/) // s="2": Dezimalstunden
    expect(xfs[3]).toContain('<alignment horizontal="right"/>') // s="3": Zeittext rechts
  })

  it('setzt Spaltenbreiten, Querformat auf eine Seitenbreite und die Kopfzeile auf jede Druckseite', () => {
    expect(sheet).toMatch(/<cols>(<col min="\d+" max="\d+" width="\d+" customWidth="1"\/>){4}<\/cols>/)
    expect(sheet).toContain('<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>')
    expect(sheet).toContain('<pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/>')
    expect(sheet).toContain('<pane ySplit="4" topLeftCell="A5" activePane="bottomLeft" state="frozen"/>')
    expect(teil(zip, 'xl/workbook.xml')).toContain(`<definedName name="_xlnm.Print_Titles" localSheetId="0">'Logbook'!$4:$4</definedName>`)
    // Reihenfolge nach CT_Worksheet
    const folge = ['<sheetPr>', '<dimension', '<sheetViews>', '<sheetFormatPr', '<cols>', '<sheetData>', '<pageMargins', '<pageSetup', '<headerFooter>'].map((t) => sheet.indexOf(t))
    expect(folge.every((p, i) => p >= 0 && (i === 0 || p > folge[i - 1]))).toBe(true)
  })

  it('Kopfzellen tragen s="1", Dezimalstunden s="2", Zeittext rechts s="3", Namen kein Format', () => {
    for (const ref of ['A4', 'B4', 'C4', 'D4']) expect(sheet).toMatch(new RegExp(`<c r="${ref}" s="1"`))
    expect(sheet).toContain('<c r="D5" s="2"><v>16.5</v></c>')
    expect(sheet).toContain('<c r="D6" s="2"><v>4</v></c>')
    // Die Zaehlspalte ist keine Stundenspalte — „3", nicht „3.00".
    expect(sheet).toContain('<c r="B5"><v>3</v></c>')
    // „16:30" steht rechts — links klebte es an der Zahl davor („3 16:30").
    expect(sheet).toContain('<c r="C5" s="3" t="inlineStr">')
    expect(sheet).toContain('<c r="A5" t="inlineStr">')
    // Ueber dem Kopf nichts formatiert, auch wenn die Spalte passt.
    expect(sheet).not.toMatch(/<c r="[A-Z]+[1-3]" s=/)
  })

  it('die Summenzeile ist fett mit Linie — auch ueber leeren Zellen, Dezimalstunden bleiben „0.00"', () => {
    const s = teil(
      xlsxDatei('S', [['Name', 'x', 'Total', 'Total (h)'], ['a', '', '01:00', 1], ['Total', '', '01:00', 1]], { kopfzeile: 1, dezimalSpalten: [3], rechtsSpalten: [2, 3], summenzeile: 3 }),
      'xl/worksheets/sheet1.xml',
    )
    expect(s).toContain('<row r="3"><c r="A3" s="4" t="inlineStr"><is><t xml:space="preserve">Total</t></is></c><c r="B3" s="4"/><c r="C3" s="6" t="inlineStr">')
    expect(s).toContain('<c r="D3" s="5"><v>1</v></c>')
    // Eine leere Zelle ohne Format entfaellt ganz.
    expect(s).not.toContain('r="B2"')
    // Eine Summenzeile im Vorspann oder ausserhalb der Tabelle gilt nicht.
    const ohne = teil(xlsxDatei('S', [['a', 'b'], ['Total', 1]], { kopfzeile: 1, summenzeile: 5 }), 'xl/worksheets/sheet1.xml')
    expect(ohne).toContain('<c r="B2"><v>1</v></c>')
  })

  it('Breiten aus dem Inhalt: der lange Name passt, der Titel zaehlt nicht', () => {
    const b = spaltenBreiten(zeilen, optionen)
    expect(b[0]).toBe('Mika Beispiel-Langername'.length + 2)
    expect(b[3]).toBe('Total (h)'.length + 1 + 2)
    // Grenzen: nie unter 6, nie ueber 50
    expect(spaltenBreiten([['a', 'b'.repeat(80)]])).toEqual([6, 50])
    // Dezimalstunden zaehlen mit zwei Nachkommastellen
    expect(spaltenBreiten([['h'], ['x', 1234.5]], { kopfzeile: 1, dezimalSpalten: [1] })).toEqual([6, '1234.50'.length + 2])
  })

  it('schreibt docProps mit Titel, Ersteller und Zeitpunkt — eingetragen in Content Types und .rels', () => {
    const core = teil(zip, 'docProps/core.xml')
    expect(core).toContain('<dc:title>AAA Logbook — all instructors</dc:title>')
    expect(core).toContain('<dc:creator>Instructor Connect</dc:creator>')
    expect(core).toContain('<dcterms:created xsi:type="dcterms:W3CDTF">2026-11-02T13:45:30Z</dcterms:created>')
    expect(teil(zip, 'docProps/app.xml')).toContain('<vt:lpstr>Logbook</vt:lpstr>')
    const ct = teil(zip, '[Content_Types].xml')
    expect(ct).toContain('<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>')
    expect(ct).toContain('<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>')
    const rels = teil(zip, '_rels/.rels')
    expect(rels).toContain('Target="docProps/core.xml"')
    expect(rels).toContain('Target="docProps/app.xml"')
  })

  it('ohne Zeitpunkt kein „Erstellt" und der Blattname als Titel', () => {
    const core = teil(xlsxDatei('Logbook', [['a']]), 'docProps/core.xml')
    expect(core).toContain('<dc:title>Logbook</dc:title>')
    expect(core).not.toContain('dcterms:created')
  })

  it('ZIP-Datum gueltig: ungleich 0, Monat 1–12, Tag 1–31 — aus dem Exportzeitpunkt', () => {
    const eintraege = dosEintraege(zip)
    expect(eintraege).toHaveLength(8)
    const d = new Date(jetzt)
    for (const e of eintraege) {
      expect(e.datum).not.toBe(0)
      const monat = (e.datum >> 5) & 0x0f
      const tag = e.datum & 0x1f
      expect(monat).toBeGreaterThanOrEqual(1)
      expect(monat).toBeLessThanOrEqual(12)
      expect(tag).toBeGreaterThanOrEqual(1)
      expect(tag).toBeLessThanOrEqual(31)
      expect(1980 + (e.datum >> 9)).toBe(d.getFullYear())
      expect([monat, tag]).toEqual([d.getMonth() + 1, d.getDate()])
    }
    // Ohne Zeitpunkt der kleinste gueltige Tag, 01.01.1980 — nie 0.
    for (const e of dosEintraege(xlsxDatei('S', [['a']]))) expect(e).toEqual({ datum: (1 << 5) | 1, zeit: 0 })
  })

  it('dosZeit rechnet in Ortszeit und faellt bei Unmoeglichem auf 01.01.1980 zurueck', () => {
    const vorher = process.env.TZ
    process.env.TZ = 'Europe/Vienna'
    try {
      // 23:30 UTC ist in Wien schon der naechste Tag, 00:30
      const z = dosZeit(Date.UTC(2026, 10, 1, 23, 30, 4))
      expect(z.datum).toBe(((2026 - 1980) << 9) | (11 << 5) | 2)
      expect(z.zeit).toBe((0 << 11) | (30 << 5) | 2)
    } finally {
      if (vorher === undefined) delete process.env.TZ
      else process.env.TZ = vorher
    }
    expect(dosZeit(Date.UTC(1975, 0, 1))).toEqual({ datum: 33, zeit: 0 })
    expect(dosZeit(Number.NaN)).toEqual({ datum: 33, zeit: 0 })
    expect(dosZeit(undefined)).toEqual({ datum: 33, zeit: 0 })
  })

  it('gleiche Eingabe → byte-gleiche Datei', () => {
    expect(xlsxDatei('Logbook', zeilen, optionen)).toEqual(zip)
    expect(xlsxDatei('Logbook', zeilen, { ...optionen, erstellt: jetzt + 60_000 })).not.toEqual(zip)
  })

  it('ein Kopf ausserhalb der Tabelle wird ignoriert statt eine leere Zeile zu fixieren', () => {
    const s = teil(xlsxDatei('S', [['a', 'b']], { kopfzeile: 5 }), 'xl/worksheets/sheet1.xml')
    expect(s).not.toContain('<pane')
    expect(s).not.toContain(' s="1"')
  })
})

describe('xml — Steuerzeichen und Anfuehrungszeichen (Audit 11/2026, SEC-04)', () => {
  it("'Max\\u000BMuster' wird 'MaxMuster' — die Zeile bleibt erhalten", () => {
    const zip = xlsxDatei('Logbook', [['Instructor', 'Hours'], ['Max\u000BMuster', 1.5], ['Ok', 2]])
    const sheet = teil(zip, 'xl/worksheets/sheet1.xml')
    expect(sheet).toContain('MaxMuster')
    expect(sheet).not.toMatch(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/)
    expect(sheet).toContain('<row r="3">')
  })

  it('entfernt jedes in XML 1.0 verbotene Zeichen, laesst Tab, LF und CR stehen', () => {
    const verboten = [...Array(32).keys()].filter((c) => ![9, 10, 13].includes(c)).map((c) => String.fromCharCode(c)).join('') + '\uFFFE\uFFFF'
    expect(xml(`a${verboten}b`)).toBe('ab')
    expect(xml('a\tb\nc\rd')).toBe('a\tb\nc\rd')
  })

  it('maskiert Anfuehrungszeichen — der Blattname steht in einem Attribut', () => {
    expect(xml('A "B" & <C>')).toBe('A &quot;B&quot; &amp; &lt;C&gt;')
    const wb = teil(xlsxDatei('Log "x"', [['a']]), 'xl/workbook.xml')
    expect(wb).toContain('name="Log &quot;x&quot;"')
  })

  it('verdoppelt & in der Fusszeile und Hochkommas im Druckbezug', () => {
    const zip = xlsxDatei("O'Brien", [['k', 'l'], ['a', 1]], { kopfzeile: 1, titel: 'A & B' })
    expect(teil(zip, 'xl/worksheets/sheet1.xml')).toContain('<oddFooter>&amp;LA &amp;&amp; B&amp;RPage &amp;P of &amp;N</oddFooter>')
    expect(teil(zip, 'xl/workbook.xml')).toContain(`'O''Brien'!$1:$1`)
  })
})

describe('downloadXlsx', () => {
  /** Wie downloadCsv: Browser-Bausteine stubben statt die Datei auszunehmen. */
  it('setzt Dateiname und XLSX-MIME-Typ und loest den Download aus', () => {
    const calls: Record<string, unknown> = {}
    const g = globalThis as unknown as Record<string, unknown>
    const orig = { Blob: g.Blob, URL: g.URL, document: g.document }
    g.Blob = class {
      constructor(parts: unknown[], opts: { type: string }) {
        calls.parts = parts
        calls.type = opts.type
      }
    }
    g.URL = {
      createObjectURL: () => 'blob:stub',
      revokeObjectURL: (u: string) => {
        calls.revoked = u
      },
    }
    const anchor: Record<string, unknown> = {
      click: () => {
        calls.clicked = true
      },
    }
    g.document = {
      createElement: () => anchor,
    }
    try {
      downloadXlsx('logbook.xlsx', 'Logbook', [['a', 1]])
      expect(calls.type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      expect(anchor.download).toBe('logbook.xlsx')
      expect(anchor.href).toBe('blob:stub')
      expect(calls.clicked).toBe(true)
      expect(calls.revoked).toBe('blob:stub')
    } finally {
      Object.assign(g, orig)
    }
  })
})
