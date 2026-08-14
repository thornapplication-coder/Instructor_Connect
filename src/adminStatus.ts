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
  /** Steht der Grading-Bereich dieser Rolle offen? Sonst bekaeme sie eine
   *  Meldung zu einem Bereich, den sie nicht oeffnen kann. */
  darfGrading: boolean
  /** Dasselbe fuer das Feedback. Es stand hier lange bedingungslos, weil es
   *  „auch dem Gruppen-Admin offensteht" — seit der Training Admin ein Panel
   *  hat, stimmt das nicht mehr: Er sieht Grading, aber kein Feedback, und
   *  bekam einen Punkt, der ihn in die Uebersicht zurueckwarf. */
  darfFeedback: boolean
}

export function adminStatus({ gradingRecords, feedbackEntries, darfGrading, darfFeedback }: StatusQuelle): StatusPunkt[] {
  const punkte: StatusPunkt[] = []
  if (darfGrading) {
    // Reihenfolge ist Dringlichkeit: Ein gescheiterter Versand ist ein
    // Fehler, eine fehlende Unterschrift nur unfertig.
    const gescheitert = gradingRecords.filter((r) => r.mailStatus === 'failed').length
    if (gescheitert) punkte.push({ key: 'failedMails', count: gescheitert, tone: 'bad', to: '/admin/grading/dashboard' })

    /* Gelb, nicht rot: `trafficLight` gibt fuer dasselbe Blatt 'yellow'
       zurueck (gradingRules.ts). Rot hier und gelb in der Liste waeren zwei
       Aussagen ueber eine Tatsache — und die Statuszeile soll den Blick
       lenken, nicht ihn gegen die Liste stellen. Ein Fehler ist ein
       gescheiterter Versand; ein fehlendes Folgeformular ist unfertig. */
    const offeneFolgen = gradingRecords.filter((r) => missingFollowUps(r, gradingRecords).length > 0).length
    if (offeneFolgen) punkte.push({ key: 'openFollowUps', count: offeneFolgen, tone: 'wait', to: '/admin/grading/dashboard' })

    const ohneUnterschrift = gradingRecords.filter((r) => r.status !== 'signed').length
    if (ohneUnterschrift) punkte.push({ key: 'openSignatures', count: ohneUnterschrift, tone: 'wait', to: '/admin/grading/dashboard' })
  }

  // Ein Punkt fuehrt irgendwohin — deshalb nur, wenn dieses Irgendwohin
  // dieser Rolle auch offensteht.
  const offenesFeedback = darfFeedback ? feedbackEntries.filter((f) => !f.resolvedAt).length : 0
  if (offenesFeedback) punkte.push({ key: 'openFeedback', count: offenesFeedback, tone: 'wait', to: '/admin/feedback' })

  return punkte
}
