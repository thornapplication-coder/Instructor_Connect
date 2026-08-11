import { BarChart3, Ban, FileText, Image as ImageIcon, Info, Paperclip, Plus, SendHorizonal, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Field, inputCls, Modal, NewDot, TopBar } from '../components/ui'
import i18n from '../i18n'
import { useUnsavedWork } from '../editGuard'
import { navigate } from '../router'
import { isGroupAdmin, mayAccessGroup, useStore } from '../store'
import type { Attachment, Message, Poll, PollType } from '../types'

function timeLabel(ts: number, lng: string) {
  return new Date(ts).toLocaleString(lng === 'de' ? 'de-AT' : 'en-GB', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function AttachmentChip({ a }: { a: Attachment }) {
  const Icon = a.kind === 'image' ? ImageIcon : FileText
  return (
    <span className="mt-2 flex items-center gap-2 rounded-xl bg-line/10 px-3 py-2 text-[13px]">
      <Icon size={16} className="shrink-0 text-accent" />
      <span className="min-w-0 truncate">{a.name}</span>
      <span className="shrink-0 text-[11px] text-dim">{a.sizeMB.toFixed(1)} MB</span>
    </span>
  )
}

function MessageBubble({ msg, isOwn, authorName, bold, canDelete, onDelete, lng }: {
  msg: Message
  isOwn: boolean
  authorName: string
  bold: boolean
  canDelete: boolean
  onDelete: () => void
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
        <p className={`mb-0.5 text-[12px] font-semibold ${isOwn ? 'text-dim' : 'text-accent'}`}>{authorName}</p>
        <p className={`whitespace-pre-wrap text-[14.5px] leading-relaxed ${bold ? 'font-bold' : ''}`}>{msg.text}</p>
        {msg.attachment && <AttachmentChip a={msg.attachment} />}
        <p className="mt-1 text-right text-[10.5px] text-dim">{timeLabel(msg.createdAt, lng)}</p>
        {canDelete && (
          <button
            onClick={onDelete}
            className="min-h-11 absolute -right-2 -top-2 hidden rounded-full bg-danger/90 p-1 text-bg group-hover:block"
            aria-label={t('common.delete')}
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>
    </div>
  )
}

/** Ablaufzeitpunkt einheitlich als UTC anzeigen: DD.MM.YYYY HH:MM UTC */
function formatUtc(ts: number): string {
  const d = new Date(ts)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getUTCDate())}.${p(d.getUTCMonth() + 1)}.${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UTC`
}

function PollCard({ poll }: { poll: Poll }) {
  const { t } = useTranslation()
  const { state, currentUser, vote, closePoll } = useStore()
  const group = state.groups.find((g) => g.id === poll.groupId)!
  const author = state.users.find((u) => u.id === poll.authorId)
  const options = poll.type === 'yesno' ? [t('common.yes'), t('common.no')] : poll.options
  const totalVotes = Object.keys(poll.votes).length
  /**
   * Prozentanteile nach dem Größte-Reste-Verfahren: unabhängig gerundete
   * Werte ergaben in Summe 99 % oder 101 %.
   */
  const pctOf = (() => {
    const counts = options.map((_, i) => Object.values(poll.votes).filter((v) => v === i).length)
    if (totalVotes === 0) return counts.map(() => 0)
    const exact = counts.map((c) => (c / totalVotes) * 100)
    const floors = exact.map(Math.floor)
    let rest = 100 - floors.reduce((a, b) => a + b, 0)
    const order = exact
      .map((v, i) => ({ i, frac: v - Math.floor(v) }))
      .sort((a, b) => b.frac - a.frac)
    const out = [...floors]
    for (const { i } of order) {
      if (rest <= 0) break
      out[i] += 1
      rest -= 1
    }
    return out
  })()
  const myVote = poll.votes[currentUser!.id]
  // Abgelaufene Umfragen sind automatisch geschlossen
  const expired = !!poll.validUntil && poll.validUntil <= Date.now() + state.timeOffsetMs
  const closed = poll.closed || expired
  const mayClose = !closed && (poll.authorId === currentUser!.id || isGroupAdmin(currentUser, group))

  return (
    <div className="mx-auto w-full max-w-md rounded-2xl border border-accent/20 bg-surface p-4 shadow-soft">
      <div className="mb-1 flex items-center gap-2 text-[12px] text-dim">
        <BarChart3 size={14} className="text-accent" />
        <span>
          {t('chat.poll')} · {author?.name}
        </span>
        {closed && (
          <span className="ml-auto rounded-full bg-line/10 px-2 py-0.5 text-[10.5px] font-medium">{t('chat.closed')}</span>
        )}
      </div>
      <p className="mb-1 text-[15px] font-semibold leading-snug">{poll.question}</p>
      {poll.validUntil && (
        <p className={`mb-3 text-[11.5px] ${expired ? 'text-danger' : 'text-dim'}`}>
          {t('chat.pollValidUntil')}: {formatUtc(poll.validUntil)}
        </p>
      )}
      <div className="space-y-2">
        {options.map((opt, i) => {
          const count = Object.values(poll.votes).filter((v) => v === i).length
          const pct = totalVotes ? Math.round((count / totalVotes) * 100) : 0
          const chosen = myVote === i
          return (
            <button
              key={i}
              disabled={closed}
              onClick={() => vote(poll.id, i)}
              className={`min-h-11 relative block w-full overflow-hidden rounded-xl border px-3 py-2 text-left transition ${
                chosen ? 'border-accent bg-accent/10' : 'border-line/10 hover:border-line/25'
              } ${closed ? 'cursor-default' : ''}`}
            >
              <span
                className="absolute inset-y-0 left-0 bg-accent/15 transition-all"
                style={{ width: `${pct}%` }}
              />
              <span className="relative flex items-center justify-between gap-2 text-[14px]">
                <span className={chosen ? 'font-semibold text-accent' : ''}>{opt}</span>
                <span className="shrink-0 text-[12px] text-dim">
                  {count} · {pct}%
                </span>
              </span>
            </button>
          )
        })}
      </div>
      <div className="mt-3 flex items-center justify-between text-[11.5px] text-dim">
        {/* role=status: eine abgegebene oder geänderte Stimme wird angesagt */}
        <span role="status">
          {t('chat.votes', { count: totalVotes })} · {t('chat.changeHint')}
        </span>
        {mayClose && (
          <button onClick={() => closePoll(poll.id)} className="shrink-0 font-medium text-accent hover:underline">
            {t('chat.closePoll')}
          </button>
        )}
      </div>
    </div>
  )
}

function PollModal({ groupId, onClose }: { groupId: string; onClose: () => void }) {
  const { t } = useTranslation()
  const { createPoll } = useStore()
  const [question, setQuestion] = useState('')
  const [type, setType] = useState<PollType>('yesno')
  const [options, setOptions] = useState(['', ''])
  // Gültigkeit in UTC — Datum + Uhrzeit werden als UTC interpretiert
  const [validDate, setValidDate] = useState('')
  const [validTime, setValidTime] = useState('23:59')

  const validUntil = validDate
    ? Date.UTC(
        Number(validDate.slice(0, 4)),
        Number(validDate.slice(5, 7)) - 1,
        Number(validDate.slice(8, 10)),
        Number((validTime || '23:59').slice(0, 2)),
        Number((validTime || '23:59').slice(3, 5)),
      )
    : undefined
  const valid =
    question.trim() && validDate && (type === 'yesno' || options.filter((o) => o.trim()).length >= 2)

  return (
    <Modal
      title={t('chat.poll')}
      onClose={onClose}
      confirmDiscard={question.trim() || options.some((o) => o.trim()) || validDate ? t('common.discardConfirm') : undefined}
    >
      <div className="space-y-4">
        <Field label={t('chat.pollQuestion')}>
          <input className={inputCls} value={question} onChange={(e) => setQuestion(e.target.value)} autoFocus />
        </Field>
        <Field label={t('chat.pollType')} group>
          <div className="flex gap-2">
            {(['yesno', 'multi'] as const).map((tp) => (
              <button
                key={tp}
                aria-pressed={type === tp}
                onClick={() => setType(tp)}
                className={`min-h-11 flex-1 rounded-xl border px-3 py-2.5 text-sm transition ${
                  type === tp ? 'border-accent bg-accent/10 font-semibold text-accent' : 'border-line/10 text-dim'
                }`}
              >
                {t(`chat.${tp}`)}
              </button>
            ))}
          </div>
        </Field>
        {type === 'multi' && (
          <div className="space-y-2">
            {options.map((opt, i) => (
              <div key={i} className="flex gap-2">
                <input
                  className={inputCls}
                  placeholder={`${t('chat.option')} ${i + 1}`}
                  value={opt}
                  onChange={(e) => setOptions(options.map((o, j) => (j === i ? e.target.value : o)))}
                />
                {options.length > 2 && (
                  <button onClick={() => setOptions(options.filter((_, j) => j !== i))} className="text-dim hover:text-danger">
                    <X size={16} />
                  </button>
                )}
              </div>
            ))}
            <button
              onClick={() => setOptions([...options, ''])}
              className="flex items-center gap-1 text-[13px] font-medium text-accent hover:underline"
            >
              <Plus size={14} /> {t('chat.addOption')}
            </button>
          </div>
        )}
        {/* Ablauf: Datum und Uhrzeit, beides in UTC */}
        <Field label={t('chat.pollValidUntilUtc') + ' *'}>
          <div className="flex gap-2">
            <input type="date" className={inputCls} value={validDate} onChange={(e) => setValidDate(e.target.value)} />
            <input type="time" className={inputCls} value={validTime} onChange={(e) => setValidTime(e.target.value)} />
          </div>
          <p className="mt-1.5 text-[11.5px] leading-relaxed text-dim">{t('chat.pollValidHint')}</p>
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            disabled={!valid}
            onClick={() => {
              createPoll(groupId, question.trim(), type, options.filter((o) => o.trim()), validUntil)
              onClose()
            }}
          >
            {t('chat.create')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

export function ChatRoom({ groupId }: { groupId: string }) {
  const { t, i18n } = useTranslation()
  const store = useStore()
  const { state, currentUser, visibleMessages, visiblePolls, sendMessage, deleteMessage, myGroups, unreadGroups, markChatSeen } = store
  const [text, setText] = useState('')
  const [pendingAttachment, setPendingAttachment] = useState<Attachment | undefined>()
  // Entwurf oder gewählter Anhang: kein automatisches Neuladen (editGuard)
  useUnsavedWork(!!text.trim() || !!pendingAttachment)
  const [showPoll, setShowPoll] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const group = state.groups.find((g) => g.id === groupId)
  const timeline = useMemo(() => {
    if (!group) return []
    const items: Array<{ ts: number; msg?: Message; poll?: Poll }> = [
      ...visibleMessages(groupId).map((m) => ({ ts: m.createdAt, msg: m })),
      ...visiblePolls(groupId).map((p) => ({ ts: p.createdAt, poll: p })),
    ]
    return items.sort((a, b) => a.ts - b.ts)
  }, [group, groupId, visibleMessages, visiblePolls])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [timeline.length])

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

  const send = () => {
    if (!text.trim() && !pendingAttachment) return
    sendMessage(groupId, text.trim(), pendingAttachment)
    setText('')
    setPendingAttachment(undefined)
  }

  const isAdminAuthor = (authorId: string) => {
    const author = state.users.find((u) => u.id === authorId)
    return !!author && (author.role === 'superadmin' || group.adminIds.includes(author.id))
  }

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
                className={`min-h-11 relative shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] transition ${
                  g.id === groupId ? 'border-accent bg-accent/15 font-semibold text-accent' : 'border-line/15 text-dim hover:text-ink'
                }`}
              >
                {g.name}
                {unreadGroups.has(g.id) && g.id !== groupId && <NewDot size={10} className="-right-0.5 -top-0.5" />}
              </button>
            ))}
          </div>
        </nav>
      )}

      <main className="mx-auto w-full max-w-3xl flex-1 space-y-3 px-4 py-4">
        {timeline.length === 0 && <p className="pt-10 text-center text-sm text-dim">{t('chat.noMessages')}</p>}
        {timeline.map((item) =>
          item.msg ? (
            <MessageBubble
              key={item.msg.id}
              msg={item.msg}
              isOwn={item.msg.authorId === currentUser!.id}
              authorName={state.users.find((u) => u.id === item.msg!.authorId)?.name ?? '—'}
              bold={isAdminAuthor(item.msg.authorId)}
              // Auch der Admin der Gruppe darf moderieren — bisher konnte er
              // in seiner eigenen Gruppe nichts entfernen.
              canDelete={
                currentUser!.role === 'superadmin' ||
                item.msg.authorId === currentUser!.id ||
                (state.groups.find((g) => g.id === groupId)?.adminIds.includes(currentUser!.id) ?? false)
              }
              onDelete={() => {
                if (window.confirm(t('chat.deleteMessageConfirm'))) deleteMessage(item.msg!.id)
              }}
              lng={i18n.language}
            />
          ) : (
            <PollCard key={item.poll!.id} poll={item.poll!} />
          ),
        )}
        <div ref={bottomRef} />
      </main>

      <div className="above-sandbox-sticky sticky z-20 border-t border-line/10 bg-bg/90 px-3 py-2.5 backdrop-blur">
        {/* Vom Admin gesperrt: mitlesen ja, senden nein */}
        {currentUser!.chatBlocked ? (
          <div className="mx-auto flex max-w-3xl items-center gap-2.5 rounded-xl border border-danger/25 bg-danger/10 px-3.5 py-3 text-[13px] text-danger">
            <Ban size={16} className="shrink-0" />
            {t('chat.blockedNote')}
          </div>
        ) : (
        <div className="mx-auto max-w-3xl">
          {pendingAttachment && (
            <div className="mb-2 flex items-center gap-2 rounded-xl bg-surface px-3 py-2 text-[13px]">
              <Paperclip size={14} className="text-accent" />
              <span className="min-w-0 flex-1 truncate">{pendingAttachment.name}</span>
              <button onClick={() => setPendingAttachment(undefined)} className="text-dim hover:text-danger">
                <X size={14} />
              </button>
            </div>
          )}
          <div className="flex items-end gap-1.5">
            <button
              onClick={() =>
                // Sandbox: ein Bild wird simuliert; das Limit gilt trotzdem
                setPendingAttachment({ name: 'photo-' + Math.floor(Math.random() * 900 + 100) + '.jpg', kind: 'image', sizeMB: 3.2 })
              }
              title={t('chat.attach', { max: state.settings.maxUploadMB })}
              className="flex h-11 w-11 items-center justify-center rounded-full text-dim transition hover:bg-line/5 hover:text-accent"
            >
              <Paperclip size={20} />
            </button>
            <button
              onClick={() => setShowPoll(true)}
              title={t('chat.poll')}
              className="flex h-11 w-11 items-center justify-center rounded-full text-dim transition hover:bg-line/5 hover:text-accent"
            >
              <BarChart3 size={20} />
            </button>
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && send()}
              placeholder={t('chat.inputPlaceholder')}
              className="min-w-0 flex-1 rounded-full border border-line/10 bg-surface px-4 py-2.5 text-[15px] outline-none transition focus:border-accent/60"
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
        )}
      </div>

      {showPoll && <PollModal groupId={groupId} onClose={() => setShowPoll(false)} />}
    </div>
  )
}
