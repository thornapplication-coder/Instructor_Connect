import { FileX2, Wrench } from 'lucide-react'
import { lazy, Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import { ErrorBoundary } from '../../components/ErrorBoundary'
import { Button, Page, TopBar } from '../../components/ui'
import { navigate } from '../../router'
import { useStore } from '../../store'
import { toast } from '../../components/Toast'
import { darf } from './access'
import { istLadefehler } from './ladefehler'

/**
 * Einstieg der DocCheck-Kachel (Spez. 3.2).
 *
 * Diese Datei ist der einzige EINSTIEG, den InstructorConnect von DocCheck
 * statisch laedt — klein mit Absicht. Dazu kommen nur kleine Module ohne
 * Bibliothek: Rechte (`access`), Einstellungen (`settings`) und
 * Sandbox-Bestand (`library`) fuer den Store, `ladefehler` fuer diese
 * Huelle. `src/startbundle.test.ts` haelt die Liste (Audit 11/2026,
 * CIG-03). Alles andere kommt per `lazy` erst beim Oeffnen
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

/**
 * @param neuLaden nur für Tests ersetzbar — jsdom kann die Seite nicht neu laden
 */
export function DocCheckRoute({ neuLaden = () => window.location.reload() }: { neuLaden?: () => void } = {}) {
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
      fallback={(fehler, reset) => {
        /*
         * Ladefehler → Seite neu laden; Renderfehler → Grenze zurücksetzen.
         *
         * Vorher setzte „Erneut versuchen" immer nur zurück. Nach einem
         * gescheiterten Nachladen konnte das nie gelingen: Das `lazy` oben
         * hält sein abgelehntes Versprechen, und Chromium merkt sich den
         * gescheiterten Modulabruf — selbst ein frischer import() derselben
         * Adresse scheitert weiter (Audit 11/2026, TEC-08). Ein Neuladen
         * kostet hier nichts: Ist das Modul nie geladen, gibt es auch keine
         * Sitzungsdokumente. Ein Renderfehler dagegen setzt nur zurück, weil
         * ein Neuladen die Dokumente verwürfe.
         */
        const laden = istLadefehler(fehler)
        return (
          <Meldung
            icon={<FileX2 size={26} />}
            titel={t('docCheck.errorTitle')}
            text={laden ? t('docCheck.errorLoadBody') : t('docCheck.errorBody')}
            // Vorher hieß JEDER Fehler ohne eigenen Code „DC-LOAD" — auch ein
            // Renderfehler, der mit dem Netz nichts zu tun hat.
            code={`${t('docCheck.errorCode')}: ${fehler.message.startsWith('DC-') ? fehler.message : laden ? 'DC-LOAD' : 'DC-RENDER'}`}
            aktion={
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => navigate('/')}>
                  {t('docCheck.toHome')}
                </Button>
                <Button onClick={laden ? neuLaden : reset}>{t('docCheck.retry')}</Button>
              </div>
            }
          />
        )
      }}
    >
      <Suspense fallback={<Meldung icon={<span className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />} titel="DocCheck" text={t('docCheck.loading')} />}>
        <DocCheckApp />
      </Suspense>
    </ErrorBoundary>
  )
}
