import { FileX2, Wrench } from 'lucide-react'
import { lazy, Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import { ErrorBoundary } from '../../components/ErrorBoundary'
import { Button, Page, TopBar } from '../../components/ui'
import { navigate } from '../../router'
import { useStore } from '../../store'
import { toast } from '../../components/Toast'
import { darf } from './access'

/**
 * Einstieg der DocCheck-Kachel (Spez. 3.2).
 *
 * Diese Datei ist das EINZIGE, was InstructorConnect von DocCheck statisch
 * laedt — klein mit Absicht. Alles andere kommt per `lazy` erst beim Oeffnen
 * und liegt hinter einer Fehlergrenze: Scheitert das Nachladen (Netz weg)
 * oder wirft das Modul, steht hier eine Meldung, und Startseite, Sandbox-
 * Leiste und alle anderen Kacheln laufen weiter.
 *
 * Die Texte dieser Huelle liegen im App-Bundle (Schluessel `docCheck`), weil
 * sie gerade dann gebraucht werden, wenn das Modul NICHT geladen ist.
 */
const DocCheckApp = lazy(() => import('./DocCheckApp'))

function Meldung({ icon, titel, text, code, aktion }: { icon: React.ReactNode; titel: string; text: string; code?: string; aktion?: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <TopBar title="DocCheck" back="/" />
      <Page>
        <div className="mx-auto flex max-w-md flex-col items-center gap-stack py-major text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-raised text-dim">{icon}</span>
          <h2 className="text-head font-semibold">{titel}</h2>
          <p className="text-small text-dim">{text}</p>
          {code && <p className="font-mono text-micro text-dim">{code}</p>}
          {aktion}
        </div>
      </Page>
    </div>
  )
}

export function DocCheckRoute() {
  const { t } = useTranslation()
  const { docCheckSettings, docCheckRolle, updateDocCheckSettings } = useStore()
  // Feature-Schalter „DocCheck aus" (Spez. 13.2): Wartungshinweis, ohne dass
  // das Modul ueberhaupt geladen wird. Der Schalter selbst liegt IM Modul —
  // ohne den Knopf hier sperrte sich der Superadmin mit dem Ausschalten
  // selbst aus und kaeme nur ueber den Datenbestand zurueck (UX-Pruefung
  // 01.11.2026).
  if (!docCheckSettings.features.doccheck) {
    return (
      <Meldung
        icon={<Wrench size={26} />}
        titel={t('docCheck.maintenanceTitle')}
        text={t('docCheck.maintenanceBody')}
        aktion={
          darf(docCheckRolle, 'konfigurieren') ? (
            <Button
              onClick={() => {
                updateDocCheckSettings({ features: { doccheck: true } as never })
                toast(t('docCheck.maintenanceOnDone'), 'ok')
              }}
            >
              {t('docCheck.maintenanceOn')}
            </Button>
          ) : undefined
        }
      />
    )
  }
  return (
    <ErrorBoundary
      fallback={(fehler, reset) => (
        <Meldung
          icon={<FileX2 size={26} />}
          titel={t('docCheck.errorTitle')}
          text={t('docCheck.errorBody')}
          code={`${t('docCheck.errorCode')}: ${fehler.message.startsWith('DC-') ? fehler.message : 'DC-LOAD'}`}
          aktion={
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => navigate('/')}>
                {t('docCheck.toHome')}
              </Button>
              <Button onClick={reset}>{t('docCheck.retry')}</Button>
            </div>
          }
        />
      )}
    >
      <Suspense fallback={<Meldung icon={<span className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />} titel="DocCheck" text={t('docCheck.loading')} />}>
        <DocCheckApp />
      </Suspense>
    </ErrorBoundary>
  )
}
