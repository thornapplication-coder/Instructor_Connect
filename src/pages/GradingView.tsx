import { AlertTriangle, CheckCircle2, Clock, Printer, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { SignaturePad } from '../components/SignaturePad'
import { useTranslation } from 'react-i18next'
import { Badge, Button, Card, Page, TopBar } from '../components/ui'
import { navigate } from '../router'
import { useStore } from '../store'
import { formatDate, formatDateTime, gradeColor, missingFollowUps, TrafficDot, trafficLight } from './Grading'

/**
 * Abgeschicktes Formular: read-only nach beidseitiger Signatur (Spez. 5.5).
 * Die Druckansicht ist der Vorläufer des 1:1-PDF-Nachbaus — sie folgt der
 * Tabellenstruktur des Originalformulars.
 */
export function GradingView({ recordId, autoPrint = false }: { recordId: string; autoPrint?: boolean }) {
  // Formulare sind immer vollständig englisch, unabhängig von der App-Sprache
  const { i18n } = useTranslation()
  const t = i18n.getFixedT('en')
  const { state, currentUser, saveGradingRecord, retryGradingMail, gradingRecordById } = useStore()
  // Berechtigungsprüfung am Objekt: fremde Formulare sind über die URL weder
  // les- noch unterschreibbar. Nicht gefunden = nicht berechtigt.
  const record = gradingRecordById(recordId)
  const [lateSignature, setLateSignature] = useState<string | null>(null)

  // Redirect als Effekt, nicht als Seiteneffekt in der Render-Phase.
  useEffect(() => {
    if (!record) navigate('/grading')
  }, [record])

  // iOS/iPadOS erlaubt window.print() nur aus einer Nutzergeste heraus —
  // ein automatischer Aufruf nach Navigation verpufft dort wirkungslos.
  const isIOS =
    /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const [printHint, setPrintHint] = useState(false)

  // PDF-Download aus der Liste: Ansicht rendern, dann PDF-/Druckdialog
  // öffnen (dort „Als PDF sichern" wählen) und die URL wieder bereinigen.
  // Am iPad/iPhone stattdessen einen deutlichen Knopf zeigen, der den
  // Dialog per Fingertipp (= gültige Geste) öffnet.
  useEffect(() => {
    if (!autoPrint || !record) return
    if (isIOS) {
      // URL bewusst noch nicht bereinigen: die Navigation würde die
      // Komponente neu aufbauen und den Hinweis-Zustand verwerfen.
      setPrintHint(true)
      return
    }
    const tm = setTimeout(() => {
      window.print()
      navigate(`/grading/${recordId}`)
    }, 400)
    return () => clearTimeout(tm)
  }, [autoPrint, record, recordId, isIOS])

  if (!record) return null

  const grading = state.settings.grading
  const formType = grading.formTypes.find((f) => f.id === record.formTypeId)
  // Das Instruktoren-Blatt (308G) führt laut Original keine Kürzel —
  // dort steht ausschließlich die ausgeschriebene Kompetenz.
  const hideCodes = formType?.competencySet === 'instructor'
  // Maßgeblich ist der im Formular eingefrorene Wortlaut. Nur Altbestand ohne
  // Momentaufnahme fällt auf den aktuellen Katalog zurück.
  const competencies: { code: string; title: string }[] = record.competencies?.length
    ? record.competencies
    : formType?.competencySet
      ? grading.competencySets.find((c) => c.key === formType.competencySet)?.competencies ?? []
      : []
  const userName = (id: string) => state.users.find((u) => u.id === id)?.name ?? '—'
  const traineeLabel = (tr: { traineeName?: string; traineeId: string }) => tr.traineeName || userName(tr.traineeId)

  // Kopf-/Fußzeile des Ausdrucks kommt aus den Einstellungen, damit der
  // Superadmin ATO-Kennung und Formularstand ohne Deployment pflegen kann.
  const doc = state.settings.documentHeader ?? { atoName: '', approvalNumber: '', formRevision: '' }
  // Das Instruktorenblatt 308G verweist nicht auf die Pilotenformulare.
  const pilotFootnotes = formType?.competencySet !== 'instructor'
  const isAdmin = currentUser!.role !== 'member'
  const linked = state.gradingRecords.filter((r) => r.parentId === record.id)
  const missing = missingFollowUps(record, state.gradingRecords)
  const parentRec = record.parentId ? state.gradingRecords.find((r) => r.id === record.parentId) : undefined

  return (
    <>
      <TopBar
        title={`${record.formTypeId} · ${formType?.title ?? ''}`}
        back="/grading"
        wide
        right={
          <button onClick={() => window.print()} title={t('grading.print')} className="flex h-11 w-11 items-center justify-center rounded-full text-dim transition hover:bg-line/5 hover:text-accent">
            <Printer size={19} />
          </button>
        }
      />
      <Page wide className="space-y-4">
        {/* Druck-Kopf: Organisation, Formularbenennung, Formularstand und
            Export-Stempel — ohne diese Angaben lässt sich ein Ausdruck weder
            der ATO noch einem Formularstand zuordnen. */}
        <div className="hidden border-b-2 border-line/60 pb-2 print:block">
          <p className="text-[11px] font-semibold uppercase tracking-wide">
            {[doc.atoName, doc.approvalNumber].filter(Boolean).join(' · ')}
          </p>
          <h1 className="text-2xl font-bold tracking-tight">
            {record.formTypeId} — {formType?.title ?? ''}
          </h1>
          <p className="mt-1 flex justify-between gap-4 text-[11px] text-dim">
            <span>{t('grading.exportStamp', { date: formatDateTime(Date.now() + state.timeOffsetMs), name: currentUser!.name })}</span>
            <span>{doc.formRevision}</span>
          </p>
        </div>

        {/* iPad/iPhone: Druckdialog braucht einen Fingertipp */}
        {printHint && (
          <div className="space-y-3 rounded-xl border border-accent/40 bg-accent/10 p-3.5 print:hidden">
            <p className="text-[13px] leading-relaxed">{t('grading.printHintBody')}</p>
            <Button
              onClick={() => {
                setPrintHint(false)
                window.print()
                navigate(`/grading/${recordId}`)
              }}
              className="flex w-full items-center justify-center gap-2"
            >
              <Printer size={16} /> {t('grading.printNow')}
            </Button>
            <p className="text-[11.5px] leading-relaxed text-dim">{t('grading.printShareFallback')}</p>
          </div>
        )}

        {/* Status ist Bedienoberfläche — auf Papier steht der Stand im Kopf */}
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <TrafficDot color={trafficLight(record, state.gradingRecords)} />
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
          <div className="space-y-3 rounded-xl border border-danger/30 bg-danger/10 p-3.5 text-[13px] print:hidden">
            <div className="flex items-start gap-2.5">
              <AlertTriangle size={16} className="mt-0.5 shrink-0 text-danger" />
              <div>
                <p className="font-semibold text-danger">{t('grading.mail.failed')}</p>
                {record.mailError && <p className="mt-0.5 text-dim">{record.mailError}</p>}
              </div>
            </div>
            {/* Erneut senden direkt aus dem Formular — nicht nur im Admin-Panel */}
            <Button onClick={() => retryGradingMail(record.id)} className="flex w-full items-center justify-center gap-2">
              <RefreshCw size={15} /> {t('grading.sendAgain')}
            </Button>
          </div>
        )}

        {/* Pflicht-Folgeformular fehlt noch: deutlich sichtbar + direkt ausfüllbar */}
        {missing.length > 0 && (
          <div className="space-y-3 rounded-xl border border-wait/50 bg-wait/10 p-3.5 print:hidden">
            <div className="flex items-start gap-2.5 text-[13px]">
              <AlertTriangle size={16} className="mt-0.5 shrink-0 text-wait" />
              <p className="font-semibold">{t('grading.followUpWarn')}</p>
            </div>
            {missing.map((id) => {
              const title = `${id} — ${grading.formTypes.find((f) => f.id === id)?.title ?? ''}`
              // Ein angefangenes Folgeformular wird fortgesetzt, nicht ein
              // zweites daneben angelegt.
              const started = linked.find((l) => l.formTypeId === id && l.status !== 'signed')
              return (
                <Button
                  key={id}
                  onClick={() => navigate(started ? `/grading/${started.id}` : `/grading/new?type=${id}&parent=${record.id}`)}
                  className="flex w-full items-center justify-center gap-2"
                >
                  {started ? t('grading.openUnsignedFollowUp', { form: title }) : t('grading.fillNow', { form: title })}
                </Button>
              )
            })}
          </div>
        )}

        {record.status === 'signed' && (
          <p className="rounded-xl border border-line/10 bg-surface/60 p-3.5 text-[12.5px] leading-relaxed text-dim print:hidden">{t('grading.readOnlyNote')}</p>
        )}

        {/* Folgeformulare (306/310): das auslösende Grading Sheet geht beim
            Versand automatisch mit */}
        {parentRec && (
          <p className="rounded-xl border border-line/10 bg-surface/60 p-3.5 text-[12.5px] leading-relaxed text-dim print:hidden">
            {t('grading.mailAttachment', { form: `${parentRec.formTypeId} — ${grading.formTypes.find((f) => f.id === parentRec.formTypeId)?.title ?? ''}` })}{' '}
            <button onClick={() => navigate(`/grading/${parentRec.id}`)} className="font-medium text-accent hover:underline">
              {t('grading.openParent')}
            </button>
          </p>
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
                <dt className="text-dim">
                  {f.label}
                  {/* Fußnoten des Originalformulars (z. B. PRG*) gehören auf den
                      Nachweis, nicht nur in die Eingabemaske. */}
                  {f.hint && <span className="block text-[11px] leading-snug text-dim">{f.hint}</span>}
                </dt>
                <dd className="text-right font-medium">
                  {f.type === 'date' && record.header[f.key] ? formatDate(record.header[f.key]) : record.header[f.key] || '–'}
                </dd>
              </div>
            ))}
            {/* Qualifikation und Sitzposition werden im Formular erfasst, sind
                aber keine Katalogfelder — ohne diese Zeilen fehlen sie auf dem
                Dokument und im Ausdruck. */}
            {([
              [t('grading.instructorQual'), record.header.instructorQual],
              [t('grading.instructorSeat'), record.header.instructorSeat],
            ] as const)
              .filter(([, v]) => !!v)
              .map(([label, value]) => (
                <div key={label} className="flex justify-between gap-3 border-b border-line/[0.06] pb-1.5">
                  <dt className="text-dim">{label}</dt>
                  <dd className="text-right font-medium">{value}</dd>
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
            {/* 307A trägt die Unterschrift jedes Teilnehmers, 307B (CBT/WBT/VCR)
                findet ohne Anwesenheit statt — dort bürgt der Instruktor. */}
            <ol className="space-y-1 text-[13.5px]">
              {record.attendance.map((a, i) => (
                <li key={i} className="flex items-center gap-2 border-b border-line/[0.06] py-1 last:border-0">
                  <span className="w-5 shrink-0 text-dim">{i + 1}.</span>
                  <span className="min-w-0 flex-1">{a.name}</span>
                  {record.formTypeId === '307A' &&
                    (a.signature ? (
                      <img src={a.signature} alt="" className="h-10 w-32 shrink-0 rounded border border-line/15 bg-white object-contain" />
                    ) : (
                      <span className="shrink-0 text-[12px] text-dim">{t('grading.missingSignature')}</span>
                    ))}
                </li>
              ))}
            </ol>
            {record.formTypeId === '307B' && (
              <p className="mt-2 text-[11.5px] leading-relaxed text-dim">{t('grading.attendance307B')}</p>
            )}
          </Card>
        )}

        {/* Bewertungen */}
        {record.trainees.map((tr, i) => (
          <Card key={i} className="p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-[15px] font-semibold">{traineeLabel(tr)}</p>
              <span className="flex items-center gap-2">
                <span className="text-[12px] text-dim">{[tr.position, tr.seat].filter(Boolean).join(' · ')}</span>
                {tr.overall && (
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold ${
                      tr.overall === 'competent' ? 'bg-emerald-700 text-white' : 'bg-red-600 text-white'
                    }`}
                  >
                    {t(`grading.${tr.overall}`)}
                  </span>
                )}
              </span>
            </div>

            <div className="space-y-1.5 sm:grid sm:grid-cols-2 sm:gap-x-6 sm:space-y-0 print:grid print:grid-cols-2 print:gap-x-4 print:space-y-0">
              {competencies.map((c) => {
                const g = tr.grades.find((x) => x.code === c.code)
                return (
                  <div key={c.code} className="flex items-start gap-2.5 border-b border-line/[0.06] pb-1.5 last:border-0">
                    <span className={`flex h-7 w-9 shrink-0 items-center justify-center rounded-md text-[13px] font-bold ${gradeColor(g?.grade ?? null)}`}>
                      {g?.grade ?? '–'}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13.5px] font-medium">
                        {hideCodes ? c.title : <>{c.code} <span className="font-normal text-dim">· {c.title}</span></>}
                      </p>
                      {g?.comment && <p className="mt-0.5 text-[12.5px] text-dim">{g.comment}</p>}
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-3 print:grid-cols-3">
              {[
                ['positive', tr.positiveComment],
                ['development', tr.developmentComment],
                ['summary', tr.summaryComment],
              ].map(([key, val]) =>
                val ? (
                  <div key={key}>
                    <p className="text-[12.5px] font-semibold text-dim">{t(`grading.${key}`)}</p>
                    <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed">{val}</p>
                  </div>
                ) : null,
              )}
            </div>
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
                    <span>Competent / Continue to next session{pilotFootnotes ? ' ***' : ''}</span>
                  </p>
                  <p className="flex items-start gap-2">
                    <span className="font-mono">{tr.overall === 'not_competent' ? '☒' : '☐'}</span>
                    <span>Not Competent / Additional training required{pilotFootnotes ? ' *' : ''}</span>
                  </p>
                  <p className="flex items-start gap-2">
                    <span className="font-mono">{record.sessionStatus === 'not_completed' ? '☒' : '☐'}</span>
                    <span>Session not completed{pilotFootnotes ? ' **' : ''}</span>
                  </p>
                </div>
              ))}
            </div>
            {/* Die Fußnoten verweisen auf die Pilotenformulare 306 und 310 —
                auf einer TRI/SFI/MCCI-Beurteilung haben sie nichts verloren. */}
            {pilotFootnotes && (
              <div className="mt-3 space-y-1 text-[11.5px] leading-relaxed text-dim">
                <p>{t('grading.footnote1')}</p>
                <p>{t('grading.footnote2')}</p>
                <p>{t('grading.footnote3')}</p>
              </div>
            )}
          </Card>
        )}

        {/* Anhängende Formulare */}
        {linked.length > 0 && (
          <Card className="p-4">
            <p className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-dim">{t('grading.linkedForms')}</p>
            {linked.map((l) => (
              <div key={l.id} className="py-1 text-[13.5px]">
                {/* Auf Papier muss der Verweis stehen bleiben — der Druckstil
                    blendet Schaltflächen aus, deshalb hier Text plus Knopf. */}
                <span className="hidden print:inline">
                  {l.formTypeId} — {grading.formTypes.find((f) => f.id === l.formTypeId)?.title}
                  {l.signedAt ? ` · ${t('grading.signedAt', { date: formatDateTime(l.signedAt) })}` : ''}
                </span>
                <button
                  onClick={() => navigate(`/grading/${l.id}`)}
                  className="min-h-11 block w-full py-1 text-left text-accent hover:underline print:hidden"
                >
                  {l.formTypeId} — {grading.formTypes.find((f) => f.id === l.formTypeId)?.title}
                </button>
              </div>
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
          {/* Nachtragen darf nur der Instruktor, der das Formular geführt hat —
              er legt das Gerät dem Piloten vor. Vollzugriff (Ablage/Admin)
              berechtigt zum Lesen, nicht zum Unterschreiben. */}
          {record.status === 'awaiting_signature' && !record.signatureTrainee && record.instructorId === currentUser!.id && (
            <div className="mt-4 space-y-3 rounded-xl border border-warm/25 bg-warm/5 p-3.5 print:hidden">
              <SignaturePad
                value={lateSignature}
                onChange={setLateSignature}
                label={record.formTypeId === '308G' ? 'Signature Candidate Instructor (CAI)' : t('grading.sigTrainee')}
              />
              <Button
                disabled={!lateSignature}
                className="w-full"
                onClick={() => {
                  saveGradingRecord({
                    ...record,
                    signatureTrainee: lateSignature,
                    status: 'signed',
                    mailStatus: 'sent',
                    signedAt: Date.now() + state.timeOffsetMs,
                  })
                  setLateSignature(null)
                  // Fehlt noch ein Pflicht-Folgeformular, bleibt der Nutzer auf
                  // dem Formular und sieht dort, was offen ist.
                  if (missingFollowUps(record, state.gradingRecords).length === 0) navigate('/grading')
                }}
              >
                {t('grading.completeSignature')}
              </Button>
            </div>
          )}
        </Card>

        {isAdmin && (
          <p className="text-center text-[12px] text-dim print:mt-1 print:text-left print:text-[10px]">
            {t('grading.recipients')}:{' '}
            {[
              ...new Set([
                ...grading.defaultRecipients,
                // Form 310 (Deferred Item) geht IMMER an den Training Admin
                ...(record.formTypeId === '310' ? grading.deferredRecipients : []),
                // 306 (Additional Training) geht zusätzlich an die Eskalationsempfänger
                ...(record.formTypeId === '306' ||
                record.trainees.some((tr) => tr.overall === 'not_competent') ||
                record.sessionStatus === 'not_completed'
                  ? grading.escalationRecipients
                  : []),
                ...(record.extraRecipients ?? []),
              ]),
            ].join(', ')}
          </p>
        )}

        {/* Druck-Fuß: Dokumentkennung auf jedem Blatt, immer zuunterst */}
        <p className="hidden border-t border-line/40 pt-1.5 text-[10px] text-dim print:block">
          {[
            doc.atoName,
            `${record.formTypeId} — ${formType?.title ?? ''}`,
            doc.formRevision,
            `ID ${record.id}`,
            record.status === 'signed'
              ? t('grading.status.signed')
              : t('grading.status.awaiting_signature'),
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </Page>
    </>
  )
}
