import { useEffect, type ReactNode } from 'react'
import { ErrorBoundary } from './components/ErrorBoundary'
import { AppFehler, SeitenFehler } from './components/Fehlerseite'
import { SandboxBar } from './components/SandboxBar'
import { OfflineBanner } from './components/OfflineBanner'
import { StorageBanner } from './components/StorageBanner'
import { SessionBanner } from './components/SessionBanner'
import { UpdateBanner } from './components/UpdateBanner'
import { ToastHost } from './components/Toast'
import { Admin } from './pages/Admin'
import { ChatInfo } from './pages/ChatInfo'
import { ChatList } from './pages/ChatList'
import { ChatRoom } from './pages/ChatRoom'
import { DevicePreview } from './pages/DevicePreview'
import { Feedback } from './pages/Feedback'
import { Grading } from './pages/Grading'
import { GradingForm } from './pages/GradingForm'
import { decodeChain } from './folgeKette'
import { GradingView } from './pages/GradingView'
import { Home } from './pages/Home'
import { LessonPlans } from './pages/LessonPlans'
import { Logbook } from './pages/Logbook'
import { Notes } from './pages/Notes'
import { Imprint } from './pages/Imprint'
import { InstructorInfo } from './pages/InstructorInfo'
import { Login } from './pages/Login'
import { WhoToCall } from './pages/WhoToCall'
import { navigate, useRoute } from './router'
import { DocCheckRoute } from './modules/doccheck'
import { StoreProvider, useStore } from './store'
import { SANDBOX } from './sandbox/flag'
import type { ModuleKey } from './types'

function Screen() {
  const route = useRoute()
  const { currentUser, moduleAllowed, docCheckRolle } = useStore()

  // Impressum und Gerätevorschau sind auch ohne Anmeldung erreichbar. Die
  // Vorschau ist ein Sandbox-Werkzeug wie die Leiste, die zu ihr führt —
  // ohne Sandbox gibt es sie nicht, auch nicht über die Adresszeile
  // (Audit 11/2026, KERN-18).
  if (route === '/imprint') return <Imprint />
  if (SANDBOX && route === '/device') return <DevicePreview />

  if (!currentUser) return <Login />

  // Ein gesperrtes Modul darf auch über die Adresszeile nicht aufgehen —
  // die Kachel auszublenden reicht nicht.
  const moduleOfRoute = (r: string): ModuleKey | null => {
    if (r.startsWith('/chat')) return 'chat'
    // `/report` ist die alte Monatsbericht-Adresse und leitet ins Grading
    // Tool um. Ohne diese Zeile griff die Modulsperre dort nicht: Die
    // Grading-Ansicht rendert einen Durchgang lang samt Altbestaenden,
    // bevor der Effekt umleitet.
    if (r.startsWith('/grading') || r.startsWith('/report')) return 'grading'
    if (r.startsWith('/lessons')) return 'lessons'
    if (r.startsWith('/info')) return 'info'
    if (r.startsWith('/feedback')) return 'feedback'
    if (r.startsWith('/contacts')) return 'contacts'
    if (r.startsWith('/notes')) return 'notes'
    return null
  }
  const blocked = moduleOfRoute(route)
  // Gesperrt heisst: Startseite UND Adresse zurueck. Vorher blieb der Hash auf
  // `#/notes` stehen, waehrend die Startseite zu sehen war — ein Neuladen oder
  // ein Lesezeichen fuehrte wieder ins Nichts, und die Adresszeile behauptete
  // eine Ansicht, die gar nicht offen ist. Das Admin-Panel raeumt seine
  // Adresse seit jeher auf; die Modulsperre kannte die Regel nicht.
  if (blocked && !moduleAllowed(blocked)) return <Home unknownRoute />

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
  else if (route === '/logbook') page = <Logbook />
  else if (route === '/feedback') page = <Feedback />
  // DocCheck: Ohne Berechtigung fuehrt auch die Adresszeile nicht hinein.
  else if (route === '/doccheck') page = docCheckRolle === 'keine' ? <Home unknownRoute /> : <DocCheckRoute />
  // #/admin/<bereich>[/<unterbereich>] — die Verwaltung ist adressierbar
  else if (route.startsWith('/admin')) page = <Admin sub={route.slice('/admin'.length).replace(/^\//, '').split('?')[0]} />
  else page = <Home unknownRoute={route !== '/' && route !== ''} />

  return page
}

function AppShell() {
  const { currentUser } = useStore()
  return (
    <div className="flex min-h-full flex-col">
      {/*
        Ein einziger Stapel fuer alles, was am unteren Rand liegt.

        Vorher trug jeder Streifen `above-sandbox fixed inset-x-0` selbst und
        sass damit auf demselben Punkt: Der Offline-Streifen verdeckte die
        Abschlussleiste des Formulars (dafuer gibt es die Sonderregel in
        index.css), und die neue Bestaetigung verdeckte anschliessend den
        Offline-Streifen — ausgerechnet die Zahl der wartenden Formulare, im
        Funkloch, drei Sekunden lang. Zwei Fehler desselben Musters.

        Ein Flex-Stapel loest das Muster auf: Was gleichzeitig sichtbar ist,
        liegt untereinander statt uebereinander. Reihenfolge von unten nach
        oben, dringlichstes zuletzt.

        Im Druck ist der ganze Stapel weg (Audit 11/2026, GRD-14/UI-01): Er
        liegt ausserhalb von main, die Druckregel fuer Bedienelemente griff
        dort nicht, und nur Offline- und Speicherstreifen trugen ein eigenes
        `print:hidden`. Wer ein Blatt abschickte und gleich das PDF zog, hatte
        „Form signed and sent." samt Schliessknopf auf dem Nachweis — Chrome
        druckt ein `fixed`-Element auf JEDES Blatt. Die Regel sitzt hier, am
        Stapel, damit sie fuer jeden Streifen gilt, auch fuer kuenftige.

        Seitlich haelt `safe-x` den Stapel aus dem Sicherheitsbereich — im
        Querformat lag ein Streifen sonst unter der Sensorkappe (MOB-07).
      */}
      <div className="above-sandbox safe-x pointer-events-none fixed inset-x-0 z-40 flex flex-col items-center gap-tight [--rand-x:0.75rem] print:hidden">
        <ToastHost />
        <StorageBanner />
        <SessionBanner />
        <OfflineBanner />
        <UpdateBanner />
      </div>
      <div className="flex flex-1 flex-col">
        {/* Identitätswechsel baut die Seite neu auf: sonst schrieb ein offener
            Bildschirm dem neuen Nutzer sofort „gesehen" gut und übernahm
            fremden Formularzustand. */}
        <SeitenGrenze>
          <Screen key={currentUser?.id ?? 'anon'} />
        </SeitenGrenze>
      </div>
      <SandboxBar />
    </div>
  )
}

/**
 * Fehlergrenze um die Seiten (Audit 11/2026, TEC-07): Ein Fehler in einer
 * Ansicht nimmt Hülle, Leisten und Streifen nicht mit. Die Route setzt sie
 * zurück — wer über Zurück oder ein Lesezeichen weitergeht, sieht die neue
 * Seite statt der alten Fehlermeldung.
 */
function SeitenGrenze({ children }: { children: ReactNode }) {
  const route = useRoute()
  return (
    <ErrorBoundary zuruecksetzenBei={route} fallback={(fehler, zuruecksetzen) => <SeitenFehler fehler={fehler} zuruecksetzen={zuruecksetzen} />}>
      {children}
    </ErrorBoundary>
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
  // Die äußere Grenze fängt, was die Seitengrenze nicht erreicht: einen
  // Fehler in der Hülle oder schon beim Aufbau des Stores (ein gespeicherter
  // Stand, an dem die App abstürzt). Vorher blieb dann nur eine weiße Seite
  // — bei jedem Start wieder, bis jemand die Websitedaten löschte.
  return (
    <ErrorBoundary fallback={(fehler) => <AppFehler fehler={fehler} />}>
      <StoreProvider>
        <AppShell />
      </StoreProvider>
    </ErrorBoundary>
  )
}
