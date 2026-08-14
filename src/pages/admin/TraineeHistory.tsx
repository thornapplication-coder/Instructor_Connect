import { ArrowLeft, ChevronRight, Minus, Search, TrendingDown, TrendingUp, TriangleAlert } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge, Card, CardHeading, inputCls } from '../../components/ui'
import { navigate } from '../../router'
import { useStore } from '../../store'
import { traineeHistories, type CompetencyTrack, type TraineeHistory as History } from '../../traineeHistory'
import type { GradingRecord } from '../../types'
import { gradeColor } from '../Grading'
import { formatDate } from '../../datum'

/**
 * Verlauf eines Piloten über mehrere Sessions.
 *
 * Das einzelne Blatt beantwortet „wie lief dieser Durchgang?" — nicht aber
 * „steht dieselbe Kompetenz beim dritten Mal immer noch bei 2?". Genau das
 * zeigt diese Ansicht, und deshalb hebt sie wiederkehrende Schwächen hervor
 * statt nur Zahlen aufzureihen.
 *
 * Anders als der Standardisierungsbericht ist das KEIN Behördendokument,
 * sondern ein internes Trainingswerkzeug — die Ansicht folgt daher der
 * Bediensprache. Sichtbar nur mit vollem Archivzugriff (grading_view_all):
 * ein Verlauf, der nur die eigenen Blätter kennt, zeigt Lücken statt
 * Entwicklung.
 */

type T = ReturnType<typeof useTranslation>['t']

function TrendBadge({ trend, t }: { trend: CompetencyTrack['trend']; t: T }) {
  if (trend === null)
    return <span className="text-micro text-dim">{t('forms:admin.trendNone')}</span>
  const map = {
    up: { Icon: TrendingUp, cls: 'text-ok', label: t('forms:admin.trendUp') },
    down: { Icon: TrendingDown, cls: 'text-danger', label: t('forms:admin.trendDown') },
    flat: { Icon: Minus, cls: 'text-dim', label: t('forms:admin.trendFlat') },
  }[trend]
  return (
    <span className={`inline-flex items-center gap-1 text-micro font-medium ${map.cls}`}>
      <map.Icon size={14} /> {map.label}
    </span>
  )
}

function CompetencyRow({ c, t }: { c: CompetencyTrack; t: T }) {
  return (
    <div className={`rounded-xl border p-3 ${c.recurringWeak ? 'border-warm/40 bg-warm/5' : 'border-line/10'}`}>
      <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-small font-semibold">{c.code}</span>
        <span className="min-w-0 flex-1 truncate text-small text-dim">{c.title}</span>
        {c.recurringWeak && (
          <Badge tone="wait">
            <TriangleAlert size={12} className="mr-1" /> {t('forms:admin.recurringWeak')}
          </Badge>
        )}
      </div>
      {/* Noten in zeitlicher Folge — die Reihe IST die Aussage */}
      <div className="flex flex-wrap items-center gap-1.5">
        {c.values.map((v, i) => (
          <span
            key={i}
            title={formatDate(v.date)}
            className={`flex h-7 w-8 items-center justify-center rounded-md text-small font-bold ${gradeColor(v.grade)}`}
          >
            {v.grade}
          </span>
        ))}
        <span className="ml-1 text-micro text-dim">
          {t('forms:admin.average')} {c.mean === null ? '–' : c.mean.toFixed(2)}
        </span>
        <span className="ml-auto">
          <TrendBadge trend={c.trend} t={t} />
        </span>
      </div>
    </div>
  )
}

function Detail({ history, onBack, t }: { history: History; onBack: () => void; t: T }) {
  const { state } = useStore()
  const nameOf = (id: string) => state.users.find((u) => u.id === id)?.name ?? id
  const weak = history.competencies.filter((c) => c.recurringWeak).length

  return (
    <div className="space-y-section">
      <button onClick={onBack} className="flex items-center gap-1.5 text-small font-medium text-dim transition hover:text-ink">
        <ArrowLeft size={15} /> {t('forms:admin.backToTrainees')}
      </button>

      <Card className="space-y-tight p-4">
        <h3 className="text-head font-bold">{history.name}</h3>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-micro text-dim">
          <span>{t('forms:admin.sessionsCount', { count: history.sessions.length })}</span>
          <span>{t('forms:admin.lastSession', { date: formatDate(history.lastDate) })}</span>
          {weak > 0 && (
            <span className="font-semibold text-warm">{t('forms:admin.recurringWeakCount', { count: weak })}</span>
          )}
          {history.notCompetentCount > 0 && (
            <span className="font-semibold text-danger">
              {t('forms:admin.notCompetentCount', { count: history.notCompetentCount })}
            </span>
          )}
        </div>
      </Card>

      <Card className="space-y-stack p-4">
        <CardHeading>{t('forms:admin.course')}</CardHeading>
        {/* Wiederkehrende Schwächen zuerst — sie sind der Grund, warum man
            diese Ansicht überhaupt öffnet. */}
        {[...history.competencies]
          .sort((a, b) => Number(b.recurringWeak) - Number(a.recurringWeak))
          .map((c) => (
            <CompetencyRow key={c.code} c={c} t={t} />
          ))}
      </Card>

      <Card className="space-y-tight p-4">
        <CardHeading>{t('forms:admin.sessionList')}</CardHeading>
        {history.sessions.map((s) => (
          <button
            key={s.recordId}
            onClick={() => navigate(`/grading/${s.recordId}`)}
            className="flex min-h-11 w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left transition hover:bg-line/5"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-body font-medium">
                {s.formTypeId} · {formatDate(s.date)}
              </span>
              <span className="block truncate text-micro text-dim">
                {nameOf(s.instructorId)}
                {s.aircraftType ? ` · ${s.aircraftType}` : ''}
              </span>
            </span>
            {s.overall === 'not_competent' && (
              <span className="shrink-0">
                <Badge tone="bad">{t('forms:notCompetent')}</Badge>
              </span>
            )}
            <ChevronRight size={16} className="shrink-0 text-dim" />
          </button>
        ))}
      </Card>
    </div>
  )
}

export function TraineeHistory({ records }: { records: GradingRecord[] }) {
  // Kein `lng` mehr: Der Text dieses Berichts liegt im Namensraum `forms`,
  // den es nur auf Englisch gibt. Vorher entschied die einbindende Ansicht
  // über die Sprache — und vergaß sie an einer von zwei Stellen, weshalb
  // derselbe Bericht im Grading Tool englisch und im Admin-Panel deutsch war.
  const { t } = useTranslation()
  const { now } = useStore()
  const [query, setQuery] = useState('')
  const [openKey, setOpenKey] = useState<string | null>(null)

  const histories = useMemo(() => traineeHistories(records, now()), [records, now])
  const open = openKey ? histories.find((h) => h.key === openKey) : undefined

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? histories.filter((h) => h.name.toLowerCase().includes(q)) : histories
  }, [histories, query])

  if (open) return <Detail history={open} onBack={() => setOpenKey(null)} t={t} />

  return (
    <div className="space-y-stack">
      <p className="text-small leading-relaxed text-dim">{t('forms:admin.traineesHint')}</p>

      {histories.length === 0 ? (
        <Card className="p-4 text-small text-dim">{t('forms:admin.noTrainees')}</Card>
      ) : (
        <>
          <label className="relative block">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-dim" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('forms:admin.searchTrainee')}
              aria-label={t('forms:admin.searchTrainee')}
              className={`${inputCls} pl-9`}
            />
          </label>

          {shown.length === 0 ? (
            <Card className="p-4 text-small text-dim">{t('forms:admin.noMatch')}</Card>
          ) : (
            <div className="space-y-stack">
              {shown.map((h) => {
                const weak = h.competencies.filter((c) => c.recurringWeak).length
                return (
                  <Card key={h.key} className="p-0" onClick={() => setOpenKey(h.key)}>
                    <div className="flex min-h-11 items-center gap-2.5 px-3.5 py-3">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-body font-semibold">{h.name}</span>
                        <span className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-micro text-dim">
                          <span>{t('forms:admin.sessionsCount', { count: h.sessions.length })}</span>
                          <span>{t('forms:admin.lastSession', { date: formatDate(h.lastDate) })}</span>
                        </span>
                      </span>
                      {weak > 0 && (
                        <span className="shrink-0">
                          <Badge tone="wait">
                            <TriangleAlert size={12} className="mr-1" /> {weak}
                          </Badge>
                        </span>
                      )}
                      {h.notCompetentCount > 0 && (
                        <span className="shrink-0">
                          <Badge tone="bad">{h.notCompetentCount}</Badge>
                        </span>
                      )}
                      <ChevronRight size={16} className="shrink-0 text-dim" />
                    </div>
                  </Card>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}
