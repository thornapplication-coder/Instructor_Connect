import { LogOut, MessageSquareText, MessagesSquare, Phone, GraduationCap, ShieldCheck, Share } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { GradingIcon } from '../components/GradingIcon'
import { Avatar, NewDot, ThemeToggle } from '../components/ui'
import { navigate } from '../router'
import { useStore } from '../store'
import { useIsDesktop } from '../useIsDesktop'
import { APP_VERSION } from '../types'

/* Kachel-Beschriftungen bleiben laut Spez. §5 in beiden Sprachen Englisch. */
const TILES = [
  { to: '/grading', label: 'Grading Tool', icon: GradingIcon },
  { to: '/chat', label: 'Chat', icon: MessagesSquare },
  { to: '/feedback', label: 'Feedback', icon: MessageSquareText },
  { to: '/info', label: 'Instructor Info', icon: GraduationCap },
  { to: '/contacts', label: 'Who to call', icon: Phone },
] as const

export function Home() {
  const { t, i18n } = useTranslation()
  const { currentUser, logout, unreadGroups, hasNewInfo, hasNewContacts, visibleGradingRecords } = useStore()
  const isDesktop = useIsDesktop()
  // Offene Signatur oder fehlgeschlagener Versand markiert die Grading-Kachel
  const hasOpenGrading = visibleGradingRecords.some((r) => r.status !== 'signed' || r.mailStatus === 'failed')
  const firstName = currentUser!.name.split(' ')[0]

  // Typisiert über die TILES-Routen: eine umbenannte oder neue Kachel ohne
  // Eintrag hier ist ein Compile-Fehler, kein still fehlender Punkt.
  const hasNews: Record<(typeof TILES)[number]['to'], boolean> = {
    '/grading': hasOpenGrading,
    '/chat': unreadGroups.size > 0,
    '/feedback': false,
    '/info': hasNewInfo,
    '/contacts': hasNewContacts,
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between px-5 pt-6">
        <div className="flex items-center gap-3">
          <Avatar name={currentUser!.name} size={40} />
          <div>
            <p className="text-[15px] font-semibold leading-tight">{t('home.hello', { name: firstName })}</p>
            <p className="text-[12px] text-dim">{t(`roles.${currentUser!.role}`)}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <ThemeToggle />
          <div className="flex overflow-hidden rounded-lg border border-line/15 text-[11px]">
            {(['de', 'en'] as const).map((lng) => (
              <button
                key={lng}
                onClick={() => i18n.changeLanguage(lng)}
                className={`px-2 py-1 font-medium uppercase transition ${i18n.language === lng ? 'bg-accent text-bg' : 'text-dim hover:text-ink'}`}
              >
                {lng}
              </button>
            ))}
          </div>
          <button
            onClick={logout}
            aria-label={t('common.logout')}
            className="rounded-full p-2 text-dim transition hover:bg-line/5 hover:text-ink"
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-5 py-8">
        <h1 className="mb-1 text-2xl font-bold tracking-tight">
          Instructor <span className="text-accent">Connect</span>
        </h1>
        <p className="mb-6 text-sm text-dim">{t('home.subtitle')}</p>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5 sm:gap-4">
          {TILES.map(({ to, label, icon: Icon }) => (
            <button
              key={to}
              onClick={() => navigate(to)}
              className="group relative flex aspect-square flex-col items-center justify-center gap-3 rounded-3xl border border-line/[0.07] bg-surface shadow-tile transition hover:-translate-y-0.5 hover:border-accent/40 hover:bg-raised"
            >
              {hasNews[to] && <NewDot className="right-3.5 top-3.5" />}
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-raised text-accent transition group-hover:bg-accent group-hover:text-bg">
                <Icon size={28} />
              </span>
              <span className="px-2 text-center text-[14px] font-semibold leading-tight">{label}</span>
            </button>
          ))}
        </div>

        {/* Admin Panel bewusst nur am Desktop: auf Tablet/Handy zu unübersichtlich. */}
        {currentUser!.role === 'superadmin' && isDesktop && (
          <button
            onClick={() => navigate('/admin')}
            className="mx-auto mt-8 flex items-center gap-2 rounded-full border border-line/10 px-4 py-2 text-[13px] text-dim transition hover:border-accent/40 hover:text-ink"
          >
            <ShieldCheck size={15} className="text-accent" /> {t('home.admin')}
          </button>
        )}

        <p className="mx-auto mt-6 flex max-w-xs items-center gap-2 text-center text-[11px] leading-snug text-dim/70">
          <Share size={13} className="shrink-0" /> {t('home.installHint')}
        </p>
      </main>

      <footer className="space-y-2 pb-4 text-center">
        <div className="flex items-center justify-center gap-4 text-[12.5px]">
          <button onClick={() => navigate('/imprint')} className="text-dim underline-offset-2 hover:text-ink hover:underline">
            {t('common.imprint')}
          </button>
          <button onClick={logout} className="flex items-center gap-1 text-dim underline-offset-2 hover:text-ink hover:underline">
            <LogOut size={12} /> {t('common.logout')}
          </button>
        </div>
        <p className="text-[11px] text-dim/50">Instructor Connect v{APP_VERSION}</p>
      </footer>
    </div>
  )
}
