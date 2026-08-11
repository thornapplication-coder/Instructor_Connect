import { describe, expect, it } from 'vitest'
import {
  historyOf,
  MIN_FOR_TREND,
  RECURRING_LOW,
  traineeHistories,
  traineeKey,
} from './traineeHistory'
import type { CompetencyGrade, Grade, GradingRecord, OverallResult, TraineeGrading } from './types'

/**
 * Der Verlauf soll die Trainingsaussage sichtbar machen, die im einzelnen
 * Blatt nicht steht: bleibt dieselbe Kompetenz schwach, wird es besser?
 * Getestet wird deshalb vor allem, WAS zusammengefuehrt wird und was nicht.
 */

const NOW = Date.UTC(2026, 7, 10)

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
    const [h] = traineeHistories([a, b], NOW)
    expect(h.name).toBe('Sophie Berger')
    expect(h.sessions.map((s) => s.recordId)).toEqual(['b', 'a'])
  })

  it('trennt verschiedene Piloten und sortiert nach juengster Session', () => {
    const alt = rec('a', '2026-07-01', [trainee('Alt Pilot', [g('KNO', 3)])])
    const neu = rec('b', '2026-08-01', [trainee('Neu Pilot', [g('KNO', 3)])])
    expect(traineeHistories([alt, neu], NOW).map((h) => h.name)).toEqual(['Neu Pilot', 'Alt Pilot'])
  })

  it('trennt mehrere Piloten desselben Blattes sauber auf', () => {
    const doppel = rec('a', '2026-08-01', [
      trainee('Sophie Berger', [g('KNO', 4)]),
      trainee('Max Payne', [g('KNO', 2)]),
    ])
    const hs = traineeHistories([doppel], NOW)
    expect(hs).toHaveLength(2)
    expect(hs.find((h) => h.name === 'Max Payne')!.competencies[0].values[0].grade).toBe(2)
  })

  it('zaehlt nur unterschriebene Blaetter — ein offenes ist kein Nachweis', () => {
    const offen = rec('a', '2026-08-01', [trainee('Sophie Berger', [g('KNO', 1)])], { status: 'awaiting_signature' })
    expect(traineeHistories([offen], NOW)).toEqual([])
  })

  it('laesst Folgeformulare aussen vor — sie tragen keine Noten', () => {
    const haupt = rec('a', '2026-08-01', [trainee('Sophie Berger', [g('KNO', 3)])])
    const folge = rec('b', '2026-08-02', [trainee('Sophie Berger', [g('KNO', 5)])], { formTypeId: '306', parentId: 'a' })
    const [h] = traineeHistories([haupt, folge], NOW)
    expect(h.sessions.map((s) => s.recordId)).toEqual(['a'])
  })

  it('ignoriert Eintraege ohne Namen, statt einen leeren Piloten zu erfinden', () => {
    const ohne = rec('a', '2026-08-01', [trainee('   ', [g('KNO', 3)])])
    expect(traineeHistories([ohne], NOW)).toEqual([])
  })
})

describe('Kompetenz-Auswertung', () => {
  const sessions = (grades: (Grade | null)[]) =>
    grades.map((grade, i) => rec(`r${i}`, `2026-0${i + 1}-01`, [trainee('Sophie Berger', [g('KNO', grade)])]))

  it('laesst „NO" aus dem Schnitt heraus, statt es als schlechte Note zu werten', () => {
    const [h] = traineeHistories(sessions([4, 'NO', 2]), NOW)
    const kno = h.competencies.find((c) => c.code === 'KNO')!
    expect(kno.values.map((v) => v.grade)).toEqual([4, 2])
    expect(kno.mean).toBe(3)
  })

  it('meldet eine wiederkehrende Schwaeche erst ab der zweiten schwachen Session', () => {
    const einmal = traineeHistories(sessions([2, 4, 4]), NOW)[0].competencies[0]
    const mehrfach = traineeHistories(sessions([2, 2, 4]), NOW)[0].competencies[0]
    expect(einmal.lowCount).toBe(1)
    expect(einmal.recurringWeak).toBe(false)
    expect(mehrfach.lowCount).toBe(RECURRING_LOW)
    expect(mehrfach.recurringWeak).toBe(true)
  })

  it('bildet keinen Trend aus zu wenigen Sessions', () => {
    const zwei = traineeHistories(sessions([2, 5]), NOW)[0].competencies[0]
    expect(zwei.values).toHaveLength(2)
    expect(zwei.values.length).toBeLessThan(MIN_FOR_TREND)
    expect(zwei.trend).toBeNull()
  })

  it('erkennt Verbesserung, Verschlechterung und Stillstand', () => {
    expect(traineeHistories(sessions([2, 3, 4, 5]), NOW)[0].competencies[0].trend).toBe('up')
    expect(traineeHistories(sessions([5, 4, 3, 2]), NOW)[0].competencies[0].trend).toBe('down')
    expect(traineeHistories(sessions([3, 3, 3, 3]), NOW)[0].competencies[0].trend).toBe('flat')
  })

  it('uebernimmt den eingefrorenen Wortlaut der Kompetenz', () => {
    const [h] = traineeHistories(sessions([3, 3, 3]), NOW)
    expect(h.competencies[0].title).toBe('Application of knowledge')
  })

  it('faellt auf den Code zurueck, wenn kein Wortlaut hinterlegt ist', () => {
    const ohneTitel = rec('a', '2026-08-01', [trainee('Sophie Berger', [g('XYZ', 3)])], { competencies: undefined })
    expect(traineeHistories([ohneTitel], NOW)[0].competencies[0].title).toBe('XYZ')
  })

  it('zaehlt nicht bestandene Sessions', () => {
    const a = rec('a', '2026-07-01', [trainee('Sophie Berger', [g('KNO', 1)], 'not_competent')])
    const b = rec('b', '2026-08-01', [trainee('Sophie Berger', [g('KNO', 4)], 'competent')])
    expect(traineeHistories([a, b], NOW)[0].notCompetentCount).toBe(1)
  })
})

describe('historyOf', () => {
  it('findet einen Piloten ueber seinen Schluessel', () => {
    const a = rec('a', '2026-08-01', [trainee('Sophie Berger', [g('KNO', 3)])])
    expect(historyOf([a], traineeKey('SOPHIE BERGER'), NOW)?.name).toBe('Sophie Berger')
  })

  it('liefert nichts fuer einen unbekannten Schluessel', () => {
    expect(historyOf([], 'niemand', NOW)).toBeUndefined()
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
    expect(() => traineeHistories([ohne], NOW)).not.toThrow()
    expect(traineeHistories([ohne], NOW)).toEqual([])
  })
})
