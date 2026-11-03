import { MonitorSmartphone, ShieldAlert } from 'lucide-react'
import { useEffect, useState, type KeyboardEvent } from 'react'

/** Pfeiltasten in einer Reiterleiste: wechseln UND den Fokus mitnehmen. */
function reiterTasten<T extends string>(liste: readonly T[], aktuell: T, setze: (r: T) => void) {
  return (e: KeyboardEvent<HTMLDivElement>) => {
    const n = naechsterReiter(liste, aktuell, e.key)
    if (n === null) return
    e.preventDefault()
    setze(n)
    e.currentTarget.querySelector<HTMLElement>(`[data-reiter="${n}"]`)?.focus()
  }
}
import i18n from 'i18next'
import { useTranslation } from 'react-i18next'
import { useStore } from '../../store'
import { APP_VERSION } from '../../types'
import { SANDBOX } from '../../sandbox/flag'
import { Badge, Button, Card, CardHeading, Modal, Page, selectCls, TopBar } from '../../components/ui'
import { darf } from './access'
import { aktiv, pruefSchalter } from './settings'
import { registriereDocCheckTexte } from './i18n'
import { hinweisMerken, hinweisOffen, sitzungsAblage } from './hinweis'
import { profileBereinigen } from './recheck/profil'
import { aktuellerStand, nachSammlung, offeneEmpfehlungen, SANDBOX_DOKUMENTE, SANDBOX_EMPFEHLUNGEN, SANDBOX_SAMMLUNGEN, SANDBOX_STAENDE, standLabel } from './library'
import { useAnsichtsmodus } from './viewMode'
import { zahl } from '../../zahl'
import { naechsterReiter } from './reiter'
import { aktualisiert, fuerNutzer, setzen } from './sitzung'
import { standardVerbindung } from './verbindung'
import { ViewerProvider } from './components/Viewer'
import { AdminTab } from './components/AdminTab'
import { LibraryPanel, Phase, ReviewDocsPanel, SessionDocsPanel } from './components/Panels'
import { ChatTab, PruefungTab, RevisionenTab, VerwaltenTab } from './components/Tabs'
import { BefundeMobil, ExportTab } from './components/Export'
import { FindingsTab } from './components/Befunde'
import { ReCheckMobil, ReCheckTab } from './components/ReCheck'
import { usePaketPruefung } from './components/Paket'
import { ReferenzPanel } from './components/Referenzen'

// Die Texte kommen erst mit dem Modul — wer DocCheck nie oeffnet, laedt sie
// nie. Registriert wird beim Laden dieses Bundles, also vor dem ersten Render.
registriereDocCheckTexte(i18n)

type Reiter = 'pruefung' | 'findings' | 'recheck' | 'chat' | 'revisionen' | 'export' | 'verwalten' | 'admin'

/** Hinweisdialog je Anmeldung (Spez. 5.5 Nr. 2, Regel in `hinweis.ts`) — je
 *  Nutzer, damit auch „Ansicht als" und der nächste Nutzer am geteilten Gerät
 *  ihn sehen (Audit 11/2026, SEC-05). `zu` hält das Schließen fest, auch
 *  wenn die Ablage gesperrt ist; ein anderer Nutzer gilt nicht als gesehen. */
function useHinweis(nutzer: string | null): [boolean, () => void] {
  const [zu, setZu] = useState<string | null>(null)
  const offen = zu !== nutzer && hinweisOffen(sitzungsAblage(), nutzer)
  const schliessen = () => {
    hinweisMerken(sitzungsAblage(), nutzer)
    setZu(nutzer)
  }
  return [offen, schliessen]
}

function Kopf({ modell, setModell, zeigeModell }: { modell: string; setModell: (m: string) => void; zeigeModell: boolean }) {
  const { t } = useTranslation('doccheck')
  const { docCheckSettings } = useStore()
  return (
    <TopBar
      title="DocCheck"
      back="/"
      wide
      right={
        <div className="flex items-center gap-2">
          {/* Status-Ampel (Spez. 13.5). In der Sandbox gibt es nichts zu
              ueberwachen — sie sagt das, statt Gruen vorzutaeuschen. */}
          <span className="hidden items-center gap-1.5 md:flex">
            <Badge tone="ok">{t('status.library')}: {t('status.sandbox')}</Badge>
            <Badge tone="accent">{t('status.ai')}: {t('status.simulated')}</Badge>
          </span>
          {zeigeModell && (
            /* Unter sm schmal: Bei 320 px (400 % Zoom) blieb vom Titel sonst nur „D…" (Audit 11/2026, A11Y-11) */
            <select
              aria-label={t('model')}
              className={`${selectCls} !w-auto max-w-24 !px-2 !py-1.5 sm:max-w-none sm:!px-3`}
              value={modell}
              onChange={(e) => setModell(e.target.value)}
            >
              {docCheckSettings.modelle.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                  {m.id === docCheckSettings.ausweichModell ? ` (${t('fallbackShort')})` : ''}
                </option>
              ))}
            </select>
          )}
        </div>
      }
    />
  )
}

function Fuss({ onStand }: { onStand: () => void }) {
  const { t } = useTranslation('doccheck')
  return (
    <footer className="mt-section flex flex-wrap items-center justify-between gap-2 border-t border-line/10 pt-3 text-micro text-dim">
      <span>
        Instructor Connect v{APP_VERSION} · DocCheck {t('footer.phase')}
      </span>
      <button onClick={onStand} className="min-h-9 rounded-lg px-2 hover:bg-line/5 hover:text-ink">
        {standLabel(aktuellerStand(SANDBOX_STAENDE))}
      </button>
    </footer>
  )
}

function Hinweis({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation('doccheck')
  return (
    <Modal title={t('notice.title')} onClose={onClose}>
      <div className="space-y-stack text-small leading-relaxed">
        <p>{t('notice.body1')}</p>
        <p>{t('notice.body2')}</p>
        {SANDBOX && <p className="rounded-xl bg-accent/15 p-3">{t('notice.sandbox')}</p>}
        <div className="flex justify-end">
          <Button onClick={onClose}>{t('notice.ok')}</Button>
        </div>
      </div>
    </Modal>
  )
}

/** Wirft beim Rendern — die Fehlerprobe aus der Administration. */
function Wurf(): JSX.Element {
  throw new Error('DC-PROBE')
}

function Desktop() {
  const { t } = useTranslation('doccheck')
  const { docCheckRolle, docCheckSettings } = useStore()
  const [modell, setModell] = useState(docCheckSettings.standardModell)
  const [reiter, setReiter] = useState<Reiter>('pruefung')
  const [auswahl, setAuswahl] = useState<Set<string>>(new Set())
  const [probe, setProbe] = useState(false)
  usePaketPruefung()
  const reiterListe: Reiter[] = ['pruefung', 'findings', ...(aktiv(docCheckSettings, 'recheck') ? (['recheck'] as const) : []), 'chat', 'revisionen', 'export']
  if (darf(docCheckRolle, 'bibliothekPflegen')) reiterListe.push('verwalten')
  if (darf(docCheckRolle, 'konfigurieren')) reiterListe.push('admin')
  // Findings braucht die Breite der Tabelle; die Seitenspalten bleiben in
  // den anderen Reitern erreichbar.
  const verwaltung = reiter === 'verwalten' || reiter === 'admin' || reiter === 'findings'
  // Re-Check: die Prüfdokumente bilden das Paket — ihre Spalte bleibt, die
  // Bibliothek rechts wird für die Vorschlagstabelle nicht gebraucht.
  const nurLinks = reiter === 'recheck'

  return (
    <div className="flex flex-1 flex-col">
      <Kopf modell={modell} setModell={setModell} zeigeModell />
      <Page wide>
        {/* Verwaltung und Administration nehmen die volle Breite: Die
            Seitenspalten gehoeren zur Pruefung, und zwischen ihnen blieben
            fuer Tabellen keine 40 Zeichen. */}
        {/* Unter 1280 px stand alles untereinander — die Reiter erst unter
            sämtlichen Dokumentkarten (UX-Prüfung 01.11.2026). Jetzt ab 1024 px
            zwei Spalten: Prüfdokumente links über beide Zeilen, rechts die
            Reiter und darunter Bibliothek/Sitzung; schmaler stehen die Reiter
            zuerst. Ab 1280 px wie bisher drei Spalten. */}
        {/* Auch einspaltig eine ausdrückliche Spalte: Die stillschweigende
            „auto"-Spur wuchs auf die Mindestbreite des Inhalts (402 px), und bei
            320 px (400 % Zoom) musste man waagerecht scrollen, Text war
            abgeschnitten (Audit 11/2026, A11Y-11, WCAG 1.4.10). */}
        <div className={`grid grid-cols-[minmax(0,1fr)] items-start gap-stack ${verwaltung ? '' : nurLinks ? 'lg:grid-cols-[15rem_minmax(0,1fr)]' : 'lg:grid-cols-[15rem_minmax(0,1fr)] xl:grid-cols-[15rem_minmax(0,1fr)_18rem]'}`}>
          {!verwaltung && (
            <div className="space-y-stack lg:row-span-2 xl:row-span-1">
              <ReviewDocsPanel />
              {!nurLinks && <ReferenzPanel />}
            </div>
          )}
          <Card className={`min-w-0 p-0 ${verwaltung ? '' : 'order-first lg:order-none lg:col-start-2 lg:row-start-1'}`}>
            {/* Umbrechen statt waagerecht scrollen: Die Mittelspalte ist ab 1280 px
                auf jeder Breite gleich schmal, und mit Re-Check endete
                „Administration" 46 px hinter dem Rand — abgeschnitten, ohne
                Zeichen, dass es weitergeht (Audit 11/2026, DC-11). */}
            <div role="tablist" aria-label="DocCheck" onKeyDown={reiterTasten(reiterListe, reiter, setReiter)} className="flex flex-wrap gap-x-1 border-b border-line/10 px-2 pt-2">
              {reiterListe.map((r) => (
                <button
                  key={r}
                  role="tab"
                  id={`dc-tab-${r}`}
                  data-reiter={r}
                  aria-controls="dc-panel"
                  tabIndex={reiter === r ? 0 : -1}
                  aria-selected={reiter === r}
                  onClick={() => setReiter(r)}
                  className={`min-h-11 shrink-0 whitespace-nowrap rounded-t-xl border-b-2 px-2.5 text-small transition ${reiter === r ? 'border-accent font-semibold text-ink' : 'border-transparent text-dim hover:text-ink'}`}
                >
                  {t(`tabs.${r}`)}
                </button>
              ))}
            </div>
            <div role="tabpanel" id="dc-panel" aria-labelledby={`dc-tab-${reiter}`} className="p-4 xl:p-section">
              {/* h2 zwischen Seitentitel (h1) und Kartenüberschriften (h3) — sonst fehlte eine Ebene */}
              <h2 className="sr-only">{t(`tabs.${reiter}`)}</h2>
              {reiter === 'pruefung' && <PruefungTab modell={modell} zuFindings={() => setReiter('findings')} />}
              {reiter === 'findings' && <FindingsTab />}
              {reiter === 'recheck' && reiterListe.includes('recheck') && <ReCheckTab />}
              {reiter === 'chat' && <ChatTab />}
              {reiter === 'revisionen' && <RevisionenTab />}
              {reiter === 'export' && <ExportTab />}
              {reiter === 'verwalten' && <VerwaltenTab />}
              {reiter === 'admin' && <AdminTab onFehlerProbe={() => setProbe(true)} />}
              {probe && <Wurf />}
            </div>
          </Card>
          <div className={`space-y-stack ${verwaltung || nurLinks ? 'hidden' : 'lg:col-start-2 xl:col-start-3 xl:row-start-1'}`}>
            <LibraryPanel darfPflegen={darf(docCheckRolle, 'bibliothekPflegen')} auswahl={auswahl} setAuswahl={setAuswahl} />
            <SessionDocsPanel />
          </div>
        </div>
        <Fuss onStand={() => setReiter('revisionen')} />
      </Page>
    </div>
  )
}

type Segment = 'bibliothek' | 'nachpruefungen' | 'befunde' | 'recheck' | 'chat'

/** Ansichtsmodus iPhone/iPad (Spez. 3.8, 6.9): einspaltig, keine Prüfläufe. */
function Ansicht() {
  const { t, i18n: sprache } = useTranslation('doccheck')
  const { docCheckSettings } = useStore()
  const [seg, setSeg] = useState<Segment>('bibliothek')
  const empf = offeneEmpfehlungen(SANDBOX_EMPFEHLUNGEN)
  const segmente: Segment[] = ['bibliothek', 'nachpruefungen', 'befunde', ...(aktiv(docCheckSettings, 'recheck') ? (['recheck'] as const) : []), 'chat']
  return (
    <div className="flex flex-1 flex-col">
      <Kopf modell="" setModell={() => {}} zeigeModell={false} />
      <Page>
        <div className="space-y-stack">
          <p className="flex items-center gap-2 rounded-xl border border-line/10 bg-surface/60 p-3 text-small text-dim">
            <MonitorSmartphone size={18} className="shrink-0" aria-hidden /> {t('mobile.desktopOnly')}
          </p>
          {/* 2 x 2 am Handy: Vier Segmente in einer Reihe liessen „Nachpruefungen"
              mitten im Wort umbrechen (gemessen am iPhone 13, 390 px). */}
          <div role="tablist" aria-label="DocCheck" onKeyDown={reiterTasten(segmente, seg, setSeg)} className={`grid grid-cols-2 gap-1 rounded-2xl bg-line/5 p-1 ${segmente.length === 5 ? 'sm:grid-cols-5' : 'sm:grid-cols-4'}`}>
            {segmente.map((s, i) => (
              <button
                key={s}
                role="tab"
                data-reiter={s}
                tabIndex={seg === s ? 0 : -1}
                aria-selected={seg === s}
                onClick={() => setSeg(s)}
                // Ungerade Anzahl: das letzte Segment nimmt am Handy die ganze Zeile.
                className={`min-h-11 rounded-xl px-1 text-small transition ${segmente.length % 2 && i === segmente.length - 1 ? 'col-span-2 sm:col-span-1' : ''} ${seg === s ? 'bg-surface font-semibold text-ink shadow-soft' : 'text-dim'}`}
              >
                {t(`mobile.${s}`)}
              </button>
            ))}
          </div>
          <h2 className="sr-only">{t(`mobile.${seg}`)}</h2>
          {seg === 'bibliothek' &&
            nachSammlung(
              SANDBOX_DOKUMENTE.filter((d) => d.status === 'aktiv'),
              SANDBOX_SAMMLUNGEN,
            ).map((g) => (
              <Card key={g.sammlung.id} className="space-y-tight p-4">
                <CardHeading>{g.sammlung.name}</CardHeading>
                {g.docs.map((d) => (
                  <div key={d.id} className="flex items-center justify-between gap-2 border-t border-line/5 pt-2 text-small first:border-0 first:pt-0">
                    <span className="min-w-0">
                      <span className="font-semibold">{d.typ}</span> {d.revision}
                      <span className="block truncate text-micro text-dim">{d.titel}</span>
                    </span>
                    <span className="shrink-0 text-micro text-dim">{t('library.pages', { n: zahl(d.seiten, sprache.language) })}</span>
                  </div>
                ))}
              </Card>
            ))}
          {seg === 'nachpruefungen' &&
            empf.map((e) => (
              <Card key={e.id} className="space-y-tight p-4 text-small">
                <p className="font-semibold">
                  {e.pruefdokument} {e.revision}
                </p>
                <p className="text-dim">
                  {e.alt} → {e.neu}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {e.abschnitte.map((a) => (
                    <Badge key={a} tone="wait">
                      {a}
                    </Badge>
                  ))}
                </div>
                <p className="text-micro text-dim">{t('mobile.startOnDesktop')}</p>
              </Card>
            ))}
          {seg === 'befunde' && <BefundeMobil />}
          {seg === 'recheck' && <ReCheckMobil />}
          {seg === 'chat' && (
            <Card className="space-y-stack p-4 text-center text-small text-dim">
              <p>{t('mobile.chatLimit')}</p>
              <Phase n={7} />
            </Card>
          )}
          <Fuss onStand={() => setSeg('bibliothek')} />
        </div>
      </Page>
    </div>
  )
}

export default function DocCheckApp() {
  const ansicht = useAnsichtsmodus()
  const { docCheckRolle, currentUser, docCheckSettings } = useStore()
  const [hinweis, schliessen] = useHinweis(currentUser?.id ?? null)
  const { t } = useTranslation('doccheck')
  // Gehört die Sitzung (Dokumente, Referenzlisten, Re-Check) noch diesem
  // Nutzer? „Ansicht als" in der Sandbox wechselt die Identität ohne
  // Abmelden — fremde Dokumente dürfen dabei nicht stehen bleiben, auch
  // nicht im Kern des Workers (Nachtrag SEC#1: dort wirkte das Glossar des
  // Vorgängers weiter, solange er kein Dokument geladen hatte).
  useEffect(() => {
    if (fuerNutzer(currentUser?.id ?? null)) standardVerbindung().beenden()
  }, [currentUser?.id])
  // Dauerhafter Empfänger für Aktualisierungen, die der Worker von sich aus
  // schickt — etwa neu geprüfte Prüfdokumente, nachdem ein Regelwerk (N8)
  // geladen oder entfernt wurde. Ohne ihn gingen sie verloren.
  useEffect(() => {
    const ab = standardVerbindung().beiOcr((z) => setzen((s) => aktualisiert(s, z)))
    return () => {
      ab()
    }
  }, [])
  // Listenprofile von vor SEC-02 trugen Zelltext als Schlüssel — beim Öffnen
  // umschreiben, nicht erst, wenn wieder jemand einen Re-Check macht.
  useEffect(() => {
    try {
      profileBereinigen(localStorage)
    } catch {
      /* gesperrte Website-Daten: dann liegt dort auch nichts */
    }
  }, [])
  // Prüfschalter wirken sofort, auch auf schon geladene Prüfdokumente: Der
  // Kern prüft sie neu, die Ergebnisse kommen über den Empfänger oben.
  // Vorher galten sie nur fürs nächste Hochladen (Audit 11/2026, DC-12).
  const { formal, word, rechnen } = pruefSchalter(docCheckSettings)
  useEffect(() => {
    standardVerbindung().pruefenSetzen({ formal, word, rechnen })
  }, [formal, word, rechnen])
  // Doppelter Riegel: Die Route prueft schon, aber ein Rollenwechsel in der
  // Sandbox („View as") darf nicht in einer offenen Ansicht stehen bleiben.
  if (docCheckRolle === 'keine') {
    return (
      <Page>
        <p className="flex items-center gap-2 py-major text-small text-dim">
          <ShieldAlert size={18} /> {t('noAccess')}
        </p>
      </Page>
    )
  }
  return (
    <ViewerProvider>
      {ansicht ? <Ansicht /> : <Desktop />}
      {hinweis && <Hinweis onClose={schliessen} />}
    </ViewerProvider>
  )
}
