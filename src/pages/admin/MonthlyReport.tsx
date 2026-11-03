import { CalendarRange, Download, Info } from 'lucide-react'
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge, type BadgeTone, Card, CardHeading, FilterAuswahl } from '../../components/ui'
import { downloadCsv } from '../../csv'
import { toast } from '../../components/Toast'
import { briefkopfZulassung, formatDelta, formatPct, type Flag } from '../../gradingStats'
import {
  monatsBeschriftung,
  monthlyCsv,
  monthlyCsvName,
  monthlyReport,
  monthsWithData,
  type Beschrifter,
  type CompetencyLine,
  type MonatsBeschriftung,
  type Figures,
  type MonthKey,
  type MonthlyReport as Report,
} from '../../monthlyReport'
import { useStore } from '../../store'
import type { CompetencySetKey, GradingRecord } from '../../types'
import { gradeColor } from '../../gradingRules'

/**
 * Persönlicher Monatsbericht.
 *
 * Der Standardisierungsbericht beantwortet die Frage der ATO („bewertet
 * jemand systematisch strenger?"). Der Einzelne sieht dort eine Zeile unter
 * vielen und erfährt nie von sich aus, wo er steht. Hier ist die
 * Blickrichtung umgedreht: eigene Zahlen eines Monats, gespiegelt gegen die
 * eigenen Muster UND gegen alle Gradings — der erste Vergleich zeigt die
 * Kalibrierung im Muster, der zweite, ob das Muster als Ganzes ausschert.
 *
 * Für Instruktoren ist der Bericht der eigene; Rollen mit vollem
 * Archivzugriff können zusätzlich den Instruktor wählen.
 */

const fmt = (v: number | null, digits = 2) => (v === null ? '–' : v.toFixed(digits))

const deltaClass = (v: number | null) => (v === null ? 'text-dim' : Math.abs(v) < 0.4 ? 'text-dim' : v > 0 ? 'text-warm' : 'text-accent')

function FlagBadge({ flag, t }: { flag: Flag; t: (k: string) => string }) {
  const map: Record<Flag, BadgeTone> = {
    none: 'ok',
    watch: 'wait',
    review: 'bad',
    insufficient: 'dim',
  }
  const label: Record<Flag, string> = {
    none: 'flagNone',
    watch: 'flagWatch',
    review: 'flagReview',
    insufficient: 'flagInsufficient',
  }
  return (
    <Badge tone={map[flag]}>{t(`forms:admin.${label[flag]}`)}</Badge>
  )
}

/** Kennzahlenzeile: eigener Wert, Flotte, Gesamt — immer in dieser Ordnung. */
/**
 * Eine Kennzahlzeile. Bewusst echtes <tr>/<th>/<td>: Der Block war ein Raster
 * aus <span>, und damit fehlte jede Verbindung zwischen einem Wert und seiner
 * Spaltenüberschrift. Vorgelesen wurde „2,95 2,88 3,01" ohne die Angabe,
 * welche Zahl die eigene und welche die der Flotte ist — bei einer
 * Gegenüberstellung ist das die ganze Aussage. Mit einer Tabelle nennt die
 * Vorlesesoftware zu jedem Wert Zeile und Spalte.
 */
function FigureRow({ label, own, fleet, all }: { label: string; own: string; fleet: string; all: string }) {
  // Werte ungetrennt — „22 / %" stand am Telefon auf zwei Zeilen, während
  // die Nachbarspalten Platz hatten (Audit 11/2026, GRD-13). Die
  // Beschriftungen sind kurz und bleiben ganz: „Share 1–2" bräche sonst
  // hinter dem Gedankenstrich.
  return (
    <tr className="border-b border-line/[0.06] text-small last:border-0">
      <th scope="row" className="whitespace-nowrap py-1.5 pr-2 text-left font-normal text-dim">
        {label}
      </th>
      <td className="whitespace-nowrap py-1.5 px-2 text-right font-semibold tabular-nums">{own}</td>
      <td className="whitespace-nowrap py-1.5 px-2 text-right tabular-nums text-dim">{fleet}</td>
      <td className="whitespace-nowrap py-1.5 pl-2 text-right tabular-nums text-dim">{all}</td>
    </tr>
  )
}

function Distribution({ dist, t }: { dist: Figures['dist']; t: (k: string) => string }) {
  const total = Object.values(dist).reduce((a, b) => a + b, 0)
  return (
    <div>
      <CardHeading className="mb-2">{t('forms:admin.distribution')}</CardHeading>
      <div className="flex flex-wrap gap-1.5">
        {(['1', '2', '3', '4', '5', 'NO'] as const).map((k) => {
          const n = dist[k] ?? 0
          const share = total === 0 ? 0 : Math.round((n / total) * 100)
          return (
            <span key={k} className="flex items-center gap-1.5 rounded-lg border border-line/10 px-2 py-1">
              <span className={`flex h-6 w-7 items-center justify-center rounded-md text-micro font-bold ${gradeColor(k === 'NO' ? 'NO' : Number(k))}`}>
                {k}
              </span>
              <span className="whitespace-nowrap text-micro tabular-nums">
                {n} <span className="text-dim">· {formatPct(share)}</span>
              </span>
            </span>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Kompetenzen eines Monats. Am Telefon breiter als der Bildschirm: Die erste
 * Spalte bleibt stehen, und ein Schatten am rechten Rand zeigt, dass es
 * weitergeht — vorher waren 294 von 520 px zu sehen und nichts wies auf den
 * Rest hin (Audit 11/2026, MOB-06).
 */
/**
 * Text, der nur an Leerzeichen umbricht — nie hinter einem Bindestrich.
 *
 * Neben den Spaltenköpfen mit Namen (Bericht eines anderen, „Chris
 * Beispiel's aircraft types", R3-MONATSBERICHT) gab die Tabelle der ersten
 * Spalte bei 360 px nur noch die Breite bis zum Bindestrich: „Problem-/
 * solving" (Ebene-3-Test zu GRD-13). Wortweise bleibt jedes Wort ganz; die
 * Tabelle scrollt dann, statt zu trennen.
 */
function Wortweise({ text }: { text: string }) {
  return (
    <>
      {text.split(' ').map((wort, i) => (
        <Fragment key={i}>
          {i > 0 && ' '}
          <span className="whitespace-nowrap">{wort}</span>
        </Fragment>
      ))}
    </>
  )
}

function CompetencyTable({ lines, t, wort }: { lines: CompetencyLine[]; t: (k: string) => string; wort: MonatsBeschriftung }) {
  return (
    <div className="scroll-schatten-x overflow-x-auto">
      <table className="w-full min-w-[520px] border-collapse text-small">
        <thead>
          <tr className="border-b border-line/15 text-left text-micro uppercase tracking-wide text-dim">
            <th className="sticky left-0 bg-surface py-2 pr-2 font-semibold">{t('forms:admin.perCompetency')}</th>
            <th className="py-2 px-2 text-right font-semibold">{wort.eigen}</th>
            <th className="py-2 px-2 text-right font-semibold">{wort.flotte}</th>
            <th className="py-2 px-2 text-right font-semibold">{t('forms:admin.allCol')}</th>
            <th className="py-2 px-2 text-right font-semibold">{wort.gegenFlotte}</th>
            <th className="py-2 pl-2 text-right font-semibold">{t('forms:admin.vsAll')}</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((c) => (
            <tr key={c.code} className="border-b border-line/[0.06] last:border-0">
              <th scope="row" className="sticky left-0 bg-surface py-2 pr-2 text-left font-normal">
                <span className="zusammen font-semibold">{c.code}</span>{' '}
                <span className="text-dim">
                  <Wortweise text={c.title} />
                </span>
              </th>
              <td className="whitespace-nowrap py-2 px-2 text-right font-semibold tabular-nums">{fmt(c.own)}</td>
              <td className="whitespace-nowrap py-2 px-2 text-right tabular-nums text-dim">{fmt(c.fleet)}</td>
              <td className="whitespace-nowrap py-2 px-2 text-right tabular-nums text-dim">{fmt(c.all)}</td>
              <td className={`whitespace-nowrap py-2 px-2 text-right tabular-nums ${deltaClass(c.deltaFleet)}`}>{formatDelta(c.deltaFleet)}</td>
              <td className={`whitespace-nowrap py-2 pl-2 text-right tabular-nums ${deltaClass(c.deltaAll)}`}>{formatDelta(c.deltaAll)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function MonthlyReport({ records }: { records: GradingRecord[] }) {
  // Kein `lng` mehr: Der Text dieses Berichts liegt im Namensraum `forms`,
  // den es nur auf Englisch gibt. Vorher entschied die einbindende Ansicht
  // über die Sprache — und vergaß sie an einer von zwei Stellen, weshalb
  // derselbe Bericht im Grading Tool englisch und im Admin-Panel deutsch war.
  const { t } = useTranslation()
  const { state, currentUser, can, now } = useStore()

  const mayPickInstructor = can('grading_view_all')
  /*
   * Vorbelegung: der eigene Bericht — aber nur, wenn es ihn geben kann.
   *
   * `useState(currentUser.id)` allein log: Ein Training Admin bewertet nicht
   * (`canGrade: false`), steht deshalb gar nicht in `instructorOptions` — das
   * Auswahlfeld zeigte dann den ERSTEN fremden Namen an, waehrend der Bericht
   * weiter fuer ihn selbst rechnete und „keine Bewertungen" meldete. Man las
   * einen Namen mit Daten und ein leeres Ergebnis. Dasselbe traf den
   * Superadmin, der selbst nicht bewertet.
   */
  const [instructorId, setInstructorId] = useState('')
  const who = mayPickInstructor ? instructorId || currentUser!.id : currentUser!.id

  const ownMonths = useMemo(() => monthsWithData(records, who), [records, who])
  // Wer fuer andere auswerten darf, hat oft selbst keine Bewertungen. Dann
  // duerfen die Monate nicht leer bleiben — sonst verschwaende die Auswahl
  // und mit ihr der Instruktorwaehler.
  const months = useMemo(
    () => (ownMonths.length > 0 ? ownMonths : mayPickInstructor ? monthsWithData(records) : []),
    [ownMonths, mayPickInstructor, records],
  )
  const [picked, setPicked] = useState<string>('')
  const month: MonthKey | undefined = months.find((m) => `${m.year}-${m.month}` === picked) ?? months[0]

  // Kompetenzsatz je Blatt aus dem Katalog — der Bericht vergleicht nur
  // innerhalb eines Satzes (siehe monthlyReport.ts).
  const setOfRecord = useCallback(
    (r: GradingRecord): CompetencySetKey | null =>
      state.settings.grading.formTypes.find((f) => f.id === r.formTypeId)?.competencySet ?? null,
    [state.settings.grading.formTypes],
  )
  const report: Report | undefined = useMemo(
    () => (month ? monthlyReport(records, who, month, setOfRecord) : undefined),
    [records, who, month, setOfRecord],
  )

  const userName = (id: string) => state.users.find((u) => u.id === id)?.name ?? id
  // Name des Kompetenzsatzes wie in Statistik und Standardisierungsbericht
  // aus dem Katalog der Einstellungen (Audit 11/2026, GRD-21/GTY-08).
  const satzName = (key: CompetencySetKey) =>
    state.settings.grading.competencySets.find((c) => c.key === key)?.name ??
    t(key === 'instructor' ? 'forms:admin.schemeInstructor' : 'forms:admin.schemePilot')
  const instructorOptions = useMemo(
    () =>
      [...new Set([...state.users.filter((u) => u.active && u.canGrade).map((u) => u.id), ...records.map((r) => r.instructorId)])]
        .map((id) => ({ id, name: userName(id) }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [state.users, records],
  )

  /*
   * Steht der aktuelle Nutzer nicht zur Wahl (oder hat er in keinem Monat
   * Daten), auf den ersten Instruktor MIT Daten wechseln — sonst zeigt das
   * Feld einen anderen Namen, als der Bericht rechnet.
   */
  useEffect(() => {
    if (!mayPickInstructor || instructorId) return
    // „Daten" heißt: auswertbare Blätter (monthsWithData — unterschrieben,
    // kein Folgeformular). Gefragt wurde nach IRGENDEINEM Blatt: Ein
    // Superadmin mit einem einzigen offenen 308G landete auf seinem eigenen,
    // leeren Bericht („No gradings in this month"), obwohl andere Daten
    // hatten — gefunden beim Ebene-3-Test zu GRD-13.
    const hatDaten = (id: string) => monthsWithData(records, id).length > 0
    if (hatDaten(currentUser!.id) && instructorOptions.some((o) => o.id === currentUser!.id)) {
      setInstructorId(currentUser!.id)
      return
    }
    const ersterMitDaten = instructorOptions.find((o) => hatDaten(o.id))
    if (ersterMitDaten) setInstructorId(ersterMitDaten.id)
  }, [mayPickInstructor, instructorId, instructorOptions, records, currentUser])

  /*
   * Aus Sicht des Lesers: Beim Bericht eines anderen stehen dessen Name statt
   * „You" und „vs your types" — auf dem Bildschirm, im Ausdruck und in der
   * CSV aus derselben Funktion und mit derselben Bedingung (Audit 11/2026,
   * R3-MONATSBERICHT; vorher galt das nur für die CSV).
   */
  const fremd = who !== currentUser!.id
  const beschrifter: Beschrifter = (k, w) => t(k, w)
  const wort = monatsBeschriftung({ fremd, instruktor: userName(who) }, beschrifter)

  const monthLabel = (m: MonthKey) =>
    // Der Monatsname gehoert zum Berichtstext und bleibt deshalb englisch.
    new Date(m.year, m.month, 1).toLocaleDateString('en', { month: 'long', year: 'numeric' })

  // Inhalt und Name der Datei entstehen in monthlyReport.ts — dort ist
  // geprüft, dass Kopf, Aussage, Einheiten und Spaltennamen stimmen
  // (Audit 11/2026, RPT-01).
  const exportCsv = () => {
    if (!report) return
    const jetzt = now()
    const doc = state.settings.documentHeader
    const csv = monthlyCsv(report, {
      atoName: doc?.atoName ?? '',
      // Absender wie im Kopf der übrigen Berichte — mit derselben
      // Rückfallkennung, statt bei leeren Einstellungen nichts zu nennen.
      zulassung: briefkopfZulassung('', doc),
      instruktor: userName(report.instructorId),
      satzName,
      exportiertAm: jetzt,
      exportiertVon: currentUser!.name,
      fremd,
      beschriftung: beschrifter,
    })
    toast(t('forms:toast.exported'))
    downloadCsv(monthlyCsvName(report, userName(report.instructorId), jetzt), csv)
  }

  if (months.length === 0)
    return <Card className="p-4 text-small text-dim">{t('forms:admin.noMonths')}</Card>

  // lang="en": Der Bericht ist englisch (Namensraum forms), unabhängig von
  // der Oberfläche — Sprachausgabe und Silbentrennung sollen das wissen.
  return (
    <div lang="en" className="space-y-stack">
      <p className="text-small leading-relaxed text-dim">{wort.hinweis}</p>

      {/* Auswahl: Monat und — mit vollem Archivzugriff — der Instruktor */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Beschriftung mit dem Feld verbunden; vorher stand ein loses
            <label> daneben und `w-auto` verlor gegen w-full (UID-17). */}
        <FilterAuswahl
          label={t('forms:admin.month')}
          sichtbar
          symbol={<CalendarRange size={15} aria-hidden />}
          value={picked || (month ? `${month.year}-${month.month}` : '')}
          onChange={setPicked}
        >
          {months.map((m) => (
            <option key={`${m.year}-${m.month}`} value={`${m.year}-${m.month}`}>
              {monthLabel(m)}
            </option>
          ))}
        </FilterAuswahl>
        {mayPickInstructor && (
          <FilterAuswahl
            label={t('forms:admin.instructorPick')}
            sichtbar
            value={instructorId}
            onChange={(v) => { setInstructorId(v); setPicked('') }}
          >
            {instructorOptions.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </FilterAuswahl>
        )}
        <button
          onClick={exportCsv}
          className="ml-auto flex min-h-11 items-center gap-1.5 rounded-xl border border-line/15 px-3 py-2 text-small text-dim transition hover:border-accent/40 hover:text-accent"
        >
          <Download size={15} /> {t('forms:admin.downloadCsv')}
        </button>
      </div>

      {!report || report.own.sessions === 0 ? (
        <Card className="p-4 text-small text-dim">{t('forms:admin.noDataMonth')}</Card>
      ) : (
        <>
          {/* Kalibrierung zuerst — sie ist die Aussage, der Rest ist Beleg. */}
          <Card className="space-y-stack p-4">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              {/* h2: Kopf des Berichts, die Karten darunter sind h3 — als h3 sprang die Gliederung von h1 auf h3 (A11Y-14). */}
              <h2 className="text-lead font-bold">{userName(report.instructorId)}</h2>
              <span className="text-small text-dim">· {monthLabel(report.month)}</span>
              {report.fleets.length > 0 && <span className="text-small text-dim">· {report.fleets.join(', ')}</span>}
              <span className="text-small text-dim">· {satzName(report.competencySet)}</span>
            </div>
            {/* Der Bericht vergleicht nur innerhalb eines Satzes. Die eigenen
                Durchgänge des anderen fielen vorher still heraus (GRD-21). */}
            {report.ausgelassen.sessions > 0 && (
              <p className="flex items-start gap-2 text-small leading-relaxed">
                <Info size={15} className="mt-0.5 shrink-0 text-accent" aria-hidden />
                {t('forms:admin.otherSetOmitted', { count: report.ausgelassen.sessions, name: satzName(report.ausgelassen.set) })}
              </p>
            )}
            <div className="grid gap-2 sm:grid-cols-2">
              {/* Ohne fremde Formulare in der Gruppe vergleicht man sich mit
                  sich selbst — die 0 waere dann keine Aussage, sondern Zufall
                  der Datenlage. Dann lieber den Grund nennen. */}
              <div className="rounded-xl border border-line/10 p-3">
                <p className="mb-1 text-micro uppercase tracking-wide text-dim">{wort.gegenFlotte}</p>
                {report.fleetHasOthers ? (
                  <>
                    <p className={`text-title font-bold tabular-nums ${deltaClass(report.deltaFleet)}`}>{formatDelta(report.deltaFleet)}</p>
                    <FlagBadge flag={report.flagFleet} t={t} />
                  </>
                ) : (
                  <p className="text-micro leading-relaxed text-dim">{wort.nurEigene}</p>
                )}
              </div>
              <div className="rounded-xl border border-line/10 p-3">
                <p className="mb-1 text-micro uppercase tracking-wide text-dim">{t('forms:admin.vsAll')}</p>
                {report.allHasOthers ? (
                  <>
                    <p className={`text-title font-bold tabular-nums ${deltaClass(report.deltaAll)}`}>{formatDelta(report.deltaAll)}</p>
                    <FlagBadge flag={report.flagAll} t={t} />
                  </>
                ) : (
                  <p className="text-micro leading-relaxed text-dim">{wort.nurEigene}</p>
                )}
              </div>
            </div>
            <p className="text-micro leading-relaxed text-dim">{wort.deltaHinweis}</p>
          </Card>

          <Card className="p-4">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <caption className="sr-only">{wort.zahlenTitel}</caption>
                <thead>
                  <tr className="border-b border-line/15 text-micro uppercase tracking-wide text-dim">
                    <td />
                    <th scope="col" className="py-1.5 px-2 text-right font-semibold">{wort.eigen}</th>
                    <th scope="col" className="py-1.5 px-2 text-right font-semibold">{wort.flotte}</th>
                    <th scope="col" className="py-1.5 pl-2 text-right font-semibold">{t('forms:admin.allCol')}</th>
                  </tr>
                </thead>
                <tbody>
            <FigureRow label={t('forms:admin.sessions')} own={String(report.own.sessions)} fleet={String(report.fleet.sessions)} all={String(report.all.sessions)} />
            <FigureRow label={t('forms:admin.traineesGraded')} own={String(report.own.trainees)} fleet={String(report.fleet.trainees)} all={String(report.all.trainees)} />
            <FigureRow label={t('forms:admin.gradesGiven')} own={String(report.own.gradesN)} fleet={String(report.fleet.gradesN)} all={String(report.all.gradesN)} />
            <FigureRow label={t('forms:admin.meanGrade')} own={fmt(report.own.mean)} fleet={fmt(report.fleet.mean)} all={fmt(report.all.mean)} />
            <FigureRow label={t('forms:admin.lowShareLbl')} own={formatPct(report.own.lowShare)} fleet={formatPct(report.fleet.lowShare)} all={formatPct(report.all.lowShare)} />
            <FigureRow label={t('forms:admin.highShareLbl')} own={formatPct(report.own.highShare)} fleet={formatPct(report.fleet.highShare)} all={formatPct(report.all.highShare)} />
            <FigureRow label={t('forms:admin.ncRateLbl')} own={formatPct(report.own.ncRate)} fleet={formatPct(report.fleet.ncRate)} all={formatPct(report.all.ncRate)} />
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="p-4">
            <Distribution dist={report.own.dist} t={t} />
          </Card>

          <Card className="p-4">
            <CompetencyTable lines={report.competencies} t={t} wort={wort} />
          </Card>

          <div className="flex items-start gap-2.5 rounded-xl border border-line/10 bg-surface/60 p-3.5 text-micro text-dim">
            <Info size={15} className="mt-0.5 shrink-0 text-accent" />
            <p>{wort.herkunft}</p>
          </div>
        </>
      )}
    </div>
  )
}
