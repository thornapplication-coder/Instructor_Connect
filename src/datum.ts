/**
 * Das Datumsformat der App — an EINER Stelle.
 *
 * Befund aus dem Audit: Diese beiden Funktionen standen in
 * `src/pages/Grading.tsx`, also in einer Seitendatei, und wurden von zwoelf
 * Modulen importiert — darunter `src/gradingExport.ts`, ein Logik-Modul, das
 * damit aus einer React-Seite zog. Ein Test gab es nicht, und die Wache in
 * `src/testGuard.test.ts` konnte ihn nicht verlangen: Sie prueft nur
 * `src/*.ts`. Die zentralste Formatregel der App lag damit ausserhalb jeder
 * Absicherung.
 *
 * Festlegung: **DD.MM.YYYY, in beiden Sprachen** (31.08.2026). Nicht das
 * Gebietsschema — Englisch zeigte sonst 31/08/2026 und im Chat sogar 14/08
 * ganz ohne Jahr. Die Datums-EINGABEFELDER folgen weiter dem Geraet; deren
 * Schreibweise bestimmt der Browser, nicht die App.
 */

/** Monatsname samt Jahr („August 2026") — ein NAME, kein Datum, deshalb in
 *  der Sprache der Oberflaeche. Die DD.MM.YYYY-Regel gilt fuer Datumsangaben. */
export function monatsName(monat: string, sprache: string): string {
  const jahr = Number(monat.slice(0, 4))
  const m = Number(monat.slice(5, 7))
  if (!Number.isFinite(jahr) || !Number.isFinite(m) || m < 1 || m > 12) return monat
  return new Date(jahr, m - 1, 1).toLocaleDateString(sprache === 'de' ? 'de-AT' : 'en-GB', {
    month: 'long',
    year: 'numeric',
  })
}

/** Einheitliches Datumsformat DD.MM.YYYY. Nimmt einen Zeitstempel oder ein
 *  ISO-Datum (YYYY-MM-DD); was sich nicht lesen laesst, kommt unveraendert
 *  zurueck, statt „NaN.NaN.NaN" in einen Nachweis zu schreiben. */
export function formatDate(input: number | string): string {
  const d = typeof input === 'number' ? new Date(input) : new Date(`${input}T00:00:00`)
  if (Number.isNaN(d.getTime())) return String(input)
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`
}

/** Datum mit Uhrzeit — DD.MM.YYYY HH:MM, Ortszeit des Geraets. */
export function formatDateTime(ts: number): string {
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return String(ts)
  return `${formatDate(ts)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
