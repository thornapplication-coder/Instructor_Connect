import type { PdfJs } from './parse/pdf'

/**
 * pdf.js laden — für den Lese-Worker wie für Viewer und OCR im Fenster.
 * Der eigene Worker von pdf.js kommt aus dem Bündel, nie von einem CDN
 * (Spez. 4.1). Einmal geladen, bleibt die Bibliothek im Speicher.
 */
let geladen: Promise<PdfJs> | null = null

export function pdfjsLaden(): Promise<PdfJs> {
  geladen ??= Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]).then(([lib, url]) => {
    lib.GlobalWorkerOptions.workerSrc = url.default
    return lib as unknown as PdfJs
  })
  return geladen
}
