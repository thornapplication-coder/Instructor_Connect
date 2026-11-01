import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { Kern } from './kern'
import type { PdfJs } from './parse/pdf'
import { pdfBauen, textSeite } from './parse/pdfBauen'

const standardFontDataUrl = fileURLToPath(new URL('../../../node_modules/pdfjs-dist/standard_fonts/', import.meta.url))
const kern = () => new Kern({ pdfjs: async () => pdfjs as unknown as PdfJs, standardFontDataUrl })
const pdf = (zeilen: string[], weitere: { bild?: boolean }[] = []) => pdfBauen([{ texte: textSeite(zeilen) }, ...weitere.map((w) => ({ texte: [], ...w }))])

describe('Kern — Lesen, Suchen, Entfernen', () => {
  it('liest, fasst zusammen und macht das Dokument durchsuchbar', async () => {
    const k = kern()
    const fort: number[] = []
    const z = await k.lesen({ id: 'd1', name: 'afm.pdf', daten: pdf(['Airplane Flight Manual', 'BATT 1 OFF BUS', 'Rev. 4']) }, (n) => fort.push(n))
    expect(z).toMatchObject({ id: 'd1', format: 'pdf', seiten: 1, ocrSeiten: 0, meta: { revision: 'Rev 4', typ: 'AFM' } })
    expect(z.sha256).toHaveLength(64)
    expect(fort).toEqual([1])
    expect(k.suchen('BATT 1 OFF BUS')[0]).toMatchObject({ docId: 'd1', docTitle: 'Airplane Flight Manual', exakt: true })
    expect(k.seitenText('d1', 1)).toContain('BATT 1 OFF BUS')
    expect(k.seitenText('d1', 9)).toBeNull()
    expect(k.seitenText('x', 1)).toBeNull()
    k.entfernen('d1')
    expect(k.anzahl).toBe(0)
    expect(k.suchen('BATT 1 OFF BUS')).toEqual([])
  })

  it('übergebener Titel geht vor; Titeländerung erscheint in den Treffern', async () => {
    const k = kern()
    await k.lesen({ id: 'd', name: 'x.pdf', titel: 'Mein PLM', daten: pdf(['hydraulic pressure check']) })
    expect(k.suchen('hydraulic')[0].docTitle).toBe('Mein PLM')
    k.titelSetzen('d', 'PLM CL30')
    k.titelSetzen('d', 'PLM CL30')
    k.titelSetzen('fehlt', 'x')
    expect(k.suchen('hydraulic')[0].docTitle).toBe('PLM CL30')
  })

  it('Abbrechen während des Lesens → DC-ABORTED, nichts wird aufgenommen', async () => {
    const k = kern()
    const daten = pdfBauen(Array.from({ length: 30 }, (_, i) => ({ texte: textSeite([`page ${i}`]) })))
    const lauf = k.lesen({ id: 'gross', name: 'g.pdf', daten }, (n) => n === 2 && k.abbrechen('gross'))
    await expect(lauf).rejects.toThrow('DC-ABORTED')
    expect(k.anzahl).toBe(0)
    k.abbrechen('gibt-es-nicht')
  })

  it('OCR-Ergebnis ersetzt den Seitentext, markiert die Seite und landet im Index', async () => {
    const k = kern()
    const z = await k.lesen({ id: 's', name: 's.pdf', daten: pdf(['Cover page with enough text here'], [{ bild: true }]) })
    expect(z.ocrKandidaten).toEqual([2])
    const neu = k.ocrEinspielen('s', [{ n: 2, text: 'Scanned   AMC1 ORA.ATO.230\n\n\n\nend' }, { n: 99, text: 'x' }])
    expect(neu).toMatchObject({ ocrSeiten: 1, ocrKandidaten: [] })
    expect(k.seitenText('s', 2)).toBe('Scanned AMC1 ORA.ATO.230\n\nend')
    expect(k.suchen('AMC1 ORA.ATO.230')[0]).toMatchObject({ seite: 2 })
    k.ocrEinspielen('s', [{ n: 2, text: 'ohne Regel' }])
    expect(k.suchen('AMC1 ORA.ATO.230')).toEqual([])
    expect(k.ocrEinspielen('fehlt', [])).toBeNull()
  })

  it('Lesefehler kommen als Code an und hinterlassen nichts', async () => {
    const k = kern()
    await expect(k.lesen({ id: 'x', name: 'x.txt', daten: new Uint8Array([1, 2]) })).rejects.toThrow('DC-FORMAT')
    expect(k.anzahl).toBe(0)
  })
})
