import { BookOpenCheck, LogOut, MessageSquareText, MessagesSquare, Phone, Plane, GraduationCap, RefreshCw, ShieldCheck, Share } from 'lucide-react'
import { useEffect, useState } from 'react'
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

export function Home({ unknownRoute = false }: { unknownRoute?: boolean }) {
  const { t, i18n } = useTranslation()
  // Ein Tippfehler in der Adresse zeigte die Startseite, ließ aber den
  // ungültigen Hash stehen — ein Neuladen landete dann wieder im Nichts.
  useEffect(() => {
    if (unknownRoute) navigate('/')
  }, [unknownRoute])
  const { state, currentUser, logout, unreadGroups, hasNewInfo, hasNewContacts, visibleGradingRecords, can, moduleAllowed } = useStore()
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
    '/feedback': false, // bewusst ohne Punkt — Feedback ist eine Einbahnstraße
    '/info': hasNewInfo,
    // Änderungen am Verzeichnis wurden berechnet, aber nie angezeigt
    '/contacts': hasNewContacts,
  }

  // Die Kacheln folgen der Rechte-Matrix: was der Superadmin einer Rolle
  // freischaltet, wird auch sichtbar. Vorher war die Startseite für den
  // Training Admin fest verdrahtet und freigegebene Rechte unerreichbar.
  const tiles = TILES.filter((tl) => {
    if (tl.to === '/grading') return can('grading_create') || can('grading_view_all')
    if (tl.to === '/lessons') return moduleAllowed('lessons')
    if (tl.to === '/info') return moduleAllowed('info')
    if (tl.to === '/chat') return moduleAllowed('chat')
    if (tl.to === '/feedback') return moduleAllowed('feedback')
    if (tl.to === '/contacts') return moduleAllowed('contacts')
    return true
  })

  return (
    <div className="flex flex-1 flex-col">
      <header className="safe-top-6 mx-auto flex w-full max-w-3xl items-center justify-between px-5 xl:max-w-none xl:px-10">
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
            className="flex h-11 w-11 items-center justify-center rounded-full text-dim transition hover:bg-line/5 hover:text-ink"
          >
            <RefreshCw size={17} />
          </button>
          <ThemeToggle />
          <div className="flex overflow-hidden rounded-lg border border-line/15 text-[11px]">
            {(['de', 'en'] as const).map((lng) => (
              <button
                key={lng}
                onClick={() => i18n.changeLanguage(lng)}
                className={`min-h-11 px-4 py-1 font-medium uppercase transition ${i18n.language === lng ? 'bg-accent text-bg' : 'text-dim hover:text-ink'}`}
              >
                {lng}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-5 py-8 short:py-3 md:max-w-4xl xl:max-w-none xl:px-10">
        {/* Bildmarke und Titel mittig über den Kacheln. Im flachen Fenster
            (Handy quer) rückt der Schriftzug neben die Bildmarke, damit die
            Kacheln ohne Scrollen erreichbar bleiben. */}
        <div className="mb-8 flex flex-col items-center gap-4 short:mb-3 short:flex-row short:justify-center short:gap-3">
          <span className="flex h-20 w-20 items-center justify-center rounded-3xl bg-raised shadow-tile short:h-11 short:w-11 short:rounded-2xl md:h-24 md:w-24">
            {/* Größe per CSS statt per size-Prop — so greifen die Varianten
                (flaches Fenster / ab Tablet) ohne mehrfaches Rendern. */}
            <Plane className="h-11 w-11 text-accent short:h-6 short:w-6 md:h-[52px] md:w-[52px]" />
          </span>
          <h1 className="text-center text-4xl font-bold tracking-tight short:text-2xl md:text-5xl">
            Instructor <span className="text-accent">Connect</span>
          </h1>
        </div>

        {/* 2 Spalten am Handy, 3 ab Tablet — große, gut greifbare Kacheln */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-5 xl:grid-cols-6 short:grid-cols-3 short:gap-2.5">
          {tiles.map(({ to, label, icon: Icon }) => (
            <button
              key={to}
              onClick={() => navigate(to)}
              className="group relative flex aspect-square flex-col items-center justify-center gap-3 rounded-3xl border border-line/[0.07] bg-surface shadow-tile transition hover:-translate-y-0.5 hover:border-accent/40 hover:bg-raised short:aspect-auto short:h-[72px] short:flex-row short:justify-start short:gap-2.5 short:rounded-2xl short:px-3"
            >
              {to === '/grading' && gradingTraffic ? (
                <span
                  aria-label={`status ${gradingTraffic}`}
                  className={`pointer-events-none absolute right-3.5 top-3.5 z-10 h-3 w-3 rounded-full ring-2 ring-bg ${TRAFFIC_CLS[gradingTraffic]}`}
                />
              ) : (
                hasNews[to] && <NewDot className="right-3.5 top-3.5" />
              )}
              {/* Kachelgröße bleibt — Symbol und Beschriftung wachsen ab Tablet
                  deutlich mit, damit sie am iPad und Desktop gut lesbar sind. */}
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-raised text-accent transition group-hover:bg-accent group-hover:text-bg sm:h-20 sm:w-20 lg:h-24 lg:w-24 short:h-10 short:w-10 short:rounded-xl">
                <Icon size={28} className="sm:hidden short:block" />
                <Icon size={40} className="hidden sm:block lg:hidden short:hidden" />
                <Icon size={48} className="hidden lg:block short:hidden" />
              </span>
              <span className="px-2 text-center text-[14px] font-semibold leading-tight sm:text-[17px] lg:text-[19px] short:px-0 short:text-left short:text-[13px]">{label}</span>
            </button>
          ))}
        </div>

        {/* Admin Panel bewusst nur am Desktop: auf Tablet/Handy zu unübersichtlich.
            Admins bekommen ein kleines Panel (Gruppen + Feedback). */}
        {(currentUser!.role === 'superadmin' || currentUser!.role === 'group_admin') && isDesktop && (
          <button
            onClick={() => navigate('/admin')}
            className="min-h-11 mx-auto mt-8 flex items-center gap-2 rounded-full border border-line/10 px-4 py-2 text-[13px] text-dim transition hover:border-accent/40 hover:text-ink"
          >
            <ShieldCheck size={15} className="text-accent" /> {t('home.admin')}
          </button>
        )}

        {/* Antippen öffnet das Share-Sheet (iOS: „Zum Home-Bildschirm") */}
        <button
          onClick={openInstall}
          className="mx-auto mt-6 flex min-h-11 max-w-xs items-center gap-2 text-center text-[11px] leading-snug text-dim underline-offset-2 transition hover:text-ink hover:underline short:hidden md:mt-8"
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

      <footer className="space-y-2 pb-4 text-center short:space-y-1 short:pb-2">
        <div className="flex items-center justify-center gap-4 text-[12.5px]">
          <button onClick={() => navigate('/imprint')} className="inline-flex min-h-11 items-center text-dim underline-offset-2 hover:text-ink hover:underline">
            {t('common.imprint')}
          </button>
          <button onClick={logout} className="inline-flex min-h-11 items-center gap-1 text-dim underline-offset-2 hover:text-ink hover:underline">
            <LogOut size={12} /> {t('common.logout')}
          </button>
        </div>
        <p className="text-[11px] text-dim short:hidden">Instructor Connect v{APP_VERSION}</p>
      </footer>
    </div>
  )
}
