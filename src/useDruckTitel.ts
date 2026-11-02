import { useEffect } from 'react'
import { druckTitel } from './dateiName'

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
 */
export function useDruckTitel(teile: readonly (string | null | undefined)[] | null): void {
  // Abhaengig vom fertigen Text, nicht vom Feld: Ein neues Array je Render
  // setzte den Titel sonst bei jedem Render neu.
  const titel = teile ? druckTitel(teile) : null
  useEffect(() => {
    if (titel === null) return
    const vorher = document.title
    document.title = titel
    return () => {
      document.title = vorher
    }
  }, [titel])
}
