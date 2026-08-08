import { AlertTriangle, CheckCircle2, Clock, Printer } from 'lucide-react'
import { useEffect, useState } from 'react'
import { SignaturePad } from '../components/SignaturePad'
import { useTranslation } from 'react-i18next'
import { Badge, Button, Card, Page, TopBar } from '../components/ui'
import { navigate } from '../router'
import { useStore } from '../store'
import { formatDate, formatDateTime, gradeColor, TrafficDot, trafficLight } from './Grading'

/**
 * Abgeschicktes Formular: read-only nach beidseitiger Signatur (Spez. 5.5).
 * Die Druckansicht ist der Vorläufer des 1:1-PDF-Nachbaus — sie folgt der
 * Tabellenstruktur des Originalformulars.
 */
export function GradingView({ recordId }: { recordId: string }) {
  // Formulare sind immer vollständig englisch, unabhängig von der App-Sprache
  const { i18n } = useTranslation()
  const t = i18n.getFixedT('en')
  const { state, currentUser, saveGradingRecord } = useStore()
  const record = state.gradingRecords.find((r) => r.id === recordId)
  const [lateSignature, setLateSignature] = useState<string | null>(null)

  // Redirect als Effekt, nicht als Seiteneffekt in der Render-Phase.
  useEffect(() => {
    if (!record) navigate('/grading')
  }, [record])

  if (!record) return null

  const grading = state.settings.grading
  const formType = grading.formTypes.find((f) => f.id === record.formTypeId)
  const competencies = formType?.competencySet
    ? grading.competencySets.find((c) => c.key === formType.competencySet)?.competencies ?? []
    : []
  const userName = (id: string) => state.users.find((u) => u.id === id)?.name ?? '—'

  const isAdmin = currentUser!.role !== 'member'
  const linked = state.gradingRecords.filter((r) => r.parentId === record.id)

  return (
    <>
      <TopBar
        title={`${record.formTypeId} · ${formType?.title ?? ''}`}
        back="/grading"
        right={
          <button onClick={() => window.print()} title={t('grading.print')} className="rounded-full p-2 text-dim transition hover:bg-line/5 hover:text-accent">
            <Printer size={19} />
          </button>
        }
      />
      <Page className="space-y-4">
        {/* Export-Stempel: erscheint auf jedem Ausdruck/PDF-Export */}
        <p className="hidden border-b border-line/20 pb-2 text-[11px] text-dim print:block">
          {t('grading.exportStamp', { date: formatDateTime(Date.now() + state.timeOffsetMs), name: currentUser!.name })}
        </p>

        {/* Status */}
        <div className="flex flex-wrap items-center gap-2">
          <TrafficDot color={trafficLight(record)} />
          {record.status === 'signed' ? (
            <Badge tone="dim">
              <CheckCircle2 size={11} className="mr-1" /> {t('grading.status.signed')}
            </Badge>
          ) : (
            <Badge tone="warm">
              <Clock size={11} className="mr-1" /> {t('grading.status.awaiting_signature')}
            </Badge>
          )}
          <Badge tone={record.mailStatus === 'sent' ? 'accent' : 'dim'}>{t(`grading.mail.${record.mailStatus}`)}</Badge>
        </div>

        {record.mailStatus === 'failed' && (
          <div className="flex items-start gap-2.5 rounded-xl border border-danger/30 bg-danger/10 p-3.5 text-[13px]">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-danger" />
            <div>
              <p className="font-semibold text-danger">{t('grading.mail.failed')}</p>
              {record.mailError && <p className="mt-0.5 text-dim">{record.mailError}</p>}
            </div>
          </div>
        )}

        {record.status === 'signed' && (
          <p className="rounded-xl border border-line/10 bg-surface/60 p-3.5 text-[12.5px] leading-relaxed text-dim">{t('grading.readOnlyNote')}</p>
        )}

        {/* Kopfdaten */}
        <Card className="p-4">
          <p className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-dim">{t('grading.headerData')}</p>
          <dl className="grid gap-x-4 gap-y-2 text-[13.5px] sm:grid-cols-2">
            <div className="flex justify-between gap-3 border-b border-line/[0.06] pb-1.5">
              <dt className="text-dim">{t('grading.instructor')}</dt>
              <dd className="text-right font-medium">{userName(record.instructorId)}</dd>
            </div>
            {formType?.fields.map((f) => (
              <div key={f.key} className="flex justify-between gap-3 border-b border-line/[0.06] pb-1.5">
                <dt className="text-dim">{f.label}</dt>
                <dd className="text-right font-medium">
                  {f.type === 'date' && record.header[f.key] ? formatDate(record.header[f.key]) : record.header[f.key] || '–'}
                </dd>
              </div>
            ))}
          </dl>
        </Card>

        {/* Freitext (306/310) */}
        {formType && formType.freeTextSections.length > 0 && (
          <Card className="space-y-3 p-4">
            {formType.freeTextSections.map((sec) => (
              <div key={sec}>
                <p className="mb-1 text-[13px] font-semibold text-dim">{sec}</p>
                <p className="whitespace-pre-wrap rounded-lg bg-bg/40 p-3 text-[13.5px] leading-relaxed">{record.freeText[sec] || '–'}</p>
              </div>
            ))}
          </Card>
        )}

        {/* Teilnehmerliste (307A/307B) */}
        {record.attendance && record.attendance.length > 0 && (
          <Card className="p-4">
            <p className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-dim">{t('grading.attendance')}</p>
            <ol className="space-y-1 text-[13.5px]">
              {record.attendance.map((a, i) => (
                <li key={i} className="flex gap-2 border-b border-line/[0.06] py-1 last:border-0">
                  <span className="w-5 text-dim">{i + 1}.</span>
                  <span>{a.name}</span>
                </li>
              ))}
            </ol>
          </Card>
        )}

        {/* Bewertungen */}
        {record.trainees.map((tr, i) => (
          <Card key={i} className="p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-[15px] font-semibold">{userName(tr.traineeId)}</p>
              <span className="flex items-center gap-2">
                <span className="text-[12px] text-dim">{tr.position}</span>
                {tr.overall && (
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold ${
                      tr.overall === 'competent' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-danger/20 text-danger'
                    }`}
                  >
                    {t(`grading.${tr.overall}`)}
                  </span>
                )}
              </span>
            </div>

            <div className="space-y-1.5">
              {competencies.map((c) => {
                const g = tr.grades.find((x) => x.code === c.code)
                return (
                  <div key={c.code} className="flex items-start gap-2.5 border-b border-line/[0.06] pb-1.5 last:border-0">
                    <span className={`flex h-7 w-9 shrink-0 items-center justify-center rounded-md text-[13px] font-bold ${gradeColor(g?.grade ?? null)}`}>
                      {g?.grade ?? '–'}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13.5px] font-medium">
                        {c.code} <span className="font-normal text-dim">· {c.title}</span>
                      </p>
                      {g?.comment && <p className="mt-0.5 text-[12.5px] text-dim">{g.comment}</p>}
                    </div>
                  </div>
                )
              })}
            </div>

            {[
              ['positive', tr.positiveComment],
              ['development', tr.developmentComment],
              ['summary', tr.summaryComment],
            ].map(([key, val]) =>
              val ? (
                <div key={key} className="mt-3">
                  <p className="text-[12.5px] font-semibold text-dim">{t(`grading.${key}`)}</p>
                  <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed">{val}</p>
                </div>
              ) : null,
            )}
          </Card>
        ))}

        {record.sessionStatus && (
          <Card className="p-4">
            {/* Ankreuzzeilen im Wortlaut des Originalformulars */}
            <p className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-dim">Overall Result</p>
            <div className="space-y-1.5 text-[13.5px]">
              {record.trainees.map((tr, i) => (
                <div key={i}>
                  <p className="flex items-start gap-2">
                    <span className="font-mono">{tr.overall === 'competent' ? '☒' : '☐'}</span>
                    <span>Competent / Continue to next session ***</span>
                  </p>
                  <p className="flex items-start gap-2">
                    <span className="font-mono">{tr.overall === 'not_competent' ? '☒' : '☐'}</span>
                    <span>Not Competent / Additional training required *</span>
                  </p>
                  <p className="flex items-start gap-2">
                    <span className="font-mono">{record.sessionStatus === 'not_completed' ? '☒' : '☐'}</span>
                    <span>Session not completed **</span>
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-3 space-y-1 text-[11.5px] leading-relaxed text-dim/80">
              <p>{t('grading.footnote1')}</p>
              <p>{t('grading.footnote2')}</p>
              <p>{t('grading.footnote3')}</p>
            </div>
          </Card>
        )}

        {/* Anhängende Formulare */}
        {linked.length > 0 && (
          <Card className="p-4">
            <p className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-dim">{t('grading.linkedForms')}</p>
            {linked.map((l) => (
              <button key={l.id} onClick={() => navigate(`/grading/${l.id}`)} className="block w-full py-1 text-left text-[13.5px] text-accent hover:underline">
                {l.formTypeId} — {grading.formTypes.find((f) => f.id === l.formTypeId)?.title}
              </button>
            ))}
          </Card>
        )}

        {/* Unterschriften */}
        <Card className="p-4">
          <p className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-dim">{t('grading.signatures')}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              [record.formTypeId === '308G' ? 'Signature Course Instructor (COI)' : t('grading.sigInstructor'), record.signatureInstructor],
              [record.formTypeId === '308G' ? 'Signature Candidate Instructor (CAI)' : t('grading.sigTrainee'), record.signatureTrainee],
            ]
              .filter(([, sig]) => sig !== null || !record.attendance)
              .map(([label, sig]) => (
              <div key={label as string}>
                <p className="mb-1 text-[12.5px] text-dim">{label}</p>
                {sig ? (
                  <img src={sig as string} alt="" className="h-24 w-full rounded-lg border border-line/15 bg-white object-contain" />
                ) : (
                  <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-line/25 text-[12.5px] text-dim">
                    {t('grading.missingSignature')}
                  </div>
                )}
              </div>
            ))}
          </div>
          {record.signedAt && <p className="mt-3 text-[12px] text-dim">{t('grading.signedAt', { date: formatDateTime(record.signedAt) })}</p>}

          {/* Offene Unterschrift nachholen: nur das fehlende Feld ist offen,
              danach wird das Formular wie üblich gesperrt und versendet. */}
          {record.status === 'awaiting_signature' && !record.signatureTrainee && (
            <div className="mt-4 space-y-3 rounded-xl border border-warm/25 bg-warm/5 p-3.5">
              <SignaturePad
                value={lateSignature}
                onChange={setLateSignature}
                label={record.formTypeId === '308G' ? 'Signature Candidate Instructor (CAI)' : t('grading.sigTrainee')}
              />
              <Button
                disabled={!lateSignature}
                className="w-full"
                onClick={() => {
                  const escalate =
                    record.trainees.some((tr) => tr.overall === 'not_competent') || record.sessionStatus === 'not_completed'
                  saveGradingRecord({
                    ...record,
                    signatureTrainee: lateSignature,
                    status: 'signed',
                    mailStatus: escalate ? 'pending' : 'sent',
                    signedAt: Date.now() + state.timeOffsetMs,
                  })
                  setLateSignature(null)
                }}
              >
                {t('grading.completeSignature')}
              </Button>
            </div>
          )}
        </Card>

        {isAdmin && (
          <p className="text-center text-[12px] text-dim/70">
            {t('grading.recipients')}:{' '}
            {(record.trainees.some((tr) => tr.overall === 'not_competent') || record.sessionStatus === 'not_completed'
              ? [...grading.defaultRecipients, ...grading.escalationRecipients]
              : grading.defaultRecipients
            ).join(', ')}
          </p>
        )}
      </Page>
    </>
  )
}
