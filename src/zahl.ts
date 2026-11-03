/**
 * Zahlen in der Schreibweise der Oberflächensprache — an EINER Stelle.
 *
 * Audit 11/2026, TXT-17: DocCheck schrieb Seitenzahlen und Token-Grenzen
 * fest mit `toLocaleString('de-AT')`, an drei Stellen. In der englischen
 * Oberfläche stand deshalb „SBX-AVI-300 · 1 490 pp." neben „3,000 pages"
 * aus dem Sprachpaket. Gleiche Zuordnung wie `monatsName` in `datum.ts`:
 * Deutsch → de-AT, alles andere → en-GB.
 *
 * Nur für die ANZEIGE. Exporte schreiben Zahlen ohne Gruppierung, damit
 * Excel sie als Zahl liest (`csvNum` in `csv.ts`).
 */
export function zahl(n: number, sprache: string): string {
  return n.toLocaleString(sprache.startsWith('de') ? 'de-AT' : 'en-GB')
}
