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
 * hier an (useUnsavedWork bzw. registriereOffeneArbeit), und
 * hasUnsavedWork() prüft zusätzlich, was sich generisch erkennen lässt:
 * offene Dialoge und die Formular-Routen.
 * Solange irgendetwas offen ist, wird nie automatisch neu geladen — die
 * neue Version wartet, bis die Arbeit gesichert oder verworfen ist.
 */

let editCount = 0

/**
 * Offene Arbeit, die in keinem React-Zustand steckt.
 *
 * DocCheck hält Prüfdokumente, Referenzlisten und Re-Check-Bestätigungen
 * absichtlich nur im Speicher des Tabs (CLAUDE.md: „NIE im
 * Anwendungszustand"). Die Wache kannte sie nicht: Nach jedem Deployment lud
 * ein DocCheck-Tab binnen etwa einer Minute von selbst neu, und eingelesene
 * Pakete samt OCR-Läufen waren ohne Rückfrage weg (Audit 11/2026, TEC-02).
 *
 * Eine Registrierung statt eines Imports: Das Startbundle darf DocCheck nicht
 * mitziehen. Das Modul meldet sich selbst an, sobald es geladen wird.
 */
const pruefungen = new Set<() => boolean>()

/** Eine Prüfung „ist hier noch etwas offen?" anmelden. Liefert die Abmeldung. */
export function registriereOffeneArbeit(pruefung: () => boolean): () => void {
  pruefungen.add(pruefung)
  return () => {
    pruefungen.delete(pruefung)
  }
}

/** Nur die angemeldeten Prüfungen — ohne DOM, deshalb auch in Ebene 1 abfragbar. */
export function registrierteArbeitOffen(): boolean {
  for (const pruefung of pruefungen) {
    try {
      if (pruefung()) return true
    } catch {
      // Wer nicht sagen kann, ob etwas offen ist, verliert lieber ein
      // Update als eine Arbeit: Das Update kommt wieder, die Arbeit nicht.
      return true
    }
  }
  return false
}

export function hasUnsavedWork(): boolean {
  if (editCount > 0) return true
  if (registrierteArbeitOffen()) return true
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
