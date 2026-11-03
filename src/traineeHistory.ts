import { mean, scopeRecords, trainingDate } from './gradingStats'
import type { CompetencySetKey, Grade, GradingRecord, OverallResult } from './types'

/**
 * Verlauf eines Piloten über mehrere Sessions.
 *
 * Bisher war jedes Blatt eine Insel: Man sah, wie ein Durchgang lief, aber
 * nicht, ob dieselbe Kompetenz beim dritten Mal immer noch bei 2 steht. Genau
 * darin liegt aber die Trainingsaussage — eine einzelne 2 ist ein schlechter
 * Tag, dieselbe 2 über drei Sessions ist ein Befund.
 *
 * Die Auswertung läuft über ALLE Instruktoren: Ein Pilot wird im Kurs von
 * wechselnden Lehrern bewertet, und ein Verlauf, der nur die eigenen Blätter
 * kennt, zeigt Lücken statt Entwicklung. Die Ansicht bleibt deshalb den
 * Rollen mit vollem Archivzugriff vorbehalten (grading_view_all) — die
 * Wochenfrist der Instruktorenansicht bleibt davon unberührt.
 */

/** Ab so vielen Sessions mit Note ≤ 2 gilt eine Schwäche als wiederkehrend. */
export const RECURRING_LOW = 2
/** Erst ab so vielen bewerteten Sessions wird überhaupt ein Trend gebildet —
 *  aus zwei Punkten eine Richtung abzulesen, wäre Kaffeesatz. */
export const MIN_FOR_TREND = 3
/** Ab dieser Differenz der Halbzeit-Mittelwerte heißt es „besser"/„schlechter". */
export const TREND_DELTA = 0.5

export interface TraineeSession {
  recordId: string
  date: number
  formTypeId: string
  instructorId: string
  aircraftType: string
  overall: OverallResult | null
  grades: { code: string; grade: Grade | null; comment: string }[]
}

export interface CompetencyTrack {
  code: string
  title: string
  /** nur bewertete Sessions, chronologisch (älteste zuerst) */
  values: { date: number; grade: Exclude<Grade, 'NO'> }[]
  mean: number | null
  /** Anzahl Sessions mit Note ≤ 2 */
  lowCount: number
  recurringWeak: boolean
  trend: 'up' | 'down' | 'flat' | null
}

export interface TraineeHistory {
  /** Satz und Person (`traineeKey`) — dieselbe Person hat je Satz einen
   *  eigenen Verlauf und damit einen eigenen Schlüssel. */
  key: string
  name: string
  /** Pilotenkompetenzen (308A–F/H) oder Instruktorkompetenzen (308G) */
  competencySet: CompetencySetKey
  /** chronologisch, neueste zuerst — so liest man eine Historie */
  sessions: TraineeSession[]
  competencies: CompetencyTrack[]
  notCompetentCount: number
  lastDate: number
}

/** Namen werden frei eingetippt; „ Sophie Berger" und „sophie berger" sind
 *  derselbe Pilot. Ohne diese Zusammenführung zerfiele der Verlauf in
 *  Einzelstücke. */
export function traineeKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

function trendOf(values: { grade: number }[]): 'up' | 'down' | 'flat' | null {
  if (values.length < MIN_FOR_TREND) return null
  const half = Math.floor(values.length / 2)
  const first = values.slice(0, half).map((v) => v.grade)
  const last = values.slice(values.length - half).map((v) => v.grade)
  const a = first.reduce((x, y) => x + y, 0) / first.length
  const b = last.reduce((x, y) => x + y, 0) / last.length
  if (b - a >= TREND_DELTA) return 'up'
  if (a - b >= TREND_DELTA) return 'down'
  return 'flat'
}

/** Schlüssel eines Verlaufs: Satz und Person. */
export function historyKey(set: CompetencySetKey, name: string): string {
  return `${set}:${traineeKey(name)}`
}

/**
 * Verlauf je Pilot. Die Datenbasis ist dieselbe wie in der Statistik
 * (scopeRecords): nur unterschriebene Blätter, keine Folgeformulare, nur
 * Blätter mit Piloten — ein nicht unterschriebenes Blatt ist kein Nachweis
 * und darf keinen Verlauf bewegen.
 *
 * Audit 11/2026, GTY-09: Gruppiert wurde nur nach dem Namen. Ein
 * Instruktoranwärter mit einem 308B (als Pilot) und einem 308G (als
 * Kandidat) stand unter „How a pilot develops" mit „2 sessions", und der
 * Verlauf mischte KNO … WLM mit PRE … REP. Piloten- und
 * Instruktorenbewertungen folgen verschiedenen Maßstäben und werden nirgends
 * miteinander verrechnet (statsBySet, monthlyReport) — hier auch nicht mehr:
 * Je Satz und Person ein eigener Verlauf. Ein Blatt ohne Satz im Katalog
 * zählt wie bisher zu den Piloten.
 */
export function traineeHistories(
  records: GradingRecord[],
  now: number,
  setOf: (r: GradingRecord) => CompetencySetKey | null,
): TraineeHistory[] {
  const scoped = scopeRecords(records, { period: 'all', now })
  const byTrainee = new Map<string, { name: string; set: CompetencySetKey; sessions: TraineeSession[] }>()

  scoped.forEach((r) => {
    const set = setOf(r) ?? 'pilot'
    r.trainees.forEach((tr) => {
      // Beide Felder optional lesen: Ein Datensatz ohne traineeId (Altbestand,
      // von Hand eingespielt) brachte den ganzen Verlauf zum Absturz.
      const raw = tr.traineeName?.trim() || tr.traineeId?.trim()
      if (!raw) return
      const key = historyKey(set, raw)
      const entry = byTrainee.get(key) ?? { name: raw, set, sessions: [] }
      entry.sessions.push({
        recordId: r.id,
        date: trainingDate(r),
        formTypeId: r.formTypeId,
        instructorId: r.instructorId,
        aircraftType: r.header.aircraftType ?? '',
        overall: tr.overall,
        grades: tr.grades.map((g) => ({ code: g.code, grade: g.grade, comment: g.comment })),
      })
      byTrainee.set(key, entry)
    })
  })

  // Wortlaut der Kompetenzen aus dem jüngsten Blatt, das ihn führt — er ist
  // je Formular eingefroren und kann sich über die Zeit geändert haben. Je
  // Satz getrennt: Die Kürzel der beiden Kataloge sind unabhängig vergeben.
  const titles = new Map<string, string>()
  ;[...scoped]
    .sort((a, b) => trainingDate(a) - trainingDate(b))
    .forEach((r) => r.competencies?.forEach((c) => titles.set(`${setOf(r) ?? 'pilot'}:${c.code}`, c.title)))

  return [...byTrainee.entries()]
    .map(([key, { name, set, sessions }]) => {
      const chrono = [...sessions].sort((a, b) => a.date - b.date)
      const codes: string[] = []
      chrono.forEach((s) => s.grades.forEach((g) => { if (!codes.includes(g.code)) codes.push(g.code) }))

      const competencies: CompetencyTrack[] = codes.map((code) => {
        const values = chrono
          .map((s) => ({ date: s.date, grade: s.grades.find((g) => g.code === code)?.grade }))
          .filter((v): v is { date: number; grade: Exclude<Grade, 'NO'> } => typeof v.grade === 'number')
        const lowCount = values.filter((v) => v.grade <= 2).length
        return {
          code,
          title: titles.get(`${set}:${code}`) ?? code,
          values,
          mean: mean(values.map((v) => v.grade)),
          lowCount,
          recurringWeak: lowCount >= RECURRING_LOW,
          trend: trendOf(values),
        }
      })

      return {
        key,
        name,
        competencySet: set,
        sessions: [...chrono].reverse(),
        competencies,
        notCompetentCount: chrono.filter((s) => s.overall === 'not_competent').length,
        lastDate: chrono[chrono.length - 1]?.date ?? 0,
      }
    })
    .sort((a, b) => b.lastDate - a.lastDate)
}

/** Einzelner Verlauf; `key` stammt aus historyKey. */
export function historyOf(
  records: GradingRecord[],
  key: string,
  now: number,
  setOf: (r: GradingRecord) => CompetencySetKey | null,
): TraineeHistory | undefined {
  return traineeHistories(records, now, setOf).find((h) => h.key === key)
}
