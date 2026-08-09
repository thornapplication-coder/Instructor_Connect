import { AlertTriangle, CheckCircle2, Clock, FileText, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { GradingIcon } from '../components/GradingIcon'
import { Badge, Card, Page, TopBar } from '../components/ui'
import { navigate } from '../router'
import { useStore } from '../store'
import type { GradingRecord } from '../types'

/** Farbcodierung laut Spez. 5.3: 5/4 grün, 3 dunkelgrün, 2 orange, 1 rot, NO grau.
 *  Kräftige Vollfarben mit weißem/schwarzem Text — in Hell- UND Dunkelmodus lesbar. */
export function gradeColor(g: number | 'NO' | null): string {
  if (g === 'NO' || g === null) return 'bg-line/10 text-dim'
  if (g >= 4) return 'bg-emerald-600 text-white'
  if (g === 3) return 'bg-emerald-800 text-white'
  if (g === 2) return 'bg-amber-500 text-black'
  return 'bg-red-600 text-white'
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
 * Pflicht-Folgeformulare, die zu diesem Formular noch fehlen:
 * Not Competent ⇒ 306 (Additional Training) ist verpflichtend,
 * Session not completed ⇒ 310 (Deferred Item List) ist verpflichtend.
 */
export function missingFollowUps(r: GradingRecord, all: GradingRecord[]): string[] {
  if (r.parentId) return []
  const children = all.filter((c) => c.parentId === r.id)
  const out: string[] = []
  if (r.trainees.some((tr) => tr.overall === 'not_competent') && !children.some((c) => c.formTypeId === '306')) out.push('306')
  if (r.sessionStatus === 'not_completed' && !children.some((c) => c.formTypeId === '310')) out.push('310')
  return out
}

/**
 * Ampelsystem für den Formularstatus:
 *  grün  = abgeschlossen, unterschrieben und versendet
 *  gelb  = noch offen (Unterschrift/Versand ausständig oder
 *          Pflicht-Folgeformular fehlt)
 *  rot   = Versand fehlgeschlagen — Handeln erforderlich
 */
export type TrafficColor = 'green' | 'yellow' | 'red'

export function trafficLight(r: GradingRecord, all?: GradingRecord[]): TrafficColor {
  if (r.mailStatus === 'failed') return 'red'
  if (all && missingFollowUps(r, all).length > 0) return 'yellow'
  if (r.status === 'signed' && r.mailStatus === 'sent') return 'green'
  return 'yellow'
}

export const TRAFFIC_CLS: Record<TrafficColor, string> = {
  green: 'bg-emerald-400',
  yellow: 'bg-amber-400',
  red: 'bg-red-500',
}

export function TrafficDot({ color, className = '' }: { color: TrafficColor; className?: string }) {
  return <span className={`inline-block h-3 w-3 shrink-0 rounded-full ${TRAFFIC_CLS[color]} ${className}`} />
}

export function Grading() {
  // Das Grading-Modul ist immer vollständig englisch
  const { i18n } = useTranslation()
  const t = i18n.getFixedT('en')
  const { state, currentUser, visibleGradingRecords, hideGradingRecord } = useStore()

  const formTitle = (id: string) => state.settings.grading.formTypes.find((f) => f.id === id)?.title ?? id
  const traineeLabel = (tr: { traineeName?: string; traineeId: string }) =>
    tr.traineeName || state.users.find((u) => u.id === tr.traineeId)?.name || '—'
  const mayGrade = currentUser!.canGrade || currentUser!.role !== 'member'
  const isMember = currentUser!.role === 'member'
  // Filter über die Ampel-Legende (antippen zum Filtern)
  const [trafficFilter, setTrafficFilter] = useState<TrafficColor | ''>('')
  const list = visibleGradingRecords.filter((r) => !trafficFilter || trafficLight(r, state.gradingRecords) === trafficFilter)

  return (
    <>
      {/* Modulname bleibt in beiden Sprachen Englisch */}
      <TopBar
        title="Grading Tool"
        back="/"
        right={
          mayGrade ? (
            <button
              onClick={() => navigate('/grading/new')}
              className="flex items-center gap-1 rounded-full bg-accent px-3 py-1.5 text-[13px] font-semibold text-bg hover:brightness-110"
            >
              <Plus size={15} /> {t('grading.newForm')}
            </button>
          ) : undefined
        }
      />
      <Page className="space-y-3">
        {!mayGrade && <p className="rounded-xl border border-line/10 bg-surface/60 p-3.5 text-[13px] text-dim">{t('grading.noPermission')}</p>}

        {/* Ampel-Legende — antippen filtert die Liste */}
        <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-line/10 bg-surface/60 px-2.5 py-2 text-[11.5px] text-dim">
          <button
            onClick={() => setTrafficFilter('')}
            className={`rounded-full border px-2.5 py-1 transition ${trafficFilter === '' ? 'border-accent bg-accent/15 font-semibold text-accent' : 'border-transparent'}`}
          >
            {t('grading.traffic.all')}
          </button>
          {(['green', 'yellow', 'red'] as TrafficColor[]).map((c) => (
            <button
              key={c}
              onClick={() => setTrafficFilter(trafficFilter === c ? '' : c)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 transition ${
                trafficFilter === c ? 'border-accent bg-accent/15 font-semibold text-accent' : 'border-transparent'
              }`}
            >
              <TrafficDot color={c} /> {t(`grading.traffic.${c}`)}
            </button>
          ))}
        </div>

        {/* Aufbewahrung in der Instruktoren-Ansicht: 1 Woche */}
        {isMember && <p className="px-1 text-[11.5px] leading-relaxed text-dim/80">{t('grading.retentionHint')}</p>}

        {list.length === 0 && <p className="pt-6 text-center text-sm text-dim">{t('grading.empty')}</p>}

        {list.map((r) => {
          const notCompetent = r.trainees.some((tr) => tr.overall === 'not_competent')
          const missing = missingFollowUps(r, state.gradingRecords)
          return (
            <Card key={r.id} onClick={() => navigate(`/grading/${r.id}`)} className="p-4">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-raised text-accent">
                  {r.formTypeId === '306' || r.formTypeId === '310' ? <FileText size={19} /> : <GradingIcon size={20} />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold leading-snug">
                    {r.formTypeId} · {formTitle(r.formTypeId)}
                  </p>
                  <p className="mt-0.5 truncate text-[13px] text-dim">
                    {r.trainees.length > 0 ? r.trainees.map(traineeLabel).join(', ') : t('grading.noTrainee')} ·{' '}
                    {r.header.aircraftType} · {formatDate(r.createdAt)}
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
                      <span key={id} className="inline-flex items-center gap-1 rounded-full bg-amber-500 px-2.5 py-0.5 text-[11px] font-semibold text-black">
                        <AlertTriangle size={11} /> {id} {t('grading.stillRequired')}
                      </span>
                    ))}
                    {r.parentId && <Badge tone="dim">{t('grading.linked')}</Badge>}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <TrafficDot color={trafficLight(r, state.gradingRecords)} className="mt-1" />
                  {/* Aus der eigenen Listenansicht entfernen — gilt nur für den
                      aktuellen Nutzer, im Admin-Panel bleibt alles erhalten */}
                  {(
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        if (window.confirm(t('grading.deleteOwnConfirm'))) hideGradingRecord(r.id)
                      }}
                      title={t('grading.deleteOwn')}
                      className="rounded-lg p-1.5 text-dim transition hover:bg-danger/10 hover:text-danger"
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              </div>
            </Card>
          )
        })}
      </Page>
    </>
  )
}
