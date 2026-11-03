import { describe, expect, it } from 'vitest'
import {
  historyKey,
  historyOf,
  MIN_FOR_TREND,
  RECURRING_LOW,
  traineeHistories,
  traineeKey,
} from './traineeHistory'
import type { CompetencyGrade, CompetencySetKey, Grade, GradingRecord, OverallResult, TraineeGrading } from './types'

/**
 * Der Verlauf soll die Trainingsaussage sichtbar machen, die im einzelnen
 * Blatt nicht steht: bleibt dieselbe Kompetenz schwach, wird es besser?
 * Getestet wird deshalb vor allem, WAS zusammengefuehrt wird und was nicht.
 */

const NOW = Date.UTC(2026, 7, 10)

/** Kompetenzsatz je Blatt wie im Katalog: 308G Instruktoren, sonst Piloten. */
const satz = (r: GradingRecord): CompetencySetKey | null =>
  r.formTypeId === '308G' ? 'instructor' : r.formTypeId === '399X' ? null : 'pilot'

const g = (code: string, grade: Grade | null): CompetencyGrade => ({ code, grade, comment: '' })

const trainee = (name: string, grades: CompetencyGrade[], overall: OverallResult | null = 'competent'): TraineeGrading => ({
  traineeId: '',
  traineeName: name,
  position: 'CDR',
  grades,
  positiveComment: '',
  developmentComment: '',
  summaryComment: '',
  overall,
})

const rec = (id: string, date: string, trainees: TraineeGrading[], over: Partial<GradingRecord> = {}): GradingRecord => ({
  id,
  formTypeId: '308A',
  instructorId: 'u1',
  header: { date, aircraftType: 'C560 XLS+' },
  trainees,
  sessionStatus: 'completed',
  freeText: {},
  competencies: [
    { code: 'KNO', title: 'Application of knowledge' },
    { code: 'WLM', title: 'Workload management' },
  ],
  signatureInstructor: 'sig',
  signatureTrainee: 'sig',
  status: 'signed',
  mailStatus: 'sent',
  createdAt: Date.UTC(2026, 6, 1),
  signedAt: Date.UTC(2026, 6, 1),
  ...over,
})

describe('traineeKey', () => {
  it('fuehrt denselben Piloten trotz Schreibweise zusammen', () => {
    expect(traineeKey('  Sophie   Berger ')).toBe(traineeKey('sophie berger'))
  })
})

describe('traineeHistories — Datenbasis', () => {
  it('fasst die Sessions eines Piloten zusammen, neueste zuerst', () => {
    const a = rec('a', '2026-07-01', [trainee('Sophie Berger', [g('KNO', 3)])])
    const b = rec('b', '2026-08-01', [trainee('Sophie Berger', [g('KNO', 4)])])
    const [h] = traineeHistories([a, b], NOW, satz)
    expect(h.name).toBe('Sophie Berger')
    expect(h.sessions.map((s) => s.recordId)).toEqual(['b', 'a'])
  })

  it('trennt verschiedene Piloten und sortiert nach juengster Session', () => {
    const alt = rec('a', '2026-07-01', [trainee('Alt Pilot', [g('KNO', 3)])])
    const neu = rec('b', '2026-08-01', [trainee('Neu Pilot', [g('KNO', 3)])])
    expect(traineeHistories([alt, neu], NOW, satz).map((h) => h.name)).toEqual(['Neu Pilot', 'Alt Pilot'])
  })

  it('trennt mehrere Piloten desselben Blattes sauber auf', () => {
    const doppel = rec('a', '2026-08-01', [
      trainee('Sophie Berger', [g('KNO', 4)]),
      trainee('Max Payne', [g('KNO', 2)]),
    ])
    const hs = traineeHistories([doppel], NOW, satz)
    expect(hs).toHaveLength(2)
    expect(hs.find((h) => h.name === 'Max Payne')!.competencies[0].values[0].grade).toBe(2)
  })

  it('zaehlt nur unterschriebene Blaetter — ein offenes ist kein Nachweis', () => {
    const offen = rec('a', '2026-08-01', [trainee('Sophie Berger', [g('KNO', 1)])], { status: 'awaiting_signature' })
    expect(traineeHistories([offen], NOW, satz)).toEqual([])
  })

  it('laesst Folgeformulare aussen vor — sie tragen keine Noten', () => {
    const haupt = rec('a', '2026-08-01', [trainee('Sophie Berger', [g('KNO', 3)])])
    const folge = rec('b', '2026-08-02', [trainee('Sophie Berger', [g('KNO', 5)])], { formTypeId: '306', parentId: 'a' })
    const [h] = traineeHistories([haupt, folge], NOW, satz)
    expect(h.sessions.map((s) => s.recordId)).toEqual(['a'])
  })

  it('ignoriert Eintraege ohne Namen, statt einen leeren Piloten zu erfinden', () => {
    const ohne = rec('a', '2026-08-01', [trainee('   ', [g('KNO', 3)])])
    expect(traineeHistories([ohne], NOW, satz)).toEqual([])
  })
})

describe('Kompetenz-Auswertung', () => {
  const sessions = (grades: (Grade | null)[]) =>
    grades.map((grade, i) => rec(`r${i}`, `2026-0${i + 1}-01`, [trainee('Sophie Berger', [g('KNO', grade)])]))

  it('laesst „NO" aus dem Schnitt heraus, statt es als schlechte Note zu werten', () => {
    const [h] = traineeHistories(sessions([4, 'NO', 2]), NOW, satz)
    const kno = h.competencies.find((c) => c.code === 'KNO')!
    expect(kno.values.map((v) => v.grade)).toEqual([4, 2])
    expect(kno.mean).toBe(3)
  })

  it('meldet eine wiederkehrende Schwaeche erst ab der zweiten schwachen Session', () => {
    const einmal = traineeHistories(sessions([2, 4, 4]), NOW, satz)[0].competencies[0]
    const mehrfach = traineeHistories(sessions([2, 2, 4]), NOW, satz)[0].competencies[0]
    expect(einmal.lowCount).toBe(1)
    expect(einmal.recurringWeak).toBe(false)
    expect(mehrfach.lowCount).toBe(RECURRING_LOW)
    expect(mehrfach.recurringWeak).toBe(true)
  })

  it('bildet keinen Trend aus zu wenigen Sessions', () => {
    const zwei = traineeHistories(sessions([2, 5]), NOW, satz)[0].competencies[0]
    expect(zwei.values).toHaveLength(2)
    expect(zwei.values.length).toBeLessThan(MIN_FOR_TREND)
    expect(zwei.trend).toBeNull()
  })

  it('erkennt Verbesserung, Verschlechterung und Stillstand', () => {
    expect(traineeHistories(sessions([2, 3, 4, 5]), NOW, satz)[0].competencies[0].trend).toBe('up')
    expect(traineeHistories(sessions([5, 4, 3, 2]), NOW, satz)[0].competencies[0].trend).toBe('down')
    expect(traineeHistories(sessions([3, 3, 3, 3]), NOW, satz)[0].competencies[0].trend).toBe('flat')
  })

  it('uebernimmt den eingefrorenen Wortlaut der Kompetenz', () => {
    const [h] = traineeHistories(sessions([3, 3, 3]), NOW, satz)
    expect(h.competencies[0].title).toBe('Application of knowledge')
  })

  it('faellt auf den Code zurueck, wenn kein Wortlaut hinterlegt ist', () => {
    const ohneTitel = rec('a', '2026-08-01', [trainee('Sophie Berger', [g('XYZ', 3)])], { competencies: undefined })
    expect(traineeHistories([ohneTitel], NOW, satz)[0].competencies[0].title).toBe('XYZ')
  })

  it('zaehlt nicht bestandene Sessions', () => {
    const a = rec('a', '2026-07-01', [trainee('Sophie Berger', [g('KNO', 1)], 'not_competent')])
    const b = rec('b', '2026-08-01', [trainee('Sophie Berger', [g('KNO', 4)], 'competent')])
    expect(traineeHistories([a, b], NOW, satz)[0].notCompetentCount).toBe(1)
  })
})

describe('historyOf', () => {
  it('findet einen Piloten ueber seinen Schluessel', () => {
    const a = rec('a', '2026-08-01', [trainee('Sophie Berger', [g('KNO', 3)])])
    expect(historyOf([a], historyKey('pilot', 'SOPHIE BERGER'), NOW, satz)?.name).toBe('Sophie Berger')
  })

  it('liefert nichts fuer einen unbekannten Schluessel', () => {
    expect(historyOf([], 'niemand', NOW, satz)).toBeUndefined()
  })
})

/**
 * Audit 11/2026, GTY-09: Ein Instruktoranwärter mit einem 308B und einem
 * 308G stand unter „How a pilot develops" mit „2 sessions", und sein
 * Verlauf mischte KNO … WLM mit PRE … REP.
 */
describe('traineeHistories — je Kompetenzsatz getrennt (GTY-09)', () => {
  const pilotBlatt = rec('p', '2026-07-01', [trainee('Gustav Candidate', [g('KNO', 3), g('WLM', 4)])], { formTypeId: '308B' })
  const kandidatBlatt = rec('k', '2026-08-01', [trainee('gustav  candidate', [g('PRE', 4), g('REP', 2)])], {
    formTypeId: '308G',
    competencies: [
      { code: 'PRE', title: 'Preparation' },
      { code: 'REP', title: 'Report' },
    ],
  })

  it('dieselbe Person mit 308B und 308G ergibt zwei Verläufe mit je einer Sitzung', () => {
    const hs = traineeHistories([pilotBlatt, kandidatBlatt], NOW, satz)
    expect(hs).toHaveLength(2)
    const alsPilot = hs.find((h) => h.competencySet === 'pilot')!
    const alsKandidat = hs.find((h) => h.competencySet === 'instructor')!
    expect(alsPilot.sessions.map((x) => x.recordId)).toEqual(['p'])
    expect(alsKandidat.sessions.map((x) => x.recordId)).toEqual(['k'])
    expect(alsPilot.key).not.toBe(alsKandidat.key)
  })

  it('mischt keine Kompetenzen der beiden Sätze', () => {
    const hs = traineeHistories([pilotBlatt, kandidatBlatt], NOW, satz)
    expect(hs.find((h) => h.competencySet === 'pilot')!.competencies.map((c) => c.code)).toEqual(['KNO', 'WLM'])
    const kandidat = hs.find((h) => h.competencySet === 'instructor')!
    expect(kandidat.competencies.map((c) => c.code)).toEqual(['PRE', 'REP'])
    // Der Wortlaut kommt aus dem eigenen Satz — die Ansicht zeigt beim 308G
    // nur ihn, ohne Kürzel.
    expect(kandidat.competencies.map((c) => c.title)).toEqual(['Preparation', 'Report'])
  })

  it('gleiche Kürzel in beiden Katalogen holen sich nicht gegenseitig den Wortlaut', () => {
    const pilot = rec('p2', '2026-08-02', [trainee('Ida Pilot', [g('COM', 3)])], { competencies: [{ code: 'COM', title: 'Communication' }] })
    const kandidat = rec('k2', '2026-08-03', [trainee('Ida Pilot', [g('COM', 4)])], {
      formTypeId: '308G',
      competencies: [{ code: 'COM', title: 'Communication with the trainee' }],
    })
    const hs = traineeHistories([pilot, kandidat], NOW, satz)
    expect(hs.find((h) => h.competencySet === 'pilot')!.competencies[0].title).toBe('Communication')
    expect(hs.find((h) => h.competencySet === 'instructor')!.competencies[0].title).toBe('Communication with the trainee')
  })

  it('ein Blatt ohne Satz im Katalog zählt wie bisher zu den Piloten', () => {
    const ohneSatz = rec('x', '2026-08-01', [trainee('Sophie Berger', [g('KNO', 3)])], { formTypeId: '399X' })
    const [h] = traineeHistories([ohneSatz], NOW, satz)
    expect(h.competencySet).toBe('pilot')
    expect(h.key).toBe(historyKey('pilot', 'Sophie Berger'))
  })

  it('historyOf findet den Verlauf je Satz', () => {
    expect(historyOf([pilotBlatt, kandidatBlatt], historyKey('instructor', 'Gustav Candidate'), NOW, satz)?.sessions).toHaveLength(1)
  })
})

describe('Altbestand ohne traineeId', () => {
  it('stuerzt nicht ab, wenn weder Name noch ID gefuehrt werden', () => {
    // `traineeId` galt als Pflichtfeld und wurde ungeprueft getrimmt — ein
    // von Hand eingespielter Datensatz ohne dieses Feld riss den gesamten
    // Verlauf mit, nicht nur die eine Zeile.
    const ohne = rec('x', '2026-08-05', [
      { ...trainee('', [g('KNO', 3)]), traineeName: undefined, traineeId: undefined } as unknown as TraineeGrading,
    ])
    expect(() => traineeHistories([ohne], NOW, satz)).not.toThrow()
    expect(traineeHistories([ohne], NOW, satz)).toEqual([])
  })
})
