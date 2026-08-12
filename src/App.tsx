import { useEffect } from 'react'
import { SandboxBar } from './components/SandboxBar'
import { OfflineBanner } from './components/OfflineBanner'
import { StorageBanner } from './components/StorageBanner'
import { UpdateBanner } from './components/UpdateBanner'
import { Admin } from './pages/Admin'
import { ChatInfo } from './pages/ChatInfo'
import { ChatList } from './pages/ChatList'
import { ChatRoom } from './pages/ChatRoom'
import { DevicePreview } from './pages/DevicePreview'
import { Feedback } from './pages/Feedback'
import { Grading } from './pages/Grading'
import { decodeChain, GradingForm } from './pages/GradingForm'
import { GradingView } from './pages/GradingView'
import { Home } from './pages/Home'
import { LessonPlans } from './pages/LessonPlans'
import { Notes } from './pages/Notes'
import { Imprint } from './pages/Imprint'
import { InstructorInfo } from './pages/InstructorInfo'
import { Login } from './pages/Login'
import { WhoToCall } from './pages/WhoToCall'
import { navigate, useRoute } from './router'
import { StoreProvider, useStore } from './store'
import type { ModuleKey } from './types'

function Screen() {
  const route = useRoute()
  const { currentUser, moduleAllowed } = useStore()

  // Impressum und Gerätevorschau sind auch ohne Anmeldung erreichbar.
  if (route === '/imprint') return <Imprint />
  if (route === '/device') return <DevicePreview />

  if (!currentUser) return <Login />

  // Ein gesperrtes Modul darf auch über die Adresszeile nicht aufgehen —
  // die Kachel auszublenden reicht nicht.
  const moduleOfRoute = (r: string): ModuleKey | null => {
    if (r.startsWith('/chat')) return 'chat'
    if (r.startsWith('/grading')) return 'grading'
    if (r.startsWith('/lessons')) return 'lessons'
    if (r.startsWith('/info')) return 'info'
    if (r.startsWith('/feedback')) return 'feedback'
    if (r.startsWith('/contacts')) return 'contacts'
    if (r.startsWith('/notes')) return 'notes'
    return null
  }
  const blocked = moduleOfRoute(route)
  if (blocked && !moduleAllowed(blocked)) return <Home />

  const chatMatch = route.match(/^\/chat\/([^/]+)(\/info)?$/)
  let page
  if (route === '/chat') page = <ChatList />
  else if (chatMatch && chatMatch[2]) page = <ChatInfo groupId={chatMatch[1]} />
  // key: Gruppenwechsel remountet den Chatraum — Entwurf/Anhang und
  // Scrollposition wandern nicht in die andere Gruppe mit.
  else if (chatMatch) page = <ChatRoom key={chatMatch[1]} groupId={chatMatch[1]} />
  else if (route === '/grading') page = <Grading />
  else if (route.startsWith('/grading/new')) {
    // Folgeformular (306/310) wird mit Typ und Ursprungsformular vorbelegt
    const params = new URLSearchParams(route.split('?')[1] ?? '')
    const type = params.get('type') as Parameters<typeof GradingForm>[0]['presetType']
    const parent = params.get('parent') ?? undefined
    // Kette offener Folgeformulare: je Glied Typ UND Ausgangsformular
    const next = decodeChain(params.get('next') ?? '')
    page = <GradingForm key={route} presetType={type ?? undefined} parentId={parent} next={next} />
  } else if (route.startsWith('/grading/')) {
    // ?print=1 öffnet die Ansicht und startet direkt den PDF-/Druckdialog
    const [id, query] = route.slice('/grading/'.length).split('?')
    page = <GradingView key={route} recordId={id} autoPrint={new URLSearchParams(query ?? '').get('print') === '1'} />
  }
  // Der Monatsbericht hatte eine eigene Seite und eine eigene Kachel. Er ist
  // im Grading Tool bereits ein Reiter — zwei Wege zur selben Auswertung
  // heißt, sie an zwei Stellen pflegen zu müssen. Alte Lesezeichen und die
  // zum Startbildschirm gelegte App landen deshalb hier im Grading Tool,
  // statt ins Leere zu laufen.
  else if (route === '/report') page = <ReportRedirect />
  else if (route === '/lessons') page = <LessonPlans />
  else if (route === '/info') page = <InstructorInfo />
  else if (route === '/contacts') page = <WhoToCall />
  else if (route === '/notes') page = <Notes />
  else if (route === '/feedback') page = <Feedback />
  // #/admin/<bereich>[/<unterbereich>] — die Verwaltung ist adressierbar
  else if (route.startsWith('/admin')) page = <Admin sub={route.slice('/admin'.length).replace(/^\//, '').split('?')[0]} />
  else page = <Home unknownRoute={route !== '/' && route !== ''} />

  return page
}

function AppShell() {
  const { currentUser } = useStore()
  return (
    <div className="flex min-h-full flex-col">
      <UpdateBanner />
      <OfflineBanner />
      <StorageBanner />
      <div className="flex flex-1 flex-col">
        {/* Identitätswechsel baut die Seite neu auf: sonst schrieb ein offener
            Bildschirm dem neuen Nutzer sofort „gesehen" gut und übernahm
            fremden Formularzustand. */}
        <Screen key={currentUser?.id ?? 'anon'} />
      </div>
      <SandboxBar />
    </div>
  )
}

/**
 * Der Monatsbericht hatte eine eigene Seite und eine eigene Kachel. Er ist im
 * Grading Tool bereits ein Reiter — zwei Wege zur selben Auswertung heißen,
 * sie an zwei Stellen pflegen zu müssen. Alte Lesezeichen und eine zum
 * Startbildschirm gelegte App zeigen aber weiter auf #/report; sie landen
 * deshalb im Grading Tool, statt ins Leere zu laufen.
 *
 * Der Sprung passiert im Effekt, nicht in der Render-Phase: Ein Seiteneffekt
 * beim Rendern hat in diesem Projekt schon einmal für Schleifen gesorgt.
 */
function ReportRedirect() {
  useEffect(() => {
    navigate('/grading', true)
  }, [])
  return <Grading />
}

export default function App() {
  return (
    <StoreProvider>
      <AppShell />
    </StoreProvider>
  )
}
