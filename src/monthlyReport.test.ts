import { describe, expect, it } from 'vitest'
import { monthOf, monthRange, monthlyReport, monthsWithData, sameMonth } from './monthlyReport'
import type { CompetencyGrade, Grade, GradingRecord, OverallResult, TraineeGrading } from './types'

/**
 * Der Bericht sagt einem Instruktor, wo er steht. Er darf deshalb weder
 * fremde Blaetter einrechnen noch eine Aussage vortaeuschen, die die
 * Datenbasis nicht hergibt.
 */

const g = (code: string, grade: Grade | null): CompetencyGrade => ({ code, grade, comment: '' })

const trainee = (grades: CompetencyGrade[], overall: OverallResult | null = 'competent'): TraineeGrading => ({
  traineeId: '', traineeName: 'Sophie Berger', position: 'CDR',
  grades, positiveComment: '', developmentComment: '', summaryComment: '', overall,
})

const rec = (over: Partial<GradingRecord> & { id: string; date: string }): GradingRecord => ({
  formTypeId: '308A',
  instructorId: 'u1',
  header: { date: over.date, aircraftType: 'C560 XLS+' },
  trainees: [trainee([g('KNO', 3)])],
  sessionStatus: 'completed',
  freeText: {},
  competencies: [{ code: 'KNO', title: 'Application of knowledge' }],
  signatureInstructor: 'sig', signatureTrainee: 'sig',
  status: 'signed', mailStatus: 'sent',
  createdAt: Date.UTC(2026, 6, 1), signedAt: Date.UTC(2026, 6, 1),
  ...over,
})

const AUG = { year: 2026, month: 7 }

describe('Monatsrechnung', () => {
  it('spannt den Monat von der ersten bis zur letzten Millisekunde', () => {
    const { from, to } = monthRange(AUG)
    expect(new Date(from).getMonth()).toBe(7)
    expect(new Date(from).getDate()).toBe(1)
    expect(new Date(to).getMonth()).toBe(8)
  })

  it('erkennt den Monat eines Zeitpunkts und vergleicht Monate', () => {
    expect(monthOf(new Date(2026, 7, 15).getTime())).toEqual(AUG)
    expect(sameMonth(AUG, { year: 2026, month: 7 })).toBe(true)
    expect(sameMonth(AUG, { year: 2025, month: 7 })).toBe(false)
  })
})

describe('monthsWithData', () => {
  it('liefert Monate mit auswertbaren Blaettern, neueste zuerst', () => {
    const rs = [rec({ id: 'a', date: '2026-06-10' }), rec({ id: 'b', date: '2026-08-03' })]
    expect(monthsWithData(rs)).toEqual([{ year: 2026, month: 7 }, { year: 2026, month: 5 }])
  })

  it('kann auf einen Instruktor eingegrenzt werden', () => {
    const rs = [rec({ id: 'a', date: '2026-06-10' }), rec({ id: 'b', date: '2026-08-03', instructorId: 'u2' })]
    expect(monthsWithData(rs, 'u1')).toEqual([{ year: 2026, month: 5 }])
  })

  it('zaehlt offene Blaetter und Folgeformulare nicht als Monat', () => {
    const offen = rec({ id: 'a', date: '2026-08-03', status: 'awaiting_signature' })
    const folge = rec({ id: 'b', date: '2026-08-04', parentId: 'a' })
    expect(monthsWithData([offen, folge])).toEqual([])
  })
})

describe('monthlyReport — Abgrenzung', () => {
  it('rechnet nur den gewaehlten Monat, ueber den Schulungstag', () => {
    const drin = rec({ id: 'a', date: '2026-08-03' })
    // Im Juli geschult, im August nachgetragen — gehoert in den Juli.
    const drauss = rec({ id: 'b', date: '2026-07-30', createdAt: new Date(2026, 7, 5).getTime() })
    const r = monthlyReport([drin, drauss], 'u1', AUG)
    expect(r.own.sessions).toBe(1)
  })

  it('trennt eigene Blaetter von denen der Kollegen', () => {
    const eigen = rec({ id: 'a', date: '2026-08-03' })
    const fremd = rec({ id: 'b', date: '2026-08-04', instructorId: 'u2' })
    const r = monthlyReport([eigen, fremd], 'u1', AUG)
    expect(r.own.sessions).toBe(1)
    // ... rechnet sie aber in die Vergleichswerte ein
    expect(r.fleet.sessions).toBe(2)
    expect(r.all.sessions).toBe(2)
  })

  it('nennt die Muster, auf denen im Monat geschult wurde', () => {
    const a = rec({ id: 'a', date: '2026-08-03' })
    const b = rec({ id: 'b', date: '2026-08-04', header: { date: '2026-08-04', aircraftType: 'CL30' } })
    expect(monthlyReport([a, b], 'u1', AUG).fleets).toEqual(['C560 XLS+', 'CL30'])
  })

  it('grenzt den Flottenvergleich auf die eigenen Muster ein, das Gesamtbild nicht', () => {
    const eigen = rec({ id: 'a', date: '2026-08-03' })
    const andereFlotte = rec({ id: 'b', date: '2026-08-04', instructorId: 'u2', header: { date: '2026-08-04', aircraftType: 'ATR 42/72' } })
    const r = monthlyReport([eigen, andereFlotte], 'u1', AUG)
    expect(r.fleet.sessions).toBe(1) // nur C560
    expect(r.all.sessions).toBe(2) // beide Muster
  })

  it('zaehlt den Durchgang, nicht das einzelne Blatt', () => {
    const a = rec({ id: 'a', date: '2026-08-03', batchId: 'b1' })
    const b = rec({ id: 'b', date: '2026-08-03', batchId: 'b1' })
    expect(monthlyReport([a, b], 'u1', AUG).own.sessions).toBe(1)
  })
})

describe('monthlyReport — Kennzahlen', () => {
  const withGrades = (id: string, grades: (Grade | null)[], instructorId = 'u1', overall: OverallResult = 'competent') =>
    rec({ id, date: '2026-08-03', instructorId, batchId: id, trainees: [trainee(grades.map((v, i) => g(`C${i}`, v)), overall)] })

  it('laesst „NO" aus dem Schnitt heraus und zaehlt es in der Verteilung', () => {
    const r = monthlyReport([withGrades('a', [4, 'NO', 2])], 'u1', AUG)
    expect(r.own.mean).toBe(3)
    expect(r.own.dist.NO).toBe(1)
    expect(r.own.gradesN).toBe(2)
  })

  it('rechnet Anteile und die Not-Competent-Quote', () => {
    const r = monthlyReport([withGrades('a', [1, 2, 4, 5], 'u1', 'not_competent')], 'u1', AUG)
    expect(r.own.lowShare).toBe(50)
    expect(r.own.highShare).toBe(50)
    expect(r.own.ncRate).toBe(100)
  })

  it('stellt die Abweichung zu Flotte und Gesamt gegenueber', () => {
    // Eigener Schnitt 4, Kollege im selben Muster 2 -> Flottenschnitt 3.
    const eigen = withGrades('a', [4, 4, 4, 4])
    const kollege = withGrades('b', [2, 2, 2, 2], 'u2')
    const r = monthlyReport([eigen, kollege], 'u1', AUG)
    expect(r.own.mean).toBe(4)
    expect(r.fleet.mean).toBe(3)
    expect(r.deltaFleet).toBe(1)
    expect(r.deltaAll).toBe(1)
  })

  it('erkennt, wenn die Vergleichsgruppe nur aus eigenen Formularen besteht', () => {
    // Sonst zeigt der Bericht eine 0,00 und taeuscht damit eine Aussage vor,
    // die die Datenlage nicht hergibt.
    const allein = monthlyReport([withGrades('a', [3, 3])], 'u1', AUG)
    expect(allein.fleetHasOthers).toBe(false)
    expect(allein.allHasOthers).toBe(false)
    expect(allein.deltaFleet).toBe(0)

    const mitKollege = monthlyReport([withGrades('a', [3, 3]), withGrades('b', [4, 4], 'u2')], 'u1', AUG)
    expect(mitKollege.fleetHasOthers).toBe(true)
    expect(mitKollege.allHasOthers).toBe(true)
  })

  it('meldet „insufficient", solange die Datenbasis zu duenn ist', () => {
    const r = monthlyReport([withGrades('a', [3, 3])], 'u1', AUG)
    expect(r.flagFleet).toBe('insufficient')
    expect(r.flagAll).toBe('insufficient')
  })

  it('meldet bei ausreichender Basis und klarer Abweichung „review"', () => {
    // 3 Durchgaenge, je 4 Noten = 12 Werte; eigener Schnitt 5 gegen Kollegen 1.
    const eigen = [1, 2, 3].map((i) => withGrades(`e${i}`, [5, 5, 5, 5]))
    const kollegen = [1, 2, 3].map((i) => withGrades(`k${i}`, [1, 1, 1, 1], 'u2'))
    const r = monthlyReport([...eigen, ...kollegen], 'u1', AUG)
    expect(r.own.gradesN).toBe(12)
    expect(r.own.sessions).toBe(3)
    expect(r.flagFleet).toBe('review')
  })
})

describe('monthlyReport — Kompetenzzeilen', () => {
  it('stellt je Kompetenz eigenen Wert, Flotte und Gesamt gegenueber', () => {
    const eigen = rec({ id: 'a', date: '2026-08-03', trainees: [trainee([g('KNO', 4)])] })
    const kollege = rec({ id: 'b', date: '2026-08-04', instructorId: 'u2', trainees: [trainee([g('KNO', 2)])] })
    const line = monthlyReport([eigen, kollege], 'u1', AUG).competencies.find((c) => c.code === 'KNO')!
    expect(line.title).toBe('Application of knowledge')
    expect(line.own).toBe(4)
    expect(line.fleet).toBe(3)
    expect(line.deltaFleet).toBe(1)
    expect(line.ownN).toBe(1)
  })

  it('fuehrt nur Kompetenzen, die man selbst bewertet hat', () => {
    const eigen = rec({ id: 'a', date: '2026-08-03', trainees: [trainee([g('KNO', 3)])] })
    const kollege = rec({ id: 'b', date: '2026-08-04', instructorId: 'u2', trainees: [trainee([g('WLM', 3)])] })
    const codes = monthlyReport([eigen, kollege], 'u1', AUG).competencies.map((c) => c.code)
    expect(codes).toEqual(['KNO'])
  })

  it('liefert leere Kennzahlen statt zu stolpern, wenn im Monat nichts vorliegt', () => {
    const r = monthlyReport([], 'u1', AUG)
    expect(r.own.sessions).toBe(0)
    expect(r.own.mean).toBeNull()
    expect(r.competencies).toEqual([])
    expect(r.deltaFleet).toBeNull()
    expect(r.flagFleet).toBe('insufficient')
  })
})

/**
 * Piloten- und Instruktorenbewertungen folgen unterschiedlichen Maßstäben
 * und dürfen nie gegeneinander gerechnet werden — dieselbe Zusage, die
 * `statsBySet` im Standardisierungsbericht einhält. Der Monatsbericht tat
 * es zunächst nicht: Ein TRI mit vielen 308G stand gegen Piloten-
 * Durchschnitte und bekam eine Abweichung ausgewiesen, die nur aus der
 * Vermischung stammte.
 */
describe('Kompetenzsätze werden nicht vermischt', () => {
  const setOf = (r: GradingRecord) => (r.formTypeId === '308G' ? ('instructor' as const) : ('pilot' as const))

  it('vergleicht nur innerhalb des Satzes, in dem man selbst gewertet hat', () => {
    const eigen = rec({ id: 'a', date: '2026-08-05', trainees: [trainee([g('KNO', 3)])] })
    // Ein fremdes Instruktoren-Blatt mit deutlich anderem Niveau ...
    const fremdInstr = rec({ id: 'b', date: '2026-08-06', instructorId: 'u2', formTypeId: '308G', trainees: [trainee([g('KNO', 5)])] })
    const fremdPilot = rec({ id: 'c', date: '2026-08-07', instructorId: 'u2', trainees: [trainee([g('KNO', 3)])] })
    const r = monthlyReport([eigen, fremdInstr, fremdPilot], 'u1', AUG, setOf)
    expect(r.competencySet).toBe('pilot')
    // ... zieht den Vergleichswert NICHT: 3 gegen 3 ist kein Unterschied.
    expect(r.all.mean).toBe(3)
    expect(r.deltaAll).toBe(0)
  })

  it('nimmt den Satz, in dem der Instruktor die meisten Noten vergeben hat', () => {
    const instr1 = rec({ id: 'a', date: '2026-08-05', formTypeId: '308G', trainees: [trainee([g('KNO', 4), g('COM', 4)])] })
    const pilot1 = rec({ id: 'b', date: '2026-08-06', trainees: [trainee([g('KNO', 2)])] })
    const r = monthlyReport([instr1, pilot1], 'u1', AUG, setOf)
    expect(r.competencySet).toBe('instructor')
    expect(r.own.mean).toBe(4)
  })

  it('zaehlt Folgeformulare nicht als eigene Session', () => {
    const blatt = rec({ id: 'a', date: '2026-08-05' })
    const folge = rec({ id: 'b', date: '2026-08-06', formTypeId: '306', parentId: 'a', trainees: [] })
    expect(monthlyReport([blatt, folge], 'u1', AUG, setOf).own.sessions).toBe(1)
  })

  it('faellt ohne Angabe auf den Pilotensatz zurueck', () => {
    const r = monthlyReport([rec({ id: 'a', date: '2026-08-05' })], 'u1', AUG)
    expect(r.competencySet).toBe('pilot')
    expect(r.own.sessions).toBe(1)
  })
})
