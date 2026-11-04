import { ClipboardCopy, Download, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from '../components/Toast'
import { Badge, Button, Card, Page, SectionHeading, TopBar, type BadgeTone } from '../components/ui'
import { formatDateTime, lokalerTag } from '../datum'
import { ablageDauerhaftBitten } from '../persist'
import { navigate } from '../router'
import { berichtText, gesamtStufe, textSchluessel, textWerte, zaehlen, zusammenfassungText, type Ergebnis, type Gruppe, type Stufe } from '../selbsttest'
import { laufMerken, letzterLauf, selbsttestAusfuehren } from '../selbsttestGeraet'
import { useStore } from '../store'

/**
 * Selbsttest im täglichen Betrieb (Regeln: selbsttest.ts, Messungen:
 * selbsttestGeraet.ts). Läuft beim Öffnen; jede Zeile sagt in einem Satz,
 * was los ist und was zu tun ist. Der Bericht trägt keine Inhalte — er ist
 * für die Rückfrage gedacht, wenn jemand ein Problem meldet.
 */

/** Ein Ton je Stufe — dieselbe Bedeutung wie überall (Badge, CLAUDE.md). */
const TON: Record<Stufe, BadgeTone> = { ok: 'ok', hinweis: 'wait', fehler: 'bad', offen: 'dim' }
const GRUPPEN: Gruppe[] = ['geraet', 'daten', 'doccheck']
const NUTZER_PUNKTE = new Set(['adressen', 'muster', 'ohneGruppe', 'doccheckRegel'])
const FORMULAR_PUNKTE = new Set(['fingerabdruck', 'zeiten'])

export function Selbsttest() {
  const { t } = useTranslation()
  const { state, currentUser, docCheckRolle } = useStore()
  const darfDaten = currentUser?.role === 'superadmin'
  const mitDocCheck = docCheckRolle !== 'keine'
  const [ergebnisse, setErgebnisse] = useState<Ergebnis[] | null>(null)
  const [laeuft, setLaeuft] = useState(true)
  const [zeit, setZeit] = useState<number | null>(() => letzterLauf()?.zeit ?? null)
  const stateRef = useRef(state)
  stateRef.current = state
  // Nur der jüngste Lauf zählt: Ein älterer, der später fertig wird (oder
  // einer nach dem Verlassen der Seite), schreibt nichts mehr.
  const laufNr = useRef(0)

  const pruefen = useCallback(async () => {
    const nr = ++laufNr.current
    setLaeuft(true)
    const jetzt = Date.now()
    const es = await selbsttestAusfuehren({ state: stateRef.current, jetzt, daten: darfDaten, docCheck: mitDocCheck })
    if (nr !== laufNr.current) return
    laufMerken(es, jetzt)
    setErgebnisse(es)
    setZeit(jetzt)
    setLaeuft(false)
  }, [darfDaten, mitDocCheck])

  useEffect(() => {
    void pruefen()
    return () => {
      laufNr.current++
    }
  }, [pruefen])

  const bericht = () =>
    berichtText(ergebnisse ?? [], t, {
      zeit: zeit ? formatDateTime(zeit) : '–',
      geraet: navigator.userAgent,
      stand: String(ergebnisse?.find((e) => e.id === 'version')?.werte?.stand ?? '–'),
    })

  const kopieren = () => {
    const text = bericht()
    const zwischenablage = navigator.clipboard
    if (!zwischenablage) {
      toast(t('selbsttest.kopierenFehler'), 'bad')
      return
    }
    zwischenablage.writeText(text).then(
      () => toast(t('selbsttest.kopiert'), 'ok'),
      () => toast(t('selbsttest.kopierenFehler'), 'bad'),
    )
  }

  const herunterladen = () => {
    const url = URL.createObjectURL(new Blob([bericht()], { type: 'text/plain;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `selbsttest-${lokalerTag(zeit ?? Date.now())}.txt`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    toast(t('selbsttest.heruntergeladen'), 'ok')
  }

  const gesamt = ergebnisse ? gesamtStufe(ergebnisse) : null
  const z = ergebnisse ? zaehlen(ergebnisse) : null

  return (
    <>
      <TopBar title={t('selbsttest.titel')} back="/" />
      <Page className="space-y-section">
        <p className="text-small leading-relaxed text-dim">{t('selbsttest.einleitung')}</p>

        <Card className="space-y-stack p-4">
          {/* Live-Region immer im Baum: Sprachausgaben lesen das Ergebnis vor,
              sobald der Lauf fertig ist, ohne den Fokus zu nehmen. */}
          <div role="status" className="flex flex-wrap items-center gap-tight">
            {laeuft || !z || !gesamt ? (
              <span className="text-body font-semibold">{t('selbsttest.laeuft')}</span>
            ) : (
              <>
                <Badge tone={TON[gesamt]} strong>
                  {z.fehler + z.hinweis === 0 ? t('selbsttest.zusammenfassung.ok') : t(`selbsttest.stufe.${gesamt}`)}
                </Badge>
                <span className="text-body font-semibold">{zusammenfassungText(z, t)}</span>
              </>
            )}
          </div>
          {zeit !== null && <p className="text-micro text-dim">{t('selbsttest.letzterLauf', { zeit: formatDateTime(zeit) })}</p>}
          <div className="flex flex-wrap gap-tight">
            <Button onClick={() => void pruefen()} disabled={laeuft}>
              <RefreshCw size={15} aria-hidden /> {t('selbsttest.start')}
            </Button>
            <Button variant="ghost" onClick={kopieren} disabled={!ergebnisse}>
              <ClipboardCopy size={15} aria-hidden /> {t('selbsttest.kopieren')}
            </Button>
            <Button variant="ghost" onClick={herunterladen} disabled={!ergebnisse}>
              <Download size={15} aria-hidden /> {t('selbsttest.herunterladen')}
            </Button>
          </div>
        </Card>

        {ergebnisse &&
          GRUPPEN.map((g) => {
            const teil = ergebnisse.filter((e) => e.gruppe === g)
            if (!teil.length) return null
            return (
              <section key={g} className="space-y-stack" aria-label={t(`selbsttest.gruppe.${g}`)}>
                <SectionHeading>{t(`selbsttest.gruppe.${g}`)}</SectionHeading>
                <Card className="p-0">
                  <ul className="divide-y divide-line/[0.08]">
                    {teil.map((e) => (
                      <li key={e.id} className="space-y-tight px-4 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <span className="text-body font-medium">{t(`selbsttest.punkt.${e.id}.name`)}</span>
                          <Badge tone={TON[e.stufe]}>{t(`selbsttest.stufe.${e.stufe}`)}</Badge>
                        </div>
                        <p className="text-small leading-relaxed text-dim">{t(textSchluessel(e), textWerte(e))}</p>
                        <Aktionen e={e} neuPruefen={() => void pruefen()} />
                      </li>
                    ))}
                  </ul>
                </Card>
              </section>
            )
          })}

        <p className="text-micro leading-relaxed text-dim">{t('selbsttest.berichtHinweis')}</p>
      </Page>
    </>
  )
}

/** Was man an einer Zeile tun kann — nur dort, wo es etwas zu tun gibt. */
function Aktionen({ e, neuPruefen }: { e: Ergebnis; neuPruefen: () => void }) {
  const { t } = useTranslation()
  if (e.stufe === 'ok') return null
  if (e.id === 'dauerhaft' && e.stufe === 'hinweis') {
    return (
      <Button
        variant="ghost"
        onClick={() => {
          ablageDauerhaftBitten()
          // Die Antwort des Browsers kommt asynchron; danach neu prüfen.
          setTimeout(neuPruefen, 500)
        }}
      >
        {t('selbsttest.aktion.dauerhaft')}
      </Button>
    )
  }
  if ((e.id === 'version' && e.stufe === 'hinweis') || (e.id === 'offline' && (e.variante === 'fehlend' || e.variante === 'einrichten'))) {
    return (
      <Button variant="ghost" onClick={() => window.location.reload()}>
        {t('selbsttest.aktion.neuLaden')}
      </Button>
    )
  }
  if (!e.betroffen?.length) return null
  if (NUTZER_PUNKTE.has(e.id)) {
    return (
      <Button variant="ghost" onClick={() => navigate('/admin/users')}>
        {t('selbsttest.aktion.nutzer')}
      </Button>
    )
  }
  if (FORMULAR_PUNKTE.has(e.id)) {
    return (
      <div className="flex flex-wrap gap-tight" aria-label={t('selbsttest.betroffen')}>
        {e.betroffen.map((id) => (
          <Button key={id} variant="ghost" onClick={() => navigate(`/grading/${id}`)}>
            {t('selbsttest.aktion.formular', { id })}
          </Button>
        ))}
      </div>
    )
  }
  return <p className="text-micro text-dim">{`${t('selbsttest.betroffen')}: ${e.betroffen.join(', ')}`}</p>
}
