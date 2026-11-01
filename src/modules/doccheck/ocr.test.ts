import { describe, expect, it, vi } from 'vitest'
import { OCR_DPI, ocrAusfuehren, tesseractOptionen, type OcrPdf, type OcrTesseract } from './ocr'

function deps(opts: { abbrechenNach?: number } = {}) {
  const render = vi.fn(() => ({ promise: Promise.resolve() }))
  const getViewport = vi.fn(({ scale }: { scale: number }) => ({ width: 595 * scale, height: 842 * scale }))
  const destroy = vi.fn(async () => {})
  const pdf: OcrPdf = { getDocument: () => ({ promise: Promise.resolve({ getPage: async () => ({ getViewport, render, cleanup: () => {} }) }), destroy }) }
  const terminate = vi.fn(async () => {})
  const createWorker = vi.fn(async () => ({ recognize: async () => ({ data: { text: 'SCANNED TEXT' } }), terminate }))
  const tess: OcrTesseract = { createWorker }
  const leinwand = vi.fn((b: number, h: number) => ({ b, h, getContext: () => ({}) }))
  return { d: { pdfjs: async () => pdf, tesseract: async () => tess, basis: 'https://app/doccheck/', leinwand }, render, getViewport, createWorker, terminate, destroy, leinwand }
}

describe('OCR (Spez. 7.2)', () => {
  it('alle Pfade lokal — kein CDN für Worker, Kern oder Sprachdaten (Spez. 4.1)', () => {
    const o = tesseractOptionen('https://app/doccheck/')
    expect(o).toMatchObject({ workerPath: 'https://app/doccheck/ocr/worker.min.js', corePath: 'https://app/doccheck/ocr/', langPath: 'https://app/doccheck/ocr', gzip: true, cacheMethod: 'none', workerBlobURL: false })
    expect(JSON.stringify(o)).not.toMatch(/jsdelivr|unpkg|cdn/i)
  })

  it('rendert jede Seite mit 200 dpi, erkennt englisch/LSTM und räumt auf', async () => {
    const x = deps()
    const fort = vi.fn()
    const r = await ocrAusfuehren(new Uint8Array([1]), [2, 5], x.d, fort)
    expect(r).toEqual([{ n: 2, text: 'SCANNED TEXT' }, { n: 5, text: 'SCANNED TEXT' }])
    expect(x.getViewport).toHaveBeenCalledWith({ scale: OCR_DPI / 72 })
    expect(x.leinwand).toHaveBeenCalledWith(Math.ceil(595 * (200 / 72)), Math.ceil(842 * (200 / 72)))
    expect(x.createWorker).toHaveBeenCalledWith('eng', 1, expect.objectContaining({ langPath: 'https://app/doccheck/ocr' }))
    expect(fort).toHaveBeenLastCalledWith(2, 2)
    expect(x.terminate).toHaveBeenCalled()
    expect(x.destroy).toHaveBeenCalled()
  })

  it('Abbruch: liefert das bisher Erkannte und räumt trotzdem auf', async () => {
    const x = deps()
    const ctrl = new AbortController()
    const r = await ocrAusfuehren(new Uint8Array([1]), [1, 2, 3], x.d, (n) => n === 1 && ctrl.abort(), ctrl.signal)
    expect(r).toHaveLength(1)
    expect(x.terminate).toHaveBeenCalled()
  })
})
