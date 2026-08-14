import { AlertTriangle, CheckCircle2, Clock, Download, FileDown, FilePen, HelpCircle, Plus, Search, Trash2, XCircle } from 'lucide-react'
import { formatDate, formatDateTime } from '../datum'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge, Button, Card, inputCls, Page, SectionHeading, TopBar } from '../components/ui'
import { downloadCsv } from '../csv'
import { readDrafts } from '../drafts'
import { toast } from '../components/Toast'
import { buildGradingCsv, gradingCsvName, type ExportScope } from '../gradingExport'
import { navigate } from '../router'
import { gradingListComparator } from '../gradingRules'
import { trainingDate } from '../gradingStats'
import { useStore } from '../store'
import { TraineeHistory } from './admin/TraineeHistory'
import { MonthlyReport } from './admin/MonthlyReport'
import { followUpStarted, gradingDayKey, gradingListDate, isComplete, missingFollowUps, traineesOf, trafficLight, type TrafficColor } from '../gradingRules'
import type { GradingRecord } from '../types'

// Weiterreichen, damit die Ansichten weiterhin aus einer Datei importieren
export { followUpStarted, isComplete, missingFollowUps, traineesOf, trafficLight, type TrafficColor }

/** Farbcodierung laut Spez. 5.3: 5/4 grün, 3 dunkelgrün, 2 orange, 1 rot, NO grau.
 *  Kräftige Vollfarben mit weißem/schwarzem Text — in Hell- UND Dunkelmodus lesbar. */
export function gradeColor(g: number | 'NO' | null): string {
  // Textfarbe je Fläche so gewählt, dass jede Note mindestens 4,5:1 erreicht:
  // Weiß auf emerald-600 lag bei 3,77:1 und war zu blass.
  if (g === 'NO' || g === null) return 'bg-line/10 text-dim'
  if (g >= 4) return 'bg-emerald-700 text-white'
  if (g === 3) return 'bg-emerald-800 text-white'
  if (g === 2) return 'bg-amber-500 text-black'
  return 'bg-red-700 text-white'
}

/**
 * Liste nach Schulungstag gruppieren — die Reihenfolge der bereits
 * sortierten Liste bleibt erhalten (jüngster Tag zuerst), es wird nur
 * gebündelt. Map bewahrt die Einfügereihenfolge, deshalb genügt das.
 */
function byDay(list: GradingRecord[]): [string, GradingRecord[]][] {
  const groups = new Map<string, GradingRecord[]>()
  list.forEach((r) => {
    const key = gradingDayKey(r)
    const bucket = groups.get(key)
    if (bucket) bucket.push(r)
    else groups.set(key, [r])
  })
  return [...groups.entries()]
}



/**
 * Ampelsymbol: Form UND Farbe unterscheiden die Zustände.
 *
 * Reine Farbcodierung reicht nicht — im Hellmodus sind das dunkle Orange und
 * das dunkle Rot als kleine Marken kaum auseinanderzuhalten, und für
 * rot-grün-blinde Nutzer (rund 8 % der Männer) gar nicht.
 *
 * Bis zuletzt gab es dafür ZWEI Formensysteme nebeneinander: Kreis, Dreieck
 * und Quadrat als kleine Marke — und Haken, Fragezeichen und Kreuz im
 * Icon-Feld der Formularliste. Dieselbe Ampel, zwei Gestalten, und die
 * Legende über der Liste zeigte die eine, während die Zeilen darunter die
 * andere trugen. Wer die Legende las, konnte sie auf die Liste nicht
 * anwenden.
 *
 * Also eine Gestalt für die ganze App: Haken, Fragezeichen, Kreuz. Sie sind
 * eindeutig unterscheidbar, sagen ihre Bedeutung von selbst (ein Dreieck tut
 * das nicht) und tragen dieselben Ampelfarben wie alles andere — die aus dem
 * Theme, nicht fest verdrahtet.
 */
const TRAFFIC_ICON: Record<TrafficColor, { icon: typeof CheckCircle2; ink: string }> = {
  green: { icon: CheckCircle2, ink: 'text-ok' },
  yellow: { icon: HelpCircle, ink: 'text-wait' },
  red: { icon: XCircle, ink: 'text-bad' },
}

/** `stumm` für Stellen, an denen die Umgebung die Ansage schon trägt. */
export function TrafficIcon({
  color,
  className = '',
  size = 16,
  stumm = false,
}: {
  color: TrafficColor
  className?: string
  size?: number
  stumm?: boolean
}) {
  const { t } = useTranslation()
  const { icon: Icon, ink } = TRAFFIC_ICON[color]
  return (
    <Icon
      size={size}
      // Ohne Rolle verwerfen die meisten Sprachausgaben das Label eines
      // <svg> — der Zustand wäre dann rein visuell codiert.
      role={stumm ? undefined : 'img'}
      aria-hidden={stumm || undefined}
      aria-label={stumm ? undefined : t(`forms:traffic.${color}`)}
      className={`shrink-0 ${ink} ${className}`}
    />
  )
}

/**
 * Ablage-Ansicht des Training Admins: zwei Reiter — abgeschlossene
 * Formulare (mit Zeitraum) und noch zu bearbeitende. Einfach gehaltene
 * Liste mit Filtern (Zeitraum, Student, Aircraft Type, Instruktor),
 * Ansehen, PDF-Download/Druck und endgültigem Löschen.
 */
function TrainingAdminGrading() {
  const { t } = useTranslation()
  const { state, now, currentUser } = useStore()
  const [tab, setTab] = useState<'completed' | 'open' | 'trainees' | 'monthly'>('completed')
  const [period, setPeriod] = useState('all')
  const [fTrainee, setFTrainee] = useState('')
  const [fAircraft, setFAircraft] = useState('')
  const [fInstructor, setFInstructor] = useState('')
  // Suche und Formulartyp-Filter gab es bisher nur im Superadmin-Panel. Wer
  // die Ablage fuehrt, sucht aber genau so: nach einem Namen, den jemand am
  // Telefon nennt, oder nach allen 306 eines Jahres.
  const [query, setQuery] = useState('')
  const [fType, setFType] = useState('')

  const userName = (id: string) => state.users.find((u) => u.id === id)?.name ?? '—'
  const traineeLabel = (tr: { traineeName?: string; traineeId: string }) =>
    tr.traineeName || userName(tr.traineeId) || '—'
  const formTitle = (id: string) => state.settings.grading.formTypes.find((f) => f.id === id)?.title ?? id

  const all = [...state.gradingRecords].sort(gradingListComparator(state.gradingRecords))
  // abgeschlossen = unterschrieben, versendet und ohne offenes Pflicht-Folgeformular
  const isCompleted = (r: GradingRecord) => trafficLight(r, state.gradingRecords) === 'green'

  const PERIODS: Array<{ key: string; days: number | null }> = [
    { key: 'all', days: null },
    { key: 'day', days: 1 },
    { key: 'week', days: 7 },
    { key: 'month', days: 31 },
    { key: 'year', days: 365 },
  ]
  const periodDays = PERIODS.find((x) => x.key === period)?.days ?? null

  // Folgeformulare tragen ihren Piloten in den Kopfdaten — über traineesOf
  // erscheinen sie im Filter, statt unsichtbar zu bleiben.
  const traineeOptions = [...new Set(all.flatMap((r) => traineesOf(r, all).map(traineeLabel)))].filter((n) => n !== '—').sort()
  // Wie bei den Mustern: alle, die Formulare führen dürfen, plus die aus
  // Altdaten — nicht nur die, von denen bereits etwas vorliegt.
  const instructorOptions = [
    ...new Set([
      ...state.users.filter((u) => u.active && u.canGrade).map((u) => u.id),
      ...all.map((r) => r.instructorId),
    ]),
  ]
    .map((id) => ({ id, name: userName(id) }))
    .sort((a, b) => a.name.localeCompare(b.name))
  // Muster kommen aus der zentralen Liste in den Einstellungen, nicht aus den
  // vorhandenen Formularen: eine Flotte ohne abgelegtes Formular ließ sich
  // sonst gar nicht erst auswählen — dabei ist genau das eine Auskunft
  // („für die ATR liegt nichts vor"). Muster aus Altdaten, die nicht mehr in
  // den Einstellungen stehen, werden ergänzt, damit nichts unfilterbar wird.
  const aircraftOptions = [
    ...new Set([...state.settings.aircraftTypes, ...all.map((r) => r.header.aircraftType).filter(Boolean)]),
  ].sort((a, b) => a.localeCompare(b))

  const list = all.filter((r) => {
    if (tab === 'completed' ? !isCompleted(r) : isCompleted(r)) return false
    // Zeitraum über den Schulungstag, nicht den Erfassungszeitpunkt — die
    // gleiche Regel wie in der Statistik (gradingStats.trainingDate): ein
    // nachgetragenes Formular gehört in die Periode, in der geschult wurde.
    if (periodDays && now() - trainingDate(r) > periodDays * 24 * 3600_000) return false
    if (fTrainee && !traineesOf(r, all).some((tr) => traineeLabel(tr) === fTrainee)) return false
    if (fAircraft && r.header.aircraftType !== fAircraft) return false
    if (fInstructor && r.instructorId !== fInstructor) return false
    if (fType && r.formTypeId !== fType) return false
    if (!query) return true
    // Auch die angezeigte Datumsform durchsuchbar machen: gesucht wird nach
    // dem, was in der Zeile steht (04.08.2026), nicht nach dem Rohwert.
    const heu = [
      r.formTypeId,
      formTitle(r.formTypeId),
      userName(r.instructorId),
      ...traineesOf(r, all).map(traineeLabel),
      ...Object.values(r.header),
      formatDate(gradingListDate(r)),
    ]
      .join(' ')
      .toLowerCase()
    return heu.includes(query.toLowerCase())
  })

  const formTypeOptions = [...new Set([...state.settings.grading.formTypes.map((f) => f.id), ...all.map((r) => r.formTypeId)])].sort()
  const filterAktiv = period !== 'all' || !!fTrainee || !!fAircraft || !!fInstructor || !!fType || !!query
  const filterZuruecksetzen = () => {
    setPeriod('all')
    setFTrainee('')
    setFAircraft('')
    setFInstructor('')
    setFType('')
    setQuery('')
  }

  /**
   * Was man sieht, bekommt man.
   *
   * Der Auszug nimmt genau die Zeilen der Liste und schreibt deren Filter in
   * den Dateikopf — dieselbe Funktion wie im Superadmin-Panel
   * (src/gradingExport.ts). Fuer den Training Admin ist das der eigentliche
   * Grund der Rolle: Bisher musste er jedes Blatt einzeln als PDF ziehen,
   * eine Jahresauswertung war Handarbeit. Der Personen-Auszug
   * (Kalibrierung) bleibt aussen vor — er bewertet Instruktoren und gehoert
   * dem Head of Training.
   */
  const exportieren = (scope: ExportScope) => {
    const jetzt = now()
    const csv = buildGradingCsv(scope, {
      records: list,
      alle: all,
      filter: [
        ['Rows', `${list.length} of ${all.length}`],
        ['Tab', t(`forms:ta.${tab === 'completed' ? 'completed' : 'open'}`)],
        ...(period !== 'all' ? ([['Period', t(`forms:ta.period.${period}`)]] as [string, string][]) : []),
        ...(fType ? ([['Form type', fType]] as [string, string][]) : []),
        ...(fTrainee ? ([['Trainee', fTrainee]] as [string, string][]) : []),
        ...(fInstructor ? ([['Instructor', userName(fInstructor)]] as [string, string][]) : []),
        ...(fAircraft ? ([['Aircraft', fAircraft]] as [string, string][]) : []),
        ...(query ? ([['Search', query]] as [string, string][]) : []),
      ],
      exportiertAm: jetzt,
      exportiertVon: currentUser!.name,
      userName,
      traineeLabel,
      traineesOf,
      parentLabel: (r) => {
        const eltern = all.find((x) => x.id === r.parentId)
        return eltern ? `${eltern.formTypeId} · ${formatDate(gradingListDate(eltern))}` : ''
      },
      formatDateTime,
    })
    downloadCsv(gradingCsvName(scope, jetzt), csv)
    toast(t('forms:toast.exported'))
  }

  const selCls = 'rounded-xl border border-field bg-bg/60 px-3 py-2 text-small'
  return (
    <>
      {/* Filterergebnis für Sprachausgaben — die Liste ändert sich sonst lautlos */}
      <p role="status" className="sr-only">{t('forms:admin.resultCount', { shown: list.length, total: all.length })}</p>
      <TopBar title="Grading Tool" back="/" />
      <Page wide className="space-y-stack">
        <p className="rounded-xl border border-line/10 bg-surface/60 p-3.5 text-small text-dim">{t('forms:trainingAdminNote')}</p>

        {/* Reiter: Abgeschlossen / Zu bearbeiten / Verlauf je Pilot.
            Der Verlauf traegt keinen Zaehler — er zaehlt Piloten, nicht
            Formulare, und stuende sonst irrefuehrend neben den beiden. */}
        {/* Raster statt einer Reihe: Vier Reiter nebeneinander liessen am
            Telefon je rund 80 px — „Completed forms" brach dort mitten im
            Wort („Complet/ed"), weil die projektweite Umbruchregel bei
            drohendem Ueberlauf greift. Zwei Spalten geben jedem Reiter die
            Breite, die sein laengstes Wort braucht. */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(['completed', 'open', 'trainees', 'monthly'] as const).map((tb) => (
            <button
              key={tb}
              onClick={() => setTab(tb)}
              aria-pressed={tab === tb}
              className={`min-h-11 rounded-xl border px-3 py-2.5 text-small font-semibold transition ${
                tab === tb ? 'border-accent bg-accent/15 text-ink' : 'border-line/15 text-dim'
              }`}
            >
              {tb === 'trainees' || tb === 'monthly'
                ? t(`forms:admin.${tb}`)
                : `${t(`forms:ta.${tb}`)} (${all.filter((r) => (tb === 'completed' ? isCompleted(r) : !isCompleted(r))).length})`}
            </button>
          ))}
        </div>

        {/* Die Ablage bleibt durchgehend englisch — deshalb feste Sprache. */}
        {tab === 'trainees' && <TraineeHistory records={state.gradingRecords} />}
        {tab === 'monthly' && <MonthlyReport records={state.gradingRecords} />}

        {/* Filter und Formularliste gehoeren zu den beiden Formular-Reitern;
            der Verlauf bringt seine eigene Suche mit. */}
        {tab !== 'trainees' && tab !== 'monthly' && (
        <>
        {/* Filter: Zeitraum, Student, Aircraft Type, Instruktor.
            `aria-label` an jedem Feld: Angesagt wurde sonst nur der aktuelle
            Wert („Alle Muster"), nicht, wofuer er gilt. */}
        {/* Suche zuerst: In der Ablage sucht man nach einem Namen, den
            jemand am Telefon nennt — vorher ging das nur durch Scrollen. */}
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-dim" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('forms:admin.search')}
            aria-label={t('forms:admin.search')}
            className={`${inputCls} pl-9`}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <select value={fType} onChange={(e) => setFType(e.target.value)} aria-label={t('forms:admin.allTypes')} className={selCls}>
            <option value="">{t('forms:admin.allTypes')}</option>
            {formTypeOptions.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
          <select value={period} onChange={(e) => setPeriod(e.target.value)} aria-label={t('forms:ta.periodLabel')} className={selCls}>
            {PERIODS.map((x) => (
              <option key={x.key} value={x.key}>
                {t(`forms:ta.period.${x.key}`)}
              </option>
            ))}
          </select>
          <select value={fTrainee} onChange={(e) => setFTrainee(e.target.value)} aria-label={t('forms:admin.allTrainees')} className={selCls}>
            <option value="">{t('forms:admin.allTrainees')}</option>
            {traineeOptions.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <select value={fAircraft} onChange={(e) => setFAircraft(e.target.value)} aria-label={t('forms:admin.allAircraft')} className={selCls}>
            <option value="">{t('forms:admin.allAircraft')}</option>
            {aircraftOptions.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <select value={fInstructor} onChange={(e) => setFInstructor(e.target.value)} aria-label={t('forms:admin.allInstructors')} className={selCls}>
            <option value="">{t('forms:admin.allInstructors')}</option>
            {instructorOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>

        {/* Der Auszug folgt der Liste — was oben gefiltert ist, steht in der
            Datei, und die Datei sagt im Kopf selbst, welcher Ausschnitt sie
            ist. */}
        <div className="flex flex-wrap items-center gap-2">
          {(['records', 'competencies'] as const).map((sc) => (
            <Button key={sc} variant="ghost" onClick={() => exportieren(sc)} className="flex items-center gap-1.5 text-micro">
              <Download size={13} /> {t(`forms:admin.export_${sc}`)}
            </Button>
          ))}
          <span className="text-micro text-dim">{t('forms:admin.exportListHint', { count: list.length })}</span>
        </div>

        {/* „No forms yet" erschien auch dann, wenn nur die Filter alles
            verdeckten — bei einer Ablage mit Aufbewahrungspflicht ein echter
            Schreck. Jetzt sagt der Text, was los ist, und bietet den Weg
            zurueck an. */}
        {list.length === 0 &&
          (filterAktiv ? (
            <div className="space-y-stack pt-6 text-center">
              <p className="text-body text-dim">{t('forms:noMatch')}</p>
              <button
                onClick={filterZuruecksetzen}
                className="min-h-11 rounded-xl border border-line/15 px-4 text-small transition hover:border-accent/50 hover:text-accent"
              >
                {t('forms:showAll')}
              </button>
            </div>
          ) : (
            <p className="pt-6 text-center text-body text-dim">{t('forms:empty')}</p>
          ))}

        {/* Kompakte Liste, nach Schulungstag gebuendelt — juengster Tag
            zuerst, wie in der Instruktorenansicht. In der Ablage stehen
            Blaetter mehrerer Piloten desselben Durchgangs untereinander und
            sahen ohne Grenze gleich aus; wo ein Tag endete, war nicht zu
            sehen. Das Datum steht deshalb EINMAL ueber der Gruppe statt in
            jeder Zeile — dort stand es ueberdies als Anlagedatum, waehrend
            sortiert und gefiltert wird nach dem Schulungstag (#51). Die
            Filter darueber bleiben unveraendert und greifen weiterhin
            zuerst; gebuendelt wird nur, was sie uebrig lassen. */}
        {byDay(list).map(([tag, blaetter]) => (
        <div key={tag} className="space-y-tight">
        <SectionHeading sticky>{formatDate(gradingListDate(blaetter[0]))}</SectionHeading>
        <div className="divide-y divide-line/[0.06] overflow-hidden rounded-xl border border-line/10 bg-surface/60">
          {blaetter.map((r) => (
            /* Card statt `div role="button"`: In einer Knopf-Zeile mit einem
               weiteren Knopf darin (PDF) zieht Vorlesesoftware den ganzen
               Zeileninhalt zum Namen des aeusseren Knopfes zusammen, und der
               innere verschwindet aus dem Baum. `Card` loest das ueber einen
               ausgedehnten Link (siehe ui.tsx). */
            <Card
              key={r.id}
              onClick={() => navigate(`/grading/${r.id}`)}
              label={`${r.formTypeId} · ${traineesOf(r, all).map(traineeLabel).join(', ') || t('forms:openForm')} · ${formatDate(gradingListDate(r))}`}
              className="flex items-center gap-3 rounded-none border-0 bg-transparent px-3 py-2.5 shadow-none transition hover:bg-line/5"
            >
              <TrafficIcon color={trafficLight(r, state.gradingRecords)} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-small font-semibold">
                  {r.formTypeId} · {formTitle(r.formTypeId)}
                </p>
                <p className="flex flex-wrap items-baseline gap-x-1.5 text-micro text-dim">
                  <span className="min-w-0 max-w-full truncate">
                    {traineesOf(r, all).map(traineeLabel).join(', ') || t('forms:noTrainee')}
                  </span>
                  <span className="shrink-0">· {userName(r.instructorId)}</span>
                  <span className="shrink-0">· {r.header.aircraftType || '—'}</span>
                </p>
              </div>
              {/* PDF-Download/Druck (öffnet die Ein-Seiten-Druckansicht) */}
              {r.status === 'signed' && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    navigate(`/grading/${r.id}?print=1`)
                  }}
                  title={t('forms:downloadPdf')}
                  aria-label={t('forms:downloadPdf')}
                  className="relative z-10 flex h-11 w-11 items-center justify-center rounded-lg text-dim transition hover:bg-accent/10 hover:text-accent"
                >
                  <FileDown size={16} />
                </button>
              )}
              {/* Kein Löschen: die Ablage des Training Admins ist nur-lesend.
                  Ausbuchen eines Ausbildungsnachweises bleibt dem Superadmin
                  im Admin-Panel vorbehalten (ORA.GEN.220 Aufbewahrung). */}
            </Card>
          ))}
        </div>
        </div>
        ))}
        </>
        )}
      </Page>
    </>
  )
}

export function Grading() {
  // Das Grading-Modul ist immer vollständig englisch
  const { t } = useTranslation()
  const { state, currentUser, visibleGradingRecords, hideGradingRecord, can } = useStore()
  const [drafts, setDrafts] = useState(() => readDrafts(currentUser!.id))

  const formTitle = (id: string) => state.settings.grading.formTypes.find((f) => f.id === id)?.title ?? id
  const traineeLabel = (tr: { traineeName?: string; traineeId: string }) =>
    tr.traineeName || state.users.find((u) => u.id === tr.traineeId)?.name || '—'
  const mayGrade = can('grading_create')
  // nur-lesender Zugriff (Training Admin bzw. per Matrix eingeschränkt)
  const isTrainingAdmin = !mayGrade && can('grading_view_all')

  const isMember = currentUser!.role === 'member'
  // Filter über die Ampel-Legende (antippen zum Filtern)
  const [trafficFilter, setTrafficFilter] = useState<TrafficColor | ''>('')
  // Verlauf je Pilot: nur mit vollem Archivzugriff sinnvoll — die
  // Instruktorenliste reicht wegen der Wochenfrist nicht über einen Kurs.
  const maySeeHistory = can('grading_view_all')
  /**
   * Reiter dieser Ansicht.
   *
   * Der Verlauf je Pilot braucht den vollen Archivzugriff, sonst zeigte er
   * bloß Lücken. Der Monatsbericht dagegen wertet die EIGENEN Bewertungen
   * aus — er gehört jedem, der bewertet. Er hatte dafür eine eigene Kachel
   * auf der Startseite; die ist entfallen, und damit muss er hier
   * erreichbar sein, sonst käme ein Member gar nicht mehr an seine eigene
   * Monatsauswertung.
   */
  const views = ['records', ...(maySeeHistory ? (['trainees'] as const) : []), ...(mayGrade || maySeeHistory ? (['monthly'] as const) : [])] as const
  const [adminView, setAdminView] = useState<'records' | 'trainees' | 'monthly'>('records')
  const list = visibleGradingRecords.filter((r) => !trafficFilter || trafficLight(r, state.gradingRecords) === trafficFilter)
  const filterAnsage = (
    <p role="status" className="sr-only">
      {t('forms:admin.resultCount', { shown: list.length, total: visibleGradingRecords.length })}
    </p>
  )

  // Training Admin: eigene Ablage-Ansicht mit zwei Reitern und Filtern
  if (isTrainingAdmin) return <TrainingAdminGrading />

  return (
    <>
      {filterAnsage}
      {/* Modulname bleibt in beiden Sprachen Englisch */}
      <TopBar
        title="Grading Tool"
        back="/"
        right={
          mayGrade ? (
            <button
              onClick={() => navigate('/grading/new')}
              className="min-h-11 flex items-center gap-1 rounded-full bg-accent px-3 py-1.5 text-small font-semibold text-bg hover:brightness-110"
            >
              <Plus size={15} /> {t('forms:newForm')}
            </button>
          ) : undefined
        }
      />
      <Page className="space-y-stack">
        {!mayGrade && !isTrainingAdmin && <p className="rounded-xl border border-line/10 bg-surface/60 p-3.5 text-small text-dim">{t('forms:noPermission')}</p>}
        {/* Training Admin: reiner Lese-/Download-Zugriff auf alle Formulare */}
        {isTrainingAdmin && <p className="rounded-xl border border-line/10 bg-surface/60 p-3.5 text-small text-dim">{t('forms:trainingAdminNote')}</p>}

        {/* Umschalter Formulare / Verlauf je Pilot — nur mit vollem
            Archivzugriff, sonst zeigte der Verlauf bloß Lücken. */}
        {views.length > 1 && (
          <div className={`grid grid-cols-2 gap-2 ${views.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
            {views.map((v) => (
              <button
                key={v}
                onClick={() => setAdminView(v)}
                aria-pressed={adminView === v}
                className={`min-h-11 rounded-xl border px-3 py-2.5 text-small font-semibold transition ${
                  adminView === v ? 'border-accent bg-accent/15 text-ink' : 'border-line/15 text-dim'
                }`}
              >
                {t(`forms:admin.${v}`)}
              </button>
            ))}
          </div>
        )}

        {maySeeHistory && adminView === 'trainees' && <TraineeHistory records={state.gradingRecords} />}
        {adminView === 'monthly' && (
          <>
            <p className="rounded-xl border border-line/10 bg-surface/60 p-3.5 text-small text-dim">{t('forms:admin.monthlyIntro')}</p>
            <MonthlyReport records={state.gradingRecords} />
          </>
        )}

        {adminView === 'records' && (
        <>
        {/* Angefangene Entwuerfe zuoberst: Sie lagen unsichtbar im Speicher,
            und nach einem Neuladen begann eine halbe Stunde Bewertung von
            vorn. Der Fortschritt steht dabei, damit man weiss, was einen
            erwartet. */}
        {drafts.map((d) => (
          <Card key={d.key} className="flex items-center gap-3 border-accent/30 p-4">
            <FilePen size={18} className="shrink-0 text-accent" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-body font-semibold">
                {t('forms:draftOpen')} · {d.formTypeId}
                {d.wer ? ` · ${d.wer}` : ''}
              </p>
              {d.gesamt > 0 && (
                <p className="text-micro text-dim">{t('forms:gradedOf', { done: d.noten, total: d.gesamt })}</p>
              )}
            </div>
            <button
              onClick={() => navigate(`/grading/new?type=${d.formTypeId}`)}
              className="min-h-11 shrink-0 rounded-xl border border-accent/40 px-3 text-small font-semibold text-accent transition hover:bg-accent/10"
            >
              {t('forms:draftContinue')}
            </button>
            <button
              onClick={() => {
                if (!window.confirm(t('forms:draftDiscardConfirm'))) return
                localStorage.removeItem(d.key)
                setDrafts(readDrafts(currentUser!.id))
              }}
              aria-label={t('forms:draftDiscard')}
              title={t('forms:draftDiscard')}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-dim transition hover:bg-danger/10 hover:text-danger"
            >
              <Trash2 size={16} />
            </button>
          </Card>
        ))}

        {/* Ampel-Legende — antippen filtert die Liste. Mobil sauber
            untereinander, ab Tablet als symmetrisches 2×2-Raster. */}
        <div role="group" aria-label={t('forms:traffic.all')} className="flex flex-col gap-0.5 rounded-xl border border-line/10 bg-surface/60 p-1.5 text-micro text-dim sm:grid sm:grid-cols-2 sm:gap-1">
          <button
            onClick={() => setTrafficFilter('')}
            aria-pressed={trafficFilter === ''}
            className={`min-h-11 flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left transition ${
              trafficFilter === '' ? 'bg-accent/15 font-semibold text-ink' : 'hover:bg-line/5'
            }`}
          >
            <span className="inline-block h-3 w-3 shrink-0 rounded-full border-2 border-line/40" />
            {t('forms:traffic.all')}
          </button>
          {(['green', 'yellow', 'red'] as TrafficColor[]).map((c) => (
            <button
              key={c}
              onClick={() => setTrafficFilter(trafficFilter === c ? '' : c)}
              aria-pressed={trafficFilter === c}
              className={`min-h-11 flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left transition ${
                trafficFilter === c ? 'bg-accent/15 font-semibold text-ink' : 'hover:bg-line/5'
              }`}
            >
              <TrafficIcon color={c} stumm />
              {t(`forms:traffic.${c}`)}
            </button>
          ))}
        </div>

        {/* Aufbewahrung in der Instruktoren-Ansicht: 1 Woche */}
        {isMember && <p className="px-1 text-micro leading-relaxed text-dim">{t('forms:retentionHint')}</p>}

        {list.length === 0 &&
          (trafficFilter ? (
            <div className="space-y-stack pt-6 text-center">
              <p className="text-body text-dim">{t('forms:noMatch')}</p>
              <button
                onClick={() => setTrafficFilter('')}
                className="min-h-11 rounded-xl border border-line/15 px-4 text-small transition hover:border-accent/50 hover:text-accent"
              >
                {t('forms:showAll')}
              </button>
            </div>
          ) : (
            <p className="pt-6 text-center text-body text-dim">{t('forms:empty')}</p>
          ))}

        {/* Nach Schulungstag gruppiert, jüngster Tag zuerst. Die Liste war
            zwar schon so sortiert, aber ohne sichtbare Grenze: Bei einem
            Durchgang mit mehreren Piloten standen vier gleich aussehende
            Zeilen untereinander, und wo ein Tag endete, war nicht zu sehen.
            Das Datum steht jetzt EINMAL über der Gruppe statt in jeder
            Zeile — in der Zeile stand es überdies als Anlagedatum, während
            sortiert wurde nach dem Schulungstag (#51). */}
        {byDay(list).map(([tag, blaetter]) => (
          <div key={tag} className="space-y-stack">
            <SectionHeading sticky>{formatDate(gradingListDate(blaetter[0]))}</SectionHeading>
            {/* Bewusst KEIN zweispaltiges Raster: Die Liste ist nach Tagen
                gegliedert, und ein Tag traegt meist ein einziges Blatt. Zwei
                Spalten liessen dann neben jeder Zeile eine leere Haelfte —
                die Breite waere wieder aufgespannt statt genutzt. */}
            {blaetter.map((r) => {
          const notCompetent = r.trainees.some((tr) => tr.overall === 'not_competent')
          const missing = missingFollowUps(r, state.gradingRecords)
          const light = trafficLight(r, state.gradingRecords)
          return (
            <Card
              key={r.id}
              onClick={() => navigate(`/grading/${r.id}`)}
              label={`${r.formTypeId} · ${traineesOf(r, state.gradingRecords).map((tr) => tr.traineeName).filter(Boolean).join(', ') || t('forms:openForm')} · ${formatDate(r.header.date || r.createdAt)}`}
              className="p-4"
            >
              <div className="flex items-start gap-3">
                {/* Die Ampel dieser Zeile — und zwar nur hier.
                    Bis zuletzt stand sie zweimal in derselben Zeile: links
                    dieses Icon-Feld, rechts neben den Knoepfen noch einmal
                    derselbe Wert als TrafficIcon. Zwei Anzeigen fuer eine
                    Aussage kosten Blickwege und lassen offen, ob sie
                    dasselbe meinen. Das Icon-Feld bleibt, weil es die
                    Ampel zusaetzlich in der Form codiert (Haken, Fragezeichen,
                    Kreuz) — die Farbe allein traegt sie nicht.
                    Die Ansage haengt jetzt hier, wo vorher der Punkt sie trug. */}
                <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-raised">
                  <TrafficIcon color={light} size={22} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-lead font-semibold leading-snug">
                    {r.formTypeId} · {formTitle(r.formTypeId)}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5 text-small text-dim">
                    <span className="min-w-0 max-w-full truncate">
                      {traineesOf(r, state.gradingRecords).map(traineeLabel).join(', ') || t('forms:noTrainee')}
                    </span>
                    {/* schrumpfbar: ein langer Mustername drängte sonst den
                        Pilotennamen vollständig aus der Zeile */}
                    <span className="min-w-0 max-w-[40%] shrink truncate">· {r.header.aircraftType}</span>
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {r.status === 'signed' ? (
                      <Badge tone="dim">
                        <CheckCircle2 size={11} className="mr-1" /> {t('forms:status.signed')}
                      </Badge>
                    ) : r.status === 'awaiting_signature' ? (
                      <Badge tone="wait">
                        <Clock size={11} className="mr-1" /> {t('forms:status.awaiting_signature')}
                      </Badge>
                    ) : (
                      <Badge tone="dim">{t('forms:status.draft')}</Badge>
                    )}
                    {notCompetent && <Badge tone="bad">{t('forms:notCompetent')}</Badge>}
                    {r.mailStatus === 'failed' && (
                      <Badge tone="bad">
                        <AlertTriangle size={11} className="mr-1" /> {t('forms:mail.failed')}
                      </Badge>
                    )}
                    {/* Pflicht-Folgeformular noch nicht ausgefüllt */}
                    {missing.map((id) => (
                      <Badge key={id} tone="wait" strong>
                        <AlertTriangle size={11} className="mr-1" />{' '}
                        {/* Angelegt, aber unsigniert: dann fehlt nur noch die
                            Unterschrift — das ist etwas anderes als „gar nicht da". */}
                        {followUpStarted(r, state.gradingRecords, id)
                          ? t('forms:unsignedForm', { id })
                          : t('forms:missingForm', { id })}
                      </Badge>
                    ))}
                    {r.parentId && <Badge tone="dim">{t('forms:linked')}</Badge>}
                  </div>
                </div>
                {/* Aktionen in EINER Reihe */}
                <div className="pointer-events-auto relative z-10 mt-0.5 flex shrink-0 items-center gap-1">
                  {/* Komplett ausgefüllte Formulare als PDF herunterladen —
                      öffnet die Ein-Seiten-Druckansicht mit PDF-Dialog */}
                  {r.status === 'signed' && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        navigate(`/grading/${r.id}?print=1`)
                      }}
                      title={t('forms:downloadPdf')}
                      className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-lg text-dim transition hover:bg-accent/10 hover:text-accent"
                    >
                      <FileDown size={16} />
                    </button>
                  )}
                  {/* Aus der eigenen Listenansicht entfernen — gilt nur für den
                      aktuellen Nutzer, im Admin-Panel bleibt alles erhalten.
                      Training Admin ist nur-lesend und hat keinen Mülleimer.
                      Unfertiges lässt sich nicht ausblenden: eine offene
                      Pflicht darf nicht aus der Sicht verschwinden, die sie
                      anmahnen soll (der Store weigert sich zusätzlich). */}
                  {!isTrainingAdmin && trafficLight(r, state.gradingRecords) === 'green' && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      if (window.confirm(t('forms:deleteOwnConfirm'))) hideGradingRecord(r.id)
                    }}
                    title={t('forms:deleteOwn')}
                    className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-lg text-dim transition hover:bg-danger/10 hover:text-danger"
                  >
                    <Trash2 size={16} />
                  </button>
                  )}
                </div>
              </div>
            </Card>
          )
            })}
          </div>
        ))}
        </>
        )}
      </Page>
    </>
  )
}
