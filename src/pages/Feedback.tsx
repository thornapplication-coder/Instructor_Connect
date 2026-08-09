import { AlertTriangle, CheckCircle2, Info, Paperclip, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Card, Field, inputCls, Page, TopBar } from '../components/ui'
import { navigate } from '../router'
import { useStore } from '../store'
import type { Attachment } from '../types'

export function Feedback() {
  const { t } = useTranslation()
  const { state, currentUser, submitFeedback } = useStore()
  const [category, setCategory] = useState('')
  const [recipient, setRecipient] = useState('')
  const [urgent, setUrgent] = useState(false)
  const [message, setMessage] = useState('')
  const [attachment, setAttachment] = useState<Attachment | undefined>(undefined)
  const [error, setError] = useState(false)
  const [sent, setSent] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const categories = [...state.settings.feedbackCategories].sort((a, b) => a.localeCompare(b))
  const recipients = [...state.settings.feedbackRecipients].sort((a, b) => a.localeCompare(b))

  const pickFile = (file: File | null) => {
    if (!file) return
    setAttachment({
      name: file.name,
      kind: file.type.startsWith('image/') ? 'image' : 'file',
      sizeMB: Math.round((file.size / 1024 / 1024) * 10) / 10,
    })
  }

  const submit = () => {
    if (!recipient || !category || !message.trim()) {
      setError(true)
      return
    }
    // Feedback bleibt im Admin-Panel gespeichert und dort löschbar.
    submitFeedback({ category, recipient, urgent, message: message.trim(), attachment })
    setSent(true)
  }

  if (sent) {
    return (
      <>
        <TopBar title={t('feedback.title')} back="/" />
        <Page className="flex flex-col items-center justify-center pt-16 text-center">
          <CheckCircle2 size={52} className="mb-4 text-accent" />
          <h2 className="text-xl font-bold">{t('feedback.sentTitle')}</h2>
          <p className="mt-1.5 max-w-sm text-[14px] text-dim">{t('feedback.sentBody')}</p>
          <Card className="mt-6 w-full max-w-sm p-4 text-left text-[13px]">
            <p className="mb-1 font-semibold text-dim">{t('feedback.recipients')}</p>
            <p className="truncate">{recipient}</p>
            {urgent && (
              <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-danger/15 px-2.5 py-1 text-[12px] font-semibold text-danger">
                <AlertTriangle size={12} /> {t('feedback.urgent')}
              </p>
            )}
            {attachment && (
              <p className="mt-2 flex items-center gap-1.5 truncate text-dim">
                <Paperclip size={13} /> {attachment.name} · {attachment.sizeMB} MB
              </p>
            )}
            {state.settings.feedbackCC.length > 0 && (
              <>
                <p className="mb-1 mt-3 font-semibold text-dim">{t('feedback.cc')}</p>
                {state.settings.feedbackCC.map((r) => (
                  <p key={r} className="truncate">{r}</p>
                ))}
              </>
            )}
          </Card>
          <Button className="mt-6" onClick={() => navigate('/')}>
            {t('feedback.backHome')}
          </Button>
        </Page>
      </>
    )
  }

  return (
    <>
      <TopBar title={t('feedback.title')} back="/" />
      <Page className="space-y-5">
        <p className="text-[14px] text-dim">{t('feedback.intro')}</p>

        <Field label={t('feedback.recipient') + ' *'}>
          <select
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            className="w-full rounded-xl border border-line/10 bg-bg/60 px-3 py-2.5 text-[14px]"
          >
            <option value="">…</option>
            {recipients.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </Field>

        <Field label={t('feedback.category') + ' *'}>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full rounded-xl border border-line/10 bg-bg/60 px-3 py-2.5 text-[14px]"
          >
            <option value="">…</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>

        {/* Urgent-Kennzeichnung */}
        <button
          onClick={() => setUrgent(!urgent)}
          className={`flex w-full items-center gap-2.5 rounded-xl border px-3.5 py-3 text-left text-[14px] font-semibold transition ${
            urgent ? 'border-danger bg-danger/15 text-danger' : 'border-line/15 text-dim hover:border-danger/40'
          }`}
        >
          <AlertTriangle size={17} />
          {t('feedback.urgent')}
          <span className="ml-auto text-[12px] font-normal">{urgent ? t('feedback.urgentOn') : t('feedback.urgentOff')}</span>
        </button>

        <Field label={t('feedback.message') + ' *'}>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className={`${inputCls} min-h-36`}
          />
        </Field>

        {/* Foto oder PDF anhängen */}
        <Field label={t('feedback.attachment')}>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
          />
          {attachment ? (
            <div className="flex items-center gap-2.5 rounded-xl border border-line/15 px-3.5 py-2.5 text-[13.5px]">
              <Paperclip size={15} className="shrink-0 text-accent" />
              <span className="min-w-0 flex-1 truncate">{attachment.name}</span>
              <span className="shrink-0 text-[12px] text-dim">{attachment.sizeMB} MB</span>
              <button onClick={() => { setAttachment(undefined); if (fileRef.current) fileRef.current.value = '' }} className="shrink-0 text-dim hover:text-danger">
                <X size={15} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => fileRef.current?.click()}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line/25 px-3.5 py-3 text-[13.5px] text-dim transition hover:border-accent/50 hover:text-accent"
            >
              <Paperclip size={15} /> {t('feedback.attach')}
            </button>
          )}
        </Field>

        {error && <p className="text-[13px] text-danger">{t('feedback.errorEmpty')}</p>}

        <div className="flex items-start gap-2.5 rounded-xl border border-line/10 bg-surface/60 p-3.5 text-[12.5px] text-dim">
          <Info size={15} className="mt-0.5 shrink-0 text-accent" />
          <p>{t('feedback.identity', { name: currentUser!.name, email: currentUser!.email })}</p>
        </div>

        <Button className="w-full py-3" onClick={submit}>
          {t('feedback.submit')}
        </Button>
      </Page>
    </>
  )
}
