/**
 * Spaltenzahl eines Kachelrasters — ohne Waise in der letzten Reihe.
 *
 * Das Admin-Panel zeigte dem Superadmin neun Kacheln in vier Spalten: zwei
 * volle Reihen und darunter „Changelog" allein neben drei leeren Feldern
 * (Audit 11/2026, UID-09). Eine feste Spaltenzahl passt nur zu einer
 * Kachelzahl — und die haengt an der Rolle (Superadmin neun, Gruppenadmin
 * zwei, Training Admin einer). Deshalb rechnet eine Funktion die Spalten aus
 * der Zahl, statt sie je Ansicht zu raten.
 *
 * Regel: Eine Reihe genuegt, solange alles hineinpasst. Sonst die erste
 * Spaltenzahl aus der Vorzugsliste, bei der die letzte Reihe voll ist oder
 * hoechstens eine Kachel fehlt. Vier zuerst (die bisherige Breite), dann drei
 * (9 → 3 × 3), dann fuenf, zuletzt zwei.
 */
const VORZUG = [4, 3, 5] as const
/** Zwei Spalten gehen immer auf: Die letzte Reihe hat eine oder zwei Kacheln. */
const ZULETZT = 2
export type Spalten = (typeof VORZUG)[number] | typeof ZULETZT

export function rasterSpalten(anzahl: number): Spalten {
  if (anzahl <= VORZUG[0]) return VORZUG[0]
  for (const c of VORZUG) {
    const rest = anzahl % c
    if (rest === 0 || rest >= c - 1) return c
  }
  return ZULETZT
}

/**
 * Die Tailwind-Klasse dazu. Sie steht hier ausgeschrieben, weil Tailwind nur
 * Klassen erzeugt, die woertlich im Quelltext vorkommen — ein
 * zusammengesetztes `grid-cols-${n}` fiele still weg.
 */
const KLASSE: Record<Spalten, string> = {
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4',
  5: 'grid-cols-5',
}

export function rasterKlasse(anzahl: number): string {
  return KLASSE[rasterSpalten(anzahl)]
}
