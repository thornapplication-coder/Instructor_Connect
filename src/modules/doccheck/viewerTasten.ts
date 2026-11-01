/**
 * Viewer ohne Download (Spez. 2, 6.3): Für DocCheck-Nutzer werden
 * Strg/Cmd+S und Strg/Cmd+P abgefangen. Ein Bedienungsschutz, kein
 * Kopierschutz (Spez. 5.5) — er verhindert das Versehen, nicht die Absicht.
 */
export function istGesperrteTaste(e: { key: string; ctrlKey: boolean; metaKey: boolean; altKey?: boolean }): boolean {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return false
  return ['s', 'p'].includes(e.key.toLowerCase())
}
