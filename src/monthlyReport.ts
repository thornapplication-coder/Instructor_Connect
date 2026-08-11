import {
  authorityOf,
  calibrationFlag,
  mean,
  numbersOf,
  pct,
  trainingDate,
  type Flag,
} from './gradingStats'
import { isFollowUpType } from './gradingRules'
import type { CompetencySetKey, Grade, GradingRecord } from './types'

/**
 * Persönlicher Monatsbericht eines Instruktors.
 *
 * Der Standardisierungsbericht beantwortet die Frage der ATO („bewertet
 * jemand systematisch strenger?"), sagt dem Einzelnen aber nichts: Er sieht
 * dort eine Zeile unter vielen und erfährt nie von sich aus, wo er steht.
 * Dieser Bericht dreht die Blickrichtung um — eigene Zahlen eines Monats,
 * zweifach gespiegelt: gegen die Muster, auf denen man geschult hat, und
 * gegen alle Gradings.
 *
 * Beide Vergleiche sind nötig und messen Verschiedenes: Die Flotte sagt,
 * ob man im eigenen Muster kalibriert ist; das Gesamtbild zeigt, ob die
 * Flotte als Ganzes aus der Reihe fällt. Nur der zweite Vergleich findet
 * einen Musterbestand, in dem alle gleich mild bewerten.
 *
 * Die Zahlen sind Aggregate der EIGENEN Arbeit — kein Zugriff auf fremde
 * Formulare. Die Vergleichswerte sind ebenfalls Aggregate und nennen
 * niemanden namentlich.
 */

/** Monat als Jahr + Nullindex, wie ihn `Date` führt. */
export interface MonthKey {
  year: number
  /** 0 = Januar */
  month: number
}

export interface Figures {
  sessions: number
  trainees: number
  gradesN: number
  mean: number | null
  /** Verteilung 1–5 und NO */
  dist: Record<string, number>
  lowShare: number | null
  highShare: number | null
  ncRate: number | null
}

export interface CompetencyLine {
  code: string
  title: string
  own: number | null
  ownN: number
  fleet: number | null
  all: number | null
  deltaFleet: number | null
  deltaAll: number | null
}

export interface MonthlyReport {
  month: MonthKey
  instructorId: string
  /** Kompetenzsatz, auf den sich der ganze Bericht bezieht — Piloten- und
   *  Instruktorenbewertungen werden nie gegeneinander gerechnet. */
  competencySet: CompetencySetKey
  /** Muster, auf denen dieser Instruktor im Monat geschult hat */
  fleets: string[]
  authorities: ('AT' | 'UK')[]
  own: Figures
  /** Alle Instruktoren, dieselben Muster, derselbe Monat */
  fleet: Figures
  /** Alle Instruktoren, alle Muster, derselbe Monat */
  all: Figures
  competencies: CompetencyLine[]
  deltaFleet: number | null
  deltaAll: number | null
  flagFleet: Flag
  flagAll: Flag
  /** Hat ausser dem Instruktor selbst noch jemand zur Vergleichsgruppe
   *  beigetragen? Wenn nicht, vergleicht man sich mit sich selbst — die
   *  Abweichung ist dann zwangslaeufig 0 und sagt nichts. Das muss der
   *  Bericht kenntlich machen, statt eine belastbare Null vorzutaeuschen. */
  fleetHasOthers: boolean
  allHasOthers: boolean
}

/** Erster Millisekunde des Monats und erste des Folgemonats. */
export function monthRange(m: MonthKey): { from: number; to: number } {
  return { from: new Date(m.year, m.month, 1).getTime(), to: new Date(m.year, m.month + 1, 1).getTime() }
}

export function monthOf(ts: number): MonthKey {
  const d = new Date(ts)
  return { year: d.getFullYear(), month: d.getMonth() }
}

export function sameMonth(a: MonthKey, b: MonthKey): boolean {
  return a.year === b.year && a.month === b.month
}

/**
 * Datenbasis des Berichts: dieselben vier Regeln wie in der Statistik
 * (nur unterschrieben, keine Folgeformulare, nur Blätter mit Piloten),
 * zusätzlich auf den Monat des SCHULUNGSTAGS eingegrenzt — ein nachgetragenes
 * Blatt gehört in den Monat, in dem geschult wurde.
 */
function inMonth(records: GradingRecord[], m: MonthKey): GradingRecord[] {
  const { from, to } = monthRange(m)
  return records.filter((r) => {
    if (r.status !== 'signed' || r.parentId || r.trainees.length === 0) return false
    const t = trainingDate(r)
    return t >= from && t < to
  })
}

/** Monate mit auswertbaren Blättern, neueste zuerst — Grundlage der Auswahl. */
export function monthsWithData(records: GradingRecord[], instructorId?: string): MonthKey[] {
  const seen = new Map<string, MonthKey>()
  records.forEach((r) => {
    if (r.status !== 'signed' || r.parentId || r.trainees.length === 0) return
    if (instructorId && r.instructorId !== instructorId) return
    const m = monthOf(trainingDate(r))
    seen.set(`${m.year}-${m.month}`, m)
  })
  return [...seen.values()].sort((a, b) => b.year - a.year || b.month - a.month)
}

function figuresOf(records: GradingRecord[]): Figures {
  const trainees = records.flatMap((r) => r.trainees)
  const grades: (Grade | null)[] = trainees.flatMap((tr) => tr.grades.map((g) => g.grade))
  const nums = numbersOf(grades)
  const dist: Record<string, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, NO: 0 }
  grades.forEach((v) => {
    if (v === null) return
    dist[String(v)] = (dist[String(v)] ?? 0) + 1
  })
  return {
    // Ein Durchgang kann mehrere Blätter ergeben (eines je Pilot) —
    // gezählt wird der Durchgang, wie überall sonst.
    sessions: new Set(records.map((r) => r.batchId ?? r.id)).size,
    trainees: trainees.length,
    gradesN: nums.length,
    mean: mean(grades),
    dist,
    lowShare: pct(nums.filter((v) => v <= 2).length, nums.length),
    highShare: pct(nums.filter((v) => v >= 4).length, nums.length),
    ncRate: pct(trainees.filter((tr) => tr.overall === 'not_competent').length, trainees.length),
  }
}

/** Kompetenz-Wortlaut aus dem jüngsten Blatt, das ihn führt (er ist je
 *  Formular eingefroren und kann sich über die Zeit geändert haben). */
function titlesOf(records: GradingRecord[]): Map<string, string> {
  const titles = new Map<string, string>()
  ;[...records]
    .sort((a, b) => trainingDate(a) - trainingDate(b))
    .forEach((r) => r.competencies?.forEach((c) => titles.set(c.code, c.title)))
  return titles
}

const meanForCode = (records: GradingRecord[], code: string): { mean: number | null; n: number } => {
  const vals = records.flatMap((r) => r.trainees.flatMap((tr) => tr.grades.filter((g) => g.code === code).map((g) => g.grade)))
  return { mean: mean(vals), n: numbersOf(vals).length }
}

/**
 * `setOf` liefert den Kompetenzsatz eines Blattes (pilot/instructor).
 *
 * Ohne ihn rechnete der Bericht Piloten- und Instruktorenbewertungen
 * gegeneinander — genau das, was `statsBySet` im Standardisierungsbericht
 * ausdrücklich verhindert: Die beiden Sätze folgen unterschiedlichen
 * Maßstäben. Ein TRI, der in einem Monat viele 308G schreibt, stand damit
 * gegen Piloten-Durchschnitte und bekam eine Abweichung ausgewiesen, die
 * nur aus der Vermischung stammte.
 *
 * Der Bericht beschränkt sich deshalb auf EINEN Satz — den, in dem der
 * Instruktor in diesem Monat die meisten Noten vergeben hat — und
 * vergleicht ausschließlich innerhalb dieses Satzes. Welcher es ist, steht
 * als `competencySet` im Ergebnis.
 *
 * Folgeformulare (306/310) tragen keine Noten, zählten aber als eigene
 * Session mit. Sie fallen hier heraus: Ein 306 ist die Folge einer Session,
 * nicht eine zweite.
 */
export function monthlyReport(
  records: GradingRecord[],
  instructorId: string,
  m: MonthKey,
  setOf: (r: GradingRecord) => CompetencySetKey | null = () => 'pilot',
): MonthlyReport {
  const gewertet = inMonth(records, m).filter((r) => !isFollowUpType(r.formTypeId))
  const eigene = gewertet.filter((r) => r.instructorId === instructorId)
  // Dominanter Satz des Monats: der mit den meisten eigenen Noten.
  const notenJeSatz = (key: CompetencySetKey) =>
    eigene.filter((r) => setOf(r) === key).reduce((n, r) => n + r.trainees.reduce((k, tr) => k + tr.grades.length, 0), 0)
  const competencySet: CompetencySetKey = notenJeSatz('instructor') > notenJeSatz('pilot') ? 'instructor' : 'pilot'
  const monthRecords = gewertet.filter((r) => setOf(r) === competencySet)
  const ownRecords = monthRecords.filter((r) => r.instructorId === instructorId)
  const fleets = [...new Set(ownRecords.map((r) => r.header.aircraftType).filter(Boolean))].sort()
  const authorities = [...new Set(ownRecords.map(authorityOf))].sort()
  // Vergleichsgruppe „Flotte": dieselben Muster, derselbe Monat, ALLE
  // Instruktoren — der eigene Anteil bleibt bewusst enthalten, sonst
  // verschiebt sich der Bezugswert je nachdem, wie viel man selbst
  // beigetragen hat.
  const fleetRecords = fleets.length === 0 ? [] : monthRecords.filter((r) => fleets.includes(r.header.aircraftType ?? ''))

  const own = figuresOf(ownRecords)
  const fleet = figuresOf(fleetRecords)
  const all = figuresOf(monthRecords)

  const titles = titlesOf(monthRecords)
  const codes: string[] = []
  ownRecords.forEach((r) => r.trainees.forEach((tr) => tr.grades.forEach((g) => { if (!codes.includes(g.code)) codes.push(g.code) })))

  const competencies: CompetencyLine[] = codes.map((code) => {
    const o = meanForCode(ownRecords, code)
    const f = meanForCode(fleetRecords, code)
    const a = meanForCode(monthRecords, code)
    return {
      code,
      title: titles.get(code) ?? code,
      own: o.mean,
      ownN: o.n,
      fleet: f.mean,
      all: a.mean,
      deltaFleet: o.mean === null || f.mean === null ? null : o.mean - f.mean,
      deltaAll: o.mean === null || a.mean === null ? null : o.mean - a.mean,
    }
  })

  const deltaFleet = own.mean === null || fleet.mean === null ? null : own.mean - fleet.mean
  const deltaAll = own.mean === null || all.mean === null ? null : own.mean - all.mean

  return {
    month: m,
    instructorId,
    competencySet,
    fleets,
    authorities,
    own,
    fleet,
    all,
    competencies,
    deltaFleet,
    deltaAll,
    flagFleet: calibrationFlag(deltaFleet, own.gradesN, own.sessions),
    flagAll: calibrationFlag(deltaAll, own.gradesN, own.sessions),
    fleetHasOthers: fleetRecords.some((r) => r.instructorId !== instructorId),
    allHasOthers: monthRecords.some((r) => r.instructorId !== instructorId),
  }
}
