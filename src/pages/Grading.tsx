import { AlertTriangle, CheckCircle2, Clock, FileText, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { GradingIcon } from '../components/GradingIcon'
import { Badge, Card, Page, TopBar } from '../components/ui'
import { navigate } from '../router'
import { useStore } from '../store'

export function gradeLabel(v: number | 'NO' | null) {
  return v === null ? '–' : String(v)
}

/** Farbcodierung laut Spez. 5.3: 5/4 grün, 3 dunkelgrün, 2 orange, 1 rot, NO grau */
export function gradeColor(g: number | 'NO' | null): string {
  if (g === 'NO' || g === null) return 'bg-line/10 text-dim'
  if (g >= 4) return 'bg-emerald-500/20 text-emerald-300'
  if (g === 3) return 'bg-emerald-700/25 text-emerald-200'
  if (g === 2) return 'bg-amber-500/20 text-amber-300'
  return 'bg-red-500/20 text-red-300'
}

export function Grading() {
  const { t, i18n } = useTranslation()
  const { state, currentUser, visibleGradingRecords } = useStore()

  const dateLabel = (ts: number) =>
    new Date(ts).toLocaleDateString(i18n.language === 'de' ? 'de-AT' : 'en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })

  const formTitle = (id: string) => state.settings.grading.formTypes.find((f) => f.id === id)?.title ?? id
  const userName = (id: string) => state.users.find((u) => u.id === id)?.name ?? '—'
  const mayGrade = currentUser!.canGrade || currentUser!.role !== 'member'

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

        {visibleGradingRecords.length === 0 && <p className="pt-6 text-center text-sm text-dim">{t('grading.empty')}</p>}

        {visibleGradingRecords.map((r) => {
          const notCompetent = r.trainees.some((tr) => tr.overall === 'not_competent')
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
                    {r.trainees.length > 0 ? r.trainees.map((tr) => userName(tr.traineeId)).join(', ') : t('grading.noTrainee')} ·{' '}
                    {r.header.aircraftType} · {dateLabel(r.createdAt)}
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
                    {r.parentId && <Badge tone="dim">{t('grading.linked')}</Badge>}
                  </div>
                </div>
              </div>
            </Card>
          )
        })}
      </Page>
    </>
  )
}
