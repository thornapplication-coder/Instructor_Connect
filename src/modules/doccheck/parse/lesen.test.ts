import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { docxBauen } from './docx.test'
import { brauchbarerTitel, dateiLesen, formatErkennen } from './lesen'
import type { PdfJs } from './pdf'
import { pdfBauen, textSeite } from './pdfBauen'
import { xlsxBauen } from './xlsx.test'

const standardFontDataUrl = fileURLToPath(new URL('../../../../node_modules/pdfjs-dist/standard_fonts/', import.meta.url))
const deps = { pdfjs: async () => pdfjs as unknown as PdfJs }

describe('formatErkennen — nach Inhalt, nicht nach Endung', () => {
  it('PDF an der Signatur, auch mit falscher Endung', () => {
    expect(formatErkennen('x.docx', new TextEncoder().encode('%PDF-1.7'))).toBe('pdf')
  })
  it('ZIP: Office-Format nach Endung; sonst unbekannt', () => {
    const zip = new Uint8Array([0x50, 0x4b, 3, 4])
    expect(formatErkennen('a.DOCX', zip)).toBe('docx')
    expect(formatErkennen('a.xlsx', zip)).toBe('xlsx')
    expect(formatErkennen('a.zip', zip)).toBeNull()
    expect(formatErkennen('a.txt', new TextEncoder().encode('hallo'))).toBeNull()
  })
})

describe('dateiLesen', () => {
  it('PDF: Metadaten vom Deckblatt, Fingerabdruck, Duplikat gegen den Bestand', async () => {
    const daten = pdfBauen([{ texte: textSeite(['Pilot Learning Manual CL30', 'Doc No.: SBX-PLM-300', 'Edition 1, Rev. 0.0', 'Effective 01 March 2026']) }], { titel: 'Microsoft Word - plm.docx' })
    const r = await dateiLesen({ name: 'plm.pdf', daten }, deps, {
      standardFontDataUrl,
      bestand: [{ id: 'x', bezeichnung: 'PLM Rev 0.0', herkunft: 'session', nummer: 'SBX-PLM-300', revision: 'Edition 1 Rev 0.0' }],
    })
    expect(r.meta).toMatchObject({ titel: 'Pilot Learning Manual CL30', revision: 'Edition 1 Rev 0.0', datum: '2026-03-01', typ: 'PLM' })
    expect(r.sha256).toHaveLength(64)
    expect(r.duplikat?.art).toBe('gleicheRevision')
    // Der Puffer des Aufrufers bleibt unversehrt (pdf.js übernimmt seine Kopie).
    expect(daten.byteLength).toBeGreaterThan(0)
  })

  it('DOCX: Deckblatt-Textfelder zählen für die Metadaten', async () => {
    const body = '<w:p><w:r><mc:AlternateContent><mc:Choice><w:txbxContent><w:p><w:r><w:t>Training Manual</w:t></w:r></w:p><w:p><w:r><w:t>Revision 7</w:t></w:r></w:p></w:txbxContent></mc:Choice></mc:AlternateContent></w:r></w:p><w:p><w:r><w:t>Body</w:t></w:r></w:p>'
    const r = await dateiLesen({ name: 'tm.docx', daten: await docxBauen(body) }, deps)
    expect(r.meta).toMatchObject({ titel: 'Training Manual', revision: 'Revision 7', typ: 'TM' })
    expect(r.roh.format).toBe('docx')
  })

  it('XLSX wird gelesen; unbekanntes Format → DC-FORMAT', async () => {
    expect((await dateiLesen({ name: 'l.xlsx', daten: await xlsxBauen() }, deps)).roh.format).toBe('xlsx')
    await expect(dateiLesen({ name: 'x.txt', daten: new Uint8Array([1, 2, 3]) }, deps)).rejects.toThrow('DC-FORMAT')
  })

  it('leere Datei → DC-EMPTY mit eigenem Text, nicht „Format nicht erkannt" (Audit 11/2026, DC-16)', async () => {
    for (const name of ['leer.pdf', 'leer.docx', 'leer.xlsx', 'leer']) await expect(dateiLesen({ name, daten: new Uint8Array() }, deps)).rejects.toThrow('DC-EMPTY')
  })
})

describe('brauchbarerTitel', () => {
  it('verwirft Druckertreiber-Titel und Dateinamen', () => {
    expect(brauchbarerTitel('Microsoft Word - plm.docx')).toBeUndefined()
    expect(brauchbarerTitel('scan.pdf')).toBeUndefined()
    expect(brauchbarerTitel(undefined)).toBeUndefined()
    expect(brauchbarerTitel('Flight Manual')).toBe('Flight Manual')
  })
})
