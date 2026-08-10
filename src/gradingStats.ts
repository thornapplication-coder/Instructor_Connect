import type { CompetencySetKey, Grade, GradingRecord } from './types'

/**
 * Gemeinsame Rechengrundlage für alle Auswertungen des Grading-Moduls.
 *
 * Vorher rechneten die Kalibrierungs-Kachel der Statistik und der
 * Standardisierungsbericht getrennt — mit unterschiedlichen Regeln und ohne
 * dass der Unterschied irgendwo stand. Gemessen wurden für denselben
 * Instruktor und denselben Bestand Abweichungen von +0,19 und +0,59. Zwei
 * Dokumente für dieselbe Standardisierungsbesprechung, die einander
 * widersprechen, sind schlimmer als eines, das fehlt.
 *
 * Deshalb liegen die Regeln jetzt hier, an einer Stelle, und beide Ansichten
 * benutzen sie.
 */

/** Ab dieser Menge ist eine Abweichung überhaupt aussagekräftig. Darunter
 *  erklärt sich jeder Unterschied durch Zufall, und eine Kennzeichnung würde
 *  einen Instruktor zu Unrecht in Erklärungsnot bringen. */
export const MIN_GRADES = 10
export const MIN_SESSIONS = 3
/** Schwellen in Notenpunkten. Bewusst feste, erklärbare Werte statt einer
 *  Standardabweichung: bei drei bis fünf Instruktoren ist die Streuung selbst
 *  so unsicher, dass sie keine belastbare Grenze hergibt. */
export const WATCH = 0.4
export const REVIEW = 0.8

export const PERIODS = [
  { key: 'all', months: 0 },
  { key: '12m', months: 12 },
  { key: '6m', months: 6 },
  { key: '3m', months: 3 },
] as const

export type PeriodKey = (typeof PERIODS)[number]['key']

export type Flag = 'none' | 'watch' | 'review' | 'insufficient'

export interface InstructorRow {
  id: string
  sessions: number
  /** Anzahl echter Zahlnoten (ohne „NO") */
  n: number
  mean: number | null
  /** Abweichung vom Mittel des Kompetenzsatzes */
  delta: number | null
  dist: Record<string, number>
  lowShare: number | null
  highShare: number | null
  ncRate: number | null
  flag: Flag
}

export interface SetStats {
  key: CompetencySetKey
  overall: number | null
  sessions: number
  n: number
  lowShare: number | null
  highShare: number | null
  ncRate: number | null
  rows: InstructorRow[]
}

/** Nur die Zahlen zählen; „NO" (not observed) ist keine schlechte Note,
 *  sondern gar keine — sie darf den Schnitt nicht senken. */
export function numbersOf(vals: (Grade | null)[]): number[] {
  return vals.filter((v): v is Exclude<Grade, 'NO'> => typeof v === 'number')
}

export function mean(vals: (Grade | null)[]): number | null {
  const nums = numbersOf(vals)
  return nums.length === 0 ? null : nums.reduce((a, b) => a + b, 0) / nums.length
}

export function pct(part: number, total: number): number | null {
  return total === 0 ? null : (part / total) * 100
}

/**
 * Maßgeblich ist der Schulungstag, nicht der Zeitpunkt der Erfassung. Ein
 * zwei Wochen später nachgetragenes Formular gehört in die Periode, in der
 * geschult wurde — sonst verschiebt der Nachtrag die Auswertung.
 * Fehlt oder taugt das Datum nicht, bleibt die Erfassungszeit als Ersatz.
 */
export function trainingDate(r: GradingRecord): number {
  const raw = r.header.date
  if (raw) {
    const t = new Date(`${raw}T00:00:00`).getTime()
    if (!Number.isNaN(t)) return t
  }
  return r.createdAt
}

export function periodStart(period: PeriodKey, now: number): number {
  const months = PERIODS.find((p) => p.key === period)?.months ?? 0
  if (months === 0) return 0
  const d = new Date(now)
  d.setMonth(d.getMonth() - months)
  return d.getTime()
}

export function periodLabel(period: PeriodKey): string {
  const months = PERIODS.find((p) => p.key === period)?.months ?? 0
  return months === 0 ? 'All records' : `Last ${months} months`
}

/**
 * Die Datenbasis jeder Auswertung. Vier Regeln, alle mit Grund:
 *
 *  - **Nur unterschriebene Formulare.** Ein Blatt, das noch auf eine
 *    Unterschrift wartet, ist kein Nachweis und darf keine Kennzahl bewegen.
 *  - **Keine Folgeformulare.** 306 und 310 tragen keine Noten; sie zählen
 *    beim Ausgangsformular mit, nicht ein zweites Mal für sich.
 *  - **Nur Blätter mit Piloten.** Anwesenheitslisten haben keine Bewertung.
 *  - **Zeitraum über den Schulungstag** (siehe trainingDate).
 */
export function scopeRecords(
  records: GradingRecord[],
  opts: { fleet?: string; period: PeriodKey; now: number },
): GradingRecord[] {
  const from = periodStart(opts.period, opts.now)
  return records.filter(
    (r) =>
      r.status === 'signed' &&
      !r.parentId &&
      r.trainees.length > 0 &&
      (!opts.fleet || r.header.aircraftType === opts.fleet) &&
      trainingDate(r) >= from,
  )
}

/**
 * Auswertung je Kompetenzsatz. Piloten- und Instruktorenbewertungen folgen
 * unterschiedlichen Maßstäben und dürfen nie gegeneinander gerechnet werden:
 * Ein Instruktor, der viele 308G schreibt, wäre sonst gegen Piloten-
 * Durchschnitte kalibriert.
 */
export function statsBySet(
  scoped: GradingRecord[],
  setOf: (r: GradingRecord) => CompetencySetKey | null,
): SetStats[] {
  return (['pilot', 'instructor'] as const)
    .map((key): SetStats => {
      const rs = scoped.filter((r) => setOf(r) === key)
      const allGrades = rs.flatMap((r) => r.trainees.flatMap((tr) => tr.grades.map((x) => x.grade)))
      const overall = mean(allGrades)

      const byInstr = new Map<string, GradingRecord[]>()
      rs.forEach((r) => {
        const list = byInstr.get(r.instructorId)
        if (list) list.push(r)
        else byInstr.set(r.instructorId, [r])
      })

      const rows: InstructorRow[] = [...byInstr.entries()]
        .map(([id, own]) => {
          const grades = own.flatMap((r) => r.trainees.flatMap((tr) => tr.grades.map((x) => x.grade)))
          const nums = numbersOf(grades)
          // Ein Durchgang kann mehrere Blätter ergeben (eines je Pilot) —
          // gezählt wird der Durchgang, nicht das Blatt.
          const sessions = new Set(own.map((r) => r.batchId ?? r.id)).size
          const m = mean(grades)
          const dist: Record<string, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, NO: 0 }
          grades.forEach((v) => {
            if (v === null) return
            dist[String(v)] = (dist[String(v)] ?? 0) + 1
          })
          const trainees = own.flatMap((r) => r.trainees)
          const nc = trainees.filter((tr) => tr.overall === 'not_competent').length
          const delta = m === null || overall === null ? null : m - overall
          const enough = nums.length >= MIN_GRADES && sessions >= MIN_SESSIONS
          const flag: Flag = !enough
            ? 'insufficient'
            : delta === null || Math.abs(delta) < WATCH
              ? 'none'
              : Math.abs(delta) < REVIEW
                ? 'watch'
                : 'review'
          return {
            id,
            sessions,
            n: nums.length,
            mean: m,
            delta,
            dist,
            lowShare: pct(nums.filter((v) => v <= 2).length, nums.length),
            highShare: pct(nums.filter((v) => v >= 4).length, nums.length),
            ncRate: pct(nc, trainees.length),
            flag,
          }
        })
        .sort((a, b) => (b.delta ?? 0) - (a.delta ?? 0))

      const nums = numbersOf(allGrades)
      const fleetTrainees = rs.flatMap((r) => r.trainees)
      return {
        key,
        overall,
        rows,
        sessions: new Set(rs.map((r) => r.batchId ?? r.id)).size,
        n: nums.length,
        lowShare: pct(nums.filter((v) => v <= 2).length, nums.length),
        highShare: pct(nums.filter((v) => v >= 4).length, nums.length),
        ncRate: pct(fleetTrainees.filter((tr) => tr.overall === 'not_competent').length, fleetTrainees.length),
      }
    })
    .filter((s) => s.rows.length > 0)
}
