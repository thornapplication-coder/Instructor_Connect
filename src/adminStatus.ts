import { missingFollowUps } from './gradingRules'
import type { FeedbackEntry, GradingRecord } from './types'

/**
 * Was gerade wartet — in einer Zeile ueber den Kacheln des Admin-Panels.
 *
 * Das Panel zeigte acht gleich aussehende Kacheln und sonst nichts. Ob
 * irgendwo etwas liegt, stand hinter zwei bis drei Klicks: offene
 * Unterschriften und fehlgeschlagene Versendungen im Dashboard des Grading
 * Tools, unbearbeitete Rueckmeldungen im Feedback-Bereich. Wer nicht gezielt
 * nachsah, sah nichts — und ein fehlgeschlagener Versand eines
 * Schulungsnachweises ist genau das, was nicht liegen bleiben darf
 * (ORA.GEN.220).
 *
 * Diese Funktion sammelt die vier Dinge, die auf Handeln warten. Sie ist
 * bewusst rein: dieselbe Zaehlung wie im Dashboard, nur an einer Stelle
 * definiert und pruefbar. Ein Punkt mit der Zahl 0 wird gar nicht erst
 * zurueckgegeben — eine Statuszeile, die „0 offen" meldet, ist Rauschen.
 */

/** `bad` verlangt Handeln (etwas ist kaputt), `wait` erinnert (etwas fehlt noch). */
export type StatusTone = 'bad' | 'wait'

export type StatusPunkt = {
  /** Uebersetzungsschluessel unterhalb von admin.status in de/en */
  key: 'failedMails' | 'openSignatures' | 'openFollowUps' | 'openFeedback'
  count: number
  tone: StatusTone
  /** Wohin der Punkt springt — die Zeile soll nicht nur melden, sondern hinfuehren. */
  to: string
}

export type StatusQuelle = {
  gradingRecords: GradingRecord[]
  feedbackEntries: FeedbackEntry[]
  /** Nur der Superadmin sieht das Grading Tool; ein Gruppen-Admin bekaeme
   *  sonst eine Meldung zu einem Bereich, den er nicht oeffnen kann. */
  darfGrading: boolean
}

export function adminStatus({ gradingRecords, feedbackEntries, darfGrading }: StatusQuelle): StatusPunkt[] {
  const punkte: StatusPunkt[] = []
  if (darfGrading) {
    // Reihenfolge ist Dringlichkeit: Ein gescheiterter Versand ist ein
    // Fehler, eine fehlende Unterschrift nur unfertig.
    const gescheitert = gradingRecords.filter((r) => r.mailStatus === 'failed').length
    if (gescheitert) punkte.push({ key: 'failedMails', count: gescheitert, tone: 'bad', to: '/admin/grading/dashboard' })

    const offeneFolgen = gradingRecords.filter((r) => missingFollowUps(r, gradingRecords).length > 0).length
    if (offeneFolgen) punkte.push({ key: 'openFollowUps', count: offeneFolgen, tone: 'bad', to: '/admin/grading/dashboard' })

    const ohneUnterschrift = gradingRecords.filter((r) => r.status !== 'signed').length
    if (ohneUnterschrift) punkte.push({ key: 'openSignatures', count: ohneUnterschrift, tone: 'wait', to: '/admin/grading/dashboard' })
  }

  // Feedback steht auch dem Gruppen-Admin offen — deshalb ausserhalb der
  // Grading-Bedingung.
  const offenesFeedback = feedbackEntries.filter((f) => !f.resolvedAt).length
  if (offenesFeedback) punkte.push({ key: 'openFeedback', count: offenesFeedback, tone: 'wait', to: '/admin/feedback' })

  return punkte
}
