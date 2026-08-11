import { describe, expect, it } from 'vitest'
import {
  authorityOf,
  mean,
  MIN_GRADES,
  MIN_SESSIONS,
  numbersOf,
  pct,
  periodLabel,
  periodStart,
  scopeRecords,
  statsBySet,
  trainingDate,
} from './gradingStats'
import type { CompetencyGrade, Grade, GradingRecord, TraineeGrading } from './types'

/**
 * Kennzahlen entscheiden mit darüber, ob ein Instruktor auffällt. Sie müssen
 * deshalb sowohl richtig rechnen als auch dieselbe Rechnung liefern wie die
 * Kachel auf der Startseite (#43) — beide benutzen genau diese Funktionen.
 */

const grades = (...vals: (Grade | null)[]): CompetencyGrade[] =>
  vals.map((grade, i) => ({ code: `C${i}`, grade, comment: '' }))

const trainee = (g: CompetencyGrade[], overall: TraineeGrading['overall'] = 'competent'): TraineeGrading => ({
  traineeId: '',
  traineeName: 'Sophie Berger',
  position: 'CDR',
  grades: g,
  positiveComment: '',
  developmentComment: '',
  summaryComment: '',
  overall,
})

const rec = (over: Partial<GradingRecord> = {}): GradingRecord => ({
  id: 'r1',
  formTypeId: '308A',
  instructorId: 'u1',
  header: { date: '2026-08-05', aircraftType: 'C560 XLS+' },
  trainees: [trainee(grades(3, 3, 3))],
  sessionStatus: 'completed',
  freeText: {},
  signatureInstructor: 'sig',
  signatureTrainee: 'sig',
  status: 'signed',
  mailStatus: 'sent',
  createdAt: Date.UTC(2026, 7, 5),
  signedAt: Date.UTC(2026, 7, 5),
  ...over,
})

describe('mean / numbersOf — „NO" ist keine schlechte Note, sondern gar keine', () => {
  it('laesst NO aus dem Schnitt heraus, statt es als 0 zu werten', () => {
    expect(mean([4, 'NO', 2])).toBe(3)
    expect(numbersOf([4, 'NO', 2, null])).toEqual([4, 2])
  })

  it('liefert null statt NaN, wenn gar keine Zahl vorliegt', () => {
    expect(mean(['NO', null])).toBeNull()
    expect(mean([])).toBeNull()
  })
})

describe('pct', () => {
  it('rechnet Anteile in Prozent', () => {
    expect(pct(1, 4)).toBe(25)
  })

  it('teilt nicht durch null, sondern liefert null', () => {
    expect(pct(0, 0)).toBeNull()
  })
})

describe('trainingDate — der Schulungstag zaehlt, nicht die Erfassung (#51)', () => {
  it('nimmt das Kopfdatum', () => {
    expect(trainingDate(rec())).toBe(new Date('2026-08-05T00:00:00').getTime())
  })

  it('faellt ohne Datum auf den Erfassungszeitpunkt zurueck', () => {
    const created = Date.UTC(2026, 7, 9)
    expect(trainingDate(rec({ header: {}, createdAt: created }))).toBe(created)
  })

  it('faellt auch bei unbrauchbarem Datum zurueck, statt NaN zu liefern', () => {
    const created = Date.UTC(2026, 7, 9)
    expect(trainingDate(rec({ header: { date: 'kein-datum' }, createdAt: created }))).toBe(created)
  })
})

describe('periodStart / periodLabel', () => {
  it('bedeutet „alle Daten" ohne Untergrenze', () => {
    expect(periodStart('all', Date.UTC(2026, 7, 10))).toBe(0)
    expect(periodLabel('all')).toBe('All records')
  })

  it('rechnet Monatsfenster zurueck', () => {
    const now = Date.UTC(2026, 7, 10)
    expect(periodStart('12m', now)).toBeLessThan(now)
    expect(periodLabel('12m')).toBe('Last 12 months')
  })
})

describe('authorityOf — Altbestand ohne Angabe zaehlt als AT (#64)', () => {
  it('erkennt UK', () => expect(authorityOf(rec({ authority: 'UK' }))).toBe('UK'))
  it('erkennt AT', () => expect(authorityOf(rec({ authority: 'AT' }))).toBe('AT'))
  it('nimmt AT, wenn nichts angegeben ist', () => expect(authorityOf(rec({}))).toBe('AT'))
})

describe('scopeRecords — die vier Regeln der Datenbasis', () => {
  const now = Date.UTC(2026, 7, 10)
  const base = { period: 'all' as const, now }

  it('zaehlt nur unterschriebene Blaetter', () => {
    const offen = rec({ id: 'x', status: 'awaiting_signature' })
    expect(scopeRecords([rec(), offen], base).map((r) => r.id)).toEqual(['r1'])
  })

  it('zaehlt Folgeformulare nicht ein zweites Mal', () => {
    const child = rec({ id: 'c', parentId: 'r1' })
    expect(scopeRecords([rec(), child], base).map((r) => r.id)).toEqual(['r1'])
  })

  it('laesst Anwesenheitslisten ohne Piloten aussen vor', () => {
    const liste = rec({ id: 'a', trainees: [] })
    expect(scopeRecords([rec(), liste], base).map((r) => r.id)).toEqual(['r1'])
  })

  it('filtert nach Flotte und Behoerde', () => {
    const uk = rec({ id: 'uk', authority: 'UK', header: { date: '2026-08-05', aircraftType: 'CL30' } })
    expect(scopeRecords([rec(), uk], { ...base, authority: 'UK' }).map((r) => r.id)).toEqual(['uk'])
    expect(scopeRecords([rec(), uk], { ...base, fleet: 'CL30' }).map((r) => r.id)).toEqual(['uk'])
  })

  it('schneidet ueber den Schulungstag ab, nicht ueber die Erfassung (#51)', () => {
    // Vor zwei Jahren geschult, gestern nachgetragen — gehoert NICHT ins 12-Monats-Fenster.
    const nachtrag = rec({ id: 'alt', header: { date: '2024-01-15' }, createdAt: now })
    expect(scopeRecords([nachtrag], { period: '12m', now }).map((r) => r.id)).toEqual([])
  })
})

describe('statsBySet', () => {
  const setOf = () => 'pilot' as const

  it('trennt Piloten- und Instruktorensaetze und laesst leere Saetze ganz weg', () => {
    // Piloten- und Instruktorenbewertungen duerfen nie gegeneinander gerechnet
    // werden; ein Satz ohne Daten erscheint gar nicht erst als leere Zeile.
    const out = statsBySet([rec()], setOf)
    expect(out.map((s) => s.key)).toEqual(['pilot'])
    expect(out.every((s) => s.rows.length > 0)).toBe(true)
  })

  it('zaehlt den Durchgang, nicht das einzelne Blatt', () => {
    const a = rec({ id: 'a', batchId: 'b1' })
    const b = rec({ id: 'b', batchId: 'b1' })
    const row = statsBySet([a, b], setOf).find((s) => s.key === 'pilot')!.rows[0]
    expect(row.sessions).toBe(1)
  })

  it('meldet „insufficient", solange die Datenbasis zu duenn ist', () => {
    const row = statsBySet([rec()], setOf).find((s) => s.key === 'pilot')!.rows[0]
    expect(row.flag).toBe('insufficient')
    expect(MIN_GRADES).toBeGreaterThan(0)
    expect(MIN_SESSIONS).toBeGreaterThan(0)
  })

  it('rechnet Anteile und Not-Competent-Quote je Instruktor', () => {
    const many = Array.from({ length: 4 }, (_, i) =>
      rec({ id: `r${i}`, batchId: `b${i}`, trainees: [trainee(grades(1, 2, 5, 4), i === 0 ? 'not_competent' : 'competent')] }),
    )
    const row = statsBySet(many, setOf).find((s) => s.key === 'pilot')!.rows[0]
    expect(row.n).toBe(16)
    expect(row.sessions).toBe(4)
    expect(row.lowShare).toBe(50)
    expect(row.highShare).toBe(50)
    expect(row.ncRate).toBe(25)
    expect(row.flag).not.toBe('insufficient')
  })
})

describe('statsBySet — Sortierung bei fehlendem Delta', () => {
  it('sortiert Zeilen ohne Delta nicht als „unauffaellig" mitten ins Feld', () => {
    // Wer nur „NO" vergeben hat, hat kein Delta. Heute rutscht er ueber
    // `?? 0` zwischen die auffaelligen Instruktoren — dieser Test haelt das
    // aktuelle Verhalten fest, damit eine Korrektur sichtbar wird.
    const setOf = () => 'pilot' as const
    const mk = (id: string, instr: string, vals: (Grade | null)[]) =>
      rec({ id, batchId: id, instructorId: instr, trainees: [trainee(grades(...vals))] })
    const rs = [
      ...[1, 2, 3].map((i) => mk(`hoch${i}`, 'u-hoch', [5, 5, 5, 5])),
      ...[1, 2, 3].map((i) => mk(`no${i}`, 'u-no', ['NO', 'NO', 'NO', 'NO'])),
      ...[1, 2, 3].map((i) => mk(`tief${i}`, 'u-tief', [1, 1, 1, 1])),
    ]
    const rows = statsBySet(rs, setOf).find((s) => s.key === 'pilot')!.rows
    expect(rows.map((r) => r.id)).toEqual(['u-hoch', 'u-no', 'u-tief'])
    expect(rows.find((r) => r.id === 'u-no')!.mean).toBeNull()
    expect(rows.find((r) => r.id === 'u-no')!.flag).toBe('insufficient')
  })
})
