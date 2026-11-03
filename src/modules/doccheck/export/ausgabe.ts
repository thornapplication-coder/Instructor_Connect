import JSZip from 'jszip'
import { csvBefunde } from './csv'
import type { Datenstand } from './datenstand'
import { pruefstandAus, pruefstandText, type Pruefstand } from './pruefstand'
import type { CsvTrenner } from '../types'
import { geraetOnline, istLadefehler } from '../ladefehler'

/**
 * Alle Formate aus EINEM Datenstand (Spez. v1.1 Kap. 10.1 Nr. 1), mit den
 * Dateinamen aus Kap. 10.2. Word und PowerPoint werden erst hier geladen
 * — wer nur die CSV will, lädt docx.js und pptxgenjs nie.
 */

export type Format = 'xlsx' | 'docx' | 'csv' | 'pptx' | 'json'

export const ENDUNG: Record<Format, string> = {
  xlsx: '.xlsx',
  docx: '_Report.docx',
  csv: '_Findings.csv',
  pptx: '_Briefing.pptx',
  json: '.doccheck.json',
}

export const MIME: Record<Format | 'zip', string> = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  csv: 'text/csv;charset=utf-8',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  json: 'application/json',
  zip: 'application/zip',
}

export interface Datei {
  name: string
  daten: Uint8Array
  mime: string
}

/** Was eine Ausgabe außer dem Datenstand braucht; der CSV-Trenner ist Einstellung des Superadmins (Spez. 10.6). */
export interface Kontext {
  userId: string
  ts: string
  csvTrenner?: CsvTrenner
  /** Geladener Prüfstand, aus dem der Datenstand stammt — dessen Prüfer, Anlagedatum und Verlauf bleiben im neuen (EXP-15) */
  herkunft?: Pruefstand
}

export async function erzeugen(d: Datenstand, format: Format, kontext: Kontext & { formate: Format[] }): Promise<Datei> {
  const name = `${d.dateiStamm}${ENDUNG[format]}`
  const text = (s: string) => new TextEncoder().encode(s)
  let daten: Uint8Array
  if (format === 'csv') daten = text(csvBefunde(d, kontext.csvTrenner))
  else if (format === 'json') daten = text(pruefstandText(pruefstandAus(d, kontext.userId, kontext.formate, kontext.ts, kontext.herkunft)))
  else if (format === 'xlsx') daten = await (await import('./xlsx')).xlsxExport(d)
  else if (format === 'docx') daten = await (await import('./docx')).docxExport(d)
  else daten = await (await import('./pptx')).pptxExport(d)
  return { name, daten, mime: MIME[format] }
}

/**
 * Welche Meldung ein gescheiterter Export bekommt (Audit 11/2026, TEC-19).
 *
 * Excel, Word und PowerPoint laden ihre Bibliothek erst beim ersten Export
 * (oben, `import()`); der Service Worker legt sie erst bei diesem Abruf in
 * den Cache. Offline scheiterten sie deshalb — und die Meldung „konnte
 * nicht erzeugt werden" klang nach einem kaputten Export, für ZIP ebenso.
 * Ein Ladefehler sagt jetzt, was hilft: einmal Netz, oder CSV und
 * Prüfstand, die ohne Nachladen auskommen — und, ist das Netz wieder da,
 * Prüfstand speichern und die Seite neu laden (`neuLaden`).
 *
 * Bewusst NICHT im Leerlauf vorgeladen: Wer nur die CSV will, soll docx.js
 * und pptxgenjs nie laden (s. o.) — das gälte sonst für jedes Gerät, das
 * ein Dokument einliest.
 */
export function exportFehler(fehler: unknown, online: boolean = geraetOnline()): 'netz' | 'neuLaden' | 'fehler' {
  if (!istLadefehler(fehler, online)) return 'fehler'
  // Mit Netz gescheitert heißt: Der Browser hat den gescheiterten Modulabruf
  // gespeichert und holt ihn in dieser Seite nicht noch einmal (ladefehler.ts).
  // Nachgemessen in der Gegenprüfung: Einmal offline auf „Word" geklickt,
  // scheiterten danach mit Netz Word UND Excel (docx.ts bezieht xlsx.ts) bei
  // jedem Klick — mit „gerade ist kein Netz da". Erst ein Neuladen hilft,
  // und das verwirft die Sitzungsdokumente; der Prüfstand bewahrt die Befunde.
  return online ? 'neuLaden' : 'netz'
}

/** ZIP-Paket `…_All.zip` mit allen gewählten Formaten und dem Prüfstand. */
export async function paket(d: Datenstand, formate: Format[], kontext: Kontext): Promise<Datei> {
  const alle: Format[] = [...new Set([...formate, 'json' as const])]
  const zip = new JSZip()
  const date = new Date(`${d.datum}T00:00:00Z`)
  for (const f of alle) {
    const x = await erzeugen(d, f, { ...kontext, formate: alle })
    zip.file(x.name, x.daten, { date, createFolders: false })
  }
  return { name: `${d.dateiStamm}_All.zip`, daten: await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }), mime: MIME.zip }
}
