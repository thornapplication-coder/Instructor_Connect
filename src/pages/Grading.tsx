import { AlertTriangle, CheckCircle2, Clock, FileDown, HelpCircle, Plus, Trash2, XCircle } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge, Card, Page, TopBar } from '../components/ui'
import { navigate } from '../router'
import { gradingListComparator } from '../gradingRules'
import { trainingDate } from '../gradingStats'
import { useStore } from '../store'
import { TraineeHistory } from './admin/TraineeHistory'
import { followUpStarted, isComplete, missingFollowUps, traineesOf, trafficLight, type TrafficColor } from '../gradingRules'
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

/* Einheitliches Datumsformat DD.MM.YYYY für das gesamte Grading-Modul */
export function formatDate(input: number | string): string {
  const d = typeof input === 'number' ? new Date(input) : new Date(`${input}T00:00:00`)
  if (Number.isNaN(d.getTime())) return String(input)
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`
}

export function formatDateTime(ts: number): string {
  const d = new Date(ts)
  return `${formatDate(ts)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/**
 * Ampelsymbole: Form UND Farbe unterscheiden die Zustände.
 *
 * Reine Farbcodierung reichte nicht — im Hellmodus waren das dunkle Orange
 * und das dunkle Rot als kleine Punkte kaum auseinanderzuhalten, und für
 * rot-grün-blinde Nutzer (rund 8 % der Männer) gar nicht. Kreis, Dreieck und
 * Quadrat sind auch bei 12 px eindeutig, unabhängig von der Farbwahrnehmung.
 *
 * Die Füllungen sind bewusst kräftig; den geforderten Kontrast gegen den
 * Hintergrund liefert die dunkle Kontur, nicht die Fläche.
 */
const TRAFFIC_SHAPE: Record<TrafficColor, { fill: string; edge: string; path: JSX.Element; label: string }> = {
  green: { fill: '#10B981', edge: '#065F46', path: <circle cx="8" cy="8" r="6.1" />, label: 'ok' },
  yellow: { fill: '#F59E0B', edge: '#7C2D12', path: <path d="M8 1.5 L14.7 13.6 H1.3 Z" strokeLinejoin="round" />, label: 'open' },
  red: { fill: '#DC2626', edge: '#7F1D1D', path: <rect x="2" y="2" width="12" height="12" rx="1.8" />, label: 'failed' },
}

export function TrafficDot({ color, className = '', size = 13 }: { color: TrafficColor; className?: string; size?: number }) {
  const s = TRAFFIC_SHAPE[color]
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      role="img"
      aria-label={s.label}
      className={`shrink-0 ${className}`}
      fill={s.fill}
      stroke={s.edge}
      strokeWidth="1.5"
    >
      {s.path}
    </svg>
  )
}

/**
 * Ablage-Ansicht des Training Admins: zwei Reiter — abgeschlossene
 * Formulare (mit Zeitraum) und noch zu bearbeitende. Einfach gehaltene
 * Liste mit Filtern (Zeitraum, Student, Aircraft Type, Instruktor),
 * Ansehen, PDF-Download/Druck und endgültigem Löschen.
 */
function TrainingAdminGrading() {
  const { i18n } = useTranslation()
  const t = i18n.getFixedT('en')
  const { state, now } = useStore()
  const [tab, setTab] = useState<'completed' | 'open' | 'trainees'>('completed')
  const [period, setPeriod] = useState('all')
  const [fTrainee, setFTrainee] = useState('')
  const [fAircraft, setFAircraft] = useState('')
  const [fInstructor, setFInstructor] = useState('')

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
    return true
  })

  const selCls = 'rounded-xl border border-line/10 bg-bg/60 px-3 py-2 text-[13px]'
  return (
    <>
      {/* Filterergebnis für Sprachausgaben — die Liste ändert sich sonst lautlos */}
      <p role="status" className="sr-only">{t('grading.admin.resultCount', { shown: list.length, total: all.length })}</p>
      <TopBar title="Grading Tool" back="/" />
      <Page wide className="space-y-3">
        <p className="rounded-xl border border-line/10 bg-surface/60 p-3.5 text-[13px] text-dim">{t('grading.trainingAdminNote')}</p>

        {/* Reiter: Abgeschlossen / Zu bearbeiten / Verlauf je Pilot.
            Der Verlauf traegt keinen Zaehler — er zaehlt Piloten, nicht
            Formulare, und stuende sonst irrefuehrend neben den beiden. */}
        <div className="flex gap-2">
          {(['completed', 'open', 'trainees'] as const).map((tb) => (
            <button
              key={tb}
              onClick={() => setTab(tb)}
              className={`min-h-11 flex-1 rounded-xl border px-3 py-2.5 text-[13.5px] font-semibold transition ${
                tab === tb ? 'border-accent bg-accent/15 text-accent' : 'border-line/15 text-dim'
              }`}
            >
              {tb === 'trainees'
                ? t('grading.admin.trainees')
                : `${t(`grading.ta.${tb}`)} (${all.filter((r) => (tb === 'completed' ? isCompleted(r) : !isCompleted(r))).length})`}
            </button>
          ))}
        </div>

        {/* Die Ablage bleibt durchgehend englisch — deshalb feste Sprache. */}
        {tab === 'trainees' && <TraineeHistory records={state.gradingRecords} lng="en" />}

        {/* Filter und Formularliste gehoeren zu den beiden Formular-Reitern;
            der Verlauf bringt seine eigene Suche mit. */}
        {tab !== 'trainees' && (
        <>
        {/* Filter: Zeitraum, Student, Aircraft Type, Instruktor */}
        <div className="flex flex-wrap gap-2">
          <select value={period} onChange={(e) => setPeriod(e.target.value)} className={selCls}>
            {PERIODS.map((x) => (
              <option key={x.key} value={x.key}>
                {t(`grading.ta.period.${x.key}`)}
              </option>
            ))}
          </select>
          <select value={fTrainee} onChange={(e) => setFTrainee(e.target.value)} className={selCls}>
            <option value="">{t('grading.admin.allTrainees')}</option>
            {traineeOptions.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <select value={fAircraft} onChange={(e) => setFAircraft(e.target.value)} className={selCls}>
            <option value="">{t('grading.admin.allAircraft')}</option>
            {aircraftOptions.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <select value={fInstructor} onChange={(e) => setFInstructor(e.target.value)} className={selCls}>
            <option value="">{t('grading.admin.allInstructors')}</option>
            {instructorOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>

        {list.length === 0 && <p className="pt-6 text-center text-sm text-dim">{t('grading.empty')}</p>}

        {/* Einfache, kompakte Liste */}
        <div className="divide-y divide-line/[0.06] overflow-hidden rounded-xl border border-line/10 bg-surface/60">
          {list.map((r) => (
            <div
              key={r.id}
              onClick={() => navigate(`/grading/${r.id}`)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  navigate(`/grading/${r.id}`)
                }
              }}
              className="flex cursor-pointer items-center gap-3 px-3 py-2.5 transition hover:bg-line/5"
            >
              <TrafficDot color={trafficLight(r, state.gradingRecords)} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-semibold">
                  {r.formTypeId} · {formTitle(r.formTypeId)}
                </p>
                <p className="flex flex-wrap items-baseline gap-x-1.5 text-[12px] text-dim">
                  <span className="min-w-0 max-w-full truncate">
                    {traineesOf(r, all).map(traineeLabel).join(', ') || t('grading.noTrainee')}
                  </span>
                  <span className="shrink-0">· {userName(r.instructorId)}</span>
                  <span className="shrink-0">· {r.header.aircraftType || '—'}</span>
                  <span className="shrink-0">· {formatDate(r.createdAt)}</span>
                </p>
              </div>
              {/* PDF-Download/Druck (öffnet die Ein-Seiten-Druckansicht) */}
              {r.status === 'signed' && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    navigate(`/grading/${r.id}?print=1`)
                  }}
                  title={t('grading.downloadPdf')}
                  className="flex h-11 w-11 items-center justify-center rounded-lg text-dim transition hover:bg-accent/10 hover:text-accent"
                >
                  <FileDown size={16} />
                </button>
              )}
              {/* Kein Löschen: die Ablage des Training Admins ist nur-lesend.
                  Ausbuchen eines Ausbildungsnachweises bleibt dem Superadmin
                  im Admin-Panel vorbehalten (ORA.GEN.220 Aufbewahrung). */}
            </div>
          ))}
        </div>
        </>
        )}
      </Page>
    </>
  )
}

export function Grading() {
  // Das Grading-Modul ist immer vollständig englisch
  const { i18n } = useTranslation()
  const t = i18n.getFixedT('en')
  const { state, currentUser, visibleGradingRecords, hideGradingRecord, can } = useStore()

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
  const [showHistory, setShowHistory] = useState(false)
  const list = visibleGradingRecords.filter((r) => !trafficFilter || trafficLight(r, state.gradingRecords) === trafficFilter)
  const filterAnsage = (
    <p role="status" className="sr-only">
      {t('grading.admin.resultCount', { shown: list.length, total: visibleGradingRecords.length })}
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
              className="min-h-11 flex items-center gap-1 rounded-full bg-accent px-3 py-1.5 text-[13px] font-semibold text-bg hover:brightness-110"
            >
              <Plus size={15} /> {t('grading.newForm')}
            </button>
          ) : undefined
        }
      />
      <Page className="space-y-3">
        {!mayGrade && !isTrainingAdmin && <p className="rounded-xl border border-line/10 bg-surface/60 p-3.5 text-[13px] text-dim">{t('grading.noPermission')}</p>}
        {/* Training Admin: reiner Lese-/Download-Zugriff auf alle Formulare */}
        {isTrainingAdmin && <p className="rounded-xl border border-line/10 bg-surface/60 p-3.5 text-[13px] text-dim">{t('grading.trainingAdminNote')}</p>}

        {/* Umschalter Formulare / Verlauf je Pilot — nur mit vollem
            Archivzugriff, sonst zeigte der Verlauf bloß Lücken. */}
        {maySeeHistory && (
          <div className="flex gap-2">
            {[false, true].map((v) => (
              <button
                key={String(v)}
                onClick={() => setShowHistory(v)}
                aria-pressed={showHistory === v}
                className={`min-h-11 flex-1 rounded-xl border px-3 py-2.5 text-[13.5px] font-semibold transition ${
                  showHistory === v ? 'border-accent bg-accent/15 text-accent' : 'border-line/15 text-dim'
                }`}
              >
                {v ? t('grading.admin.trainees') : t('grading.admin.records')}
              </button>
            ))}
          </div>
        )}

        {maySeeHistory && showHistory && <TraineeHistory records={state.gradingRecords} />}

        {!showHistory && (
        <>
        {/* Ampel-Legende — antippen filtert die Liste. Mobil sauber
            untereinander, ab Tablet als symmetrisches 2×2-Raster. */}
        <div className="flex flex-col gap-0.5 rounded-xl border border-line/10 bg-surface/60 p-1.5 text-[12px] text-dim sm:grid sm:grid-cols-2 sm:gap-1">
          <button
            onClick={() => setTrafficFilter('')}
            className={`min-h-11 flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left transition ${
              trafficFilter === '' ? 'bg-accent/15 font-semibold text-accent' : 'hover:bg-line/5'
            }`}
          >
            <span className="inline-block h-3 w-3 shrink-0 rounded-full border-2 border-line/40" />
            {t('grading.traffic.all')}
          </button>
          {(['green', 'yellow', 'red'] as TrafficColor[]).map((c) => (
            <button
              key={c}
              onClick={() => setTrafficFilter(trafficFilter === c ? '' : c)}
              className={`min-h-11 flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left transition ${
                trafficFilter === c ? 'bg-accent/15 font-semibold text-accent' : 'hover:bg-line/5'
              }`}
            >
              <TrafficDot color={c} />
              {t(`grading.traffic.${c}`)}
            </button>
          ))}
        </div>

        {/* Aufbewahrung in der Instruktoren-Ansicht: 1 Woche */}
        {isMember && <p className="px-1 text-[11.5px] leading-relaxed text-dim">{t('grading.retentionHint')}</p>}

        {list.length === 0 && <p className="pt-6 text-center text-sm text-dim">{t('grading.empty')}</p>}

        {list.map((r) => {
          const notCompetent = r.trainees.some((tr) => tr.overall === 'not_competent')
          const missing = missingFollowUps(r, state.gradingRecords)
          const light = trafficLight(r, state.gradingRecords)
          return (
            <Card key={r.id} onClick={() => navigate(`/grading/${r.id}`)} className="p-4">
              <div className="flex items-start gap-3">
                {/* Status-Icon spiegelt die Ampel: grün ✓, gelb ?, rot ✕ */}
                <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-raised">
                  {light === 'green' ? (
                    <CheckCircle2 size={22} className="text-ok" />
                  ) : light === 'red' ? (
                    <XCircle size={22} className="text-bad" />
                  ) : (
                    <HelpCircle size={22} className="text-wait" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold leading-snug">
                    {r.formTypeId} · {formTitle(r.formTypeId)}
                  </p>
                  {/* Datum steht abgesetzt: es unterscheidet zwei Formulare
                      desselben Piloten und wurde vom Abschneiden verschluckt. */}
                  <p className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5 text-[13px] text-dim">
                    <span className="min-w-0 max-w-full truncate">
                      {traineesOf(r, state.gradingRecords).map(traineeLabel).join(', ') || t('grading.noTrainee')}
                    </span>
                    {/* schrumpfbar: ein langer Mustername drängte sonst den
                        Pilotennamen vollständig aus der Zeile */}
                    <span className="min-w-0 max-w-[40%] shrink truncate">· {r.header.aircraftType}</span>
                    <span className="shrink-0">· {formatDate(r.createdAt)}</span>
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {r.status === 'signed' ? (
                      <Badge tone="dim">
                        <CheckCircle2 size={11} className="mr-1" /> {t('grading.status.signed')}
                      </Badge>
                    ) : r.status === 'awaiting_signature' ? (
                      <Badge tone="warm">
                        <Clock size={11} className="mr-1" /> {t('grading.status.awaiting_signature')}
                      </Badge>
                    ) : (
                      <Badge tone="dim">{t('grading.status.draft')}</Badge>
                    )}
                    {notCompetent && <Badge tone="warm">{t('grading.notCompetent')}</Badge>}
                    {r.mailStatus === 'failed' && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-danger/15 px-2.5 py-0.5 text-[11px] font-medium text-danger">
                        <AlertTriangle size={11} /> {t('grading.mail.failed')}
                      </span>
                    )}
                    {/* Pflicht-Folgeformular noch nicht ausgefüllt */}
                    {missing.map((id) => (
                      <span key={id} className="inline-flex items-center gap-1 rounded-full bg-wait px-2.5 py-0.5 text-[11px] font-semibold text-waitInk">
                        <AlertTriangle size={11} />{' '}
                        {/* Angelegt, aber unsigniert: dann fehlt nur noch die
                            Unterschrift — das ist etwas anderes als „gar nicht da". */}
                        {followUpStarted(r, state.gradingRecords, id)
                          ? t('grading.unsignedForm', { id })
                          : t('grading.missingForm', { id })}
                      </span>
                    ))}
                    {r.parentId && <Badge tone="dim">{t('grading.linked')}</Badge>}
                  </div>
                </div>
                {/* Ampel + Aktionen in EINER Reihe */}
                <div className="mt-0.5 flex shrink-0 items-center gap-1">
                  <TrafficDot color={light} className="mr-1" />
                  {/* Komplett ausgefüllte Formulare als PDF herunterladen —
                      öffnet die Ein-Seiten-Druckansicht mit PDF-Dialog */}
                  {r.status === 'signed' && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        navigate(`/grading/${r.id}?print=1`)
                      }}
                      title={t('grading.downloadPdf')}
                      className="flex h-11 w-11 items-center justify-center rounded-lg text-dim transition hover:bg-accent/10 hover:text-accent"
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
                      if (window.confirm(t('grading.deleteOwnConfirm'))) hideGradingRecord(r.id)
                    }}
                    title={t('grading.deleteOwn')}
                    className="flex h-11 w-11 items-center justify-center rounded-lg text-dim transition hover:bg-danger/10 hover:text-danger"
                  >
                    <Trash2 size={16} />
                  </button>
                  )}
                </div>
              </div>
            </Card>
          )
        })}
        </>
        )}
      </Page>
    </>
  )
}
