import type { PdfJs } from './parse/pdf'
import type { PdfAblage } from './parse/pdfAblage'

/**
 * pdf.js laden — für den Lese-Worker wie für Viewer und OCR im Fenster.
 * Der eigene Worker von pdf.js kommt aus dem Bündel, nie von einem CDN
 * (Spez. 4.1). Einmal geladen, bleibt die Bibliothek im Speicher.
 */
let geladen: Promise<PdfJs> | null = null

declare const WorkerGlobalScope: unknown

export function pdfjsLaden(): Promise<PdfJs> {
  geladen ??= Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]).then(async ([lib, url]) => {
    lib.GlobalWorkerOptions.workerSrc = url.default
    if (typeof WorkerGlobalScope === 'undefined') return lib as unknown as PdfJs
    // Dieselbe Datei, die pdf.js im Fenster als Worker startet — kein
    // zweites Exemplar im Bündel.
    const teil = (await import(/* @vite-ignore */ url.default)) as { WorkerMessageHandler: WorkerTeil }
    return kanalAnbinden(lib as unknown as PdfJsVoll, teil.WorkerMessageHandler)
  })
  return geladen
}

/**
 * Wo die Laufzeitdateien von pdf.js unter `<basis>` liegen — die Namen
 * legt `docCheckDateien` in vite.config.ts fest. Worker, Viewer und OCR
 * fragen dieselbe Stelle, sonst fände eine Seite die Schrift, die andere nicht.
 */
export function pdfAblage(basis: string): Required<PdfAblage> {
  return { standardFontDataUrl: `${basis}pdf-fonts/`, wasmUrl: `${basis}pdf-wasm/`, iccUrl: `${basis}pdf-iccs/` }
}

/** Was der eigene Kanal von pdf.js braucht. */
export interface PdfJsVoll extends PdfJs {
  getDocument(src: Parameters<PdfJs['getDocument']>[0] & { worker?: unknown }): ReturnType<PdfJs['getDocument']>
  PDFWorker: new (o: { port: KanalEnde; name?: string }) => unknown
}
/** Der Worker-Teil von pdf.js (`WorkerMessageHandler` aus pdf.worker.mjs). */
export interface WorkerTeil {
  initializeFromPort(port: KanalEnde): void
}
export interface KanalEnde {
  postMessage(nachricht: unknown, transfer?: Transferable[]): void
  start(): void
}

/**
 * Im DocCheck-Worker gibt es kein `window`: pdf.js kann dort keinen eigenen
 * Worker starten, richtet den „Fake-Worker" ein und meldet „Setting up fake
 * worker" (Audit 11/2026, TEC-20). Ein weiterer Thread brächte nichts —
 * pdf.js läuft hier schon abseits der Oberfläche. Deshalb hängt sein
 * Worker-Teil am anderen Ende eines MessageChannel im SELBEN Worker: was
 * der Fake-Worker tut, nur als vorgesehener Weg statt als Rückfall.
 *
 * Ein PDFWorker für alle Dokumente, übergeben als `worker`: Dann gehört er
 * keiner Ladeaufgabe, und `destroy()` des einen Dokuments reißt ihn dem
 * gleichzeitig gelesenen anderen nicht weg (anders als bei `workerPort`).
 */
export function kanalAnbinden(lib: PdfJsVoll, teil: WorkerTeil, kanal: { port1: KanalEnde; port2: KanalEnde } = new MessageChannel()): PdfJs {
  teil.initializeFromPort(kanal.port2)
  // addEventListener startet einen MessagePort nicht von selbst.
  kanal.port1.start()
  kanal.port2.start()
  const worker = new lib.PDFWorker({ port: kanal.port1, name: 'doccheck' })
  return { OPS: lib.OPS, getDocument: (src) => lib.getDocument({ ...src, worker }) }
}
