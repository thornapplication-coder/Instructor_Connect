/**
 * Bewegung nur, wenn der Nutzer sie nicht abgeschaltet hat.
 *
 * Audit 11/2026, A11Y-15: Die Systemeinstellung „Bewegung reduzieren"
 * wurde nirgends beachtet. Für CSS (Übergänge, Kachelhub, Kreisel) regelt
 * das `src/index.css` mit einer Medienabfrage. Ein `scrollIntoView` mit
 * `behavior: 'smooth'` aus dem Code geht aber an CSS vorbei — die
 * ausdrückliche Angabe schlägt `scroll-behavior` —, deshalb steht die Frage
 * hier, einmal für jeden Sprung im Code.
 */
export const WENIGER_BEWEGUNG = '(prefers-reduced-motion: reduce)'

type Abfrage = (q: string) => { matches: boolean }

/** Ohne `matchMedia` (alte Umgebung, Test ohne Nachbildung) ist nichts
 *  bekannt — dann bleibt es beim bisherigen Verhalten. */
function standardAbfrage(): Abfrage | null {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? (q) => window.matchMedia(q) : null
}

export function bewegungReduziert(abfrage: Abfrage | null = standardAbfrage()): boolean {
  return abfrage?.(WENIGER_BEWEGUNG).matches ?? false
}

/** Für `scrollIntoView`/`scrollTo`: springen statt gleiten, wenn gewünscht. */
export function scrollVerhalten(abfrage: Abfrage | null = standardAbfrage()): ScrollBehavior {
  return bewegungReduziert(abfrage) ? 'auto' : 'smooth'
}
