import type { BackendKonfig } from './backend/konfig'

/**
 * Content-Security-Policy der ausgelieferten Seite (Audit 11/2026, SEC-07).
 *
 * Bisher stand keine: Eine künftige XSS hätte jedes Skript nachladen und den
 * ganzen Bestand an jede Adresse schicken können. GitHub Pages setzt keine
 * eigenen Kopfzeilen, deshalb kommt die Richtlinie als `<meta>` in die
 * gebaute index.html — NUR im Build (Plugin in vite.config.ts mit
 * `apply: 'build'`): `vite dev` mit dem React-Plugin braucht ein
 * Inline-Skript (Refresh-Präambel), das sie zu Recht abwiese.
 *
 * Warum jede Quelle da ist:
 * - `'wasm-unsafe-eval'`: WebAssembly (OCR-Kern, Bilddecoder von pdf.js) —
 *   erlaubt Wasm, NICHT `eval` für JavaScript.
 * - `worker-src blob:`: Bibliotheken, die ihren Worker aus einem Blob bauen.
 * - `connect-src blob: data:`: Abrufe eingelesener Dateien und Bilddaten.
 * - `style-src 'unsafe-inline'`: Stilattribute; Skripte bleiben streng.
 * - `form-action 'none'`: Kein Formular der App sendet — jedes fängt
 *   `onSubmit` ab. Ein Absenden wäre also ein Fehler oder ein Angriff.
 *
 * Mit Backend kommt dessen Adresse in `connect-src` (dazu die WebSocket-
 * Fassung derselben Adresse für Echtzeit-Kanäle) — nur dann, ohne Backend
 * gibt es kein fremdes Ziel.
 */
export function cspFuer(konfig: BackendKonfig | null): string {
  const verbinden = ["'self'", 'blob:', 'data:']
  if (konfig) {
    const ursprung = new URL(konfig.url).origin
    // Die Adresse wird Teil der Richtlinie: Ein Semikolon oder Leerzeichen
    // darin begänne eine eigene Anweisung (etwa „script-src *"). Lieber den
    // Build abbrechen als still eine aufgeweichte Richtlinie ausliefern.
    if (!/^https?:\/\/[A-Za-z0-9.-]+(:\d+)?$/.test(ursprung)) throw new Error(`CSP: unzulässige Backend-Adresse ${JSON.stringify(konfig.url)}`)
    verbinden.push(ursprung, ursprung.replace(/^http/, 'ws'))
  }
  const anweisungen: [string, string[]][] = [
    ['default-src', ["'self'"]],
    ['script-src', ["'self'", "'wasm-unsafe-eval'"]],
    ['worker-src', ["'self'", 'blob:']],
    ['connect-src', verbinden],
    ['img-src', ["'self'", 'data:', 'blob:']],
    ['style-src', ["'self'", "'unsafe-inline'"]],
    ['font-src', ["'self'", 'data:']],
    ['object-src', ["'none'"]],
    ['base-uri', ["'self'"]],
    ['form-action', ["'none'"]],
  ]
  return anweisungen.map(([name, quellen]) => `${name} ${quellen.join(' ')}`).join('; ')
}
