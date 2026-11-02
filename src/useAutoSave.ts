import { useCallback, useEffect, useRef } from 'react'

/**
 * Automatisch speichern — kurz nach der letzten Eingabe, und SOFORT, wenn
 * die Ansicht verlassen wird oder das Feld den Fokus verliert.
 *
 * Das Impressum speicherte per Zeitgeber 600 ms nach der letzten Eingabe.
 * Wer innerhalb dieser Zeit „Zur Übersicht" klickte, verlor die letzte
 * Änderung: Der Aufräumteil des Effekts verwarf den Zeitgeber, ohne zu
 * speichern — still, trotz der Zusage „werden sofort gespeichert"
 * (Audit 11/2026, VERW-14). Nachgestellt: „NEUE ZEILE TEST" getippt, sofort
 * weg, nach 1,5 s stand die Zeile nicht im Zustand.
 *
 * Verglichen wird über JSON: Der Wert ist oft ein frisch gebautes Objekt
 * ({ de, en }), und ein Vergleich nach Identität stellte den Zeitgeber bei
 * jedem Neuzeichnen neu — bei einem Store mit Takt unter Umständen nie fertig.
 *
 * @param wert        Der aktuelle Stand der Eingabe.
 * @param gespeichert Der Stand im Speicher; gleich `wert` = nichts offen.
 * @param speichern   Schreibt `wert`. Darf sich bei jedem Zeichnen ändern.
 * @returns `offen` (es gibt Ungespeichertes) und `jetzt` (sofort speichern,
 *          z. B. bei onBlur; ohne offene Änderung wirkungslos).
 */
export function useAutoSave<T>(
  wert: T,
  gespeichert: T,
  speichern: (wert: T) => void,
  verzoegerung = 600,
): { offen: boolean; jetzt: () => void } {
  const schluessel = JSON.stringify(wert)
  const offen = schluessel !== JSON.stringify(gespeichert)

  // Der letzte Stand für den Aufräumteil — der sieht sonst nur, was beim
  // ersten Zeichnen galt.
  const letzter = useRef({ wert, offen, speichern })
  useEffect(() => {
    letzter.current = { wert, offen, speichern }
  })

  const jetzt = useCallback(() => {
    const { wert: w, offen: o, speichern: s } = letzter.current
    if (!o) return
    // Sofort als erledigt markieren: Ein Blur kurz vor dem Verlassen darf
    // nicht zu einem zweiten Speichern beim Aufräumen führen.
    letzter.current = { ...letzter.current, offen: false }
    s(w)
  }, [])

  useEffect(() => {
    if (!offen) return
    const zeitgeber = setTimeout(jetzt, verzoegerung)
    return () => clearTimeout(zeitgeber)
  }, [schluessel, offen, verzoegerung, jetzt])

  // Verlassen der Ansicht: was noch offen ist, wird gespeichert statt
  // verworfen.
  useEffect(() => jetzt, [jetzt])

  return { offen, jetzt }
}
