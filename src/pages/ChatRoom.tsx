import { BarChart3, Ban, FileText, Image as ImageIcon, Info, Paperclip, Plus, SendHorizonal, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Field, inputCls, Modal, NewDot, TopBar } from '../components/ui'
import { navigate } from '../router'
import { isGroupAdmin, useStore } from '../store'
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
  return (
    <div className={`group flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`relative max-w-[82%] rounded-bubble px-4 py-2.5 shadow-soft ${
          isOwn ? 'rounded-br-md bg-accent/20' : 'rounded-bl-md bg-surface'
        }`}
      >
        {!isOwn && <p className="mb-0.5 text-[12px] font-semibold text-accent">{authorName}</p>}
        <p className={`whitespace-pre-wrap text-[14.5px] leading-relaxed ${bold ? 'font-bold' : ''}`}>{msg.text}</p>
        {msg.attachment && <AttachmentChip a={msg.attachment} />}
        <p className="mt-1 text-right text-[10.5px] text-dim">{timeLabel(msg.createdAt, lng)}</p>
        {canDelete && (
          <button
            onClick={onDelete}
            className="absolute -right-2 -top-2 hidden rounded-full bg-danger/90 p-1 text-bg group-hover:block"
            aria-label="delete"
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>
    </div>
  )
}

function PollCard({ poll }: { poll: Poll }) {
  const { t } = useTranslation()
  const { state, currentUser, vote, closePoll } = useStore()
  const group = state.groups.find((g) => g.id === poll.groupId)!
  const author = state.users.find((u) => u.id === poll.authorId)
  const options = poll.type === 'yesno' ? [t('common.yes'), t('common.no')] : poll.options
  const totalVotes = Object.keys(poll.votes).length
  const myVote = poll.votes[currentUser!.id]
  const mayClose = !poll.closed && (poll.authorId === currentUser!.id || isGroupAdmin(currentUser, group))

  return (
    <div className="mx-auto w-full max-w-md rounded-2xl border border-accent/20 bg-surface p-4 shadow-soft">
      <div className="mb-1 flex items-center gap-2 text-[12px] text-dim">
        <BarChart3 size={14} className="text-accent" />
        <span>
          {t('chat.poll')} · {author?.name}
        </span>
        {poll.closed && (
          <span className="ml-auto rounded-full bg-line/10 px-2 py-0.5 text-[10.5px] font-medium">{t('chat.closed')}</span>
        )}
      </div>
      <p className="mb-3 text-[15px] font-semibold leading-snug">{poll.question}</p>
      <div className="space-y-2">
        {options.map((opt, i) => {
          const count = Object.values(poll.votes).filter((v) => v === i).length
          const pct = totalVotes ? Math.round((count / totalVotes) * 100) : 0
          const chosen = myVote === i
          return (
            <button
              key={i}
              disabled={poll.closed}
              onClick={() => vote(poll.id, i)}
              className={`relative block w-full overflow-hidden rounded-xl border px-3 py-2 text-left transition ${
                chosen ? 'border-accent bg-accent/10' : 'border-line/10 hover:border-line/25'
              } ${poll.closed ? 'cursor-default' : ''}`}
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
        <span>
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

  const valid = question.trim() && (type === 'yesno' || options.filter((o) => o.trim()).length >= 2)

  return (
    <Modal title={t('chat.poll')} onClose={onClose}>
      <div className="space-y-4">
        <Field label={t('chat.pollQuestion')}>
          <input className={inputCls} value={question} onChange={(e) => setQuestion(e.target.value)} autoFocus />
        </Field>
        <Field label={t('chat.pollType')}>
          <div className="flex gap-2">
            {(['yesno', 'multi'] as const).map((tp) => (
              <button
                key={tp}
                onClick={() => setType(tp)}
                className={`flex-1 rounded-xl border px-3 py-2.5 text-sm transition ${
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
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            disabled={!valid}
            onClick={() => {
              createPoll(groupId, question.trim(), type, options.filter((o) => o.trim()))
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

  // Wer den Chat offen hat, hat die Inhalte gesehen — der grüne Punkt
  // erlischt. markChatSeen ist idempotent, daher sind volle Dependencies
  // (inkl. Nutzerwechsel über den Sandbox-Rollenwechsler) unproblematisch.
  useEffect(() => {
    if (group) markChatSeen(groupId)
  }, [group, groupId, timeline, state.currentUserId, markChatSeen])

  if (!group) {
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
            className="rounded-full p-2 text-dim transition hover:bg-line/5 hover:text-accent"
          >
            <Info size={19} />
          </button>
        }
      />

      {myGroups.length > 1 && (
        <nav className="sticky top-14 z-10 border-b border-line/10 bg-bg/85 backdrop-blur">
          <div className="mx-auto flex max-w-3xl gap-2 overflow-x-auto px-3 py-2">
            {myGroups.map((g) => (
              <button
                key={g.id}
                onClick={() => navigate(`/chat/${g.id}`)}
                className={`relative shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] transition ${
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
              canDelete={currentUser!.role === 'superadmin' || item.msg.authorId === currentUser!.id}
              onDelete={() => deleteMessage(item.msg!.id)}
              lng={i18n.language}
            />
          ) : (
            <PollCard key={item.poll!.id} poll={item.poll!} />
          ),
        )}
        <div ref={bottomRef} />
      </main>

      <div className="sticky bottom-11 z-20 border-t border-line/10 bg-bg/90 px-3 py-2.5 backdrop-blur">
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
                setPendingAttachment({ name: 'photo-' + Math.floor(Math.random() * 900 + 100) + '.jpg', kind: 'image', sizeMB: 3.2 })
              }
              title={t('chat.attach', { max: state.settings.maxUploadMB })}
              className="rounded-full p-2.5 text-dim transition hover:bg-line/5 hover:text-accent"
            >
              <Paperclip size={20} />
            </button>
            <button
              onClick={() => setShowPoll(true)}
              title={t('chat.poll')}
              className="rounded-full p-2.5 text-dim transition hover:bg-line/5 hover:text-accent"
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
              className="rounded-full bg-accent p-2.5 text-bg transition hover:brightness-110 disabled:opacity-40"
              aria-label="send"
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
