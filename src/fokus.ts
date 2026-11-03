/**
 * Wohin der Tastaturfokus geht, wenn sein bisheriges Ziel verschwindet.
 *
 * Ohne Ziel fällt der Fokus auf <body>: Tastaturnutzer fangen wieder vor
 * der Kopfleiste an, und Sprachausgaben melden gar nichts. Drei Wege führten
 * dorthin — der Seitenwechsel (router.tsx), ein Dialog, dessen Auslöser beim
 * Schließen nicht mehr da ist oder nie einer war (der DocCheck-Hinweis geht
 * beim Laden der Seite auf), und die Anmeldung, nach der die Startseite ohne
 * Fokus erschien (Audit 11/2026, A11Y-03/A11Y-17). Alle drei landen hier bei
 * der Überschrift der Seite, die `data-page-heading` trägt.
 */

/**
 * Fokus auf die Überschrift der aktuellen Seite. Liefert, ob er dort angekommen ist.
 *
 * Ohne Rollen (`preventScroll`): Die Überschrift steht in der klebenden
 * Kopfleiste, ist also ohnehin zu sehen — `focus()` rollte trotzdem an ihre
 * Stelle im Dokument, den Seitenanfang. Nach einem Seitenwechsel machte das
 * die Position zunichte, die die neue Ansicht gerade gesetzt hatte (der Chat
 * sprang ans Ende und gleich wieder nach oben, KERN-01), und nach einem
 * geschlossenen Dialog stand man plötzlich oben statt an der Stelle, an der
 * man gearbeitet hatte.
 */
export function seitenUeberschriftFokussieren(): boolean {
  const ziel = document.querySelector<HTMLElement>('[data-page-heading]')
  if (!ziel) return false
  ziel.focus({ preventScroll: true })
  return document.activeElement === ziel
}

/**
 * Fokus nach dem Schließen eines Dialogs: zurück auf den Auslöser, sonst auf
 * die Seitenüberschrift.
 *
 * Als Auslöser zählt nur ein Element, das noch im Dokument hängt und den
 * Fokus auch annimmt. <body> ist keiner (Dialog beim Laden geöffnet), ein
 * entfernter Knopf ebenso wenig („Löschen" nimmt seine Zeile mit), und ein
 * ausgeblendeter oder deaktivierter Knopf lehnt `focus()` still ab — deshalb
 * wird nachgesehen, statt sich auf den Aufruf zu verlassen.
 */
export function fokusZurueck(ausloeser: Element | null): void {
  const el = ausloeser as HTMLElement | null
  if (el && el !== document.body && el.isConnected && typeof el.focus === 'function') {
    el.focus()
    if (document.activeElement === el) return
  }
  seitenUeberschriftFokussieren()
}
