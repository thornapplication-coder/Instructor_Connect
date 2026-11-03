import { BarChart3, Ban, FileText, Image as ImageIcon, Info, Paperclip, Plus, SendHorizonal, Trash2, X } from 'lucide-react'
import { memo, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge, Button, DialogMeldung, Field, inputCls, Modal, NewDot, TopBar } from '../components/ui'
import { ablehnungZeigen } from '../dialogMeldung'
import { toast } from '../components/Toast'
import i18n from '../i18n'
import { anhangZuGross, nachrichtAbgewiesen, prozentAnteile, spaetestesUmfrageEnde, stimmenJeOption, VERLAUF_SCHRITT, verlaufFenster, umfrageAbgewiesen, umfrageAblaufFehler, umfrageEndeAus, utcTag, utcZeit, type NachrichtGrund } from '../chatRules'
import { useUnsavedWork } from '../editGuard'
import { navigate } from '../router'
import { darfAbstimmen, darfSchreiben, darfUmfrageSchliessen } from '../storeRechte'
import { mayAccessGroup, useStore } from '../store'
import type { Attachment, Message, Poll, PollType } from '../types'
import { formatDateTime } from '../datum'

/* App-weites Datumsformat DD.MM.YYYY — formatDateTime liefert es samt Uhrzeit;
   vorher zeigte Englisch 14/08 und ohne Jahr. */
function timeLabel(ts: number) {
  return formatDateTime(ts)
}

function AttachmentChip({ a }: { a: Attachment }) {
  const Icon = a.kind === 'image' ? ImageIcon : FileText
  return (
    <span className="mt-2 flex items-center gap-2 rounded-xl bg-line/10 px-3 py-2 text-small">
      <Icon size={16} className="shrink-0 text-accent" />
      <span className="min-w-0 truncate">{a.name}</span>
      <span className="shrink-0 text-micro text-dim">{a.sizeMB.toFixed(1)} MB</span>
    </span>
  )
}

/**
 * Eine Nachricht. `memo`: Neu gezeichnet wird eine Blase nur, wenn sich IHRE
 * Angaben ändern — vorher zeichnete jede Änderung (auch jeder Tastendruck in
 * der Eingabe) alle Blasen des Verlaufs neu (Audit 11/2026, TEC-10). Dafür
 * sind alle Angaben Werte oder stabile Funktionen; `onDelete` bekommt die ID.
 */
const MessageBubble = memo(function MessageBubble({ msg, isOwn, authorName, bold, canDelete, onDelete, lng }: {
  msg: Message
  isOwn: boolean
  authorName: string
  bold: boolean
  canDelete: boolean
  onDelete: (id: string) => void
  lng: string
}) {
  const t = i18n.getFixedT(lng)
  return (
    <div className={`group flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`relative max-w-[82%] rounded-bubble px-4 py-2.5 shadow-soft ${
          isOwn ? 'rounded-br-md bg-accent/20' : 'rounded-bl-md bg-surface'
        }`}
      >
        {/* Der Absender steht über JEDER Nachricht — auch über den eigenen,
            damit in Gruppen immer klar ist, wer geschrieben hat. */}
        <p className={`mb-0.5 text-micro font-semibold ${isOwn ? 'text-dim' : 'text-accent'}`}>{authorName}</p>
        <p className={`whitespace-pre-wrap text-body leading-relaxed ${bold ? 'font-bold' : ''}`}>{msg.text}</p>
        {msg.attachment && <AttachmentChip a={msg.attachment} />}
        <p className="mt-1 text-right text-micro text-dim">{timeLabel(msg.createdAt)}</p>
        {/*
          Loeschen: per Tastatur, Touch und Maus erreichbar (Audit 11/2026,
          KERN-10, MOB-04, UID-12). Vorher `hidden … group-hover:block` —
          display:none nahm den Knopf aus der Tab-Reihenfolge, und auf dem
          Telefon hing er am klebenden Hover. Jetzt bleibt er im Baum und
          nur unsichtbar: Hover, Fokus in der Blase und Tastaturfokus zeigen
          ihn; ohne Hover-Faehigkeit (Touch) steht er immer da. Die Flaeche
          ist 44×44 (min-h-11 allein ergab eine senkrechte 20×44-Pille), der
          sichtbare Kreis darin bleibt klein an der Blasenecke.
        */}
        {canDelete && (
          <button
            onClick={() => onDelete(msg.id)}
            className="group/del absolute -right-4 -top-4 flex h-11 w-11 items-center justify-center rounded-full opacity-0 transition-opacity focus-visible:opacity-100 group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
            aria-label={t('common.delete')}
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-danger text-bg shadow-soft transition group-hover/del:brightness-110">
              <Trash2 size={12} />
            </span>
          </button>
        )}
      </div>
    </div>
  )
})

function PollCard({ poll }: { poll: Poll }) {
  const { t } = useTranslation()
  const { state, currentUser, vote, closePoll } = useStore()
  const group = state.groups.find((g) => g.id === poll.groupId)!
  const author = state.users.find((u) => u.id === poll.authorId)
  const options = poll.type === 'yesno' ? [t('common.yes'), t('common.no')] : poll.options
  const totalVotes = Object.keys(poll.votes).length
  // Ganze Prozent mit Summe 100 (chatRules.ts). Vorher rundete die Karte je
  // Option einzeln — 33 + 33 + 33 = 99 % —, und die Korrektur daneben war
  // toter Code (Audit 11/2026, KERN-15).
  const stimmen = stimmenJeOption(options.length, poll.votes)
  const anteile = prozentAnteile(stimmen)
  const myVote = poll.votes[currentUser!.id]
  // Abgelaufene Umfragen sind automatisch geschlossen
  const expired = !!poll.validUntil && poll.validUntil <= Date.now() + state.timeOffsetMs
  const closed = poll.closed || expired
  // Dieselbe Regel wie im Store (storeRechte.ts): Autor oder Admin der Gruppe.
  const mayClose = !closed && darfUmfrageSchliessen(currentUser, poll, group)
  // Abstimmen nur als Mitglied — der Store verwirft die Stimme sonst still,
  // und der Knopf saehe aus wie einer, der nichts tut (KERN-19).
  const mayVote = !closed && darfAbstimmen(currentUser, group)

  return (
    <div className="mx-auto w-full max-w-md rounded-2xl border border-accent/20 bg-surface p-4 shadow-soft">
      <div className="mb-1 flex items-center gap-2 text-micro text-dim">
        <BarChart3 size={14} className="text-accent" />
        <span>
          {t('chat.poll')} · {author?.name}
        </span>
        {closed && (
          <span className="ml-auto"><Badge tone="dim">{t('chat.closed')}</Badge></span>
        )}
      </div>
      <p className="mb-1 text-lead font-semibold leading-snug">{poll.question}</p>
      {poll.validUntil && (
        <p className={`mb-3 text-micro ${expired ? 'text-danger' : 'text-dim'}`}>
          {t('chat.pollValidUntil')}: {utcZeit(poll.validUntil)}
        </p>
      )}
      <div className="space-y-stack">
        {options.map((opt, i) => {
          const count = stimmen[i]
          const pct = anteile[i]
          const chosen = myVote === i
          return (
            // aria-pressed: Die eigene Wahl zeigte nur Fettschrift und Farbe —
            // wer vorgelesen bekommt, erfuhr nicht, wofür er gestimmt hat
            // (Audit 11/2026, A11Y-08).
            <button
              key={i}
              disabled={!mayVote}
              aria-pressed={chosen}
              onClick={() => vote(poll.id, i)}
              className={`min-h-11 relative block w-full overflow-hidden rounded-xl border px-3 py-2 text-left transition ${
                chosen ? 'border-accent bg-accent/10' : 'border-line/10 hover:border-line/25'
              } ${mayVote ? '' : 'cursor-default'}`}
            >
              <span
                className="absolute inset-y-0 left-0 bg-accent/15 transition-all"
                style={{ width: `${pct}%` }}
              />
              <span className="relative flex items-center justify-between gap-2 text-body">
                <span className={chosen ? 'font-semibold text-accent' : ''}>{opt}</span>
                <span className="shrink-0 text-micro text-dim">
                  {count} · {pct}%
                </span>
              </span>
            </button>
          )
        })}
      </div>
      <div className="mt-3 flex items-center justify-between text-micro text-dim">
        {/* role=status: eine abgegebene oder geänderte Stimme wird angesagt */}
        <span role="status">
          {t('chat.votes', { count: totalVotes })} · {t('chat.changeHint')}
        </span>
        {/* Schließen ist endgültig — niemand kann danach mehr abstimmen.
            Vorher 18 px hoch und ohne Rückfrage: ein Fehltipper beim
            Scrollen genügte (Audit 11/2026, MOB-05). */}
        {mayClose && (
          <button
            onClick={() => {
              if (window.confirm(t('chat.closePollConfirm'))) closePoll(poll.id)
            }}
            className="-my-2 min-h-11 shrink-0 rounded-lg px-2 font-medium text-accent hover:underline"
          >
            {t('chat.closePoll')}
          </button>
        )}
      </div>
    </div>
  )
}

function PollModal({ groupId, onClose }: { groupId: string; onClose: () => void }) {
  const { t } = useTranslation()
  const { state, now, createPoll, effectiveRetention } = useStore()
  const [question, setQuestion] = useState('')
  const [type, setType] = useState<PollType>('yesno')
  const [options, setOptions] = useState(['', ''])
  // Gültigkeit in UTC — Datum + Uhrzeit werden als UTC interpretiert
  const [validDate, setValidDate] = useState('')
  const [validTime, setValidTime] = useState('23:59')
  const hinweisId = useId()
  const fehlerId = useId()
  const datumId = useId()
  /** Ablehnung beim Anlegen — im Dialog, nicht als Toast darunter (R3-DIALOGMELDUNG). */
  const [meldung, setMeldung] = useState<string | null>(null)

  /* Dieselbe Regel wie im Store (chatRules.ts): Vorher liess der Dialog ein
     vergangenes Datum zu, der Store verwarf die Umfrage still, und der
     Dialog schloss trotzdem (KERN-08). Dazu die Grenze der Aufbewahrung:
     Die Gruppe loeschte eine Umfrage, die laut Anzeige noch lief (KERN-09). */
  const group = state.groups.find((g) => g.id === groupId)
  const aufbewahrung = group ? effectiveRetention(group) : state.settings.defaultRetention
  const jetzt = now()
  const grenze = spaetestesUmfrageEnde(jetzt, aufbewahrung)
  const validUntil = umfrageEndeAus(validDate, validTime)
  const valid = umfrageAbgewiesen({ question, type, options, validUntil }, jetzt, aufbewahrung) === null
  // Am Datumsfeld nur, was dort zu aendern ist — und erst, wenn ein Datum steht.
  const ablauf = validDate ? umfrageAblaufFehler(validUntil, jetzt, aufbewahrung) : null
  const ablaufText =
    ablauf === 'ablaufVorbei'
      ? t('chat.pollEndPast')
      : ablauf === 'ablaufNachAufbewahrung' && grenze !== undefined
        ? t('chat.pollEndAfterRetention', { date: utcZeit(grenze) })
        : null

  return (
    <Modal
      title={t('chat.poll')}
      onClose={onClose}
      confirmDiscard={question.trim() || options.some((o) => o.trim()) || validDate ? t('common.discardConfirm') : undefined}
    >
      <div className="space-y-section">
        <Field label={t('chat.pollQuestion')}>
          <input className={inputCls} value={question} onChange={(e) => setQuestion(e.target.value)} />
        </Field>
        <Field label={t('chat.pollType')} group>
          <div className="flex gap-2">
            {(['yesno', 'multi'] as const).map((tp) => (
              <button
                key={tp}
                aria-pressed={type === tp}
                onClick={() => setType(tp)}
                className={`min-h-11 flex-1 rounded-xl border px-3 py-2.5 text-body transition ${
                  type === tp ? 'border-accent bg-accent/10 font-semibold text-accent' : 'border-line/10 text-dim'
                }`}
              >
                {t(`chat.${tp}`)}
              </button>
            ))}
          </div>
        </Field>
        {type === 'multi' && (
          <div className="space-y-stack">
            {options.map((opt, i) => (
              <div key={i} className="flex gap-2">
                {/* Name nicht nur im Platzhalter — der verschwindet beim
                    Tippen (Audit 11/2026, A11Y-07). */}
                <input
                  className={inputCls}
                  placeholder={`${t('chat.option')} ${i + 1}`}
                  aria-label={`${t('chat.option')} ${i + 1}`}
                  value={opt}
                  onChange={(e) => setOptions(options.map((o, j) => (j === i ? e.target.value : o)))}
                />
                {options.length > 2 && (
                  <button
                    onClick={() => setOptions(options.filter((_, j) => j !== i))}
                    aria-label={`${t('chat.option')} ${i + 1} — ${t('common.delete')}`}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-dim transition hover:bg-danger/10 hover:text-danger"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
            ))}
            <button
              onClick={() => setOptions([...options, ''])}
              className="flex min-h-11 items-center gap-1 text-small font-medium text-accent hover:underline"
            >
              <Plus size={14} /> {t('chat.addOption')}
            </button>
          </div>
        )}
        {/* Ablauf: Datum und Uhrzeit, beides in UTC. min/max grenzen den
            Kalender ein; getippte Werte ausserhalb nennt die Meldung.
            Als Gruppe mit je eigenem Namen: Ein <label> um beide Felder und
            den Hinweis gab dem Datumsfeld den ganzen Hinweistext als Namen,
            und das Uhrzeitfeld hatte gar keinen (Audit 11/2026, KERN-20).
            Den roten Rand traegt das Feld ueber aria-invalid (inputCls). */}
        <Field label={t('chat.pollValidUntilUtc') + ' *'} group invalid={!!ablaufText}>
          <div className="flex gap-2">
            <input
              id={datumId}
              type="date"
              className={inputCls}
              value={validDate}
              min={utcTag(jetzt)}
              max={grenze !== undefined ? utcTag(grenze) : undefined}
              aria-label={t('chat.pollDate')}
              aria-invalid={ablaufText ? true : undefined}
              aria-describedby={ablaufText ? `${fehlerId} ${hinweisId}` : hinweisId}
              onChange={(e) => setValidDate(e.target.value)}
            />
            <input
              type="time"
              className={inputCls}
              value={validTime}
              aria-label={t('chat.pollTime')}
              aria-describedby={hinweisId}
              onChange={(e) => setValidTime(e.target.value)}
            />
          </div>
          {ablaufText && (
            <p id={fehlerId} className="mt-1.5 text-micro leading-relaxed text-danger">
              {ablaufText}
            </p>
          )}
          <p id={hinweisId} className="mt-1.5 text-micro leading-relaxed text-dim">
            {t('chat.pollValidHint')}
            {grenze !== undefined && (
              <> {t('chat.pollRetentionLimit', { date: utcZeit(grenze), period: t(`retention.${aufbewahrung}`) })}</>
            )}
          </p>
        </Field>
        <DialogMeldung text={meldung} />
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            disabled={!valid}
            onClick={() => {
              // Bei Ablehnung bleibt der Dialog mit allen Eingaben offen —
              // und sagt es IM Dialog statt per Toast darunter
              // (R3-DIALOGMELDUNG): Liegt das Ende inzwischen hinter der
              // Aufbewahrung, steht der Grund am Datum; sonst (Mitgliedschaft,
              // Chat-Sperre) über den Knöpfen.
              setMeldung(null)
              if (createPoll(groupId, question.trim(), type, options.filter((o) => o.trim()), validUntil)) {
                onClose()
                return
              }
              const ablehnung = ablehnungZeigen([[datumId, !!ablaufText]], t('dialog.pollNotCreated'))
              if ('feld' in ablehnung) document.getElementById(ablehnung.feld)?.focus()
              else setMeldung(ablehnung.meldung)
            }}
          >
            {t('chat.create')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

/**
 * Eingabeleiste mit eigenem Zustand.
 *
 * Text und Anhang lagen im Zustand des ganzen Chats: Jeder Tastendruck
 * zeichnete den Verlauf neu — mit einem Jahr Nachrichten 84–189 ms je
 * Zeichen, 15 Zeichen in 2,8 s (Audit 11/2026, TEC-10). Jetzt zeichnet ein
 * Tastendruck nur diese Leiste.
 */
function ChatEingabe({ groupId, onUmfrage }: { groupId: string; onUmfrage: () => void }) {
  const { t } = useTranslation()
  const { state, currentUser, sendMessage } = useStore()
  const [text, setText] = useState('')
  const [pendingAttachment, setPendingAttachment] = useState<Attachment | undefined>()
  // Entwurf oder gewählter Anhang: kein automatisches Neuladen (editGuard)
  useUnsavedWork(!!text.trim() || !!pendingAttachment)
  const group = state.groups.find((g) => g.id === groupId)

  /** Der Grund einer Ablehnung, als Satz — jeder Schluessel ausgeschrieben,
   *  damit die Schluesselpruefung (i18n.test.ts) ihn findet. */
  const abgewiesenText = (grund: NachrichtGrund): string => {
    switch (grund) {
      case 'gesperrt':
        return t('chat.sendRejectedBlocked')
      case 'keinMitglied':
        return t('chat.sendRejectedNotMember')
      case 'anhangZuGross':
        return t('chat.sendRejectedTooLarge', { max: state.settings.maxUploadMB })
      default:
        return t('chat.sendRejected')
    }
  }

  /*
   * Eingabe und Anhang werden NUR nach erfolgreichem Senden geleert. Vorher
   * immer — der Store wies etwa einen zu grossen Anhang still ab, und der
   * getippte Text war weg (Audit 11/2026, KERN-08). Die Regel fragt die
   * Ansicht vorher selbst, um den Grund nennen zu koennen; der Store fragt
   * dieselbe (chatRules.ts).
   */
  const send = () => {
    if (!text.trim() && !pendingAttachment) return
    const grund = nachrichtAbgewiesen(currentUser, group, text, pendingAttachment, state.settings.maxUploadMB)
    if (grund || !sendMessage(groupId, text.trim(), pendingAttachment)) {
      toast(abgewiesenText(grund ?? 'leer'), 'bad')
      return
    }
    setText('')
    setPendingAttachment(undefined)
  }

  /** Anhang anfuegen — das Limit wird HIER geprueft, nicht erst beim Senden. */
  const anhaengen = () => {
    // Sandbox: ein Bild wird simuliert; das Limit gilt trotzdem
    const anhang: Attachment = { name: 'photo-' + Math.floor(Math.random() * 900 + 100) + '.jpg', kind: 'image', sizeMB: 3.2 }
    if (anhangZuGross(anhang, state.settings.maxUploadMB)) {
      toast(t('common.tooLarge', { name: anhang.name, size: anhang.sizeMB, max: state.settings.maxUploadMB }), 'bad')
      return
    }
    setPendingAttachment(anhang)
  }

  return (
    <div className="mx-auto max-w-3xl">
      {pendingAttachment && (
        <div className="mb-2 flex items-center gap-2 rounded-xl bg-surface px-3 py-2 text-small">
          <Paperclip size={14} className="text-accent" />
          <span className="min-w-0 flex-1 truncate">{pendingAttachment.name}</span>
          <button
            onClick={() => setPendingAttachment(undefined)}
            aria-label={`${pendingAttachment.name} — ${t('common.delete')}`}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-dim transition hover:bg-danger/10 hover:text-danger"
          >
            <X size={14} />
          </button>
        </div>
      )}
      <div className="flex items-end gap-1.5">
        <button
          onClick={anhaengen}
          title={t('chat.attach', { max: state.settings.maxUploadMB })}
          className="flex h-11 w-11 items-center justify-center rounded-full text-dim transition hover:bg-line/5 hover:text-accent"
        >
          <Paperclip size={20} />
        </button>
        <button
          onClick={onUmfrage}
          title={t('chat.poll')}
          className="flex h-11 w-11 items-center justify-center rounded-full text-dim transition hover:bg-line/5 hover:text-accent"
        >
          <BarChart3 size={20} />
        </button>
        {/* Rand im Feldton und lesbarer Platzhalter: Das Feld lag mit
            1,2:1 kaum sichtbar auf der Leiste, der Platzhalter mit 2,45:1 —
            und er war die einzige Beschriftung (Audit 11/2026, A11Y-10). */}
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder={t('chat.inputPlaceholder')}
          aria-label={t('chat.inputLabel')}
          className="min-w-0 flex-1 rounded-full border border-field bg-surface px-4 py-2.5 text-lead text-ink outline-none transition placeholder:text-dim focus:border-accent/60 focus:ring-2 focus:ring-accent/20"
        />
        <button
          onClick={send}
          disabled={!text.trim() && !pendingAttachment}
          className="min-h-11 rounded-full bg-accent p-2.5 text-bg transition hover:brightness-110 disabled:opacity-40"
          aria-label={t('chat.send')}
        >
          <SendHorizonal size={20} />
        </button>
      </div>
    </div>
  )
}

export function ChatRoom({ groupId }: { groupId: string }) {
  const { t, i18n } = useTranslation()
  const store = useStore()
  const { state, currentUser, visibleMessages, visiblePolls, deleteMessage, myGroups, unreadGroups, markChatSeen } = store
  const [showPoll, setShowPoll] = useState(false)
  const oeffneUmfrage = useCallback(() => setShowPoll(true), [])

  const group = state.groups.find((g) => g.id === groupId)
  const timeline = useMemo(() => {
    if (!group) return []
    const items: Array<{ ts: number; msg?: Message; poll?: Poll }> = [
      ...visibleMessages(groupId).map((m) => ({ ts: m.createdAt, msg: m })),
      ...visiblePolls(groupId).map((p) => ({ ts: p.createdAt, poll: p })),
    ]
    return items.sort((a, b) => a.ts - b.ts)
  }, [group, groupId, visibleMessages, visiblePolls])

  /* Lange Verlaeufe schrittweise (chatRules.ts, TEC-10). Die Zahl gilt je
     Gruppe — beim Wechsel beginnt die naechste wieder mit einem Schritt. */
  const [fenster, setFenster] = useState({ groupId, gezeigt: VERLAUF_SCHRITT })
  const gezeigt = fenster.groupId === groupId ? fenster.gezeigt : VERLAUF_SCHRITT
  const { sichtbar, verborgen } = verlaufFenster(timeline, gezeigt)
  const mainRef = useRef<HTMLElement>(null)
  const aelterRef = useRef<HTMLButtonElement>(null)
  const abstandVomEnde = useRef<number | null>(null)
  const aelterZeigen = () => {
    abstandVomEnde.current = document.documentElement.scrollHeight - window.scrollY
    setFenster({ groupId, gezeigt: gezeigt + VERLAUF_SCHRITT })
  }
  /* Nachgeladenes erscheint OBERHALB: Ohne Ausgleich spraenge der Ausschnitt
     an den Anfang des Nachgeladenen, und wer weiterlesen will, suchte seine
     Stelle. Der Abstand zum Seitenende bleibt deshalb gleich. Verschwindet
     der Knopf (nichts mehr davor), geht der Fokus an den Verlauf statt ins
     Leere. */
  useLayoutEffect(() => {
    if (abstandVomEnde.current === null) return
    window.scrollTo({ top: document.documentElement.scrollHeight - abstandVomEnde.current })
    abstandVomEnde.current = null
    if (!aelterRef.current) mainRef.current?.focus({ preventScroll: true })
  }, [gezeigt])

  /*
   * Loeschen: eine stabile Funktion fuer die memoisierten Blasen. Die
   * Store-Aktion ist nach jeder Aenderung eine neue — ueber die Ref ruft der
   * Knopf immer die aktuelle, ohne dass jede Blase neu zeichnet (TEC-10).
   */
  const loeschenRef = useRef(deleteMessage)
  useLayoutEffect(() => {
    loeschenRef.current = deleteMessage
  })
  const onDelete = useCallback(
    (id: string) => {
      if (window.confirm(t('chat.deleteMessageConfirm'))) loeschenRef.current(id)
    },
    [t],
  )

  /*
   * Ans Seitenende — nach dem Oeffnen, beim Gruppenwechsel und bei jeder
   * neuen Nachricht (gesendet oder empfangen). Vorher richtete
   * `scrollIntoView({ block: 'end' })` einen Anker am Fensterrand aus; darueber
   * liegen aber die klebende Eingabeleiste und die Sandbox-Leiste. Am iPhone
   * lag die neueste — auch die eben gesendete — Nachricht dahinter, und das
   * Senden sah gescheitert aus (Audit 11/2026, KERN-01). Am Seitenende steht
   * die Eingabeleiste an ihrem Platz im Fluss, direkt unter dem Verlauf.
   * Layout-Effekt: vor dem Zeichnen, sonst blitzt der alte Ausschnitt auf.
   */
  useLayoutEffect(() => {
    window.scrollTo({ top: document.documentElement.scrollHeight })
  }, [groupId, timeline.length])

  // Neue fremde Nachricht ansagen: Der 5-Sekunden-Takt des Stores bringt
  // sie lautlos in die Liste — wer die Seite hört statt sieht, bekam davon
  // nichts mit. Nur fremde Nachrichten: die eigene hat man selbst getippt.
  const [ansage, setAnsage] = useState('')
  const bekannt = useRef<number | null>(null)
  useEffect(() => {
    const fremde = timeline.filter((x) => x.msg && x.msg.authorId !== state.currentUserId).length
    if (bekannt.current !== null && fremde > bekannt.current) {
      const letzte = [...timeline].reverse().find((x) => x.msg && x.msg.authorId !== state.currentUserId)
      const wer = state.users.find((u) => u.id === letzte?.msg?.authorId)?.name ?? ''
      setAnsage(t('chat.newMessageFrom', { name: wer }))
    }
    bekannt.current = fremde
  }, [timeline, state.currentUserId, state.users, t])

  // Wer den Chat offen hat, hat die Inhalte gesehen — der grüne Punkt
  // erlischt. markChatSeen ist idempotent, daher sind volle Dependencies
  // (inkl. Nutzerwechsel über den Sandbox-Rollenwechsler) unproblematisch.
  useEffect(() => {
    if (group) markChatSeen(groupId)
  }, [group, groupId, timeline, state.currentUserId, markChatSeen])

  // Zugriff nur für Gruppenmitglieder und Gruppen-Admins — wer nicht in der
  // Gruppe ist, kommt auch über die URL nicht hinein.
  if (!group || !mayAccessGroup(currentUser, group)) {
    navigate('/chat')
    return null
  }

  const isAdminAuthor = (authorId: string) => {
    const author = state.users.find((u) => u.id === authorId)
    return !!author && (author.role === 'superadmin' || group.adminIds.includes(author.id))
  }
  // Auch der Admin der Gruppe darf moderieren — bisher konnte er in seiner
  // eigenen Gruppe nichts entfernen.
  const darfModerieren = currentUser!.role === 'superadmin' || group.adminIds.includes(currentUser!.id)

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <p role="status" className="sr-only">{ansage}</p>
      <TopBar
        title={
          <button onClick={() => navigate(`/chat/${groupId}/info`)} className="flex min-w-0 items-center gap-2 hover:text-accent">
            <span className="truncate">{group.name}</span>
          </button>
        }
        back="/chat"
        right={
          <button
            onClick={() => navigate(`/chat/${groupId}/info`)}
            aria-label={t('chat.info')}
            className="flex h-11 w-11 items-center justify-center rounded-full text-dim transition hover:bg-line/5 hover:text-accent"
          >
            <Info size={19} />
          </button>
        }
      />

      {myGroups.length > 1 && (
        <nav className="below-topbar sticky z-10 border-b border-line/10 bg-bg/85 backdrop-blur">
          <div className="mx-auto flex max-w-3xl gap-2 overflow-x-auto px-3 py-2">
            {myGroups.map((g) => (
              <button
                key={g.id}
                onClick={() => navigate(`/chat/${g.id}`)}
                className={`min-h-11 relative shrink-0 rounded-full border px-3.5 py-1.5 text-small transition ${
                  g.id === groupId ? 'border-accent bg-accent/15 font-semibold text-ink' : 'border-line/15 text-dim hover:text-ink'
                }`}
              >
                {g.name}
                {unreadGroups.has(g.id) && g.id !== groupId && <NewDot size={10} className="-right-0.5 -top-0.5" />}
              </button>
            ))}
          </div>
        </nav>
      )}

      {/* tabIndex -1: Ziel des Fokus, wenn „Ältere anzeigen" verschwindet. */}
      <main ref={mainRef} tabIndex={-1} className="mx-auto w-full max-w-3xl flex-1 space-y-stack px-4 py-4 outline-none">
        {timeline.length === 0 && <p className="pt-10 text-center text-body text-dim">{t('chat.noMessages')}</p>}
        {verborgen > 0 && (
          <p className="text-center">
            <button
              ref={aelterRef}
              onClick={aelterZeigen}
              className="min-h-11 rounded-full border border-line/15 px-4 text-small text-dim transition hover:border-accent/50 hover:text-ink"
            >
              {t('chat.showOlder', { count: verborgen })}
            </button>
          </p>
        )}
        {sichtbar.map((item) =>
          item.msg ? (
            <MessageBubble
              key={item.msg.id}
              msg={item.msg}
              isOwn={item.msg.authorId === currentUser!.id}
              authorName={state.users.find((u) => u.id === item.msg!.authorId)?.name ?? '—'}
              bold={isAdminAuthor(item.msg.authorId)}
              canDelete={darfModerieren || item.msg.authorId === currentUser!.id}
              onDelete={onDelete}
              lng={i18n.language}
            />
          ) : (
            <PollCard key={item.poll!.id} poll={item.poll!} />
          ),
        )}
      </main>

      <div className="above-sandbox-sticky safe-x sticky z-20 border-t border-line/10 bg-bg/90 py-2.5 backdrop-blur [--rand-x:0.75rem]">
        {/* Vom Admin gesperrt: mitlesen ja, senden nein */}
        {currentUser!.chatBlocked ? (
          <div className="mx-auto flex max-w-3xl items-center gap-2.5 rounded-xl border border-danger/25 bg-danger/10 px-3.5 py-3 text-small text-danger">
            <Ban size={16} className="shrink-0" />
            {t('chat.blockedNote')}
          </div>
        ) : !darfSchreiben(currentUser, group) ? (
          // Kein Mitglied (der Superadmin sieht jede Gruppe): Der Store
          // verwirft Nachricht und Umfrage — ein Eingabefeld, das nichts
          // abschickt, waere ein stiller Fehlschlag (KERN-19).
          <div className="mx-auto flex max-w-3xl items-center gap-2.5 rounded-xl border border-line/15 bg-surface px-3.5 py-3 text-small text-dim">
            <Info size={16} className="shrink-0" />
            {t('chat.notMemberNote')}
          </div>
        ) : (
          <ChatEingabe groupId={groupId} onUmfrage={oeffneUmfrage} />
        )}
      </div>

      {showPoll && <PollModal groupId={groupId} onClose={() => setShowPoll(false)} />}
    </div>
  )
}
