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
 * Hier liegt nur die reine Logik: sortieren, suchen, gruppieren. Kein React,
 * kein Store — damit sie prüfbar bleibt.
 */

/** Angeheftete Notizen stehen in einer eigenen Gruppe ganz oben. */
export const PINNED = ' pinned'
/** Notizen ohne Musterbezug — sie stehen am Ende, nicht vorn. */
export const GENERAL = ''

/** Musterbezug einer Notiz, sauber getrimmt. */
export function aircraftOf(n: Note): string {
  return n.aircraftType?.trim() ?? ''
}

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
 * Gruppen für die Liste: erst „Angeheftet", dann je Muster alphabetisch,
 * zuletzt die Notizen ohne Musterbezug.
 *
 * Eine angeheftete Notiz erscheint NUR oben und nicht zusätzlich in ihrer
 * Muster-Gruppe — sonst stünde dieselbe Notiz zweimal in derselben Liste,
 * und man wüsste beim Löschen nicht, welche man erwischt.
 */
export function groupNotes(notes: Note[]): { key: string; notes: Note[] }[] {
  const pinned = notes.filter((n) => n.pinned).sort(byRecent)
  const rest = notes.filter((n) => !n.pinned)
  const muster = [...new Set(rest.map(aircraftOf))].sort((a, b) =>
    a === GENERAL ? 1 : b === GENERAL ? -1 : a.localeCompare(b),
  )
  const gruppen = muster.map((key) => ({ key, notes: rest.filter((n) => aircraftOf(n) === key).sort(byRecent) }))
  return pinned.length > 0 ? [{ key: PINNED, notes: pinned }, ...gruppen] : gruppen
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

/** Musterliste für die Filterleiste — nur Muster, zu denen es Notizen gibt. */
export function aircraftTypesOf(notes: Note[]): string[] {
  return [...new Set(notes.map(aircraftOf).filter(Boolean))].sort((a, b) => a.localeCompare(b))
}
