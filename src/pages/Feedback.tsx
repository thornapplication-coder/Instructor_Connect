import { CheckCircle2, Info } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Card, Field, inputCls, Page, TopBar } from '../components/ui'
import { navigate } from '../router'
import { useStore } from '../store'

export function Feedback() {
  const { t } = useTranslation()
  const { state, currentUser } = useStore()
  const [selected, setSelected] = useState<string[]>([])
  const [category, setCategory] = useState(state.settings.feedbackCategories[0] ?? '')
  const [message, setMessage] = useState('')
  const [error, setError] = useState(false)
  const [sentTo, setSentTo] = useState<string[] | null>(null)

  const groups = [...state.groups].sort((a, b) => a.name.localeCompare(b.name))
  const categories = [...state.settings.feedbackCategories].sort((a, b) => a.localeCompare(b))

  const toggle = (id: string) =>
    setSelected((sel) => (sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]))

  const submit = () => {
    if (selected.length === 0 || !message.trim()) {
      setError(true)
      return
    }
    const adminIds = new Set(state.groups.filter((g) => selected.includes(g.id)).flatMap((g) => g.adminIds))
    const recipients = state.users.filter((u) => adminIds.has(u.id)).map((u) => u.email)
    setSentTo(recipients)
  }

  if (sentTo) {
    return (
      <>
        <TopBar title={t('feedback.title')} back="/" />
        <Page className="flex flex-col items-center justify-center pt-16 text-center">
          <CheckCircle2 size={52} className="mb-4 text-accent" />
          <h2 className="text-xl font-bold">{t('feedback.sentTitle')}</h2>
          <p className="mt-1.5 max-w-sm text-[14px] text-dim">{t('feedback.sentBody')}</p>
          <Card className="mt-6 w-full max-w-sm p-4 text-left text-[13px]">
            <p className="mb-1 font-semibold text-dim">{t('feedback.recipients')}</p>
            {sentTo.map((r) => (
              <p key={r} className="truncate">{r}</p>
            ))}
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

        <Field label={t('feedback.groups')}>
          <div className="flex flex-wrap gap-2">
            {groups.map((g) => (
              <button
                key={g.id}
                onClick={() => toggle(g.id)}
                className={`rounded-full border px-3.5 py-2 text-[13.5px] transition ${
                  selected.includes(g.id)
                    ? 'border-accent bg-accent/15 font-semibold text-accent'
                    : 'border-line/15 text-dim hover:border-line/30'
                }`}
              >
                {g.name}
              </button>
            ))}
          </div>
        </Field>

        <Field label={t('feedback.category')}>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full rounded-xl border border-line/10 bg-bg/60 px-3 py-2.5 text-[14px]"
          >
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>

        <Field label={t('feedback.message')}>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className={`${inputCls} min-h-36`}
          />
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
