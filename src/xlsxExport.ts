/**
 * Minimaler XLSX-Schreiber — ohne Fremdbibliothek.
 *
 * Warum von Hand: Die App laeuft offline im Browser, und fuer eine einzige
 * Tabelle eine Excel-Bibliothek zu buendeln hiesse, den groessten Teil des
 * Bundles fuer einen Export-Knopf auszugeben. Ein .xlsx ist ein ZIP mit
 * fuenf XML-Dateien; hier wird es ungepackt (STORE) geschrieben — die
 * Dateien sind klein, Kompression braeuchte einen Deflate-Encoder.
 *
 * Zellen: Zahlen als Zahlen, alles andere als Inline-String (kein
 * Shared-Strings-Teil noetig). Excel, Numbers und LibreOffice lesen das.
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

/** ZIP ohne Kompression: Local Header + Daten je Datei, dann Central Directory. */
function zipStore(dateien: { name: string; inhalt: Uint8Array }[]): Uint8Array {
  const teile: number[] = []
  const zentral: number[] = []
  let offset = 0
  for (const d of dateien) {
    const name = new TextEncoder().encode(d.name)
    const crc = crc32(d.inhalt)
    const lokal = [
      ...le32(0x04034b50), ...le16(20), ...le16(0), ...le16(0), ...le16(0), ...le16(0),
      ...le32(crc), ...le32(d.inhalt.length), ...le32(d.inhalt.length),
      ...le16(name.length), ...le16(0),
    ]
    zentral.push(
      ...le32(0x02014b50), ...le16(20), ...le16(20), ...le16(0), ...le16(0), ...le16(0), ...le16(0),
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

function xml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export type XlsxZelle = string | number

/** Baut die Arbeitsmappe: ein Blatt, Zeilen aus Strings und Zahlen. */
export function xlsxDatei(blattName: string, zeilen: XlsxZelle[][]): Uint8Array {
  const enc = (s: string) => new TextEncoder().encode(s)
  const spalte = (i: number) => {
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
  const zeilenXml = zeilen
    .map((zeile, zi) => {
      const zellen = zeile
        .map((wert, si) => {
          const ref = `${spalte(si)}${zi + 1}`
          if (typeof wert === 'number' && Number.isFinite(wert)) return `<c r="${ref}"><v>${wert}</v></c>`
          return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xml(String(wert))}</t></is></c>`
        })
        .join('')
      return `<row r="${zi + 1}">${zellen}</row>`
    })
    .join('')

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
          '</Types>',
      ),
    },
    {
      name: '_rels/.rels',
      inhalt: enc(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
          '</Relationships>',
      ),
    },
    {
      name: 'xl/workbook.xml',
      inhalt: enc(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
          `<sheets><sheet name="${xml(blattName)}" sheetId="1" r:id="rId1"/></sheets>` +
          '</workbook>',
      ),
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      inhalt: enc(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
          '</Relationships>',
      ),
    },
    {
      name: 'xl/worksheets/sheet1.xml',
      inhalt: enc(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
          `<sheetData>${zeilenXml}</sheetData>` +
          '</worksheet>',
      ),
    },
  ]
  return zipStore(dateien)
}

/** Ausloesen des Downloads im Browser — Gegenstueck zu downloadCsv. */
export function downloadXlsx(dateiname: string, blattName: string, zeilen: XlsxZelle[][]): void {
  const daten = xlsxDatei(blattName, zeilen)
  const blob = new Blob([daten.buffer as ArrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = dateiname
  a.click()
  URL.revokeObjectURL(url)
}
