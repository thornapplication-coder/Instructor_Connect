import JSZip from 'jszip'
import { csvBefunde } from './csv'
import type { Datenstand } from './datenstand'
import { pruefstandAus, pruefstandText } from './pruefstand'

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

export async function erzeugen(d: Datenstand, format: Format, kontext: { userId: string; ts: string; formate: Format[] }): Promise<Datei> {
  const name = `${d.dateiStamm}${ENDUNG[format]}`
  const text = (s: string) => new TextEncoder().encode(s)
  let daten: Uint8Array
  if (format === 'csv') daten = text(csvBefunde(d))
  else if (format === 'json') daten = text(pruefstandText(pruefstandAus(d, kontext.userId, kontext.formate, kontext.ts)))
  else if (format === 'xlsx') daten = await (await import('./xlsx')).xlsxExport(d)
  else if (format === 'docx') daten = await (await import('./docx')).docxExport(d)
  else daten = await (await import('./pptx')).pptxExport(d)
  return { name, daten, mime: MIME[format] }
}

/** ZIP-Paket `…_All.zip` mit allen gewählten Formaten und dem Prüfstand. */
export async function paket(d: Datenstand, formate: Format[], kontext: { userId: string; ts: string }): Promise<Datei> {
  const alle: Format[] = [...new Set([...formate, 'json' as const])]
  const zip = new JSZip()
  const date = new Date(`${d.datum}T00:00:00Z`)
  for (const f of alle) {
    const x = await erzeugen(d, f, { ...kontext, formate: alle })
    zip.file(x.name, x.daten, { date, createFolders: false })
  }
  return { name: `${d.dateiStamm}_All.zip`, daten: await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }), mime: MIME.zip }
}
