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
import { csvNum, csvRow } from './csv'
import { dateiName } from './dateiName'
import { formatDateTime, lokalerTag, monatsName } from './datum'
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
  /** null, wenn in der Gruppe niemand sonst diese Kompetenz mit einer Zahl
   *  bewertet hat — dann vergliche man sich nur mit sich selbst. */
  deltaFleet: number | null
  deltaAll: number | null
}

/** Eigene Blätter des Monats aus dem ANDEREN Kompetenzsatz — sie stehen
 *  nicht im Bericht, werden aber genannt statt verschwiegen. */
export interface Ausgelassen {
  set: CompetencySetKey
  sessions: number
  grades: number
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
  /** Audit 11/2026, GRD-21/GTY-08: Der Bericht zeigt nur einen Satz. Die
   *  Durchgänge des anderen fielen bisher ohne jeden Hinweis heraus — die
   *  Sitzungszahl war zu klein, und Arbeit verschwand ungekennzeichnet. */
  ausgelassen: Ausgelassen
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
 * als `competencySet` im Ergebnis, die eigenen Durchgänge des anderen
 * Satzes als `ausgelassen` — die Ansicht nennt beides.
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
  const andererSatz: CompetencySetKey = competencySet === 'pilot' ? 'instructor' : 'pilot'
  const monthRecords = gewertet.filter((r) => setOf(r) === competencySet)
  const ownRecords = monthRecords.filter((r) => r.instructorId === instructorId)
  const fleets = [...new Set(ownRecords.map((r) => r.header.aircraftType).filter(Boolean))].sort()
  const authorities = [...new Set(ownRecords.map(authorityOf))].sort()
  // Vergleichsgruppe „Flotte": dieselben Muster, derselbe Monat, ALLE
  // Instruktoren — der eigene Anteil bleibt bewusst enthalten, sonst
  // verschiebt sich der Bezugswert je nachdem, wie viel man selbst
  // beigetragen hat.
  //
  // Audit 11/2026, GTY-02/GRD-12: „Der eigene Anteil" hiess nur, soweit er
  // ein Muster trug. Ein eigenes Blatt ohne Muster (308C/308D) fiel aus der
  // Gruppe, und der Bericht wies bei lauter eigenen Blaettern „+0.25 vs your
  // types" aus — eine Abweichung von sich selbst. Eigene Blaetter gehoeren
  // deshalb immer dazu.
  const fleetRecords = monthRecords.filter(
    (r) => r.instructorId === instructorId || fleets.includes(r.header.aircraftType ?? ''),
  )

  const own = figuresOf(ownRecords)
  const fleet = figuresOf(fleetRecords)
  const all = figuresOf(monthRecords)

  const titles = titlesOf(monthRecords)
  const codes: string[] = []
  ownRecords.forEach((r) => r.trainees.forEach((tr) => tr.grades.forEach((g) => { if (!codes.includes(g.code)) codes.push(g.code) })))

  // Hat in der Gruppe noch jemand anderes diese Kompetenz mit einer ZAHL
  // bewertet? Sonst ist die Abweichung zwangslaeufig 0 und keine Aussage.
  // Audit 11/2026, GRD-12: Die Kachel sagte „no comparison possible", die
  // Tabelle darunter neunmal „0.00 vs your types". Die Pruefung je
  // Kompetenz ist strenger als fleetHasOthers — ein Kollege, der nur andere
  // Kompetenzen bewertet hat, liefert fuer diese keinen Vergleich.
  const fremdBewertet = (rs: GradingRecord[], code: string) =>
    rs.some(
      (r) =>
        r.instructorId !== instructorId &&
        r.trainees.some((tr) => tr.grades.some((g) => g.code === code && typeof g.grade === 'number')),
    )
  const abweichung = (eigen: number | null, gruppe: number | null, rs: GradingRecord[], code: string) =>
    eigen === null || gruppe === null || !fremdBewertet(rs, code) ? null : eigen - gruppe

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
      deltaFleet: abweichung(o.mean, f.mean, fleetRecords, code),
      deltaAll: abweichung(o.mean, a.mean, monthRecords, code),
    }
  })

  const anderes = figuresOf(gewertet.filter((r) => r.instructorId === instructorId && setOf(r) === andererSatz))

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
    ausgelassen: { set: andererSatz, sessions: anderes.sessions, grades: anderes.gradesN },
  }
}

/** „2026-10" — Kennung eines Monats für Dateinamen und `monatsName`. */
export function monatsKennung(m: MonthKey): string {
  return `${m.year}-${String(m.month + 1).padStart(2, '0')}`
}

/**
 * Beschriftungen der Monats-CSV — dieselben Wörter wie auf dem Bildschirm,
 * aus dem Namensraum `forms` (nur Englisch). Die Schlüssel stehen hier fest,
 * damit i18n.test.ts mechanisch prüft, dass es sie gibt.
 */
export type MonatsSchluessel =
  | 'forms:admin.monthly'
  | 'forms:admin.month'
  | 'forms:admin.instructorPick'
  | 'forms:std.set'
  | 'forms:admin.notIncluded'
  | 'forms:admin.sessions'
  | 'forms:admin.traineesGraded'
  | 'forms:admin.gradesGiven'
  | 'forms:admin.meanGrade'
  | 'forms:admin.lowShareLbl'
  | 'forms:admin.highShareLbl'
  | 'forms:admin.ncRateLbl'
  | 'forms:admin.perCompetency'
  | 'forms:admin.yours'
  | 'forms:admin.fleetCol'
  | 'forms:admin.allCol'
  | 'forms:admin.vsFleet'
  | 'forms:admin.vsAll'
  | 'forms:std.instructor'
  | 'forms:admin.fleetColOther'
  | 'forms:admin.vsFleetOther'
  | 'forms:admin.comparison'
  | 'forms:admin.deviation'
  | 'forms:std.assessmentCol'
  | 'forms:admin.onlyYou'
  | 'forms:admin.onlyInstructor'
  | 'forms:admin.deltaHint'
  | 'forms:admin.deltaHintOther'
  | 'forms:admin.flagNone'
  | 'forms:admin.flagWatch'
  | 'forms:admin.flagReview'
  | 'forms:admin.flagInsufficient'

const FLAG_SCHLUESSEL: Record<Flag, MonatsSchluessel> = {
  none: 'forms:admin.flagNone',
  watch: 'forms:admin.flagWatch',
  review: 'forms:admin.flagReview',
  insufficient: 'forms:admin.flagInsufficient',
}

export interface MonatsCsvKontext {
  /** Briefkopf: Organisation und Hauptzulassung aus den Einstellungen */
  atoName: string
  zulassung: string
  /** Name des Instruktors, dessen Bericht es ist */
  instruktor: string
  satzName: (key: CompetencySetKey) => string
  exportiertAm: number
  exportiertVon: string
  /** Exportiert jemand anderes als der Instruktor selbst? Dann heißt die
   *  Spalte „Instructor", nicht „You". */
  fremd: boolean
  beschriftung: (schluessel: MonatsSchluessel) => string
}

/**
 * Die Monats-CSV als reine Funktion.
 *
 * Audit 11/2026, RPT-01: Die Datei entstand in der Ansicht und enthielt die
 * Zahlen ohne die eigentliche Aussage — keine Abweichung, keine Einstufung,
 * kein Briefkopf, kein „Generated/By", Prozentspalten ohne Einheit
 * („Share 1–2;17"), und die Spalte hieß „You" auch dann, wenn ein Training
 * Admin den Bericht eines anderen Instruktors exportierte. Jetzt:
 *  - Kopf mit ATO, Zulassung, Bericht, Monat, Instruktor, Kompetenzsatz,
 *    Ausgelassenem und Stempel (wer, wann);
 *  - die Kalibrierung zuerst — Abweichung samt Einstufung, wie die Kacheln;
 *    ohne fremde Blätter in der Gruppe der Grund statt einer leeren Zahl;
 *  - „%" in den Bezeichnungen der Anteile;
 *  - die Spalten aus Sicht des Lesers („Instructor" statt „You").
 * Gerechnet wird hier nichts: Alle Werte kommen aus `monthlyReport`.
 */
export function monthlyCsv(report: MonthlyReport, ctx: MonatsCsvKontext): string {
  const b = ctx.beschriftung
  const prozent = (s: MonatsSchluessel) => `${b(s)} (%)`
  const eigen = ctx.fremd ? b('forms:std.instructor') : b('forms:admin.yours')
  const flotte = ctx.fremd ? b('forms:admin.fleetColOther') : b('forms:admin.fleetCol')
  const gegenFlotte = ctx.fremd ? b('forms:admin.vsFleetOther') : b('forms:admin.vsFleet')
  const nurEigene = ctx.fremd ? b('forms:admin.onlyInstructor') : b('forms:admin.onlyYou')

  let csv = csvRow([`Instructor Connect — ${b('forms:admin.monthly')}`])
  csv += csvRow([ctx.atoName, ctx.zulassung])
  csv += csvRow([b('forms:admin.month'), monatsName(monatsKennung(report.month), 'en')])
  csv += csvRow([b('forms:admin.instructorPick'), ctx.instruktor])
  csv += csvRow([b('forms:std.set'), ctx.satzName(report.competencySet)])
  // Welcher Satz fehlt, steht auch in der Datei — sonst ist die
  // Sitzungszahl ohne Erklärung zu klein (GRD-21).
  if (report.ausgelassen.sessions > 0)
    csv += csvRow([
      b('forms:admin.notIncluded'),
      ctx.satzName(report.ausgelassen.set),
      b('forms:admin.sessions'),
      report.ausgelassen.sessions,
      b('forms:admin.gradesGiven'),
      report.ausgelassen.grades,
    ])
  csv += csvRow(['Generated', formatDateTime(ctx.exportiertAm), 'Generated by', ctx.exportiertVon])
  csv += csvRow([])

  // Die Aussage zuerst — wie auf dem Bildschirm, wo die Kalibrierung oben
  // steht und der Rest Beleg ist.
  csv += csvRow([b('forms:admin.comparison'), b('forms:admin.deviation'), b('forms:std.assessmentCol')])
  const vergleich = (label: string, hatAndere: boolean, delta: number | null, flag: Flag) =>
    hatAndere ? csvRow([label, csvNum(delta), b(FLAG_SCHLUESSEL[flag])]) : csvRow([label, '', nurEigene])
  csv += vergleich(gegenFlotte, report.fleetHasOthers, report.deltaFleet, report.flagFleet)
  csv += vergleich(b('forms:admin.vsAll'), report.allHasOthers, report.deltaAll, report.flagAll)
  csv += csvRow([ctx.fremd ? b('forms:admin.deltaHintOther') : b('forms:admin.deltaHint')])
  csv += csvRow([])

  csv += csvRow(['', eigen, flotte, b('forms:admin.allCol')])
  const anzahl: [MonatsSchluessel, 'sessions' | 'trainees' | 'gradesN'][] = [
    ['forms:admin.sessions', 'sessions'],
    ['forms:admin.traineesGraded', 'trainees'],
    ['forms:admin.gradesGiven', 'gradesN'],
  ]
  anzahl.forEach(([s, k]) => (csv += csvRow([b(s), report.own[k], report.fleet[k], report.all[k]])))
  csv += csvRow([b('forms:admin.meanGrade'), csvNum(report.own.mean), csvNum(report.fleet.mean), csvNum(report.all.mean)])
  const anteile: [MonatsSchluessel, 'lowShare' | 'highShare' | 'ncRate'][] = [
    ['forms:admin.lowShareLbl', 'lowShare'],
    ['forms:admin.highShareLbl', 'highShare'],
    ['forms:admin.ncRateLbl', 'ncRate'],
  ]
  anteile.forEach(([s, k]) => (csv += csvRow([prozent(s), csvNum(report.own[k], 0), csvNum(report.fleet[k], 0), csvNum(report.all[k], 0)])))
  csv += csvRow([])

  csv += csvRow([b('forms:admin.perCompetency'), eigen, flotte, b('forms:admin.allCol'), gegenFlotte, b('forms:admin.vsAll')])
  report.competencies.forEach(
    (c) => (csv += csvRow([`${c.code} ${c.title}`, csvNum(c.own), csvNum(c.fleet), csvNum(c.all), csvNum(c.deltaFleet), csvNum(c.deltaAll)])),
  )
  return csv
}

/** Downloadname nach dem gemeinsamen Schema (dateiName): Bericht, Instruktor,
 *  Monat — und das Exportdatum hinten, damit zwei Auszüge desselben Monats
 *  einander nicht zu „(1)"-Kopien machen. */
export function monthlyCsvName(report: Pick<MonthlyReport, 'month'>, instruktor: string, exportiertAm: number): string {
  return `${dateiName(['monthly-report', instruktor, monatsKennung(report.month)], lokalerTag(exportiertAm))}.csv`
}
