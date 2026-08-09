import { ArrowLeft, Home as HomeIcon, Moon, Sun, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { navigate } from '../router'

const THEME_KEY = 'aaa-theme'

/** Vor dem ersten Render aufrufen, damit es beim Laden nicht flackert.
 *  Standard ist der Hellmodus; nur eine bewusst gewählte dunkle
 *  Einstellung schaltet um. */
export function initTheme() {
  try {
    if (localStorage.getItem(THEME_KEY) === 'dark') {
      document.documentElement.dataset.theme = 'dark'
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#161A21')
    }
  } catch {
    /* Ohne localStorage bleibt der Standard (hell) */
  }
}

export function ThemeToggle() {
  const { t } = useTranslation()
  const [light, setLight] = useState(() => document.documentElement.dataset.theme !== 'dark')
  const toggle = () => {
    const next = !light
    setLight(next)
    if (next) delete document.documentElement.dataset.theme
    else document.documentElement.dataset.theme = 'dark'
    try {
      localStorage.setItem(THEME_KEY, next ? 'light' : 'dark')
    } catch {
      /* Auswahl gilt dann nur für diese Sitzung */
    }
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', next ? '#E4E7ED' : '#161A21')
  }
  return (
    <button
      onClick={toggle}
      aria-label={t('common.theme')}
      title={t('common.theme')}
      className="flex h-11 w-11 items-center justify-center rounded-full text-dim transition hover:bg-line/5 hover:text-ink"
    >
      {light ? <Moon size={18} /> : <Sun size={18} />}
    </button>
  )
}

/** home=false unterdrückt den Home-Button — genutzt in den Grading-Forms,
 *  damit man dort nicht versehentlich aus dem Formular springt.
 *  wide=true nutzt am Desktop die volle Breite (Grading-Formulare). */
export function TopBar({
  title,
  back,
  right,
  home = true,
  wide = false,
  onBack,
}: {
  title: ReactNode
  back?: string
  right?: ReactNode
  home?: boolean
  wide?: boolean
  /** Rückfrage vor dem Verlassen; false verhindert die Navigation */
  onBack?: () => boolean
}) {
  const { t } = useTranslation()
  return (
    <header className="safe-top sticky top-0 z-20 border-b border-line/10 bg-bg/85 backdrop-blur">
      <div className={`mx-auto flex h-14 items-center gap-2 px-3 xl:max-w-none xl:px-8 ${wide ? 'max-w-5xl' : 'max-w-3xl'}`}>
        {back !== undefined && (
          <button
            onClick={() => {
              if (onBack && !onBack()) return
              navigate(back)
            }}
            aria-label={t('common.back')}
            className="-ml-1 flex h-11 w-11 items-center justify-center rounded-full text-dim transition hover:bg-line/5 hover:text-ink"
          >
            <ArrowLeft size={20} />
          </button>
        )}
        <h1 className="min-w-0 flex-1 truncate text-[17px] font-semibold tracking-tight">{title}</h1>
        {right}
        {home && (
          <button
            onClick={() => navigate('/')}
            aria-label="Home"
            title="Home"
            className="flex h-11 w-11 items-center justify-center rounded-full text-dim transition hover:bg-line/5 hover:text-accent"
          >
            <HomeIcon size={19} />
          </button>
        )}
      </div>
    </header>
  )
}

export function Page({ children, className = '', wide = false }: { children: ReactNode; className?: string; wide?: boolean }) {
  return <main className={`mx-auto w-full flex-1 px-4 pb-24 pt-4 xl:max-w-none xl:px-8 ${wide ? 'max-w-5xl' : 'max-w-3xl'} ${className}`}>{children}</main>
}

export function Card({ children, className = '', onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      className={`rounded-2xl border border-line/[0.06] bg-surface/90 shadow-soft ${onClick ? 'cursor-pointer transition hover:border-accent/30 hover:bg-raised/70' : ''} ${className}`}
    >
      {children}
    </div>
  )
}

export function Button({
  children,
  onClick,
  variant = 'primary',
  type = 'button',
  disabled,
  className = '',
}: {
  children: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'ghost' | 'danger'
  type?: 'button' | 'submit'
  disabled?: boolean
  className?: string
}) {
  const styles = {
    primary: 'bg-accent text-bg font-semibold hover:brightness-110',
    ghost: 'border border-line/15 text-ink hover:bg-line/5',
    danger: 'border border-danger/40 text-danger hover:bg-danger/10',
  }[variant]
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`min-h-11 rounded-xl px-4 py-2.5 text-sm transition disabled:opacity-40 ${styles} ${className}`}
    >
      {children}
    </button>
  )
}

export const inputCls =
  'w-full rounded-xl border border-line/10 bg-bg/60 px-3.5 py-2.5 text-[15px] text-ink placeholder:text-dim outline-none transition focus:border-accent/60 focus:ring-2 focus:ring-accent/20'

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-dim">{label}</span>
      {children}
    </label>
  )
}

export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const initials = name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
  return (
    <div
      style={{ width: size, height: size, fontSize: size * 0.38 }}
      className="flex shrink-0 items-center justify-center rounded-full bg-raised font-semibold text-accent"
    >
      {initials}
    </div>
  )
}

/** Grüner „Neu“-Punkt; Position über className, Größe über size (px) steuern. */
export function NewDot({ className = '', size = 12 }: { className?: string; size?: number }) {
  return (
    <span
      aria-label="new"
      style={{ width: size, height: size }}
      className={`pointer-events-none absolute z-10 rounded-full bg-ok ring-2 ring-bg ${className}`}
    />
  )
}

/** Mehrfachauswahl als Chip-Reihe — überall gleiches Verhalten und Styling */
export function ChipMultiSelect({ options, selected, onChange }: {
  options: { id: string; label: string }[]
  selected: string[]
  onChange: (ids: string[]) => void
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = selected.includes(o.id)
        return (
          <button
            key={o.id}
            onClick={() => onChange(on ? selected.filter((x) => x !== o.id) : [...selected, o.id])}
            className={`min-h-11 rounded-full border px-3 py-1.5 text-[12.5px] transition ${
              on ? 'border-accent bg-accent/15 font-semibold text-accent' : 'border-line/15 text-dim'
            }`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

export function Badge({ children, tone = 'accent' }: { children: ReactNode; tone?: 'accent' | 'warm' | 'dim' }) {
  const tones = {
    accent: 'bg-accent/15 text-accent',
    warm: 'bg-warm/15 text-warm',
    dim: 'bg-line/8 text-dim',
  }[tone]
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${tones}`}>{children}</span>
}

/**
 * Dialog mit vollständiger Tastaturbedienung: Escape schließt, der Fokus
 * bleibt im Dialog gefangen und kehrt beim Schließen an die auslösende
 * Stelle zurück. Ein Klick auf den Hintergrund fragt nach, sobald etwas
 * eingetragen wurde — vorher verwarf er ein halb ausgefülltes Formular
 * kommentarlos.
 */
export function Modal({
  title,
  onClose,
  children,
  confirmDiscard,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  /** Rückfrage vor dem Verwerfen (Text); ohne Angabe schließt der Dialog sofort */
  confirmDiscard?: string
}) {
  const { t } = useTranslation()
  const panelRef = useRef<HTMLDivElement>(null)
  const openerRef = useRef<Element | null>(null)

  const close = useCallback(() => {
    if (confirmDiscard && !window.confirm(confirmDiscard)) return
    onClose()
  }, [confirmDiscard, onClose])

  useEffect(() => {
    openerRef.current = document.activeElement
    const panel = panelRef.current
    // Erstes bedienbares Element bekommt den Fokus, sonst der Dialog selbst
    const focusable = () =>
      [...(panel?.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])') ?? [])].filter(
        (e) => !e.hasAttribute('disabled') && e.offsetParent !== null,
      )
    focusable()[0]?.focus() ?? panel?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        close()
        return
      }
      if (e.key !== 'Tab') return
      // Fokusfalle: Tab läuft im Kreis, statt hinter den Dialog zu wandern
      const items = focusable()
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      ;(openerRef.current as HTMLElement | null)?.focus?.()
    }
  }, [close])

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-6"
      onClick={close}
      role="presentation"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-line/10 bg-surface p-5 shadow-tile sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start gap-3">
          <h2 className="min-w-0 flex-1 text-lg font-semibold">{title}</h2>
          <button
            onClick={close}
            aria-label={t('common.close')}
            title={t('common.close')}
            className="-mr-1 -mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-dim transition hover:bg-line/5 hover:text-ink"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
