/**
 * Minimaler XLSX-Schreiber — ohne Fremdbibliothek.
 *
 * Warum von Hand: Die App laeuft offline im Browser, und fuer eine einzige
 * Tabelle eine Excel-Bibliothek zu buendeln hiesse, den groessten Teil des
 * Bundles fuer einen Export-Knopf auszugeben. Ein .xlsx ist ein ZIP aus
 * wenigen XML-Dateien; hier wird es ungepackt (STORE) geschrieben — die
 * Dateien sind klein, Kompression braeuchte einen Deflate-Encoder.
 *
 * Zellen: Zahlen als Zahlen, alles andere als Inline-String (kein
 * Shared-Strings-Teil noetig). Excel, Numbers und LibreOffice lesen das.
 *
 * Audit 11/2026, XLSX-01/EXM-09: Die Datei war eine Rohtabelle — ohne
 * Spaltenbreiten (Namen abgeschnitten), ohne ausgezeichnete Kopfzeile, ohne
 * Druckeinrichtung (zerfiel auf zwei Blaetter), ohne Dateieigenschaften und
 * mit dem ZIP-Datum 0 (Monat 0, Tag 0 — Entpacker zeigten 1980-00-00).
 * Jetzt nach dem Vorbild der DocCheck-Exporte: Breiten aus dem Inhalt,
 * Kopfzeile fett, fixiert und auf jeder Druckseite, Dezimalstunden als
 * „0.00", A4 quer auf eine Seitenbreite, docProps mit Titel und Ersteller.
 */

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i]
    for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return (crc ^ 0xffffffff) >>> 0
}

function le16(n: number): number[] {
  return [n & 0xff, (n >> 8) & 0xff]
}
function le32(n: number): number[] {
  return [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff]
}

/**
 * Zeitpunkt als DOS-Datum und -Zeit (Ortszeit, wie es das ZIP-Format meint).
 *
 * Das Datum 0 hiesse Monat 0, Tag 0 — ungueltig (EXM-09). Ohne Zeitpunkt
 * steht der kleinste gueltige Tag, 01.01.1980. Die Uhr wird hier nie
 * gelesen: Gleiche Eingabe muss die gleiche Datei ergeben.
 */
export function dosZeit(ts?: number): { datum: number; zeit: number } {
  const d = ts === undefined ? null : new Date(ts)
  if (!d || Number.isNaN(d.getTime()) || d.getFullYear() < 1980 || d.getFullYear() > 2107) return { datum: (1 << 5) | 1, zeit: 0 }
  return {
    datum: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
    zeit: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
  }
}

/** ZIP ohne Kompression: Local Header + Daten je Datei, dann Central Directory. */
function zipStore(dateien: { name: string; inhalt: Uint8Array }[], ts?: number): Uint8Array {
  const { datum, zeit } = dosZeit(ts)
  const teile: number[] = []
  const zentral: number[] = []
  let offset = 0
  for (const d of dateien) {
    const name = new TextEncoder().encode(d.name)
    const crc = crc32(d.inhalt)
    const lokal = [
      ...le32(0x04034b50), ...le16(20), ...le16(0), ...le16(0), ...le16(zeit), ...le16(datum),
      ...le32(crc), ...le32(d.inhalt.length), ...le32(d.inhalt.length),
      ...le16(name.length), ...le16(0),
    ]
    zentral.push(
      ...le32(0x02014b50), ...le16(20), ...le16(20), ...le16(0), ...le16(0), ...le16(zeit), ...le16(datum),
      ...le32(crc), ...le32(d.inhalt.length), ...le32(d.inhalt.length),
      ...le16(name.length), ...le16(0), ...le16(0), ...le16(0), ...le16(0), ...le32(0), ...le32(offset),
      ...name,
    )
    teile.push(...lokal, ...name, ...d.inhalt)
    offset += lokal.length + name.length + d.inhalt.length
  }
  const eocd = [
    ...le32(0x06054b50), ...le16(0), ...le16(0),
    ...le16(dateien.length), ...le16(dateien.length),
    ...le32(zentral.length), ...le32(offset), ...le16(0),
  ]
  return new Uint8Array([...teile, ...zentral, ...eocd])
}

/**
 * Text fuer XML — Element UND Attribut (der Blattname steht in einem).
 *
 * Audit 11/2026, SEC-04: Ein einziges Steuerzeichen (etwa \u000B aus einem
 * importierten Namen) macht das Blatt-XML ungueltig; LibreOffice liess
 * daraufhin ohne Meldung alle Datenzeilen weg, Excel bot die Reparatur an.
 * XML 1.0 erlaubt von C0 nur Tab, LF und CR, dazu nie U+FFFE/U+FFFF —
 * dieselbe Regel wie im DocCheck-Export (`export/xlsx.ts`).
 */
export function xml(s: string): string {
  return s
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export type XlsxZelle = string | number

/** Gestaltung des Blatts — alles optional; ohne Angaben eine schlichte Tabelle. */
export type XlsxOptionen = {
  /** Zeile der Spaltenkoepfe (ab 1): fett, fixiert, auf jeder Druckseite. */
  kopfzeile?: number
  /** Spalten (ab 0) mit Dezimalstunden — unter dem Kopf im Format „0.00". */
  dezimalSpalten?: number[]
  /** Spalten (ab 0), deren TEXT unter dem Kopf rechtsbuendig steht — „05:30"
   *  neben einer Zahl. Zahlen stehen ohnehin rechts; Text links daneben las
   *  sich als „2.25 11:00" (XLSX-01). */
  rechtsSpalten?: number[]
  /** Summenzeile (ab 1): fett, mit Linie darueber. */
  summenzeile?: number
  /** Titel in den Dateieigenschaften (sonst der Blattname). */
  titel?: string
  /** Zeitpunkt des Exports (ms): ZIP-Datum und „Erstellt". Ein Parameter
   *  statt der Uhr — gleiche Eingabe, byte-gleiche Datei. */
  erstellt?: number
}

/** Zellformate (Index in cellXfs). Zahlformat 2 ist das eingebaute „0.00". */
const S = { normal: 0, kopf: 1, dezimal: 2, rechts: 3, summe: 4, summeDezimal: 5, summeRechts: 6 } as const

const STYLES =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<fonts count="2"><font><sz val="10"/><name val="Arial"/><family val="2"/></font><font><b/><sz val="10"/><name val="Arial"/><family val="2"/></font></fonts>' +
  '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
  '<borders count="3"><border><left/><right/><top/><bottom/><diagonal/></border>' +
  '<border><left/><right/><top/><bottom style="thin"><color rgb="FF98A2B3"/></bottom><diagonal/></border>' +
  '<border><left/><right/><top style="thin"><color rgb="FF98A2B3"/></top><bottom/><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="7">' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1"/>' +
  '<xf numFmtId="2" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="right"/></xf>' +
  '<xf numFmtId="0" fontId="1" fillId="0" borderId="2" xfId="0" applyFont="1" applyBorder="1"/>' +
  '<xf numFmtId="2" fontId="1" fillId="0" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>' +
  '<xf numFmtId="0" fontId="1" fillId="0" borderId="2" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right"/></xf>' +
  '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
  '</styleSheet>'

function spalte(i: number): string {
  // 0 -> A, 25 -> Z, 26 -> AA … reicht weit ueber jede Exportbreite hinaus
  let n = i + 1
  let out = ''
  while (n > 0) {
    const r = (n - 1) % 26
    out = String.fromCharCode(65 + r) + out
    n = Math.floor((n - 1) / 26)
  }
  return out
}

/**
 * Spaltenbreiten aus dem Inhalt (in Zeichen), zwischen 6 und 50.
 *
 * Zeilen mit nur EINER Zelle (Titel) zaehlen nicht: Sie laufen in die
 * leeren Nachbarzellen weiter, und eine 40 Zeichen breite Spalte A nur
 * fuer die Ueberschrift risse die Tabelle auseinander. Dezimalstunden
 * zaehlen mit zwei Nachkommastellen, Kopfzellen etwas breiter (fett).
 */
export function spaltenBreiten(zeilen: XlsxZelle[][], o: Pick<XlsxOptionen, 'kopfzeile' | 'dezimalSpalten'> = {}): number[] {
  const breiten: number[] = []
  zeilen.forEach((zeile, zi) => {
    if (zeile.filter((z) => z !== '').length < 2) return
    const unterKopf = !!o.kopfzeile && zi + 1 > o.kopfzeile
    zeile.forEach((wert, si) => {
      const text = typeof wert === 'number' && unterKopf && o.dezimalSpalten?.includes(si) ? wert.toFixed(2) : String(wert)
      const n = text.length + (zi + 1 === o.kopfzeile ? 1 : 0)
      breiten[si] = Math.max(breiten[si] ?? 0, n)
    })
  })
  return Array.from(breiten, (n) => Math.min(50, Math.max(6, (n ?? 0) + 2)))
}

/** Baut die Arbeitsmappe: ein Blatt, Zeilen aus Strings und Zahlen. */
export function xlsxDatei(blattName: string, zeilen: XlsxZelle[][], o: XlsxOptionen = {}): Uint8Array {
  const enc = (s: string) => new TextEncoder().encode(s)
  const kopf = o.kopfzeile && o.kopfzeile <= zeilen.length ? o.kopfzeile : undefined
  const dezimal = new Set(o.dezimalSpalten ?? [])
  const rechts = new Set(o.rechtsSpalten ?? [])
  const summe = o.summenzeile && kopf && o.summenzeile > kopf && o.summenzeile <= zeilen.length ? o.summenzeile : undefined
  /* Formate gelten nur UNTER dem Kopf — darueber steht der Vorspann
     (Titel, Filter), dessen Spalten nichts mit der Tabelle zu tun haben. */
  const stil = (zi: number, si: number, wert: XlsxZelle): number => {
    if (kopf === zi + 1) return S.kopf
    if (!kopf || zi + 1 < kopf) return S.normal
    const s = summe === zi + 1
    if (typeof wert === 'number') return dezimal.has(si) ? (s ? S.summeDezimal : S.dezimal) : s ? S.summe : S.normal
    if (rechts.has(si)) return s ? S.summeRechts : S.rechts
    return s ? S.summe : S.normal
  }
  const zeilenXml = zeilen
    .map((zeile, zi) => {
      const zellen = zeile
        .map((wert, si) => {
          const ref = `${spalte(si)}${zi + 1}`
          const s = stil(zi, si, wert)
          const sAttr = s === S.normal ? '' : ` s="${s}"`
          // Leere Zellen nur, wo sie ein Format tragen (Kopf, Summenlinie).
          if (wert === '') return s === S.normal ? '' : `<c r="${ref}"${sAttr}/>`
          if (typeof wert === 'number' && Number.isFinite(wert)) return `<c r="${ref}"${sAttr}><v>${wert}</v></c>`
          return `<c r="${ref}"${sAttr} t="inlineStr"><is><t xml:space="preserve">${xml(String(wert))}</t></is></c>`
        })
        .join('')
      return `<row r="${zi + 1}">${zellen}</row>`
    })
    .join('')

  const breiten = spaltenBreiten(zeilen, { kopfzeile: kopf, dezimalSpalten: o.dezimalSpalten })
  const letzte = spalte(Math.max(1, breiten.length) - 1)
  const titel = o.titel ?? blattName
  // Blattnamen in Bezuegen stehen in Hochkommas; ein Hochkomma darin wird verdoppelt.
  const blattRef = `'${blattName.replace(/'/g, "''")}'`
  // Fusszeile: `&` ist dort ein Steuerzeichen und wird verdoppelt.
  // Excel nimmt hoechstens 255 Zeichen je Kopf-/Fusszeile (vgl. EXP-04).
  const fuss = `&L${titel.slice(0, 120).replace(/&/g, '&&')}&RPage &P of &N`
  const pane = kopf
    ? `<pane ySplit="${kopf}" topLeftCell="A${kopf + 1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${kopf + 1}" sqref="A${kopf + 1}"/>`
    : ''

  const dateien = [
    {
      name: '[Content_Types].xml',
      inhalt: enc(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
          '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
          '<Default Extension="xml" ContentType="application/xml"/>' +
          '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
          '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
          '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
          '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
          '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
          '</Types>',
      ),
    },
    {
      name: '_rels/.rels',
      inhalt: enc(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
          '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
          '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>' +
          '</Relationships>',
      ),
    },
    {
      name: 'docProps/core.xml',
      inhalt: enc(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
          `<dc:title>${xml(titel)}</dc:title><dc:creator>Instructor Connect</dc:creator>` +
          // Zeitpunkt in UTC mit „Z" — ein Zeitpunkt, kein Kalendertag;
          // Excel zeigt ihn in der Ortszeit des Lesers.
          (o.erstellt !== undefined && Number.isFinite(o.erstellt)
            ? `<dcterms:created xsi:type="dcterms:W3CDTF">${new Date(o.erstellt).toISOString().replace(/\.\d{3}Z$/, 'Z')}</dcterms:created>`
            : '') +
          '</cp:coreProperties>',
      ),
    },
    {
      name: 'docProps/app.xml',
      inhalt: enc(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">' +
          '<Application>Instructor Connect</Application>' +
          '<HeadingPairs><vt:vector size="2" baseType="variant"><vt:variant><vt:lpstr>Worksheets</vt:lpstr></vt:variant><vt:variant><vt:i4>1</vt:i4></vt:variant></vt:vector></HeadingPairs>' +
          `<TitlesOfParts><vt:vector size="1" baseType="lpstr"><vt:lpstr>${xml(blattName)}</vt:lpstr></vt:vector></TitlesOfParts>` +
          '</Properties>',
      ),
    },
    {
      name: 'xl/workbook.xml',
      inhalt: enc(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
          `<sheets><sheet name="${xml(blattName)}" sheetId="1" r:id="rId1"/></sheets>` +
          // Kopfzeile auf jeder Druckseite — ohne sie ist Seite 2 eine
          // Zahlenwand ohne Spaltennamen.
          (kopf ? `<definedNames><definedName name="_xlnm.Print_Titles" localSheetId="0">${xml(blattRef)}!$${kopf}:$${kopf}</definedName></definedNames>` : '') +
          '</workbook>',
      ),
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      inhalt: enc(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
          '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
          '</Relationships>',
      ),
    },
    { name: 'xl/styles.xml', inhalt: enc(STYLES) },
    {
      name: 'xl/worksheets/sheet1.xml',
      inhalt: enc(
        // Reihenfolge nach CT_Worksheet — eine falsche ist fuer Excel eine kaputte Datei.
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
          '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>' +
          `<dimension ref="A1:${letzte}${Math.max(1, zeilen.length)}"/>` +
          `<sheetViews><sheetView workbookViewId="0" tabSelected="1">${pane}</sheetView></sheetViews>` +
          '<sheetFormatPr defaultRowHeight="13.2"/>' +
          (breiten.length ? `<cols>${breiten.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : '') +
          `<sheetData>${zeilenXml}</sheetData>` +
          '<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.7" header="0.3" footer="0.3"/>' +
          // A4 quer, auf EINE Seitenbreite, beliebig viele Seiten hoch.
          '<pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/>' +
          `<headerFooter><oddFooter>${xml(fuss)}</oddFooter></headerFooter>` +
          '</worksheet>',
      ),
    },
  ]
  return zipStore(dateien, o.erstellt)
}

/** Ausloesen des Downloads im Browser — Gegenstueck zu downloadCsv. */
export function downloadXlsx(dateiname: string, blattName: string, zeilen: XlsxZelle[][], optionen?: XlsxOptionen): void {
  const daten = xlsxDatei(blattName, zeilen, optionen)
  const blob = new Blob([daten.buffer as ArrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = dateiname
  a.click()
  URL.revokeObjectURL(url)
}
