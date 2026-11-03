import { aufbereiten } from './aufbereiten'
import { ablageParameter, type AblageParameter, type PdfAblage } from './pdfAblage'
import { LEERE_LENKUNG, type Rechtscharakter, type Rohdokument } from './model'
import { seitenZeilen, type TextStueck } from './zeilen'

/**
 * PDF lesen über pdf.js (Spez. 7.2).
 *
 * pdf.js wird HINEINGEREICHT statt importiert: Im Browser läuft die
 * moderne Fassung im Worker, in den Tests die Node-taugliche
 * „legacy"-Fassung. Die Logik ist dieselbe.
 */

/** Der Teil von pdf.js, den dieser Leser braucht. */
export interface PdfJs {
  getDocument(src: { data: Uint8Array; isEvalSupported?: boolean; useSystemFonts?: boolean; disableFontFace?: boolean } & AblageParameter): { promise: Promise<PdfDok>; destroy(): Promise<void> }
  OPS: Record<string, number>
}

export interface PdfDok {
  numPages: number
  getPage(n: number): Promise<PdfSeite>
  getMetadata(): Promise<{ info?: Record<string, unknown> }>
}
export interface PdfSeite {
  getTextContent(): Promise<{ items: unknown[] }>
  getOperatorList(): Promise<{ fnArray: number[] }>
  cleanup(): void
}

/** Weniger Zeichen als das, und die Seite ist ein OCR-Kandidat — sofern sie ein Bild trägt. */
export const OCR_SCHWELLE = 30

type Item = { str?: string; transform?: number[]; width?: number; height?: number }

/** pdf.js-Textstücke in die Form, die `seitenZeilen` erwartet. */
export function stueckeAus(items: unknown[]): TextStueck[] {
  const out: TextStueck[] = []
  for (const raw of items) {
    const it = raw as Item
    if (typeof it.str !== 'string' || !it.transform) continue
    // NFKC: Ligaturen („ﬁ" → „fi") und Sonderformen würden sonst jede Suche
    // nach „fire" verfehlen. Weiche Trennstriche sind unsichtbar — weg damit.
    const str = it.str.normalize('NFKC').replace(/\u00AD/g, '')
    const [, , c, d, e, f] = it.transform
    const h = it.height || Math.hypot(c, d) || 1
    out.push({ str, x: e, y: f, w: it.width ?? str.length * h * 0.5, h })
  }
  return out
}

export interface PdfOptionen extends PdfAblage {
  vorgabe?: Rechtscharakter
  onFortschritt?: (seite: number, gesamt: number) => void
  signal?: AbortSignal
}

/** Alle so viele Seiten gibt der Leser die Ereignisschleife frei. */
export const FREIGABE_SEITEN = 8

/** Einen Macrotask abwarten — erst dann kommen Nachrichten an den Worker an. */
export const freigeben = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

export async function pdfLesen(daten: Uint8Array, pdfjs: PdfJs, opts: PdfOptionen = {}): Promise<Rohdokument> {
  const aufgabe = pdfjs.getDocument({ data: daten, isEvalSupported: false, useSystemFonts: false, disableFontFace: true, ...ablageParameter(opts) })
  let dok: PdfDok
  try {
    dok = await aufgabe.promise
  } catch (e) {
    const name = (e as { name?: string }).name
    throw new Error(name === 'PasswordException' ? 'DC-PDF-PASSWORD' : 'DC-PDF-INVALID')
  }
  try {
    const bildOps = new Set(['paintImageXObject', 'paintInlineImageXObject', 'paintImageMaskXObject', 'paintImageXObjectRepeat'].map((k) => pdfjs.OPS[k]).filter((v) => v !== undefined))
    const roh: string[][] = []
    const ocr: number[] = []
    for (let n = 1; n <= dok.numPages; n++) {
      // Im Fake-Worker antwortete pdf.js nur über Microtasks. Ohne Freigabe
      // lief „abbrechen" — wie jede Suche — erst nach der letzten Seite ein;
      // da war das Signal schon verwaist, und das abgebrochene Dokument
      // wurde trotzdem aufgenommen (Audit 11/2026, DC-01). Der eigene Kanal
      // (pdfjsLaden) antwortet über Tasks; die Freigabe bleibt trotzdem, weil
      // sie nicht davon abhängen soll, wie pdf.js gerade antwortet.
      if (n % FREIGABE_SEITEN === 0) await freigeben()
      if (opts.signal?.aborted) throw new Error('DC-ABORTED')
      const seite = await dok.getPage(n)
      const zeilen = seitenZeilen(stueckeAus((await seite.getTextContent()).items))
      roh.push(zeilen)
      if (zeilen.join('').replace(/\s/g, '').length < OCR_SCHWELLE) {
        const ops = await seite.getOperatorList()
        if (ops.fnArray.some((f) => bildOps.has(f))) ocr.push(n)
      }
      seite.cleanup()
      opts.onFortschritt?.(n, dok.numPages)
    }
    const meta = await dok.getMetadata().catch(() => ({ info: {} as Record<string, unknown> }))
    const titel = typeof meta.info?.Title === 'string' ? meta.info.Title.trim() : ''
    // Erstell-/Änderungsdatum: Für das Word-PDF-Paar (Nachtrag N5) muss
    // erkennbar sein, ob das PDF älter ist als das DOCX.
    const datum = [meta.info?.ModDate, meta.info?.CreationDate].find((d): d is string => typeof d === 'string' && d.startsWith('D:'))
    const { pages, outline } = aufbereiten(roh, { vorgabe: opts.vorgabe })
    return {
      format: 'pdf',
      pages,
      outline,
      lenkung: { ...LEERE_LENKUNG, eigenschaften: { ...(titel ? { title: titel } : {}), ...(datum ? { pdfDatum: datum } : {}) } },
      ocrKandidaten: ocr,
      tabellen: 0,
    }
  } finally {
    // pdf.js 6: Aufräumen über die Ladeaufgabe — sie gibt auch den Worker-Teil frei.
    await aufgabe.destroy()
  }
}
