import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { pdfLesen, stueckeAus, type PdfJs } from './pdf'
import { pdfBauen, textSeite } from './pdfBauen'

const lib = pdfjs as unknown as PdfJs
const standardFontDataUrl = fileURLToPath(new URL('../../../../node_modules/pdfjs-dist/standard_fonts/', import.meta.url))

function handbuch(seiten: number): Uint8Array {
  return pdfBauen(
    Array.from({ length: seiten }, (_, i) => ({
      texte: [
        { text: 'SBX AFM CL30', x: 60, y: 810 },
        ...textSeite(i === 0 ? ['1 Electrical', 'Perform a go-around if needed.', 'The hy-', 'draulic go-', 'around check.'] : [`Content of page ${i + 1} BATT 1 OFF BUS`]),
        { text: `2-${String(i + 1).padStart(2, '0')} Page ${i + 1}`, x: 60, y: 30 },
      ],
    })),
  )
}

describe('PDF lesen über pdf.js (Spez. 7.2)', () => {
  it('entfernt Kopf-/Fußzeilen, übernimmt Seitenlabels, löst Trennung richtig auf', async () => {
    const fortschritt: number[] = []
    const r = await pdfLesen(handbuch(4), lib, { onFortschritt: (n) => fortschritt.push(n), vorgabe: 'OEM', standardFontDataUrl })
    expect(r.pages).toHaveLength(4)
    expect(r.pages[0].text).toBe('1 Electrical\nPerform a go-around if needed.\nThe hydraulic go-around check.')
    expect(r.pages[0].label).toBe('2-01 Page 1')
    expect(r.pages[0].legalType).toBe('OEM')
    expect(r.pages[1].sectionPath).toEqual(['1 Electrical'])
    expect(r.pages.map((p) => p.text).join(' ')).not.toContain('SBX AFM CL30')
    expect(fortschritt).toEqual([1, 2, 3, 4])
    expect(r.outline).toEqual([{ titel: '1 Electrical', ebene: 1, vonSeite: 1 }])
  })

  it('Seiten ohne Text mit Bild sind OCR-Kandidaten, leere ohne Bild nicht', async () => {
    const daten = pdfBauen([{ texte: textSeite(['Real text on the first page here']) }, { texte: [], bild: true }, { texte: [] }])
    const r = await pdfLesen(daten, lib, { standardFontDataUrl })
    expect(r.ocrKandidaten).toEqual([2])
  })

  it('Titel aus den PDF-Metadaten', async () => {
    const r = await pdfLesen(pdfBauen([{ texte: textSeite(['x']) }], { titel: 'Synthetic AFM' }), lib, { standardFontDataUrl })
    expect(r.lenkung.eigenschaften).toEqual({ title: 'Synthetic AFM' })
  })

  it('kaputte Datei → DC-PDF-INVALID; Abbruch → DC-ABORTED', async () => {
    await expect(pdfLesen(new TextEncoder().encode('%PDF-1.4 kaputt'), lib)).rejects.toThrow('DC-PDF-INVALID')
    const ctrl = new AbortController()
    ctrl.abort()
    await expect(pdfLesen(handbuch(2), lib, { signal: ctrl.signal, standardFontDataUrl })).rejects.toThrow('DC-ABORTED')
  })

  it('passwortgeschützt → DC-PDF-PASSWORD (ohne Absturz, Spez. 13.3)', async () => {
    const fake: PdfJs = {
      OPS: {},
      getDocument: () => ({ promise: Promise.reject(Object.assign(new Error('pw'), { name: 'PasswordException' })), destroy: async () => {} }),
    }
    await expect(pdfLesen(new Uint8Array(), fake)).rejects.toThrow('DC-PDF-PASSWORD')
  })
})

describe('stueckeAus', () => {
  it('normalisiert Ligaturen und weiche Trennstriche, überspringt Fremdes', () => {
    const s = stueckeAus([{ str: 'ﬁre\u00ADwall', transform: [10, 0, 0, 10, 5, 6], width: 30, height: 10 }, { type: 'beginMarkedContent' }, { str: 'x', transform: [1, 0, 0, 12, 0, 0] }])
    expect(s[0]).toEqual({ str: 'firewall', x: 5, y: 6, w: 30, h: 10 })
    expect(s[1].h).toBe(12)
    expect(s).toHaveLength(2)
  })
})

describe('Grenzfälle', () => {
  it('unlesbare Metadaten brechen das Lesen nicht ab; fehlende Breite wird geschätzt', async () => {
    const seite = {
      getTextContent: async () => ({ items: [{ str: 'Hello world text long enough for no OCR at all', transform: [1, 0, 0, 10, 60, 700] }] }),
      getOperatorList: async () => ({ fnArray: [] }),
      cleanup: () => {},
    }
    const fake: PdfJs = {
      OPS: {},
      getDocument: () => ({
        promise: Promise.resolve({ numPages: 1, getPage: async () => seite, getMetadata: () => Promise.reject(new Error('kaputt')) }),
        destroy: async () => {},
      }),
    }
    const r = await pdfLesen(new Uint8Array(), fake)
    expect(r.lenkung.eigenschaften).toEqual({})
    expect(r.pages[0].text).toBe('Hello world text long enough for no OCR at all')
  })
})
