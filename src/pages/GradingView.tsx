import { AlertTriangle, CheckCircle2, Clock, Printer, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { contentFingerprint, HASH_VERSION, shortFingerprint } from '../docHash'
import { networkReachable } from '../net'
import { useUnsavedWork } from '../editGuard'
import { SignaturePad } from '../components/SignaturePad'
import { useTranslation } from 'react-i18next'
import { Badge, Button, Card, CardHeading, Page, TopBar } from '../components/ui'
import { navigate } from '../router'
import { useStore, userHasPerm } from '../store'
import type { GradingRecord } from '../types'
import { isNotCompetent, traineesOf } from '../gradingRules'
import { formatDate, formatDateTime, gradeColor, missingFollowUps, TrafficDot, trafficLight } from './Grading'

/**
 * Abgeschicktes Formular: read-only nach beidseitiger Signatur (Spez. 5.5).
 * Die Druckansicht ist der Vorläufer des 1:1-PDF-Nachbaus — sie folgt der
 * Tabellenstruktur des Originalformulars.
 */
export function GradingView({ recordId, autoPrint = false }: { recordId: string; autoPrint?: boolean }) {
  // Formulare sind immer vollständig englisch, unabhängig von der App-Sprache
  const { t } = useTranslation()
  const { state, currentUser, saveGradingRecord, retryGradingMail, gradingRecordById } = useStore()
  // Berechtigungsprüfung am Objekt: fremde Formulare sind über die URL weder
  // les- noch unterschreibbar. Nicht gefunden = nicht berechtigt.
  const record = gradingRecordById(recordId)
  const [lateSignature, setLateSignature] = useState<string | null>(null)
  // Eine geleistete, ungespeicherte Unterschrift darf kein automatisches
  // Update mehr wegwerfen — der Pilot ist dann längst gegangen.
  useUnsavedWork(lateSignature !== null)

  // Fingerabdruck nachrechnen: stimmt der gespeicherte Abdruck nicht mehr
  // mit dem Inhalt überein, wurde nach der Unterschrift verändert — das
  // Dokument sagt es dann selbst (auch auf dem Ausdruck).
  const [hashState, setHashState] = useState<'ok' | 'bad' | null>(null)
  useEffect(() => {
    setHashState(null)
    if (!record?.contentHash) return
    let stop = false
    // Mit DER Fassung nachrechnen, unter der das Dokument entstanden ist —
    // sonst meldet jede spätere Erweiterung der Feldliste den gesamten
    // Altbestand als „nachträglich geändert".
    void contentFingerprint({ ...record, contentHash: undefined }, record.hashVersion ?? 1).then((h) => {
      if (!stop) setHashState(h === record.contentHash ? 'ok' : 'bad')
    })
    return () => {
      stop = true
    }
  }, [record])

  // Redirect als Effekt, nicht als Seiteneffekt in der Render-Phase.
  useEffect(() => {
    if (!record) navigate('/grading')
  }, [record])

  // Der Browser benennt das gedruckte PDF nach dem Dokumenttitel. Solange
  // dieses Formular offen ist, heißt das Dokument deshalb nach dem Schema
  // Form_Titel_Person_Instruktor_Datum_Event — z. B.
  // "308A_Grading Sheet TR_Sophie Berger_Michael Holy_05.08.2026_FFS4".
  useEffect(() => {
    if (!record) return
    const typ = state.settings.grading.formTypes.find((f) => f.id === record.formTypeId)
    // Der Name der geschulten Person gehoert in den Dateinamen: Abgelegt
    // wird nach Pilot, nicht nach Instruktor — ohne ihn liegen zwoelf
    // gleichnamige PDFs im selben Ordner.
    const person = record.trainees.map((tr) => tr.traineeName || state.users.find((u) => u.id === tr.traineeId)?.name || '').filter(Boolean)
    const teile = [
      record.formTypeId,
      // Wortlaut vom Unterschriftszeitpunkt, nicht der aktuelle Katalog.
      record.docSnapshot?.formTitle || typ?.title || '',
      (person.length > 0 ? person : [record.header.traineeName].filter(Boolean)).join(', '),
      state.users.find((u) => u.id === record.instructorId)?.name ?? '',
      record.header.date ? formatDate(record.header.date) : '',
      (record.header.event ?? '').replace(/\s+/g, ''),
    ]
    document.title = teile
      .filter(Boolean)
      .join('_')
      .replace(/[\/:*?"<>|]/g, '-')
    return () => {
      document.title = 'Instructor Connect'
    }
  }, [record, state.settings.grading.formTypes, state.users])

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

  // Der führende Instruktor selbst …
  const mayCountersign = record.instructorId === currentUser!.id
  // … oder eine Vertretung, wenn er deaktiviert ist und niemand sonst mehr
  // an die offene Unterschrift käme.
  const ownerActive = state.users.find((u) => u.id === record.instructorId)?.active !== false
  const mayDeputise = !mayCountersign && !ownerActive && userHasPerm(state.settings, currentUser, 'grading_view_all')

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

  /**
   * Wer wurde geschult — auf dem DOKUMENT, nicht nur in der Bewertung.
   *
   * Die Grading Sheets (308A–H) fuehren ihre Person in `trainees`, nicht als
   * Kopfdatenfeld. Auf dem Ausdruck stand sie damit erst weit unten als
   * Ueberschrift ueber dem Notenraster: Der Kopf eines 308A nannte Muster,
   * Datum und Instruktor — aber nicht den Piloten. Wer das Blatt aus der
   * Ablage zieht oder das PDF ablegt, sucht genau diesen Namen zuerst.
   * 306 und 310 haben ihn als eigenes Kopffeld (`traineeName`); dort waere
   * eine zweite Zeile eine Dopplung, deshalb die Abfrage.
   */
  // `traineesOf` erbt bei Folgeformularen notfalls den Piloten vom
  // Ausgangsblatt — Listen und Admin loesen ihn schon immer so auf, die
  // Druckansicht nicht. Ein 306 aus der Zeit vor dem Pflichtfeld
  // „Pilot / Student Name" stand damit in jeder Liste MIT Namen, auf dem
  // Dokument aber ohne.
  const personNames = record.trainees.map(traineeLabel).filter(Boolean)
  const hasNameField = !!formType?.fields.some((f) => f.key === 'traineeName')
  // 308G beurteilt keinen Piloten, sondern einen angehenden Instruktor. „(CAI)"
  // wie bei seiner Unterschrift — das Originalformular fuehrt daneben eine
  // Zeile „Candidate Instructor" mit der Qualifikation (TRI/SFI/MCCI
  // Candidate); das Kuerzel unterscheidet die Person von ihrer Qualifikation.
  const personLabel = formType?.competencySet === 'instructor' ? t('forms:personCai') : t('forms:personPilot')
  const showPersonRow = !hasNameField && personNames.length > 0
  // Fuer Fuss und Dateiname: 306/310 tragen ihre Person im Kopffeld, die
  // Grading Sheets in `trainees` — beide Wege muessen zum selben Namen fuehren.
  const docPersons =
    personNames.length > 0
      ? personNames
      : record.header.traineeName
        ? [record.header.traineeName]
        : // Geerbter Pilot eines Folgeformulars (siehe oben)
          traineesOf(record, state.gradingRecords).map(traineeLabel).filter(Boolean).length > 0
          ? traineesOf(record, state.gradingRecords).map(traineeLabel).filter(Boolean)
          : // 307A/307B fuehren weder Kopffeld noch `trainees` — ihre Personen
            // stehen in der Teilnehmerliste. Ohne diesen Zweig trug ein
            // Anwesenheitsnachweis auf keinem Blatt einen Namen.
            record.attendance && record.attendance.length > 0
          ? [record.attendance[0].name + (record.attendance.length > 1 ? ` +${record.attendance.length - 1}` : '')].filter(Boolean)
          : []

  // Kopf-/Fußzeile des Ausdrucks kommt aus den Einstellungen, damit der
  // Superadmin ATO-Kennung und Formularstand ohne Deployment pflegen kann.
  const liveDoc = state.settings.documentHeader ?? { atoName: '', approvalNumber: '', approvalNumberUK: '', formRevision: '' }
  /*
   * Maßgeblich ist der im Datensatz EINGEFRORENE Stand.
   *
   * ATO-Name, Zulassungsnummer, Formularstand und Formulartitel wurden hier
   * zur Druckzeit aus den Einstellungen gelesen — und sind dort frei
   * änderbar. Ein vor drei Monaten unterschriebenes Dokument druckte danach
   * eine andere Zulassungsnummer, und der Fingerabdruck meldete trotzdem
   * „unverändert". Nur Altbestand ohne Momentaufnahme faellt auf die
   * aktuellen Einstellungen zurück.
   */
  const snap = record.docSnapshot
  // Auch der Formulartitel ist im Katalog editierbar — auf dem Dokument gilt
  // der Wortlaut vom Unterschriftszeitpunkt.
  const formTitel = snap?.formTitle || formType?.title || ''
  const doc = {
    atoName: snap?.atoName || liveDoc.atoName,
    formRevision: snap?.formRevision || liveDoc.formRevision,
  }
  // Kennung nach der Behörde des Trainings; Altbestand ohne Angabe = AT
  const approval = snap?.approval || (record.authority === 'UK' ? liveDoc.approvalNumberUK : liveDoc.approvalNumber) || liveDoc.approvalNumber
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
          <button onClick={() => window.print()} title={t('forms:print')} className="flex h-11 w-11 items-center justify-center rounded-full text-dim transition hover:bg-line/5 hover:text-accent">
            <Printer size={19} />
          </button>
        }
      />
      {/* print-doc/-head/-body/-foot: Im Ausdruck werden daraus Tabellenrollen
          (siehe index.css) — nur so wiederholen Chrome und Safari Kopf und
          Fuss auf JEDEM Blatt. Am Bildschirm sind Kopf und Fuss ausgeblendet,
          der Abstand zwischen den Karten sitzt deshalb am Rumpf. */}
      <Page wide className="print-doc">
        {/* Druck-Kopf: Organisation, Formularbenennung, Formularstand und
            Export-Stempel — ohne diese Angaben lässt sich ein Ausdruck weder
            der ATO noch einem Formularstand zuordnen. */}
        <div className="print-head border-b-2 border-line/60 pb-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide">
            {doc.atoName}
            {doc.atoName && approval ? ' · ' : ''}
            {/* Die ATO-Kennung darf nicht mitten im Wert umbrechen — auf dem
                Ausdruck ist sie die Zuordnung zur Zulassung. */}
            {approval && <span className="zusammen">{approval}</span>}
          </p>
          <h1 className="text-2xl font-bold tracking-tight">
            {record.formTypeId} — {formTitel}
          </h1>
          {/* Die Person gehoert in den KOPF, weil sich nur der auf jedem Blatt
              wiederholt (Chrome druckt Fussgruppen nur auf dem letzten Blatt).
              Damit traegt auch Blatt 3 eines langen Nachweises den Namen. */}
          {docPersons.length > 0 && (
            <p className="text-[12px] font-semibold">
              {personLabel}: {docPersons.join(', ')}
            </p>
          )}
          <p className="mt-1 flex justify-between gap-4 text-[11px] text-dim">
            <span>{t('forms:exportStamp', { date: formatDateTime(Date.now() + state.timeOffsetMs), name: currentUser!.name })}</span>
            <span className="zusammen">{doc.formRevision}</span>
          </p>
        </div>

        <div className="print-body space-y-4">
        {/* iPad/iPhone: Druckdialog braucht einen Fingertipp */}
        {printHint && (
          <div className="space-y-3 rounded-xl border border-accent/40 bg-accent/10 p-3.5 print:hidden">
            <p className="text-[13px] leading-relaxed">{t('forms:printHintBody')}</p>
            <Button
              onClick={() => {
                setPrintHint(false)
                window.print()
                navigate(`/grading/${recordId}`)
              }}
              className="flex w-full items-center justify-center gap-2"
            >
              <Printer size={16} /> {t('forms:printNow')}
            </Button>
            <p className="text-[11.5px] leading-relaxed text-dim">{t('forms:printShareFallback')}</p>
          </div>
        )}

        {/* Status ist Bedienoberfläche — auf Papier steht der Stand im Kopf */}
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <TrafficDot color={trafficLight(record, state.gradingRecords)} />
          {record.status === 'signed' ? (
            <Badge tone="dim">
              <CheckCircle2 size={11} className="mr-1" /> {t('forms:status.signed')}
            </Badge>
          ) : (
            <Badge tone="warm">
              <Clock size={11} className="mr-1" /> {t('forms:status.awaiting_signature')}
            </Badge>
          )}
          <Badge tone={record.mailStatus === 'sent' ? 'accent' : 'dim'}>{t(`forms:mail.${record.mailStatus}`)}</Badge>
        </div>

        {record.mailStatus === 'failed' && (
          <div className="space-y-3 rounded-xl border border-danger/30 bg-danger/10 p-3.5 text-[13px] print:hidden">
            <div className="flex items-start gap-2.5">
              <AlertTriangle size={16} className="mt-0.5 shrink-0 text-danger" />
              <div>
                <p className="font-semibold text-danger">{t('forms:mail.failed')}</p>
                {record.mailError && <p className="mt-0.5 text-dim">{record.mailError}</p>}
              </div>
            </div>
            {/* Erneut senden direkt aus dem Formular — nicht nur im Admin-Panel */}
            <Button onClick={() => retryGradingMail(record.id)} className="flex w-full items-center justify-center gap-2">
              <RefreshCw size={15} /> {t('forms:sendAgain')}
            </Button>
          </div>
        )}

        {/* Pflicht-Folgeformular fehlt noch: deutlich sichtbar + direkt ausfüllbar */}
        {missing.length > 0 && (
          <div className="space-y-3 rounded-xl border border-wait/50 bg-wait/10 p-3.5 print:hidden">
            <div className="flex items-start gap-2.5 text-[13px]">
              <AlertTriangle size={16} className="mt-0.5 shrink-0 text-wait" />
              <p className="font-semibold">{t('forms:followUpWarn')}</p>
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
                  {started ? t('forms:openUnsignedFollowUp', { form: title }) : t('forms:fillNow', { form: title })}
                </Button>
              )
            })}
          </div>
        )}

        {record.status === 'signed' && (
          <p className="rounded-xl border border-line/10 bg-surface/60 p-3.5 text-[12.5px] leading-relaxed text-dim print:hidden">{t('forms:readOnlyNote')}</p>
        )}

        {/* Rueckverweis auf das Ausgangsblatt — im DRUCK. Die Rueckrichtung
            („anhaengende Formulare") stand schon auf dem Papier, die
            Hinrichtung nicht: Auf dem ausgedruckten 306 stand nirgends, zu
            welcher Session es gehoert. Aus der Ablage gezogen war es damit
            ein Blatt ohne Vorgang. */}
        {parentRec && (
          <p className="hidden text-[10px] text-dim print:block">
            {t('forms:followUpTo', {
              form: `${parentRec.formTypeId} — ${parentRec.docSnapshot?.formTitle || grading.formTypes.find((f) => f.id === parentRec.formTypeId)?.title || ''}`,
              date: formatDate(parentRec.header.date || parentRec.createdAt),
              id: parentRec.id,
            })}
          </p>
        )}

        {/* Folgeformulare (306/310): das auslösende Grading Sheet geht beim
            Versand automatisch mit */}
        {parentRec && (
          <p className="rounded-xl border border-line/10 bg-surface/60 p-3.5 text-[12.5px] leading-relaxed text-dim print:hidden">
            {t('forms:mailAttachment', { form: `${parentRec.formTypeId} — ${grading.formTypes.find((f) => f.id === parentRec.formTypeId)?.title ?? ''}` })}{' '}
            <button onClick={() => navigate(`/grading/${parentRec.id}`)} className="font-medium text-accent hover:underline">
              {t('forms:openParent')}
            </button>
          </p>
        )}

        {/* Kopfdaten */}
        <Card className="p-4">
          <CardHeading className="mb-3">{t('forms:headerData')}</CardHeading>
          <dl className="grid gap-x-4 gap-y-2 text-[13.5px] sm:grid-cols-2">
            {/* Die geschulte Person steht an erster Stelle — sie ist die
                Zuordnung des Nachweises, alles andere beschreibt den Termin. */}
            {showPersonRow && (
              <div className="flex justify-between gap-3 border-b border-line/[0.06] pb-1.5">
                <dt className="text-dim">{personLabel}</dt>
                <dd className="text-right font-medium">{personNames.join(', ')}</dd>
              </div>
            )}
            <div className="flex justify-between gap-3 border-b border-line/[0.06] pb-1.5">
              <dt className="text-dim">{t('forms:instructor')}</dt>
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
              [t('forms:instructorQual'), record.header.instructorQual],
              [t('forms:instructorSeat'), record.header.instructorSeat],
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
            <CardHeading className="mb-2">{t('forms:attendance')}</CardHeading>
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
                      <span className="shrink-0 text-[12px] text-dim">{t('forms:missingSignature')}</span>
                    ))}
                </li>
              ))}
            </ol>
            {record.formTypeId === '307B' && (
              <p className="mt-2 text-[11.5px] leading-relaxed text-dim">{t('forms:attendance307B')}</p>
            )}
          </Card>
        )}

        {/* Bewertungen */}
        {record.trainees.map((tr, i) => (
          <Card key={i} className="p-4">
            {/* Name links, Position/Sitz und Ergebnis rechts — die rechte
                Gruppe schrumpft NICHT: Bei einem langen Namen blieben ihr am
                Telefon wenige Millimeter, und die projektweite Umbruchregel
                machte aus dem Ergebnis „Not Compe/tent". Gemessen bei 320 px:
                „Competent" stand auf zwei Zeilen. Passt beides nicht
                nebeneinander, rueckt das Ergebnis geschlossen darunter. */}
            <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <p className="min-w-0 text-[15px] font-semibold">{traineeLabel(tr)}</p>
              <span className="ml-auto flex shrink-0 items-center gap-2 whitespace-nowrap">
                <span className="text-[12px] text-dim">{[tr.position, tr.seat].filter(Boolean).join(' · ')}</span>
                {tr.overall && (
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold ${
                      tr.overall === 'competent' ? 'bg-emerald-700 text-white' : 'bg-red-600 text-white'
                    }`}
                  >
                    {t(`forms:${tr.overall}`)}
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

            {/* Notenmassstab: Gedruckt standen nackte Ziffern 1–5 und „NO",
                zusaetzlich farbig hinterlegt — in Schwarzweiss faellt die
                Farbe weg, und ein Pruefer kann das Blatt nicht aus sich
                heraus lesen. Am Bildschirm waere die Zeile Ballast (dort
                erklaert die Eingabemaske die Noten), deshalb nur im Druck. */}
            <p className="mt-2 hidden text-[9.5px] leading-snug text-dim print:block">{t('forms:gradeScale')}</p>

            <div className="mt-3 grid gap-3 sm:grid-cols-3 print:grid-cols-3">
              {[
                ['positive', tr.positiveComment],
                ['development', tr.developmentComment],
                ['summary', tr.summaryComment],
              ].map(([key, val]) =>
                val ? (
                  <div key={key}>
                    <p className="text-[12.5px] font-semibold text-dim">{t(`forms:${key}`)}</p>
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
            <CardHeading className="mb-2">Overall Result</CardHeading>
            <div className="space-y-1.5 text-[13.5px]">
              {/* Maßgeblich ist `isNotCompetent`, nicht das rohe Feld: Eine 1 oder
                  zwei Zweien machen einen Piloten rechnerisch „Not Competent"
                  (gradingRules), unabhaengig davon, was im Feld steht. Vorher
                  las diese Zeile nur das Feld — auf dem Papier stand dann
                  „☒ Competent / Continue to next session", waehrend die Ampel
                  gelb war und die App ein 306 einforderte. Das Dokument ist der
                  Nachweis; es darf dem System nicht widersprechen. */}
              {record.trainees.map((tr, i) => (
                <div key={i}>
                  <p className="flex items-start gap-2">
                    <span className="font-mono">{!isNotCompetent(tr) && tr.overall === 'competent' ? '☒' : '☐'}</span>
                    <span>Competent / Continue to next session</span>
                  </p>
                  <p className="flex items-start gap-2">
                    <span className="font-mono">{isNotCompetent(tr) ? '☒' : '☐'}</span>
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
                auf einer TRI/SFI/MCCI-Beurteilung haben sie nichts verloren.
                Eine dritte Fußnote gab es zur Skill-Test-Reife; sie nannte
                Formular 311, das es nicht gibt, und ist entfallen. */}
            {pilotFootnotes && (
              <div className="mt-3 space-y-1 text-[11.5px] leading-relaxed text-dim">
                <p>{t('forms:footnote1')}</p>
                <p>{t('forms:footnote2')}</p>
              </div>
            )}
          </Card>
        )}

        {/* Anhängende Formulare */}
        {linked.length > 0 && (
          <Card className="p-4">
            <CardHeading className="mb-2">{t('forms:linkedForms')}</CardHeading>
            {linked.map((l) => (
              <div key={l.id} className="py-1 text-[13.5px]">
                {/* Auf Papier muss der Verweis stehen bleiben — der Druckstil
                    blendet Schaltflächen aus, deshalb hier Text plus Knopf. */}
                <span className="hidden print:inline">
                  {l.formTypeId} — {grading.formTypes.find((f) => f.id === l.formTypeId)?.title}
                  {l.signedAt ? ` · ${t('forms:signedAt', { date: formatDateTime(l.signedAt) })}` : ''}
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
          <CardHeading className="mb-3">{t('forms:signatures')}</CardHeading>
          {/* Wurde die Unterschrift des Piloten in Vertretung eingeholt, gehört
              das auf das Dokument — auch auf den Ausdruck. */}
          {record.lateSignatureBy && (
            <p className="mb-3 rounded-lg border border-warm/30 bg-warm/5 px-3 py-2 text-[12px] leading-relaxed">
              {t('forms:deputisedNote', {
                name: state.users.find((u) => u.id === record.lateSignatureBy)?.name ?? record.lateSignatureBy,
              })}
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              [record.formTypeId === '308G' ? 'Signature Course Instructor (COI)' : t('forms:sigInstructor'), record.signatureInstructor],
              [record.formTypeId === '308G' ? 'Signature Candidate Instructor (CAI)' : t('forms:sigTrainee'), record.signatureTrainee],
            ]
              .filter(([, sig]) => sig !== null || !record.attendance)
              .map(([label, sig]) => (
              <div key={label as string}>
                <p className="mb-1 text-[12.5px] text-dim">{label}</p>
                {sig ? (
                  <img
                    src={sig as string}
                    alt={t('forms:sigAlt', { label })}
                    className="h-24 w-full rounded-lg border border-line/15 bg-white object-contain"
                  />
                ) : (
                  <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-line/25 text-[12.5px] text-dim">
                    {t('forms:missingSignature')}
                  </div>
                )}
              </div>
            ))}
          </div>
          {record.signedAt && <p className="mt-3 text-[12px] text-dim">{t('forms:signedAt', { date: formatDateTime(record.signedAt) })}</p>}
          {record.instructorSignedAt && record.countersignedAt && (
            <p className="text-[12px] text-dim">
              {t('forms:instrSignedAt', { date: formatDateTime(record.instructorSignedAt) })} ·{' '}
              {t('forms:counterSignedAt', { date: formatDateTime(record.countersignedAt) })}
            </p>
          )}
          {record.contentHash && (
            <p className={`mt-1 text-[11.5px] ${hashState === 'bad' ? 'font-semibold text-danger' : 'text-dim'}`}>
              {t('forms:fingerprint', { hash: shortFingerprint(record.contentHash) })}
              {hashState === 'ok' && ` — ${t('forms:fingerprintOk')}`}
              {hashState === 'bad' && ` — ${t('forms:fingerprintBad')}`}
            </p>
          )}

          {/* Offene Unterschrift nachholen: nur das fehlende Feld ist offen,
              danach wird das Formular wie üblich gesperrt und versendet. */}
          {/* Nachtragen darf der Instruktor, der das Formular geführt hat — er
              legt das Gerät dem Piloten vor. Vollzugriff (Ablage/Admin)
              berechtigt sonst zum Lesen, nicht zum Unterschreiben.
              Ausnahme: Ist der führende Instruktor deaktiviert, käme niemand
              mehr an die offene Unterschrift, und der Nachweis bliebe für
              immer unvollständig — dann darf ein Vollzugriffsberechtigter
              vertreten. Wer es war, steht danach auf dem Dokument. */}
          {record.status === 'awaiting_signature' && !record.signatureTrainee && (mayCountersign || mayDeputise) && (
            <div className="mt-4 space-y-3 rounded-xl border border-warm/25 bg-warm/5 p-3.5 print:hidden">
              <SignaturePad
                value={lateSignature}
                onChange={setLateSignature}
                label={record.formTypeId === '308G' ? 'Signature Candidate Instructor (CAI)' : t('forms:sigTrainee')}
              />
              <Button
                disabled={!lateSignature}
                className="w-full"
                onClick={async () => {
                  const now = Date.now() + state.timeOffsetMs
                  const next: GradingRecord = {
                    ...record,
                    signatureTrainee: lateSignature,
                    ...(mayCountersign ? {} : { lateSignatureBy: currentUser!.id }),
                    status: 'signed',
                    // Ohne Netz in den Ausgangskorb statt „versendet". Maßgeblich
                    // ist die echte Probe, nicht navigator.onLine: das meldet
                    // „online" auch im WLAN ohne Internet.
                    mailStatus: (await networkReachable()) ? 'sent' : 'queued',
                    // Chronologie bleibt erhalten: signedAt (Abschluss) wird
                    // gesetzt, der Zeitpunkt der Instruktorunterschrift steht
                    // in instructorSignedAt und wird hier NICHT angefasst —
                    // bei 306-Vorgängen ist genau diese Abfolge prüfrelevant.
                    signedAt: now,
                    countersignedAt: now,
                  }
                  saveGradingRecord({ ...next, contentHash: await contentFingerprint(next), hashVersion: HASH_VERSION })
                  setLateSignature(null)
                  // Fehlt noch ein Pflicht-Folgeformular, bleibt der Nutzer auf
                  // dem Formular und sieht dort, was offen ist.
                  if (missingFollowUps(record, state.gradingRecords).length === 0) navigate('/grading')
                }}
              >
                {t('forms:completeSignature')}
              </Button>
            </div>
          )}
        </Card>

        {isAdmin && (
          <p className="text-center text-[12px] text-dim print:mt-1 print:text-left print:text-[10px]">
            {t('forms:recipients')}:{' '}
            {[
              ...new Set([
                ...grading.defaultRecipients,
                // Form 310 (Deferred Item) geht IMMER an den Training Admin
                ...(record.formTypeId === '310' ? grading.deferredRecipients : []),
                // 306 (Additional Training) geht zusätzlich an die Eskalationsempfänger
                // Dieselbe Regel wie oben: auch der rechnerisch nicht
                // bestandene Pilot loest die Eskalation aus.
                ...(record.formTypeId === '306' ||
                record.trainees.some(isNotCompetent) ||
                record.sessionStatus === 'not_completed'
                  ? grading.escalationRecipients
                  : []),
                ...(record.extraRecipients ?? []),
              ]),
            ].join(', ')}
          </p>
        )}

        </div>

        {/* Druck-Fuß: schliesst das Dokument ab (ID, Stand, Status). Er steht
            auf dem LETZTEN Blatt — Chrome wiederholt Fussgruppen im Druck
            nicht zuverlaessig, Kopfgruppen schon. Die Zuordnung jedes
            einzelnen Blattes traegt deshalb der Kopf. */}
        <p className="print-foot border-t border-line/40 pt-1.5 text-[10px] text-dim">
          {[
            doc.atoName,
            `${record.formTypeId} — ${formTitel}`,
            docPersons.join(', '),
            doc.formRevision,
            `ID ${record.id}`,
            record.status === 'signed'
              ? t('forms:status.signed')
              : t('forms:status.awaiting_signature'),
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </Page>
    </>
  )
}
