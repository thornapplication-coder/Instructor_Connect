import { isNotCompetent } from './gradingRules'
import type { FormTypeId, GradingRecord } from './types'

/**
 * Kette der Folgeformulare (306/310), wie sie in der Adresszeile steht.
 *
 * Die beiden Funktionen lagen in `src/pages/GradingForm.tsx` — exportiert,
 * ungetestet und damit ausserhalb beider Testwachen, obwohl sie steuern,
 * welches Pflichtformular als naechstes an welchem Elternblatt aufgeht
 * (Audit 11/2026, TEC-18). Seit ein Entwurf die Kette mitspeichert und die
 * Entwurfsliste sie beim Fortsetzen wieder anhaengt (GRD-01), liest sie auch
 * ein Logik-Modul — das darf nicht aus einer Seite importieren.
 */

/** Ein noch offenes Glied der Folgeformular-Kette: Formulartyp plus das
 *  Ausgangsformular, an dem es hängt. Bei mehreren Piloten je Durchgang ist
 *  der Elternteil je Glied ein anderer — deshalb reicht eine reine Typliste
 *  nicht aus. */
export interface FollowUpStep {
  type: FormTypeId
  parentId: string
}

/** Kette für die Adresszeile: „306:gr-1,306:gr-2,310:gr-1" */
export const encodeChain = (steps: FollowUpStep[]) => steps.map((x) => `${x.type}:${x.parentId}`).join(',')

/** Gegenstück zu `encodeChain` — tolerant: leere oder unvollständige Glieder
 *  (ohne Elternblatt) fallen weg, statt ein Formular ohne Bezug zu öffnen. */
export function decodeChain(raw: string): FollowUpStep[] {
  return raw
    .split(',')
    .filter(Boolean)
    .map((part) => {
      const idx = part.indexOf(':')
      return idx < 0 ? null : { type: part.slice(0, idx), parentId: part.slice(idx + 1) }
    })
    .filter((x): x is FollowUpStep => x !== null && x.parentId.length > 0)
}

/**
 * Welche Folgeformulare nach dem Abschluss eines Durchgangs aufgehen — und
 * in welcher Reihenfolge.
 *
 * Audit 11/2026, GRD-11: Der Dialog bot das 306 auch ohne „Not Competent"
 * zum Ankreuzen an (Pflicht ist es nur dann, freiwillig darf es immer sein),
 * angelegt wurde es aber nur fuer nicht bestandene Piloten. Gab es keinen,
 * fiel das angekreuzte 306 wortlos aus der Kette. Jetzt gilt:
 *
 * - 306 je nicht bestandenem Piloten; ist keiner nicht bestanden und das 306
 *   trotzdem gewaehlt, eines je Blatt — es nennt genau einen Piloten.
 * - jedes andere Folgeformular (310) je Blatt, seit es einen Piloten nennt
 *   (#24).
 * - 306 vor allen anderen; danach in der gewaehlten Reihenfolge.
 */
export function folgeKette(recs: Pick<GradingRecord, 'id' | 'trainees'>[], gewaehlt: FormTypeId[]): FollowUpStep[] {
  const kette: FollowUpStep[] = []
  if (gewaehlt.includes('306')) {
    const durchgefallen = recs.filter((r) => r.trainees.some(isNotCompetent))
    ;(durchgefallen.length > 0 ? durchgefallen : recs).forEach((r) => kette.push({ type: '306', parentId: r.id }))
  }
  ;[...new Set(gewaehlt)]
    .filter((id) => id !== '306')
    .forEach((id) => recs.forEach((r) => kette.push({ type: id, parentId: r.id })))
  return kette
}
