import { druckTitel } from './dateiName'
import { useDokumentTitel } from './dokumentTitel'

/**
 * Titel des Dokuments, solange die Ansicht offen ist.
 *
 * Der Browser benennt ein gedrucktes PDF nach `document.title` und schreibt
 * ihn als Titel hinein. Ohne eigenen Titel hiess jeder Ausdruck
 * „Instructor Connect.pdf" — mehrere Berichte ueberschrieben sich oder
 * wurden zu „(1)"-Kopien (Audit 11/2026, EXM-04). Beim Verlassen kommt der
 * vorige Titel zurueck, damit die naechste Seite nicht unter fremdem Namen
 * druckt.
 *
 * Lag als Effekt allein in GradingView; als Hook, damit jede druckbare
 * Auswertung dasselbe Schema (`druckTitel`, dateiName.ts) benutzt.
 * `null` = noch nichts zu benennen (Datensatz nicht geladen).
 *
 * Seit jede Kopfleiste ihren Seitentitel setzt (A11Y-13), stehen zwei
 * Titel an: Der Drucktitel geht vor, und welcher beim Verlassen gilt,
 * entscheidet der gemeinsame Stapel in `dokumentTitel.ts` — „vorigen Titel
 * zurückschreiben" ließ je nach Reihenfolge der Effekte einen fremden stehen.
 */
export function useDruckTitel(teile: readonly (string | null | undefined)[] | null): void {
  // Abhaengig vom fertigen Text, nicht vom Feld: Ein neues Array je Render
  // setzte den Titel sonst bei jedem Render neu.
  useDokumentTitel(teile ? druckTitel(teile) : null, 'druck')
}
