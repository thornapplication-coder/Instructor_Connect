import { describe, expect, it } from 'vitest'
import { decodeChain, encodeChain, folgeKette, type FollowUpStep } from './folgeKette'
import type { GradingRecord, TraineeGrading } from './types'

/**
 * Audit 11/2026, TEC-18 (Teil Folgekette): Die Kette lag ungetestet in einer
 * Seitendatei. Sie entscheidet, welches Pflichtformular an WELCHEM
 * Elternblatt als naechstes aufgeht — ein verlorenes Glied heisst ein 306
 * ohne Bezug, das die Pflicht des Elternblatts nie erfuellt.
 */
describe('encodeChain / decodeChain', () => {
  const kette: FollowUpStep[] = [
    { type: '306', parentId: 'gr-1793571773598-1' },
    { type: '306', parentId: 'gr-1793571773598-2' },
    { type: '310', parentId: 'gr-1793571773598-1' },
  ]

  it('kommt im Rundlauf unveraendert zurueck — samt Bindestrichen in den Kennungen', () => {
    expect(encodeChain(kette)).toBe('306:gr-1793571773598-1,306:gr-1793571773598-2,310:gr-1793571773598-1')
    expect(decodeChain(encodeChain(kette))).toEqual(kette)
  })

  it('eine leere Kette ist die leere Zeichenkette und umgekehrt', () => {
    expect(encodeChain([])).toBe('')
    expect(decodeChain('')).toEqual([])
  })

  it('ueberspringt leere Teile', () => {
    expect(decodeChain('306:gr-1,,310:gr-2,')).toEqual([
      { type: '306', parentId: 'gr-1' },
      { type: '310', parentId: 'gr-2' },
    ])
  })

  it('verwirft Glieder ohne Elternblatt, statt ein Formular ohne Bezug zu oeffnen', () => {
    expect(decodeChain('306:,310')).toEqual([])
    expect(decodeChain('310:gr-9,306')).toEqual([{ type: '310', parentId: 'gr-9' }])
  })
})

/**
 * Audit 11/2026, GRD-11: Ein im Folgedialog freiwillig angekreuztes 306
 * wurde ohne „Not Competent" still ignoriert — `finish` legte 306 nur fuer
 * nicht bestandene Piloten an.
 */
describe('folgeKette — welche Folgeformulare an welchem Blatt aufgehen', () => {
  const pilot = (overall: TraineeGrading['overall'], noten: (1 | 2 | 3 | 4 | 5)[] = [3, 3]): TraineeGrading => ({
    traineeId: '',
    traineeName: 'Sophie Berger',
    position: 'CDR',
    grades: noten.map((grade, i) => ({ code: `C${i}`, grade, comment: '' })),
    positiveComment: '',
    developmentComment: '',
    summaryComment: '',
    overall,
  })
  const blatt = (id: string, tr: TraineeGrading): Pick<GradingRecord, 'id' | 'trainees'> => ({ id, trainees: [tr] })

  it('(a) Not Competent + 310: 306 nur fuer den nicht bestandenen Piloten, 310 je Blatt', () => {
    const recs = [blatt('gr-1', pilot('competent')), blatt('gr-2', pilot('not_competent'))]
    expect(folgeKette(recs, ['306', '310'])).toEqual([
      { type: '306', parentId: 'gr-2' },
      { type: '310', parentId: 'gr-1' },
      { type: '310', parentId: 'gr-2' },
    ])
  })

  it('auch der rechnerisch nicht bestandene Pilot bekommt sein 306', () => {
    const recs = [blatt('gr-1', pilot('competent', [1, 4])), blatt('gr-2', pilot('competent'))]
    expect(folgeKette(recs, ['306'])).toEqual([{ type: '306', parentId: 'gr-1' }])
  })

  it('(b) nur 310 Pflicht, 306 freiwillig angekreuzt: 306 je Blatt — nicht still verworfen', () => {
    const recs = [blatt('gr-1', pilot('competent')), blatt('gr-2', pilot('competent'))]
    expect(folgeKette(recs, ['310', '306'])).toEqual([
      { type: '306', parentId: 'gr-1' },
      { type: '306', parentId: 'gr-2' },
      { type: '310', parentId: 'gr-1' },
      { type: '310', parentId: 'gr-2' },
    ])
  })

  it('(c) 306 steht vor 310 — gleich, in welcher Reihenfolge angekreuzt wurde', () => {
    const recs = [blatt('gr-1', pilot('not_competent'))]
    expect(folgeKette(recs, ['310', '306']).map((x) => x.type)).toEqual(['306', '310'])
  })

  it('ohne 306 in der Auswahl entsteht keines — auch nicht fuer Not Competent', () => {
    // Pflicht ist es trotzdem: Der Dialog waehlt es vor und laesst es nicht abwaehlen.
    expect(folgeKette([blatt('gr-1', pilot('not_competent'))], ['310'])).toEqual([{ type: '310', parentId: 'gr-1' }])
  })

  it('nichts gewaehlt, nichts geoeffnet; doppelt gewaehlt, einmal geoeffnet', () => {
    expect(folgeKette([blatt('gr-1', pilot('competent'))], [])).toEqual([])
    expect(folgeKette([blatt('gr-1', pilot('competent'))], ['310', '310'])).toEqual([{ type: '310', parentId: 'gr-1' }])
  })

  it('ueberlebt den Rundlauf durch die Adresszeile', () => {
    const k = folgeKette([blatt('gr-1793571773598-1', pilot('not_competent')), blatt('gr-1793571773598-2', pilot('competent'))], ['306', '310'])
    expect(decodeChain(encodeChain(k))).toEqual(k)
  })
})
