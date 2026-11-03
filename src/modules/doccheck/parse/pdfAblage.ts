/**
 * Wo pdf.js seine Laufzeitdateien findet — lokal, nie ein CDN (Spez. 4.1):
 * Standardschriften, WebAssembly-Decoder (ICC-Farben, JPEG 2000, JBIG2)
 * und das CMYK-Profil.
 */
export interface PdfAblage {
  standardFontDataUrl?: string
  wasmUrl?: string
  iccUrl?: string
}
export type AblageParameter = PdfAblage & { useWorkerFetch?: boolean }

const webAdresse = (u?: string) => !!u && /^https?:\/\//i.test(u)

/**
 * Die Adressen als getDocument-Parameter.
 *
 * Ohne `useWorkerFetch` fragt der Worker-Teil von pdf.js die Gegenseite
 * nach jeder Datei, und die liest dafür `document.baseURI`. Im
 * DocCheck-Worker gibt es kein `document`: Jede Schrift scheiterte mit
 * „Unable to load font data", die ausgelieferte Ablage blieb ungenutzt
 * (Audit 11/2026, DC-15). Mit `useWorkerFetch` holt pdf.js selbst per fetch.
 *
 * Nur, wenn ALLE drei Adressen Web-Adressen sind: Holt pdf.js selbst und
 * fehlt `wasmUrl`, warnt es bei jeder ICC-Farbe; fehlt `iccUrl`, bei jedem
 * CMYK — vorher schaltete es beides still ab. In Node (Tests) sind die
 * Adressen Dateipfade; die liest pdf.js über das Dateisystem, nicht per fetch.
 */
export function ablageParameter(a: PdfAblage): AblageParameter {
  const p: AblageParameter = {}
  if (a.standardFontDataUrl) p.standardFontDataUrl = a.standardFontDataUrl
  if (a.wasmUrl) p.wasmUrl = a.wasmUrl
  if (a.iccUrl) p.iccUrl = a.iccUrl
  if (webAdresse(a.standardFontDataUrl) && webAdresse(a.wasmUrl) && webAdresse(a.iccUrl)) p.useWorkerFetch = true
  return p
}
