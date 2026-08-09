import { Lock, Plane } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Avatar, Button, inputCls, ThemeToggle } from '../components/ui'
import { useStore } from '../store'
import { APP_VERSION } from '../types'

function LanguageToggle() {
  const { i18n } = useTranslation()
  return (
    <div className="flex overflow-hidden rounded-lg border border-line/15 text-[12px]">
      {(['de', 'en'] as const).map((lng) => (
        <button
          key={lng}
          onClick={() => i18n.changeLanguage(lng)}
          className={`px-2.5 py-1 font-medium uppercase transition ${i18n.language === lng ? 'bg-accent text-bg' : 'text-dim hover:text-ink'}`}
        >
          {lng}
        </button>
      ))}
    </div>
  )
}

export function Login() {
  const { t } = useTranslation()
  const { state, login, requestLoginCode, verifyLoginCode } = useStore()
  const [identifier, setIdentifier] = useState('')
  const [code, setCode] = useState('')
  // Zwei Schritte: E-Mail eingeben → 6-stelligen Code bestätigen
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [error, setError] = useState<'' | 'email' | 'code'>('')

  const submit = () => {
    if (requestLoginCode(identifier)) {
      setError('')
      setCode('')
      setStep('code')
    } else {
      setError('email')
    }
  }

  const confirm = () => {
    if (!verifyLoginCode(code)) setError('code')
    else setError('')
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-10">
      <div className="absolute right-4 top-4 flex items-center gap-1.5">
        <ThemeToggle />
        <LanguageToggle />
      </div>

      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-raised shadow-tile">
            <Plane size={30} className="text-accent" />
          </div>
          <p className="text-sm text-dim">{t('login.welcome')}</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">
            Instructor <span className="text-accent">Connect</span>
          </h1>
          <p className="mt-2 text-sm text-dim">{t('login.subtitle')}</p>
        </div>

        {step === 'email' ? (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              submit()
            }}
            className="space-y-3"
          >
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-medium text-dim">{t('login.identifier')}</span>
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder={t('login.placeholder')}
                className={inputCls}
                autoFocus
              />
            </label>
            {error === 'email' && <p className="text-[13px] text-danger">{t('login.error')}</p>}
            <Button type="submit" className="w-full py-3">
              {t('login.button')}
            </Button>
            <p className="text-center text-[12px] text-dim">{t('login.otpHint')}</p>
          </form>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              confirm()
            }}
            className="space-y-3"
          >
            <p className="text-[13px] leading-relaxed text-dim">{t('login.codeSentTo', { email: identifier.trim() })}</p>
            {/* Sandbox: kein Mailversand — der Code wird hier angezeigt */}
            {state.pendingLogin && (
              <p className="rounded-xl border border-amber-400/25 bg-amber-400/5 p-3 text-[12.5px] text-sand">
                {t('login.sandboxCode', { code: state.pendingLogin.code })}
              </p>
            )}
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-medium text-dim">{t('login.codeLabel')}</span>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                placeholder="••••••"
                className={`${inputCls} text-center text-[20px] tracking-[0.4em]`}
                autoFocus
              />
            </label>
            {error === 'code' && <p className="text-[13px] text-danger">{t('login.codeError')}</p>}
            <Button type="submit" disabled={code.length !== 6} className="w-full py-3">
              {t('login.verify')}
            </Button>
            <p className="text-center text-[12px] leading-relaxed text-dim">{t('login.codeHint')}</p>
            <button
              type="button"
              onClick={() => {
                setStep('email')
                setError('')
              }}
              className="mx-auto block text-[12.5px] text-dim underline underline-offset-2 hover:text-ink"
            >
              {t('login.changeEmail')}
            </button>
          </form>
        )}

        <div className="mt-8 rounded-2xl border border-amber-400/25 bg-amber-400/5 p-4">
          <p className="mb-2.5 text-[12px] font-semibold uppercase tracking-wide text-sand">{t('login.sandboxUsers')}</p>
          <div className="space-y-1">
            {(['superadmin', 'group_admin', 'training_admin', 'member'] as const)
              .map((role) => state.users.find((u) => u.active && u.role === role))
              .filter((u): u is NonNullable<typeof u> => !!u)
              .map((u) => (
                <button
                  key={u.id}
                  onClick={() => login(u.email)}
                  className="flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition hover:bg-line/5"
                >
                  <Avatar name={u.name} size={30} />
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-medium">{u.name}</span>
                    <span className="block text-[12px] text-dim">{t(`roles.${u.role}`)}</span>
                  </span>
                </button>
              ))}
          </div>
        </div>

        <div className="mt-8 space-y-1 text-center text-[11px] text-dim/80">
          <p>{t('login.noSignup')}</p>
          <p className="flex items-center justify-center gap-1">
            <Lock size={11} /> {t('login.encryption')}
          </p>
          <p className="pt-1.5">
            <a href="#/imprint" className="text-dim underline underline-offset-2 hover:text-ink">
              {t('common.imprint')}
            </a>
          </p>
          <p className="pt-1 text-dim/50">v{APP_VERSION}</p>
        </div>
      </div>
    </div>
  )
}
