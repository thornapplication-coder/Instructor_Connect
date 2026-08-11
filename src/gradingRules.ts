import type { GradingRecord, TraineeGrading } from './types'

/**
 * Reine Regeln des Grading-Moduls — bewusst ohne React und ohne Store, damit
 * sie sowohl in den Ansichten als auch im Store benutzbar sind (der Store
 * braucht sie für die Sichtbarkeit, die Ansichten für Ampel und Hinweise).
 */

/**
 * Automatik laut Vorgabe: mind. eine „1" oder mind. zwei „2" ⇒ Not Competent.
 *
 * Die Regel stand nur im Formular und griff dort beim Tippen. Die Pflichtkette
 * las danach ausschliesslich `overall` — ein Datensatz mit zwei Zweien, dessen
 * `overall` aus einem Entwurf, einer Migration oder den Seed-Daten noch auf
 * 'competent' stand, kam damit ohne 306 durch und zeigte gruen. Deshalb liegt
 * die Regel jetzt hier, wo BEIDE Seiten sie benutzen.
 */
export function autoNotCompetent(tr: TraineeGrading): boolean {
  const ones = tr.grades.filter((g) => g.grade === 1).length
  const twos = tr.grades.filter((g) => g.grade === 2).length
  return ones >= 1 || twos >= 2
}

/** Gilt der Pilot als nicht bestanden — erklaert oder rechnerisch? */
export function isNotCompetent(tr: TraineeGrading): boolean {
  return tr.overall === 'not_competent' || autoNotCompetent(tr)
}

/** 306 und 310 sind die einzigen Folgeformular-Typen. */
export function isFollowUpType(formTypeId: string): boolean {
  return formTypeId === '306' || formTypeId === '310'
}

/**
 * Pflicht-Folgeformulare, die zu diesem Formular noch fehlen:
 * Not Competent ⇒ 306 (Additional Training) ist verpflichtend,
 * Session not completed ⇒ 310 (Deferred Item) ist verpflichtend.
 *
 * BEIDE hängen an genau EINEM Blatt, also an genau einem Piloten. Das 310
 * galt früher für den ganzen Durchgang (alle Blätter desselben batchId) —
 * diese Zusage ist mit Befund #24 hinfällig geworden: Seither führt das
 * Formular 310 ein Pflichtfeld „Pilot / Student Name". Ein 310, das Pilot A
 * nennt, kann den Nachweis für Pilot B nicht erbringen; es hakte dessen
 * offene Punkte stillschweigend ab, ohne ihn je zu erwähnen.
 *
 * Erfüllt ist die Pflicht erst mit der Unterschrift: ein angelegtes, aber
 * nicht unterschriebenes Folgeformular ist kein Nachweis und darf das
 * Ausgangsformular nicht stillschweigend abhaken.
 */
export function missingFollowUps(r: GradingRecord, all: GradingRecord[]): string[] {
  // Maßgeblich ist der TYP, nicht das parentId-Feld: Über die Adresszeile
  // ließ sich ein gewöhnliches Blatt mit erfundenem parentId anlegen und
  // damit die Pflicht auf 306/310 aushebeln — „Not Competent" wurde grün,
  // ohne dass je ein Folgeformular entstand.
  if (isFollowUpType(r.formTypeId)) return []
  const signedChild = (formTypeId: string) =>
    all.some((c) => c.parentId === r.id && c.formTypeId === formTypeId && c.status === 'signed')
  const out: string[] = []
  if (r.trainees.some(isNotCompetent) && !signedChild('306')) out.push('306')
  if (r.sessionStatus === 'not_completed' && !signedChild('310')) out.push('310')
  return out
}

/**
 * Für die Anzeige: Gibt es zu diesem Pflicht-Folgeformular bereits einen
 * angefangenen, aber noch nicht unterschriebenen Datensatz? Dann wartet es
 * nur noch auf die Unterschrift, statt komplett zu fehlen.
 */
export function followUpStarted(r: GradingRecord, all: GradingRecord[], formTypeId: string): boolean {
  return all.some((c) => c.parentId === r.id && c.formTypeId === formTypeId && c.status !== 'signed')
}

/** Piloten eines Formulars — Folgeformulare (306/310) führen ihren Piloten
 *  in den Kopfdaten, ältere erben ihn vom Ausgangsformular. */
export function traineesOf(r: GradingRecord, all: GradingRecord[]) {
  if (r.trainees.length > 0) return r.trainees
  const own = r.header.traineeName?.trim()
  if (own)
    return [
      {
        traineeId: '',
        traineeName: own,
        position: '',
        grades: [],
        positiveComment: '',
        developmentComment: '',
        summaryComment: '',
        overall: null,
      },
    ]
  const parent = r.parentId ? all.find((x) => x.id === r.parentId) : undefined
  return parent?.trainees ?? []
}

/**
 * Ampelsystem für den Formularstatus:
 *  grün  = abgeschlossen, unterschrieben und versendet
 *  gelb  = noch offen (Unterschrift/Versand ausständig oder
 *          Pflicht-Folgeformular fehlt)
 *  rot   = Versand fehlgeschlagen — Handeln erforderlich
 */
export type TrafficColor = 'green' | 'yellow' | 'red'

/**
 * Liegt der Beleg vollständig vor? Die Ampel las früher nur `status`,
 * `mailStatus` und die Folgeformulare — ein Datensatz mit leeren
 * Signaturfeldern und ohne `signedAt` zeigte damit grün und war optisch von
 * einem vollständigen Nachweis nicht zu unterscheiden.
 *
 * Anwesenheitsformulare (307A/307B) tragen keine Gegenzeichnung des Piloten;
 * dort bürgt der Instruktor. Sie brauchen dafür aber mindestens einen
 * Teilnehmer — eine Anwesenheitsliste ohne Anwesende belegt nichts.
 */
export function hasEvidence(r: GradingRecord): boolean {
  if (!r.signatureInstructor || !r.signedAt) return false
  if (r.attendance) return r.attendance.some((a) => a.name.trim())
  return !!r.signatureTrainee
}

export function trafficLight(r: GradingRecord, all?: GradingRecord[]): TrafficColor {
  if (r.mailStatus === 'failed') return 'red'
  if (all && missingFollowUps(r, all).length > 0) return 'yellow'
  if (r.status === 'signed' && r.mailStatus === 'sent' && hasEvidence(r)) return 'green'
  return 'yellow'
}

/**
 * Sortierung aller Grading-Listen: zuerst nach dem Schulungsdatum
 * (absteigend, neueste oben); bei gleichem Datum nach dem Status —
 * Sending failed (rot) vor Open (gelb) vor Completed (grün).
 */
export function gradingListComparator(all: GradingRecord[]) {
  const rank: Record<TrafficColor, number> = { red: 0, yellow: 1, green: 2 }
  const dateOf = (r: GradingRecord): number => {
    const raw = r.header.date
    if (raw) {
      const t = new Date(`${raw}T00:00:00`).getTime()
      if (!Number.isNaN(t)) return t
    }
    return r.createdAt
  }
  return (a: GradingRecord, b: GradingRecord): number => {
    const dd = dateOf(b) - dateOf(a)
    if (dd !== 0) return dd
    return rank[trafficLight(a, all)] - rank[trafficLight(b, all)]
  }
}

/** Ist der Vorgang komplett abgeschlossen? Unfertige Formulare dürfen dem
 *  Instruktor nicht durch die Aufbewahrungsfrist aus der Liste fallen. */
export function isComplete(r: GradingRecord, all: GradingRecord[]): boolean {
  return trafficLight(r, all) === 'green'
}
