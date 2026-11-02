import { AlertTriangle } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { standBeiseitelegen } from '../persist'
import { navigate } from '../router'
import { Button, Page, TopBar } from './ui'

/**
 * Was statt einer weißen Seite erscheint (Audit 11/2026, TEC-07).
 *
 * Vorher nahm jeder Renderfehler die ganze App mit — und war er
 * datenbedingt, blieb sie auf dem Gerät dauerhaft weiß, Impressum und
 * Sandbox-Leiste eingeschlossen. Zwei Stufen:
 *
 *  - `SeitenFehler`: eine Seite ist abgestürzt, Hülle und Leisten laufen
 *    weiter. Zur Startseite, neu laden — und wenn der Fehler am Stand hängt
 *    und immer wiederkommt, den Stand beiseitelegen.
 *  - `AppFehler`: die Hülle selbst ist abgestürzt (außerhalb des Stores).
 *
 * „Beiseitelegen" heißt sichern, nicht löschen (persist.standBeiseitelegen):
 * Der Stand bleibt als Sicherung auf dem Gerät, die App startet frisch.
 * Nachweise mit Aufbewahrungspflicht wirft kein Knopf weg.
 */

function Rueckfall({ titel, text, fehler, aktionen }: { titel: string; text: string; fehler: Error; aktionen: React.ReactNode }) {
  const { t } = useTranslation()
  return (
    <div role="alert" className="mx-auto flex max-w-md flex-col items-center gap-stack py-major text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-raised text-dim">
        <AlertTriangle size={26} />
      </span>
      <h2 className="text-head font-semibold">{titel}</h2>
      <p className="text-small text-dim">{text}</p>
      <p className="break-all font-mono text-micro text-dim">
        {t('crash.code')}: {fehler.message || fehler.name}
      </p>
      {aktionen}
    </div>
  )
}

/** Stand sichern und frisch starten — mit Meldung, falls schon das Sichern scheitert. */
function BeiseitelegenKnopf({ neuLaden }: { neuLaden: () => void }) {
  const { t } = useTranslation()
  const [gescheitert, setGescheitert] = useState(false)
  return (
    <>
      <Button variant="ghost" onClick={() => void standBeiseitelegen().then((ok) => (ok ? neuLaden() : setGescheitert(true)))}>
        {t('crash.reset')}
      </Button>
      {gescheitert && <p className="text-small text-bad">{t('crash.resetFailed')}</p>}
    </>
  )
}

const neuLadenEcht = () => window.location.reload()

export function SeitenFehler({ fehler, zuruecksetzen, neuLaden = neuLadenEcht }: { fehler: Error; zuruecksetzen: () => void; neuLaden?: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-1 flex-col">
      <TopBar title="Instructor Connect" back="/" />
      <Page>
        <Rueckfall
          titel={t('crash.pageTitle')}
          text={t('crash.pageBody')}
          fehler={fehler}
          aktionen={
            <div className="flex flex-col items-center gap-tight">
              <div className="flex flex-wrap justify-center gap-tight">
                <Button
                  variant="ghost"
                  onClick={() => {
                    navigate('/')
                    zuruecksetzen()
                  }}
                >
                  {t('crash.toHome')}
                </Button>
                <Button onClick={neuLaden}>{t('crash.reload')}</Button>
              </div>
              <BeiseitelegenKnopf neuLaden={neuLaden} />
            </div>
          }
        />
      </Page>
    </div>
  )
}

export function AppFehler({ fehler, neuLaden = neuLadenEcht }: { fehler: Error; neuLaden?: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="flex min-h-full flex-col px-4">
      <Rueckfall
        titel={t('crash.appTitle')}
        text={t('crash.appBody')}
        fehler={fehler}
        aktionen={
          <div className="flex flex-col items-center gap-tight">
            <Button onClick={neuLaden}>{t('crash.reload')}</Button>
            <BeiseitelegenKnopf neuLaden={neuLaden} />
          </div>
        }
      />
    </div>
  )
}
