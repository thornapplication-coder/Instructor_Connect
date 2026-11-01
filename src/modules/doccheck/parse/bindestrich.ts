/**
 * Silbentrennung am Zeilenende auflösen — und NUR die (Spez. 7.2).
 *
 * Aus der Referenzprüfung (Kap. 17 Nr. 2): „goaround" war ein Scheinbefund,
 * entstanden, weil ein Extraktor jeden Bindestrich am Zeilenende als
 * Trennung las. „go-around" ist aber ein echtes Bindestrichwort.
 *
 * Heuristik der Spezifikation: Kommt das Wort im Dokument auch OHNE
 * Zeilenumbruch mit Bindestrich vor, bleibt der Bindestrich. Sonst ist es
 * Silbentrennung und wird zusammengezogen.
 */

const WORT_MIT_STRICH = /\b([A-Za-zÄÖÜäöüß]+(?:-[A-Za-zÄÖÜäöüß]+)+)\b/g

/** Alle Bindestrichwörter, die irgendwo INNERHALB einer Zeile stehen. */
export function bindestrichWoerter(zeilen: string[]): Set<string> {
  const out = new Set<string>()
  for (const z of zeilen) for (const m of z.matchAll(WORT_MIT_STRICH)) out.add(m[1].toLowerCase())
  return out
}

/**
 * Zeilen einer Seite zu Text verbinden. Zeilenumbrüche bleiben erhalten —
 * außer dort, wo ein Wort getrennt wurde; dann steht es ganz in der
 * oberen Zeile.
 */
export function zeilenVerbinden(zeilen: string[], echte: Set<string>): string {
  const out: string[] = []
  let i = 0
  while (i < zeilen.length) {
    let z = zeilen[i]
    while (i + 1 < zeilen.length) {
      const m = z.match(/([A-Za-zÄÖÜäöüß]+)-$/)
      const naechste = zeilen[i + 1]
      const n = naechste.match(/^([a-zäöüß][A-Za-zÄÖÜäöüß]*)(.*)$/)
      // Nur bei kleingeschriebenem Anschluss: „FL-" + „200" oder „ATR-" +
      // „Liste" sind keine Silbentrennung.
      if (!m || !n) break
      const mitStrich = `${m[1]}-${n[1]}`.toLowerCase()
      const verbunden = echte.has(mitStrich) ? `${m[1]}-${n[1]}` : `${m[1]}${n[1]}`
      z = z.slice(0, z.length - m[0].length) + verbunden + n[2]
      i++
      // Der Rest der nächsten Zeile gehört jetzt zu dieser — weiter prüfen,
      // falls auch er wieder getrennt endet.
    }
    out.push(z)
    i++
  }
  return out.join('\n')
}
