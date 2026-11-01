/**
 * Tastatur für Reiterleisten (WAI-ARIA „Tabs"): Pfeile wechseln im Kreis,
 * Pos1/Ende springen an den Rand. Vorher waren die Reiter nur per Tab
 * einzeln erreichbar und ließen sich nicht mit Pfeilen bedienen
 * (Barrierefreiheitsprüfung 01.11.2026). Liefert den neuen Reiter oder
 * `null`, wenn die Taste nichts mit der Leiste zu tun hat.
 */
export function naechsterReiter<T>(liste: readonly T[], aktuell: T, taste: string, senkrecht = false): T | null {
  if (!liste.length) return null
  const i = Math.max(0, liste.indexOf(aktuell))
  const vor = senkrecht ? 'ArrowDown' : 'ArrowRight'
  const zurueck = senkrecht ? 'ArrowUp' : 'ArrowLeft'
  if (taste === vor) return liste[(i + 1) % liste.length]
  if (taste === zurueck) return liste[(i - 1 + liste.length) % liste.length]
  if (taste === 'Home') return liste[0]
  if (taste === 'End') return liste[liste.length - 1]
  return null
}
