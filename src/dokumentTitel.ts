import { Children, isValidElement, useEffect, type ReactNode } from 'react'

/**
 * Fenstertitel — eine Stelle für alle, die ihn setzen.
 *
 * Audit 11/2026, A11Y-13: Jede Ansicht hieß „Instructor Connect" — im Tab,
 * in der Fensterliste und in der Ansage der Sprachausgabe beim
 * Seitenwechsel (WCAG 2.4.2). Jetzt meldet die Kopfleiste ihren Titel an
 * („Notes – Instructor Connect").
 *
 * Zwei Arten melden sich an: die Seite (`seite`, über die Kopfleiste) und
 * eine Druckansicht (`druck`, `useDruckTitel`) — deren Titel schlägt der
 * Browser beim „Als PDF sichern" als Dateinamen vor und geht deshalb vor,
 * solange sie offen ist.
 *
 * Bewusst ein Stapel statt „vorigen Titel merken und beim Verlassen
 * zurückschreiben": Ändern sich Seitentitel (Kopfleiste, Kind) und
 * Drucktitel (Ansicht, Eltern) im selben Durchgang, räumt React erst das
 * Kind ab, dann die Eltern — die schreiben dabei den ALTEN Seitentitel
 * zurück, und genau den merkt sich das Kind beim Neusetzen als „vorher".
 * Nach dem Verlassen stand dann der Titel einer Seite, die es nicht mehr
 * gab (nachgestellt in dokumentTitel.dom.test.ts). Aus dem Stapel ergibt
 * sich der Titel in jeder Reihenfolge gleich.
 */
export const APP_TITEL = 'Instructor Connect'

export type TitelArt = 'seite' | 'druck'
export interface TitelEintrag {
  titel: string
  art: TitelArt
}

export const seitenTitel = (titel: string): string => `${titel} – ${APP_TITEL}`

/** Der geltende Titel: die jüngste Druckansicht, sonst die jüngste Seite mit App-Namen, sonst der App-Name. */
export function geltenderTitel(eintraege: readonly TitelEintrag[]): string {
  for (let i = eintraege.length - 1; i >= 0; i--) if (eintraege[i].art === 'druck') return eintraege[i].titel
  const seite = eintraege[eintraege.length - 1]
  return seite ? seitenTitel(seite.titel) : APP_TITEL
}

const angemeldet: TitelEintrag[] = []

/**
 * Meldet einen Titel an und setzt den geltenden; die Rückgabe meldet ihn
 * wieder ab. Gezählt wird der Eintrag selbst (Objektidentität), nicht sein
 * Text — zwei Ansichten mit gleichem Titel stören sich nicht.
 */
export function titelAnmelden(eintrag: TitelEintrag): () => void {
  angemeldet.push(eintrag)
  document.title = geltenderTitel(angemeldet)
  return () => {
    const i = angemeldet.indexOf(eintrag)
    if (i >= 0) angemeldet.splice(i, 1)
    document.title = geltenderTitel(angemeldet)
  }
}

/** Titel einer Ansicht, solange sie offen ist. `null` oder leer = nichts anmelden. */
export function useDokumentTitel(titel: string | null | undefined, art: TitelArt = 'seite'): void {
  useEffect(() => {
    if (!titel) return
    return titelAnmelden({ titel, art })
  }, [titel, art])
}

/**
 * Lesbarer Text eines Seitentitels, der kein bloßer Text ist — im Chat ist
 * der Titel ein Knopf mit dem Gruppennamen darin. Symbole und andere
 * Elemente ohne Text tragen nichts bei.
 */
export function knotenText(knoten: ReactNode): string {
  if (typeof knoten === 'string' || typeof knoten === 'number') return String(knoten)
  if (isValidElement<{ children?: ReactNode }>(knoten)) return knotenText(knoten.props.children)
  if (Array.isArray(knoten)) return Children.toArray(knoten).map(knotenText).join('')
  return ''
}
