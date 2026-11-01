import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { pdfBauen, textSeite } from './pdfBauen'

const SCHRIFTEN = fileURLToPath(new URL('../../../../node_modules/pdfjs-dist/standard_fonts/', import.meta.url))

describe('pdfBauen — synthetische Testdokumente', () => {
  it('erzeugt ein PDF, das pdf.js mit Text, Seitenzahl und Titel liest', async () => {
    const daten = pdfBauen([{ texte: textSeite(['Hello (world)', 'second \\ line']) }, { texte: [], bild: true }], { titel: 'Synthetic' })
    expect(String.fromCharCode(...daten.slice(0, 8))).toBe('%PDF-1.4')
    const aufgabe = pdfjs.getDocument({ data: daten, standardFontDataUrl: SCHRIFTEN })
    const dok = await aufgabe.promise
    expect(dok.numPages).toBe(2)
    const t = await (await dok.getPage(1)).getTextContent()
    expect(t.items.map((i) => ('str' in i ? i.str : ''))).toEqual(['Hello (world)', 'second \\ line'])
    expect((await dok.getMetadata()).info).toMatchObject({ Title: 'Synthetic' })
    await aufgabe.destroy()
  })

  it('textSeite setzt Zeilen von oben nach unten', () => {
    expect(textSeite(['a', 'b'], { oben: 100, abstand: 10 }).map((t) => t.y)).toEqual([100, 90])
  })
})
