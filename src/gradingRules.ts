import type { GradingRecord } from './types'

/**
 * Reine Regeln des Grading-Moduls — bewusst ohne React und ohne Store, damit
 * sie sowohl in den Ansichten als auch im Store benutzbar sind (der Store
 * braucht sie für die Sichtbarkeit, die Ansichten für Ampel und Hinweise).
 */

/**
 * Pflicht-Folgeformulare, die zu diesem Formular noch fehlen:
 * Not Competent ⇒ 306 (Additional Training) ist verpflichtend,
 * Session not completed ⇒ 310 (Deferred Item List) ist verpflichtend.
 *
 * Die beiden Formulare haben bewusst unterschiedliche Reichweite:
 * das 306 dokumentiert die Defizite EINES Piloten und muss deshalb an
 * genau diesem Formular hängen; das 310 betrifft den Durchgang als
 * Ganzes und gilt für alle Geschwister-Formulare des Batches.
 *
 * Erfüllt ist die Pflicht erst mit der Unterschrift: ein angelegtes, aber
 * nicht unterschriebenes Folgeformular ist kein Nachweis und darf das
 * Ausgangsformular nicht stillschweigend abhaken.
 */
export function missingFollowUps(r: GradingRecord, all: GradingRecord[]): string[] {
  if (r.parentId) return []
  const family = new Set([r.id, ...(r.batchId ? all.filter((x) => x.batchId === r.batchId).map((x) => x.id) : [])])
  const signedChild = (formTypeId: string, parents: (id: string) => boolean) =>
    all.some((c) => c.parentId !== undefined && parents(c.parentId) && c.formTypeId === formTypeId && c.status === 'signed')
  const out: string[] = []
  if (r.trainees.some((tr) => tr.overall === 'not_competent') && !signedChild('306', (id) => id === r.id)) out.push('306')
  if (r.sessionStatus === 'not_completed' && !signedChild('310', (id) => family.has(id))) out.push('310')
  return out
}

/**
 * Für die Anzeige: Gibt es zu diesem Pflicht-Folgeformular bereits einen
 * angefangenen, aber noch nicht unterschriebenen Datensatz? Dann wartet es
 * nur noch auf die Unterschrift, statt komplett zu fehlen.
 */
export function followUpStarted(r: GradingRecord, all: GradingRecord[], formTypeId: string): boolean {
  const family = new Set([r.id, ...(r.batchId ? all.filter((x) => x.batchId === r.batchId).map((x) => x.id) : [])])
  const inScope = formTypeId === '306' ? (id: string) => id === r.id : (id: string) => family.has(id)
  return all.some((c) => c.parentId !== undefined && inScope(c.parentId) && c.formTypeId === formTypeId && c.status !== 'signed')
}

/** Piloten eines Formulars — Folgeformulare (306/310/311) führen ihren Piloten
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

export function trafficLight(r: GradingRecord, all?: GradingRecord[]): TrafficColor {
  if (r.mailStatus === 'failed') return 'red'
  if (all && missingFollowUps(r, all).length > 0) return 'yellow'
  if (r.status === 'signed' && r.mailStatus === 'sent') return 'green'
  return 'yellow'
}

/** Ist der Vorgang komplett abgeschlossen? Unfertige Formulare dürfen dem
 *  Instruktor nicht durch die Aufbewahrungsfrist aus der Liste fallen. */
export function isComplete(r: GradingRecord, all: GradingRecord[]): boolean {
  return trafficLight(r, all) === 'green'
}
