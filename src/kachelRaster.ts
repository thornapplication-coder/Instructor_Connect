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
  return ohneWaise(anzahl, VORZUG) as Spalten
}

/** Erste Spaltenzahl der Vorzugsliste, deren letzte Reihe voll ist oder der höchstens eine Kachel fehlt. */
function ohneWaise(anzahl: number, vorzug: readonly number[]): number {
  for (const c of vorzug) {
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

/**
 * Startseite: dieselbe Regel, aber je Bildschirmbreite eine eigene
 * Vorzugsliste — und was in eine Reihe passt, füllt sie ganz.
 *
 * Audit 11/2026, UID-09 (Teil Startseite): Neun Kacheln standen ab xl in
 * vier Spalten — „DocCheck" allein in Reihe 3, quadratische Kacheln von
 * 253 px, die Seite 1436 px hoch bei 1440 × 900; Kachel und „Admin Panel"
 * lagen unter der Falz. Der Kommentar daneben rechnete noch mit sieben
 * Kacheln („4 + 3"). Die Zahl hängt an der Rolle: Superadmin und
 * Gruppenadmin neun, Mitglied acht (DocCheck bekommt es nie), Training
 * Admin ab Werk drei. Feste Spalten passten nie zu allen.
 *
 *  - Telefon hochkant: zwei Spalten — die Kacheln müssen groß bleiben.
 *  - Tablet (ab sm): drei, sonst vier (7 → 4 + 3 statt 3 + 3 + 1).
 *  - Desktop (ab lg): möglichst wenige Reihen — fünf, vier, drei
 *    (9 → 5 + 4). Die Kacheln haben dort eine feste Höhe, damit zwei
 *    Reihen unter Kopf und Wortmarke auf einen Laptop-Schirm passen.
 *  - Flaches Fenster (Telefon quer): vier, sonst drei — mehr Spalten machen
 *    die Zeilenkacheln zu schmal für ihre Beschriftung.
 *
 * Weniger Kacheln als Spalten heißt: so viele Spalten wie Kacheln. Zwei
 * Kacheln des Training Admins standen sonst links in einer Viererreihe,
 * daneben zwei leere Felder.
 */
const START = {
  telefon: [2],
  tablet: [3, 4],
  desktop: [5, 4, 3],
  flach: [4, 3],
} as const satisfies Record<string, readonly number[]>

export type Stufe = keyof typeof START

export function startSpalten(anzahl: number, stufe: Stufe): number {
  const vorzug = START[stufe]
  if (anzahl <= Math.max(...vorzug)) return Math.max(1, anzahl)
  return ohneWaise(anzahl, vorzug)
}

/* Ausgeschrieben aus demselben Grund wie KLASSE oben. */
const START_KLASSE: Record<Stufe, Record<number, string>> = {
  telefon: { 1: 'grid-cols-1', 2: 'grid-cols-2' },
  tablet: { 1: 'sm:grid-cols-1', 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3', 4: 'sm:grid-cols-4' },
  desktop: { 1: 'lg:grid-cols-1', 2: 'lg:grid-cols-2', 3: 'lg:grid-cols-3', 4: 'lg:grid-cols-4', 5: 'lg:grid-cols-5' },
  flach: { 1: 'short:grid-cols-1', 2: 'short:grid-cols-2', 3: 'short:grid-cols-3', 4: 'short:grid-cols-4' },
}

/** Rasterklassen der Startseite für alle Stufen; `short:` steht im CSS nach `lg:` und gewinnt im flachen Fenster. */
export function startRasterKlasse(anzahl: number): string {
  return (Object.keys(START) as Stufe[]).map((stufe) => START_KLASSE[stufe][startSpalten(anzahl, stufe)]).join(' ')
}
