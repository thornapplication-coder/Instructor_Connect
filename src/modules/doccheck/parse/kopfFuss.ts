/**
 * Kopf- und Fußzeilen erkennen und entfernen (Spez. 7.2).
 *
 * Eine Zeile, die auf mehr als 60 % der Seiten wiederkehrt — wörtlich oder
 * bis auf die Seitenzahl —, ist Seitenrahmen, kein Inhalt. Bliebe sie im
 * Text, fände die Suche „Revision 2" auf jeder Seite, und der Prüfer bekäme
 * jede Fußzeile als Fundstelle.
 *
 * Die gedruckte Seitenbezeichnung steckt genau in diesen Zeilen und wird
 * dabei übernommen: Ein Befund verweist auf „6-04-15 Page 2", nicht auf
 * PDF-Seite 1 812.
 */

const RAND = 3
const LABEL_HINWEIS = /\b(page|seite|pg\.?)\b/i
const SCHWELLE = 0.6

/** Ziffern als Platzhalter — „Page 12 of 300" und „Page 13 of 300" sind dieselbe Zeile. */
export function muster(zeile: string): string {
  return zeile.replace(/\d+/g, '#').replace(/\s+/g, ' ').trim().toLowerCase()
}


export interface KopfFussErgebnis {
  seiten: string[][]
  labels: (string | undefined)[]
  entfernt: string[]
  /** je Seite die entfernten Zeilen — dort steht der Revisionsstand (Formalprüfung) */
  rand: string[][]
}

export function kopfFussEntfernen(seiten: string[][]): KopfFussErgebnis {
  const n = seiten.length
  if (n < 3) return { seiten, labels: seiten.map(() => undefined), entfernt: [], rand: seiten.map(() => []) }
  const zaehler = new Map<string, number>()
  for (const zeilen of seiten) {
    const rand = new Set([...zeilen.slice(0, RAND), ...zeilen.slice(-RAND)].map(muster).filter(Boolean))
    for (const m of rand) zaehler.set(m, (zaehler.get(m) ?? 0) + 1)
  }
  // Nur-bis-auf-Ziffern gleich reicht allein nicht: „Step 1 … Step 2" am
  // Seitenanfang ist Inhalt. Eine Zeile mit wechselnder Zahl ist nur dann
  // Seitenrahmen, wenn sie nach Seitenangabe aussieht („Page 3", „- 12 -",
  // „6-04-15 Page 2") — sonst ginge Inhalt verloren, und das wäre schlimmer
  // als eine stehengebliebene Fußzeile.
  // Je Muster: wie oft kommt die häufigste WÖRTLICHE Fassung vor?
  const woertlich = new Map<string, Map<string, number>>()
  for (const zeilen of seiten) {
    const rand = new Set([...zeilen.slice(0, RAND), ...zeilen.slice(-RAND)].map((z) => z.replace(/\s+/g, ' ').trim()))
    for (const z of rand) {
      const m = muster(z)
      const k = woertlich.get(m) ?? new Map<string, number>()
      k.set(z, (k.get(z) ?? 0) + 1)
      woertlich.set(m, k)
    }
  }
  const gleichBleibend = (m: string) => Math.max(0, ...(woertlich.get(m)?.values() ?? [])) / n > SCHWELLE
  const wiederkehrend = new Set(
    [...zaehler]
      .filter(([m, c]) => c / n > SCHWELLE && (!m.includes('#') || gleichBleibend(m) || LABEL_HINWEIS.test(m) || /^[\s#\W]+$/.test(m)))
      .map(([m]) => m),
  )

  const labels: (string | undefined)[] = []
  const rand: string[][] = []
  const bereinigt = seiten.map((zeilen) => {
    const randIdx = new Set([...Array(Math.min(RAND, zeilen.length)).keys(), ...[...Array(Math.min(RAND, zeilen.length)).keys()].map((i) => zeilen.length - 1 - i)])
    const weg = zeilen.filter((z, i) => randIdx.has(i) && wiederkehrend.has(muster(z)))
    // Bezeichnung: die entfernte Zeile mit Seitenzahl — bevorzugt eine, die
    // „Page" o. Ä. sagt; sonst die erste mit Ziffern.
    const mitZiffer = weg.filter((z) => /\d/.test(z) && muster(z).includes('#'))
    const label = mitZiffer.find((z) => LABEL_HINWEIS.test(z)) ?? mitZiffer[0]
    labels.push(label ? seitenLabel(label) : undefined)
    rand.push(weg)
    return zeilen.filter((z, i) => !(randIdx.has(i) && wiederkehrend.has(muster(z))))
  })
  return { seiten: bereinigt, labels, entfernt: [...wiederkehrend], rand }
}

/**
 * Aus einer Fußzeile die eigentliche Bezeichnung schneiden. Mehrere Blöcke
 * („Rev 2 | 6-04-15 Page 2 | 01.03.2026") werden auf den Block mit „Page"
 * bzw. mit Ziffern reduziert — Revision und Datum sind keine Seitenangabe.
 */
export function seitenLabel(zeile: string): string {
  const teile = zeile.split(' | ').map((t) => t.trim())
  const t = teile.find((x) => LABEL_HINWEIS.test(x)) ?? teile.find((x) => /\d/.test(x)) ?? zeile
  return t.replace(/\s+/g, ' ').trim()
}
