import type { Note } from './types'

/**
 * Notizen — die persönliche Merkliste eines Instruktors.
 *
 * Bewusst KEIN Nachweis: Eine Notiz ist eine Gedächtnisstütze („beim nächsten
 * Mal Engine-out wiederholen", „LVO-Briefing vorbereiten"), kein Dokument der
 * ATO. Sie geht in keinen Export, sie hängt an keinem Formular, und sie
 * gehört ausschließlich dem, der sie geschrieben hat — auch der Superadmin
 * sieht sie nicht. Das ist die Voraussetzung dafür, dass jemand überhaupt
 * offen etwas notiert; eine Notiz, die mitgelesen wird, ist keine.
 *
 * Bewusst OHNE Musterbezug: Der erste Entwurf hatte einen, weil ihn jede
 * andere Liste der App führt. Für eine Merkliste ist er Ballast — man tippt
 * drei Wörter und will sie ablegen, nicht einordnen. Wer die Zuordnung
 * braucht, schreibt sie in den Titel.
 *
 * Hier liegt nur die reine Logik: sortieren, suchen, gruppieren. Kein React,
 * kein Store — damit sie prüfbar bleibt.
 */

/** Angeheftete Notizen stehen in einer eigenen Gruppe ganz oben. */
export const PINNED = 'pinned'
/** Alles Übrige. */
export const OTHERS = 'others'

/**
 * Reihenfolge innerhalb einer Gruppe: zuletzt geändert zuerst.
 *
 * Maßgeblich ist `updatedAt`, nicht `createdAt`: Wer eine alte Notiz
 * ergänzt, hat sie gerade wieder gebraucht — sie gehört nach oben, nicht
 * dorthin zurück, wo sie vor drei Monaten angelegt wurde.
 */
export function byRecent(a: Note, b: Note): number {
  return b.updatedAt - a.updatedAt
}

/** Volltextsuche über Titel und Text. Leere Suche liefert alles. */
export function searchNotes(notes: Note[], query: string): Note[] {
  const q = query.trim().toLowerCase()
  if (!q) return notes
  return notes.filter((n) => `${n.title} ${n.body}`.toLowerCase().includes(q))
}

/**
 * Gruppen für die Liste: „Angeheftet" oben, darunter alles Übrige.
 *
 * Eine angeheftete Notiz erscheint NUR oben und nicht zusätzlich weiter
 * unten — sonst stünde dieselbe Notiz zweimal in derselben Liste, und man
 * wüsste beim Löschen nicht, welche man erwischt. Leere Gruppen entfallen:
 * Solange nichts angeheftet ist, braucht die Liste keine Überschrift.
 */
export function groupNotes(notes: Note[]): { key: string; notes: Note[] }[] {
  const pinned = notes.filter((n) => n.pinned).sort(byRecent)
  const rest = notes.filter((n) => !n.pinned).sort(byRecent)
  return [
    ...(pinned.length > 0 ? [{ key: PINNED, notes: pinned }] : []),
    ...(rest.length > 0 ? [{ key: OTHERS, notes: rest }] : []),
  ]
}

/**
 * Kurzfassung des Textes für die Listenansicht.
 *
 * Zeilenumbrüche werden zu Leerzeichen: In der Liste steht eine Zeile, und
 * ein Text, der mit einer Aufzählung beginnt, sähe sonst aus wie eine leere
 * Notiz. Gekürzt wird an der letzten Wortgrenze, nicht mitten im Wort.
 */
export function notePreview(body: string, max = 120): string {
  const eine = body.replace(/\s+/g, ' ').trim()
  if (eine.length <= max) return eine
  const schnitt = eine.slice(0, max)
  const luecke = schnitt.lastIndexOf(' ')
  return `${(luecke > max * 0.6 ? schnitt.slice(0, luecke) : schnitt).trimEnd()}…`
}
