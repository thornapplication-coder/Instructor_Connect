/**
 * Texterkennung für Seiten ohne Textebene (Spez. 7.2): nach Rückfrage, mit
 * `tesseract.js`, englisch, 200 dpi.
 *
 * Alle Pfade zeigen auf die mitgelieferten Dateien unter `<basis>ocr/`.
 * Ohne ausdrückliche Pfade lädt tesseract.js Kern, Worker UND Sprachdaten
 * von einem CDN — genau das schließt die Spezifikation aus (Kap. 4.1:
 * keine Laufzeit-CDNs). Der Test prüft das.
 */

export const OCR_DPI = 200
/** Tesseract „LSTM only" — passend zu den mitgelieferten *-lstm-Kernen. */
export const OEM_LSTM = 1

export interface OcrSeite {
  getViewport(o: { scale: number }): { width: number; height: number }
  render(o: { canvasContext: unknown; canvas: unknown; viewport: unknown }): { promise: Promise<void> }
  cleanup(): void
}
export interface OcrPdf {
  getDocument(src: { data: Uint8Array }): { promise: Promise<{ getPage(n: number): Promise<OcrSeite> }>; destroy(): Promise<void> }
}
export interface OcrTesseract {
  createWorker(lang: string, oem: number, opts: Record<string, unknown>): Promise<{ recognize(bild: unknown): Promise<{ data: { text: string } }>; terminate(): Promise<unknown> }>
}

export function tesseractOptionen(basis: string): Record<string, unknown> {
  const ocr = `${basis}ocr/`
  return {
    workerPath: `${ocr}worker.min.js`,
    corePath: ocr,
    langPath: ocr.replace(/\/$/, ''),
    gzip: true,
    // Kein Ablegen der Sprachdaten in IndexedDB: Die App legt dort nur
    // ihren eigenen Zustand ab; den Rest hält der Service Worker vor.
    cacheMethod: 'none',
    workerBlobURL: false,
  }
}

export async function ocrAusfuehren(
  daten: Uint8Array,
  seiten: number[],
  deps: { pdfjs: () => Promise<OcrPdf>; tesseract: () => Promise<OcrTesseract>; basis: string; leinwand: (b: number, h: number) => { getContext(t: '2d'): unknown } },
  onFortschritt?: (fertig: number, gesamt: number) => void,
  signal?: AbortSignal,
): Promise<{ n: number; text: string }[]> {
  const [pdfjs, tess] = await Promise.all([deps.pdfjs(), deps.tesseract()])
  const aufgabe = pdfjs.getDocument({ data: daten.slice() })
  const worker = await tess.createWorker('eng', OEM_LSTM, tesseractOptionen(deps.basis))
  const out: { n: number; text: string }[] = []
  try {
    const dok = await aufgabe.promise
    for (const n of seiten) {
      if (signal?.aborted) break
      const seite = await dok.getPage(n)
      const viewport = seite.getViewport({ scale: OCR_DPI / 72 })
      const leinwand = deps.leinwand(Math.ceil(viewport.width), Math.ceil(viewport.height))
      await seite.render({ canvasContext: leinwand.getContext('2d'), canvas: leinwand, viewport }).promise
      const { data } = await worker.recognize(leinwand)
      out.push({ n, text: data.text })
      seite.cleanup()
      onFortschritt?.(out.length, seiten.length)
    }
  } finally {
    await worker.terminate()
    await aufgabe.destroy()
  }
  return out
}
