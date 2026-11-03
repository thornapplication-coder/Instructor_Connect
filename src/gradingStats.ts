import { formatDate } from './datum'
import type { CompetencySetKey, Grade, GradingRecord, Settings } from './types'

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
 * Anteil für die Anzeige: ganze Prozent, Zahl und Zeichen mit GESCHÜTZTEM
 * Leerzeichen; ohne Wert „–".
 *
 * Audit 11/2026, GRD-13/MOB-06: Monatsbericht und Standardisierungsbericht
 * schrieben `${v} %` mit normalem Leerzeichen — am Telefon stand „50" in
 * der einen Zeile und „%" in der nächsten. `.tabular-nums` verhindert nur
 * den Bruch IM Wort, nicht am Leerzeichen. Ein Wert ist eine Einheit.
 */
export function formatPct(v: number | null): string {
  return v === null ? '–' : `${v.toFixed(0)}\u00a0%`
}

/**
 * Abweichung zum Vergleichswert für die Anzeige: zwei Nachkommastellen, „+"
 * nur bei einem Wert über null, ohne Wert „–".
 *
 * Audit 11/2026 (Nachtrag Exporte Kern-App #2): Die Kalibrierungs-Kachel der
 * Statistik rechnete `row.delta ?? 0` und zeigte bei einem Instruktor, der
 * nur „NO" vergeben hatte, „+0.00" neben einer leeren Durchschnittszelle —
 * eine Aussage („genau im Schnitt"), wo es keine gibt. Monatsbericht und
 * Standardisierungsbericht schrieben dafür „–", jede Ansicht mit eigener
 * Formel und eigener Vorzeichenregel („+0.00" hier, „0.00" dort). Jetzt
 * fragen alle drei diese Stelle. Gerundet wird VOR der Vorzeichenwahl, damit
 * −0,001 nicht als „-0.00" erscheint.
 */
export function formatDelta(v: number | null): string {
  if (v === null) return '–'
  const gerundet = Number(v.toFixed(2))
  // −0 und 0 gleichermaßen: keine Abweichung, kein Vorzeichen.
  if (gerundet === 0) return '0.00'
  return `${gerundet > 0 ? '+' : ''}${gerundet.toFixed(2)}`
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

/**
 * Beginn des Fensters „letzte N Monate": Tagesbeginn (Ortszeit) desselben
 * Kalendertags N Monate zuvor; gibt es den Tag im Zielmonat nicht, der
 * Monatsletzte (31.05. − 3 → 28.02.).
 *
 * Audit 11/2026, TEC-15: `setMonth` lief am Monatsende über — 31.05. − 3
 * ergab den 03.03., die Schulungen vom 1. und 2. März fielen still aus der
 * Statistik. Ausserdem behielt der Beginn die Uhrzeit von „jetzt", der
 * Schulungstag (trainingDate) liegt aber auf Mitternacht: Ein Blatt vom
 * Randtag fehlte immer. Beides traf Statistik und Standardisierungsbericht
 * gleichermassen (scopeRecords).
 */
export function periodStart(period: PeriodKey, now: number): number {
  const months = PERIODS.find((p) => p.key === period)?.months ?? 0
  if (months === 0) return 0
  const jetzt = new Date(now)
  // Monatsindex darf negativ werden — der Date-Konstruktor rechnet ihn ins
  // Vorjahr um. Tag 0 des Folgemonats = letzter Tag des Zielmonats.
  const zielJahr = jetzt.getFullYear()
  const zielMonat = jetzt.getMonth() - months
  const tageImZielmonat = new Date(zielJahr, zielMonat + 1, 0).getDate()
  return new Date(zielJahr, zielMonat, Math.min(jetzt.getDate(), tageImZielmonat)).getTime()
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
/** Behörde eines Datensatzes; Altbestand ohne Angabe zählt als AT
 *  (der Standard beim Anlegen). */
export function authorityOf(r: GradingRecord): 'AT' | 'UK' {
  return r.authority === 'UK' ? 'UK' : 'AT'
}

export function scopeRecords(
  records: GradingRecord[],
  opts: { fleet?: string; authority?: '' | 'AT' | 'UK'; period: PeriodKey; now: number },
): GradingRecord[] {
  const from = periodStart(opts.period, opts.now)
  return records.filter(
    (r) =>
      r.status === 'signed' &&
      !r.parentId &&
      r.trainees.length > 0 &&
      (!opts.fleet || r.header.aircraftType === opts.fleet) &&
      (!opts.authority || authorityOf(r) === opts.authority) &&
      trainingDate(r) >= from,
  )
}

/**
 * Zeitraumfilter der Listen (Ablage des Superadmins, Liste des Training
 * Admins): „beliebig", 24 h, 7 Tage, Monat, Jahr.
 *
 * Audit 11/2026, GRD-09: Dieselbe Auswahl „Last 7 days" lieferte in den
 * beiden Listen verschiedene Zeilen — die Ablage filterte nach dem
 * Erfassungszeitpunkt, die Liste des Training Admins nach dem Schulungstag.
 * Die Ablage zeigte dabei den Schulungstag an, also Daten ausserhalb des
 * gewaehlten Zeitraums, und ihr Exportkopf „Period: Last 7 days" beschrieb
 * etwas anderes als die Zeilen darunter. Tabelle und Regel stehen deshalb
 * hier, und beide Listen fragen sie.
 */
export const LISTEN_ZEITRAEUME = [
  { key: 'all', days: null },
  { key: 'day', days: 1 },
  { key: 'week', days: 7 },
  { key: 'month', days: 31 },
  { key: 'year', days: 365 },
] as const

/** Fensterlaenge in Tagen zu einem Zeitraumschluessel; unbekannt = kein Filter. */
export function zeitraumTage(key: string): number | null {
  return LISTEN_ZEITRAEUME.find((p) => p.key === key)?.days ?? null
}

/**
 * Liegt der SCHULUNGSTAG im Fenster der letzten `tage` Tage? Massgeblich ist
 * dieselbe Regel wie in der Statistik (trainingDate): Ein nachgetragenes
 * Blatt gehoert in die Zeit, in der geschult wurde. Weil der Schulungstag
 * auf Mitternacht faellt, umfasst „7 Tage" die sieben Kalendertage bis
 * heute; ohne Kopfdatum zaehlt der Erfassungszeitpunkt.
 */
export function imZeitraum(r: GradingRecord, tage: number | null, jetzt: number): boolean {
  if (tage === null) return true
  return jetzt - trainingDate(r) <= tage * 24 * 3600_000
}

/**
 * Behoerdenangabe eines Auswertungsausschnitts — die Bereichszeile von
 * Bericht und Exportkopf, nicht der Briefkopf.
 *
 * Audit 11/2026, GRD-05/STD-01/UID-06: Der Standardisierungsbericht setzte
 * bei „All authorities" die AT-Nummer ein, weil die Rueckfallkette den Fall
 * „keine Auswahl" nie erreichte. Das gedruckte Behoerdendokument wies damit
 * UK-Bewertungen als AT.ATO.106 aus, waehrend die CSV derselben Ansicht
 * „All authorities" schrieb. Der Briefkopf darf die Hauptzulassung der ATO
 * tragen; die Bereichszeile sagt, welche Daten im Bericht stehen.
 *
 * Englisch, weil sie nur in Berichten und Exporten steht (wie periodLabel).
 */
export function berichtsKennung(
  authority: '' | 'AT' | 'UK',
  doc: Partial<Pick<Settings['documentHeader'], 'approvalNumber' | 'approvalNumberUK'>> | undefined,
): string {
  if (authority === 'UK') return doc?.approvalNumberUK || 'GBR.ATO.0541'
  if (authority === 'AT') return doc?.approvalNumber || 'AT.ATO.106'
  return 'All authorities'
}

/**
 * Zulassung im BRIEFKOPF eines Berichts: die der gewählten Behörde, ohne
 * Auswahl die Hauptzulassung der ATO (AT). Das ist der Absender, nicht der
 * Inhalt — welche Daten im Bericht stehen, sagt die Bereichszeile
 * (`berichtsKennung`). Standardisierungsbericht und Statistik drucken
 * denselben Kopf (Audit 11/2026, RPT-01) und fragen deshalb diese Stelle.
 */
export function briefkopfZulassung(
  authority: '' | 'AT' | 'UK',
  doc: Partial<Pick<Settings['documentHeader'], 'approvalNumber' | 'approvalNumberUK'>> | undefined,
): string {
  return authority === 'UK' ? doc?.approvalNumberUK || 'GBR.ATO.0541' : doc?.approvalNumber || 'AT.ATO.106'
}

/**
 * Teile des Drucktitels einer Auswertung (`druckTitel`, dateiName.ts):
 * Titel_Zeitraum_Flotte_Behörde_Datum, z. B.
 * „Standardisation Report_Last 12 months_All fleets_All authorities_02.11.2026".
 *
 * Audit 11/2026, EXM-04: Standardisierungsbericht und Statistik haben einen
 * eigenen Druck (Kopf, Querformat), druckten aber als „Instructor
 * Connect.pdf" — zwei Ausschnitte überschrieben sich im Downloadordner, und
 * der PDF-Titel sagte nichts über den Inhalt. Der Titel nennt denselben
 * Ausschnitt wie die Bereichszeile des Kopfes (periodLabel,
 * berichtsKennung). Datum im App-Format wie auf dem Dokument (datum.ts),
 * Ortszeit — der Tag des Ausdrucks unterscheidet zwei Stände.
 *
 * Englisch wie der Bericht; den Titel reicht die Ansicht aus `forms` herein.
 */
export function auswertungDruckTeile(
  titel: string,
  opts: {
    fleet: string
    authority: '' | 'AT' | 'UK'
    period: PeriodKey
    doc: Partial<Pick<Settings['documentHeader'], 'approvalNumber' | 'approvalNumberUK'>> | undefined
    now: number
  },
): string[] {
  return [titel, periodLabel(opts.period), opts.fleet || 'All fleets', berichtsKennung(opts.authority, opts.doc), formatDate(opts.now)]
}

export interface FlottenMatrix {
  /** Muster mit mindestens einem Blatt im Ausschnitt, alphabetisch */
  fleets: string[]
  /** Kompetenzen in der Reihenfolge, in der sie im Bestand auftauchen */
  codes: string[]
  /** Mittel je Muster und Kompetenz; null = in dieser Zelle keine Zahlnote */
  cell: Record<string, Record<string, number | null>>
}

/**
 * Flottenmatrix eines Kompetenzsatzes: Mittel je Muster und Kompetenz.
 *
 * Audit 11/2026, GRD-07/STAT-01/UID-01/TXT-06: Die Matrix rechnete in der
 * Ansicht aus ALLEN Blaettern des Satzes — unterschriebene und offene,
 * jeder Zeitraum, jede Behoerde. Unter „Instructor competencies (308G) ·
 * 0 sessions" stand eine gefuellte Zeile CL30 5.0/5.0/4.0 aus einem Blatt,
 * das noch auf die Unterschrift wartete, und direkt darueber der Hinweis
 * „Basis: only signed forms …". Jetzt gilt dieselbe Datenbasis wie fuer
 * Trend und Kalibrierung (scopeRecords).
 *
 * Bewusst OHNE Flottenfilter — die Optionen kennen gar keinen: Die Matrix
 * ist der Vergleich der Flotten untereinander, die Flottenauswahl der Seite
 * wirkt auf Trend und Kalibrierung. Blaetter ohne Muster haben keine Zeile.
 */
export function flottenMatrix(
  records: GradingRecord[],
  setOf: (r: GradingRecord) => CompetencySetKey | null,
  key: CompetencySetKey,
  opts: { authority: '' | 'AT' | 'UK'; period: PeriodKey; now: number },
): FlottenMatrix {
  const rs = scopeRecords(records, { authority: opts.authority, period: opts.period, now: opts.now }).filter(
    (r) => setOf(r) === key && !!r.header.aircraftType,
  )
  const fleets = [...new Set(rs.map((r) => r.header.aircraftType as string))].sort()
  const codes = [...new Set(rs.flatMap((r) => r.trainees.flatMap((tr) => tr.grades.map((x) => x.code))))]
  const cell: FlottenMatrix['cell'] = {}
  fleets.forEach((f) => {
    const vonMuster = rs.filter((r) => r.header.aircraftType === f)
    cell[f] = {}
    codes.forEach((c) => {
      cell[f][c] = mean(vonMuster.flatMap((r) => r.trainees.flatMap((tr) => tr.grades.filter((x) => x.code === c).map((x) => x.grade))))
    })
  })
  return { fleets, codes, cell }
}

/** Tönung einer Matrixzelle; `null` = keine Zahlnote, keine Fläche. */
export type MatrixTon = 'hoch' | 'gut' | 'niedrig' | 'schwach'

/**
 * Stufe einer Zelle der Flottenmatrix: ab 4 „hoch", ab 3 „gut", ab 2
 * „niedrig", darunter „schwach". Gestuft wird nach dem ANGEZEIGTEN Wert (eine
 * Nachkommastelle) — sonst stünde „4.0" (aus 3.96) in der Farbe der 3er.
 *
 * Audit 11/2026, UID-19: Die Stufen standen als rohe Palettenfarben in der
 * Ansicht (emerald/amber/red, je /20). Im Dunkelmodus ging das Amber auf dem
 * dunkelblauen Grund in ein Grau-Oliv über und war von den 3er-Zellen kaum
 * zu unterscheiden — die Warnstufe verlor ihre Bedeutung. Die Flächen kommen
 * jetzt aus den Status-Tokens (`.matrix-ton-*` in index.css, mit eigenen
 * Dunkelwerten), die Schwellen von hier.
 */
export function matrixTon(v: number | null): MatrixTon | null {
  if (v === null) return null
  const angezeigt = Number(v.toFixed(1))
  if (angezeigt >= 4) return 'hoch'
  if (angezeigt >= 3) return 'gut'
  if (angezeigt >= 2) return 'niedrig'
  return 'schwach'
}

/**
 * Kalibrierungs-Flag aus der Abweichung zum Vergleichswert.
 *
 * Dieselbe Rechnung braucht der Standardisierungsbericht (je Instruktor
 * gegen die Flotte) und der persönliche Monatsbericht (eigener Schnitt
 * gegen Flotte bzw. Gesamt). Sie steht deshalb genau einmal hier — zwei
 * Kopien wären zwei Wahrheiten, sobald jemand eine Schwelle anfasst.
 *
 * „insufficient" ist keine Bewertung, sondern die ehrliche Auskunft, dass
 * die Datenbasis für eine Aussage nicht reicht.
 */
export function calibrationFlag(delta: number | null, gradesN: number, sessions: number): Flag {
  if (gradesN < MIN_GRADES || sessions < MIN_SESSIONS) return 'insufficient'
  if (delta === null || Math.abs(delta) < WATCH) return 'none'
  return Math.abs(delta) < REVIEW ? 'watch' : 'review'
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
          const flag = calibrationFlag(delta, nums.length, sessions)
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
