/**
 * Impressum: Klartext aus dem Admin Panel → Abschnitte zum Anzeigen.
 *
 * "# " beginnt einen Abschnitt mit Überschrift, "- " eine Aufzählungszeile,
 * Leerzeilen trennen Absätze. Text vor der ersten Überschrift ist die
 * Einleitung (Abschnitt ohne Titel).
 *
 * Stand in `src/pages/Imprint.tsx`, exportiert und ohne Test — die
 * Testwache sah keine `.tsx` (Audit 11/2026, TEC-18). Was der Superadmin
 * hier eintippt, steht auf der öffentlichen Seite; ein Fehler im Zerlegen
 * verschluckt Text ohne Rückmeldung.
 */
export type ImpressumBlock = { type: 'p'; text: string } | { type: 'ul'; items: string[] }

export interface ImpressumAbschnitt {
  title: string | null
  blocks: ImpressumBlock[]
}

export function parseImprint(text: string): ImpressumAbschnitt[] {
  const sections: ImpressumAbschnitt[] = []
  let current: ImpressumAbschnitt = { title: null, blocks: [] }
  const pushSection = () => {
    if (current.title !== null || current.blocks.length > 0) sections.push(current)
  }
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (line.startsWith('# ')) {
      pushSection()
      current = { title: line.slice(2).trim(), blocks: [] }
    } else if (line.startsWith('- ')) {
      const last = current.blocks[current.blocks.length - 1]
      if (last && last.type === 'ul') last.items.push(line.slice(2).trim())
      else current.blocks.push({ type: 'ul', items: [line.slice(2).trim()] })
    } else if (line.length > 0) {
      current.blocks.push({ type: 'p', text: line })
    }
  }
  pushSection()
  return sections
}
