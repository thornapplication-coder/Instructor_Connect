import { docxLesen } from './docx'
import { duplikatPruefen, sha256Hex, type Duplikat, type Vergleichsdokument } from './duplikat'
import { metaErkennen, type ErkannteMeta } from './meta'
import type { Format, Rechtscharakter, Rohdokument } from './model'
import { pdfLesen, type PdfJs } from './pdf'
import type { PdfAblage } from './pdfAblage'
import { xlsxLesen } from './xlsx'

/**
 * Einstieg für jede hochgeladene Datei: Format bestimmen, lesen,
 * Fingerabdruck, Metadaten, Duplikat-Prüfung.
 *
 * Das Format kommt aus den ersten Bytes, nicht aus der Dateiendung — eine
 * umbenannte Datei führt sonst zu einem unverständlichen Lesefehler.
 */

export function formatErkennen(name: string, kopf: Uint8Array): Format | null {
  const ascii = String.fromCharCode(...kopf.slice(0, 5))
  if (ascii.startsWith('%PDF')) return 'pdf'
  if (kopf[0] === 0x50 && kopf[1] === 0x4b) {
    // ZIP: Office-Formate unterscheidet erst der Inhalt; die Endung ist
    // hier der günstige erste Hinweis, der Leser prüft den Rest.
    if (/\.xlsx$/i.test(name)) return 'xlsx'
    if (/\.docx$/i.test(name)) return 'docx'
    return null
  }
  return null
}

/** PDF-Titel aus Druckertreibern sind keine Titel („Microsoft Word - plm_v3.docx"). */
export function brauchbarerTitel(t?: string): string | undefined {
  if (!t) return undefined
  if (/^(microsoft (word|excel)\s*-|untitled|unbenannt)/i.test(t) || /\.(docx?|pdf|xlsx?)$/i.test(t)) return undefined
  return t
}

export interface Gelesen {
  roh: Rohdokument
  sha256: string
  meta: ErkannteMeta
  duplikat: Duplikat
}

export async function dateiLesen(
  datei: { name: string; daten: Uint8Array },
  deps: { pdfjs: () => Promise<PdfJs> },
  opts: PdfAblage & { vorgabe?: Rechtscharakter; bestand?: Vergleichsdokument[]; onFortschritt?: (s: number, g: number) => void; signal?: AbortSignal } = {},
): Promise<Gelesen> {
  // Eine leere Datei (abgebrochener Download, leerer Anhang) ist kein
  // unbekanntes Format — „PDF, DOCX oder XLSX?" führte auf die falsche
  // Spur (Audit 11/2026, DC-16).
  if (!datei.daten.byteLength) throw new Error('DC-EMPTY')
  const format = formatErkennen(datei.name, datei.daten)
  if (!format) throw new Error('DC-FORMAT')
  // Fingerabdruck VOR dem Lesen: pdf.js übernimmt den Puffer (transfer) und
  // lässt ihn danach leer zurück.
  const sha256 = await sha256Hex(datei.daten)
  const kopie = datei.daten.slice()
  const roh =
    format === 'pdf'
      ? await pdfLesen(kopie, await deps.pdfjs(), { vorgabe: opts.vorgabe, standardFontDataUrl: opts.standardFontDataUrl, wasmUrl: opts.wasmUrl, iccUrl: opts.iccUrl, onFortschritt: opts.onFortschritt, signal: opts.signal })
      : format === 'docx'
        ? await docxLesen(kopie, opts.vorgabe, opts.signal)
        : await xlsxLesen(kopie, opts.vorgabe, opts.signal)
  const eig = { ...roh.lenkung.eigenschaften, title: brauchbarerTitel(roh.lenkung.eigenschaften.title) ?? '' }
  // Deckblatt-Textfelder zählen zur ersten Seite — dort stehen bei Word-
  // Handbüchern Nummer, Revision und Datum.
  // Zusammen mit der ersten Seite, nicht davor als eigene: Sonst sucht die
  // Titelerkennung nur im Textfeld (oft nur die Dokumentnummer) und findet
  // den Titel daneben nicht — gefunden beim Browsertest mit SBX-WORD-01.
  const erste = roh.pages.slice(0, 3).map((p) => p.text)
  if (roh.lenkung.textfelder.length) erste[0] = [...roh.lenkung.textfelder, erste[0] ?? ''].join('\n')
  const meta = metaErkennen(erste, eig, datei.name)
  const duplikat = duplikatPruefen({ sha256, nummer: meta.nummer, revision: meta.revision }, opts.bestand ?? [])
  return { roh, sha256, meta, duplikat }
}
