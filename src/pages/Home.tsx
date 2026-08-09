import { BookOpenCheck, LogOut, MessageSquareText, MessagesSquare, Phone, Plane, GraduationCap, RefreshCw, ShieldCheck, Share } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { GradingIcon } from '../components/GradingIcon'
import { Avatar, Modal, NewDot, ThemeToggle } from '../components/ui'
import { navigate } from '../router'
import { useStore } from '../store'
import { useIsDesktop } from '../useIsDesktop'
import { APP_VERSION } from '../types'
import { TRAFFIC_CLS, trafficLight, type TrafficColor } from './Grading'

/* Kachel-Beschriftungen bleiben laut Spez. §5 in beiden Sprachen Englisch. */
const TILES = [
  { to: '/grading', label: 'Grading Tool', icon: GradingIcon },
  { to: '/lessons', label: 'Lesson Plan', icon: BookOpenCheck },
  { to: '/chat', label: 'Chat', icon: MessagesSquare },
  { to: '/info', label: 'Instructor Info', icon: GraduationCap },
  { to: '/feedback', label: 'Feedback', icon: MessageSquareText },
  { to: '/contacts', label: 'Who to call', icon: Phone },
] as const

export function Home() {
  const { t, i18n } = useTranslation()
  const { state, currentUser, logout, unreadGroups, hasNewInfo, visibleGradingRecords } = useStore()
  const isDesktop = useIsDesktop()
  const [showInstall, setShowInstall] = useState(false)
  // Öffnet das iOS-Share-Sheet (dort: „Zum Home-Bildschirm") — sonst Anleitung
  const openInstall = () => {
    const nav = navigator as Navigator & { share?: (data: { title: string; url: string }) => Promise<void> }
    if (nav.share) nav.share({ title: 'Instructor Connect', url: window.location.href.split('#')[0] }).catch(() => setShowInstall(true))
    else setShowInstall(true)
  }
  // Der Punkt auf der Grading-Kachel spiegelt die Ampel des Grading-Moduls:
  // rot vor gelb vor grün — kein Formular vorhanden = kein Punkt. Fehlende
  // Pflicht-Folgeformulare zählen als gelb.
  const gradingTraffic: TrafficColor | null = visibleGradingRecords.length
    ? visibleGradingRecords.some((r) => trafficLight(r, state.gradingRecords) === 'red')
      ? 'red'
      : visibleGradingRecords.some((r) => trafficLight(r, state.gradingRecords) === 'yellow')
        ? 'yellow'
        : 'green'
    : null
  const firstName = currentUser!.name.split(' ')[0]

  // Typisiert über die TILES-Routen: eine umbenannte oder neue Kachel ohne
  // Eintrag hier ist ein Compile-Fehler, kein still fehlender Punkt.
  const hasNews: Record<(typeof TILES)[number]['to'], boolean> = {
    '/grading': false, // Grading trägt stattdessen den Ampel-Punkt
    '/lessons': false,
    '/chat': unreadGroups.size > 0,
    '/feedback': false, // bewusst ohne Punkt
    '/info': hasNewInfo,
    '/contacts': false, // bewusst ohne Punkt
  }

  // Training Admin: reiner Formular-Zugriff — nur die Grading-Kachel
  const tiles = currentUser!.role === 'training_admin' ? TILES.filter((tl) => tl.to === '/grading') : TILES

  return (
    <div className="flex flex-1 flex-col">
      <header className="safe-top-6 mx-auto flex w-full max-w-3xl items-center justify-between px-5">
        <div className="flex items-center gap-3">
          <Avatar name={currentUser!.name} size={40} />
          <div>
            <p className="text-[15px] font-semibold leading-tight">{t('home.hello', { name: firstName })}</p>
            <p className="text-[12px] text-dim">{t(`roles.${currentUser!.role}`)}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {/* App neu laden — bleibt dank Hash-Routing auf der aktuellen Seite */}
          <button
            onClick={() => window.location.reload()}
            aria-label={t('common.refresh')}
            title={t('common.refresh')}
            className="rounded-full p-2 text-dim transition hover:bg-line/5 hover:text-ink"
          >
            <RefreshCw size={17} />
          </button>
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

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-5 py-8 md:max-w-4xl">
        <div className="mb-1 flex items-center gap-3">
          {/* Flugzeug-Icon wie am Login — die Bildmarke der App */}
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-raised shadow-tile">
            <Plane size={21} className="text-accent" />
          </span>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
            Instructor <span className="text-accent">Connect</span>
          </h1>
        </div>
        <p className="mb-6 text-sm text-dim md:mb-8">{t('home.subtitle')}</p>

        {/* 2 Spalten am Handy, 3 ab Tablet — große, gut greifbare Kacheln */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-5">
          {tiles.map(({ to, label, icon: Icon }) => (
            <button
              key={to}
              onClick={() => navigate(to)}
              className="group relative flex aspect-square flex-col items-center justify-center gap-3 rounded-3xl border border-line/[0.07] bg-surface shadow-tile transition hover:-translate-y-0.5 hover:border-accent/40 hover:bg-raised"
            >
              {to === '/grading' && gradingTraffic ? (
                <span
                  aria-label={`status ${gradingTraffic}`}
                  className={`pointer-events-none absolute right-3.5 top-3.5 z-10 h-3 w-3 rounded-full ring-2 ring-bg ${TRAFFIC_CLS[gradingTraffic]}`}
                />
              ) : (
                hasNews[to] && <NewDot className="right-3.5 top-3.5" />
              )}
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-raised text-accent transition group-hover:bg-accent group-hover:text-bg sm:h-16 sm:w-16">
                <Icon size={28} className="sm:hidden" />
                <Icon size={32} className="hidden sm:block" />
              </span>
              <span className="px-2 text-center text-[14px] font-semibold leading-tight sm:text-[15px]">{label}</span>
            </button>
          ))}
        </div>

        {/* Admin Panel bewusst nur am Desktop: auf Tablet/Handy zu unübersichtlich.
            Admins bekommen ein kleines Panel (Gruppen + Feedback). */}
        {(currentUser!.role === 'superadmin' || currentUser!.role === 'group_admin') && isDesktop && (
          <button
            onClick={() => navigate('/admin')}
            className="mx-auto mt-8 flex items-center gap-2 rounded-full border border-line/10 px-4 py-2 text-[13px] text-dim transition hover:border-accent/40 hover:text-ink"
          >
            <ShieldCheck size={15} className="text-accent" /> {t('home.admin')}
          </button>
        )}

        {/* Antippen öffnet das Share-Sheet (iOS: „Zum Home-Bildschirm") */}
        <button
          onClick={openInstall}
          className="mx-auto mt-6 flex max-w-xs items-center gap-2 text-center text-[11px] leading-snug text-dim/70 underline-offset-2 transition hover:text-ink hover:underline md:mt-8"
        >
          <Share size={13} className="shrink-0" /> {t('home.installHint')}
        </button>

        {showInstall && (
          <Modal title={t('home.installTitle')} onClose={() => setShowInstall(false)}>
            <ol className="list-decimal space-y-2 pl-5 text-[13.5px] leading-relaxed">
              <li>{t('home.installStep1')}</li>
              <li>{t('home.installStep2')}</li>
              <li>{t('home.installStep3')}</li>
            </ol>
          </Modal>
        )}
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
