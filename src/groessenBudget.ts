/**
 * Größenbudget: Was lädt jedes Gerät?
 *
 * Zwei Zahlen zählen für die Nutzer: was beim ersten Öffnen über die Leitung
 * geht, bevor etwas zu sehen ist (Startdateien, gzip), und was der Service
 * Worker für den Start ohne Netz vorab lädt (Vorab-Cache, roh — so liegt es
 * auf dem Gerät). Die Warnschwelle des Builds (vite.config.ts, 800 kB je
 * Chunk) meldet nur und hält nichts an; `startbundle.test.ts` prüft, WAS
 * importiert wird, nicht wie viel. Rutschte eine schwere Bibliothek in den
 * Start (pdf.js 440 kB, docx 190 kB), bemerkte es niemand, bis ein iPad im
 * Hangar eine Minute lädt.
 *
 * Gemessen am Build vom 04.11.2026 (1.28.0): Start 250 kB gzip, Vorab-Cache
 * 1,15 MB. Die Grenzen lassen gut 10 % bzw. 30 % Luft. Wer sie anhebt,
 * schreibt den Grund daneben — er lautet nicht „passt sonst nicht".
 */
export const BUDGET = {
  /** JS und CSS, die index.html direkt lädt, gzip-komprimiert */
  startGzip: 280_000,
  /** Alle Dateien des Vorab-Caches, unkomprimiert */
  vorabRoh: 1_500_000,
} as const

export interface Gemessen {
  pfad: string
  roh: number
  gzip: number
}

/** Dateien unter assets/, die index.html direkt lädt (Skripte, Stylesheets, modulepreload). */
export function startDateien(indexHtml: string): string[] {
  const out = new Set<string>()
  for (const m of indexHtml.matchAll(/<(?:script|link)\b[^>]*?\b(?:src|href)="(?:\.\/|\/)?(assets\/[^"]+\.(?:js|css))"/g)) out.add(m[1])
  return [...out].sort()
}

/** Verstöße gegen das Budget — leer heißt: in Ordnung. Mit Zahlen, damit der rote Lauf sagt, um wie viel. */
export function budgetPruefen(start: readonly Gemessen[], vorab: readonly Gemessen[]): string[] {
  const out: string[] = []
  const startGzip = start.reduce((a, d) => a + d.gzip, 0)
  const vorabRoh = vorab.reduce((a, d) => a + d.roh, 0)
  if (!start.length) out.push('Keine Startdateien gefunden — index.html verweist auf nichts unter assets/')
  if (startGzip > BUDGET.startGzip) out.push(`Start ${kb(startGzip)} gzip > Budget ${kb(BUDGET.startGzip)}: ${groesste(start, 'gzip')}`)
  if (vorabRoh > BUDGET.vorabRoh) out.push(`Vorab-Cache ${kb(vorabRoh)} > Budget ${kb(BUDGET.vorabRoh)}: ${groesste(vorab, 'roh')}`)
  return out
}

const kb = (b: number) => `${Math.round(b / 1000)} kB`

function groesste(d: readonly Gemessen[], feld: 'roh' | 'gzip'): string {
  return [...d]
    .sort((a, b) => b[feld] - a[feld])
    .slice(0, 3)
    .map((x) => `${x.pfad} ${kb(x[feld])}`)
    .join(', ')
}
