import { SandboxBar } from './components/SandboxBar'
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
import { Imprint } from './pages/Imprint'
import { InstructorInfo } from './pages/InstructorInfo'
import { Login } from './pages/Login'
import { WhoToCall } from './pages/WhoToCall'
import { useRoute } from './router'
import { StoreProvider, useStore } from './store'

function Screen() {
  const route = useRoute()
  const { currentUser } = useStore()

  // Impressum und Gerätevorschau sind auch ohne Anmeldung erreichbar.
  if (route === '/imprint') return <Imprint />
  if (route === '/device') return <DevicePreview />

  if (!currentUser) return <Login />

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
  } else if (route === '/lessons') page = <LessonPlans />
  else if (route === '/info') page = <InstructorInfo />
  else if (route === '/contacts') page = <WhoToCall />
  else if (route === '/feedback') page = <Feedback />
  else if (route.startsWith('/admin')) page = <Admin />
  else page = <Home />

  return page
}

export default function App() {
  return (
    <StoreProvider>
      <div className="flex min-h-full flex-col">
        <UpdateBanner />
        <div className="flex flex-1 flex-col">
          <Screen />
        </div>
        <SandboxBar />
      </div>
    </StoreProvider>
  )
}
