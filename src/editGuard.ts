import { useEffect } from 'react'

/**
 * Bearbeitungs-Wache für das automatische Update.
 *
 * Das Update-Banner lud die App selbsttätig neu, sobald eine neue Version
 * bereitstand — und kannte als „gerade in Bearbeitung" genau eine Route
 * (#/grading/new). Gemessen wurde der Ernstfall: eine geleistete, noch
 * nicht gespeicherte Nachtragsunterschrift (846 gesetzte Pixel) war nach
 * dem automatischen Neuladen weg — und der Pilot längst gegangen.
 *
 * Deshalb meldet jetzt jede Stelle mit ungesichertem Zustand ihre Arbeit
 * hier an (useUnsavedWork), und hasUnsavedWork() prüft zusätzlich, was
 * sich generisch erkennen lässt: offene Dialoge und die Formular-Routen.
 * Solange irgendetwas offen ist, wird nie automatisch neu geladen — die
 * neue Version wartet, bis die Arbeit gesichert oder verworfen ist.
 */

let editCount = 0

export function hasUnsavedWork(): boolean {
  if (editCount > 0) return true
  // Jeder offene Dialog ist potenziell halb ausgefüllt (Umfrage, neuer
  // Eintrag, Gruppendialog …) — Dialoge sind immer Eingabeflächen.
  if (document.querySelector('[role="dialog"]')) return true
  const h = window.location.hash
  return h.startsWith('#/grading/new') || h.includes('?print=1')
}

/** Solange `dirty` wahr ist, gilt die App als „in Bearbeitung". */
export function useUnsavedWork(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return
    editCount++
    return () => {
      editCount--
    }
  }, [dirty])
}
