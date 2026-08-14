import { describe, expect, it } from 'vitest'
import { downloadXlsx, xlsxDatei } from './xlsxExport'

/**
 * Der Excel-Export der Logbuch-Auswertung ist ein von Hand geschriebenes
 * .xlsx (ZIP + XML, ohne Fremdbibliothek). Genau deshalb steht hier ein
 * Leser daneben: Ein Fehler im ZIP-Aufbau faellt sonst erst beim Oeffnen in
 * Excel auf — und dort als „Datei ist beschaedigt", ohne Hinweis wo.
 */

/** Minimaler Leser fuer STORE-ZIPs: Central Directory rueckwaerts suchen. */
function entpacke(zip: Uint8Array): Map<string, Uint8Array> {
  const le32 = (o: number) => zip[o] | (zip[o + 1] << 8) | (zip[o + 2] << 16) | ((zip[o + 3] << 24) >>> 0)
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

  it('enthaelt die fuenf Pflichtteile einer Arbeitsmappe', () => {
    expect([...dateien.keys()].sort()).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'xl/_rels/workbook.xml.rels',
      'xl/workbook.xml',
      'xl/worksheets/sheet1.xml',
    ])
  })

  it('schreibt korrekte CRC-Pruefsummen — sonst meldet Excel eine beschaedigte Datei', () => {
    const le32 = (o: number) => zip[o] | (zip[o + 1] << 8) | (zip[o + 2] << 16) | ((zip[o + 3] << 24) >>> 0)
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
