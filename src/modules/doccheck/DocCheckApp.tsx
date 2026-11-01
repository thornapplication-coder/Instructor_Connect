import { MonitorSmartphone, ShieldAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import i18n from 'i18next'
import { useTranslation } from 'react-i18next'
import { useStore } from '../../store'
import { APP_VERSION } from '../../types'
import { SANDBOX } from '../../sandbox/flag'
import { Badge, Button, Card, CardHeading, Modal, Page, selectCls, TopBar } from '../../components/ui'
import { darf } from './access'
import { registriereDocCheckTexte } from './i18n'
import { aktuellerStand, nachSammlung, offeneEmpfehlungen, SANDBOX_DOKUMENTE, SANDBOX_EMPFEHLUNGEN, SANDBOX_SAMMLUNGEN, SANDBOX_STAENDE, standLabel } from './library'
import { useAnsichtsmodus } from './viewMode'
import { fuerNutzer } from './sitzung'
import { standardVerbindung } from './verbindung'
import { ViewerProvider } from './components/Viewer'
import { AdminTab } from './components/AdminTab'
import { LibraryPanel, Phase, ReviewDocsPanel, SessionDocsPanel } from './components/Panels'
import { ChatTab, ExportTab, PruefungTab, RevisionenTab, VerwaltenTab } from './components/Tabs'
import { FindingsTab } from './components/Befunde'

// Die Texte kommen erst mit dem Modul — wer DocCheck nie oeffnet, laedt sie
// nie. Registriert wird beim Laden dieses Bundles, also vor dem ersten Render.
registriereDocCheckTexte(i18n)

type Reiter = 'pruefung' | 'findings' | 'chat' | 'revisionen' | 'export' | 'verwalten' | 'admin'

const HINWEIS_KEY = 'dc-notice-seen'

/** Hinweisdialog je Sitzung (Spez. 5.5 Nr. 2). sessionStorage, nicht der
 *  App-Zustand: „je Sitzung" heisst, ein neuer Tab zeigt ihn wieder. */
function useHinweis(): [boolean, () => void] {
  const [offen, setOffen] = useState(() => {
    try {
      return sessionStorage.getItem(HINWEIS_KEY) !== '1'
    } catch {
      return true
    }
  })
  const schliessen = () => {
    try {
      sessionStorage.setItem(HINWEIS_KEY, '1')
    } catch {
      /* ohne sessionStorage erscheint er eben wieder */
    }
    setOffen(false)
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
            <select
              aria-label={t('model')}
              className={`${selectCls} !w-auto !py-1.5`}
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
  const reiterListe: Reiter[] = ['pruefung', 'findings', 'chat', 'revisionen', 'export']
  if (darf(docCheckRolle, 'bibliothekPflegen')) reiterListe.push('verwalten')
  if (darf(docCheckRolle, 'konfigurieren')) reiterListe.push('admin')
  // Findings braucht die Breite der Tabelle; die Seitenspalten bleiben in
  // den anderen Reitern erreichbar.
  const verwaltung = reiter === 'verwalten' || reiter === 'admin' || reiter === 'findings'

  return (
    <div className="flex flex-1 flex-col">
      <Kopf modell={modell} setModell={setModell} zeigeModell />
      <Page wide>
        {/* Verwaltung und Administration nehmen die volle Breite: Die
            Seitenspalten gehoeren zur Pruefung, und zwischen ihnen blieben
            fuer Tabellen keine 40 Zeichen. */}
        <div className={`grid items-start gap-stack ${verwaltung ? '' : 'xl:grid-cols-[15rem_minmax(0,1fr)_18rem]'}`}>
          {!verwaltung && <ReviewDocsPanel />}
          <Card className="min-w-0 p-0">
            <div role="tablist" aria-label="DocCheck" className="flex gap-1 overflow-x-auto border-b border-line/10 px-2 pt-2">
              {reiterListe.map((r) => (
                <button
                  key={r}
                  role="tab"
                  aria-selected={reiter === r}
                  onClick={() => setReiter(r)}
                  className={`min-h-11 shrink-0 rounded-t-xl border-b-2 px-2.5 text-small transition ${reiter === r ? 'border-accent font-semibold text-ink' : 'border-transparent text-dim hover:text-ink'}`}
                >
                  {t(`tabs.${r}`)}
                </button>
              ))}
            </div>
            <div role="tabpanel" className="p-4 xl:p-section">
              {reiter === 'pruefung' && <PruefungTab modell={modell} />}
              {reiter === 'findings' && <FindingsTab />}
              {reiter === 'chat' && <ChatTab />}
              {reiter === 'revisionen' && <RevisionenTab />}
              {reiter === 'export' && <ExportTab />}
              {reiter === 'verwalten' && <VerwaltenTab />}
              {reiter === 'admin' && <AdminTab onFehlerProbe={() => setProbe(true)} />}
              {probe && <Wurf />}
            </div>
          </Card>
          <div className={`space-y-stack ${verwaltung ? 'hidden' : ''}`}>
            <LibraryPanel darfPflegen={darf(docCheckRolle, 'bibliothekPflegen')} auswahl={auswahl} setAuswahl={setAuswahl} />
            <SessionDocsPanel />
          </div>
        </div>
        <Fuss onStand={() => setReiter('revisionen')} />
      </Page>
    </div>
  )
}

type Segment = 'bibliothek' | 'nachpruefungen' | 'befunde' | 'chat'

/** Ansichtsmodus iPhone/iPad (Spez. 3.8, 6.9): einspaltig, keine Prüfläufe. */
function Ansicht() {
  const { t } = useTranslation('doccheck')
  const [seg, setSeg] = useState<Segment>('bibliothek')
  const empf = offeneEmpfehlungen(SANDBOX_EMPFEHLUNGEN)
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
          <div role="tablist" className="grid grid-cols-2 gap-1 rounded-2xl bg-line/5 p-1 sm:grid-cols-4">
            {(['bibliothek', 'nachpruefungen', 'befunde', 'chat'] as const).map((s) => (
              <button
                key={s}
                role="tab"
                aria-selected={seg === s}
                onClick={() => setSeg(s)}
                className={`min-h-11 rounded-xl px-1 text-small transition ${seg === s ? 'bg-surface font-semibold text-ink shadow-soft' : 'text-dim'}`}
              >
                {t(`mobile.${s}`)}
              </button>
            ))}
          </div>
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
                    <span className="shrink-0 text-micro text-dim">{t('library.pages', { n: d.seiten.toLocaleString('de-AT') })}</span>
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
          {seg === 'befunde' && (
            <Card className="space-y-stack p-4 text-center text-small text-dim">
              <p>{t('mobile.openState')}</p>
              <Phase n={6} />
            </Card>
          )}
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
  const [hinweis, schliessen] = useHinweis()
  const { docCheckRolle, currentUser } = useStore()
  const { t } = useTranslation('doccheck')
  // Gehört die Sitzung (Dokumente im Speicher) noch diesem Nutzer? „Ansicht
  // als" in der Sandbox wechselt die Identität ohne Abmelden — fremde
  // Dokumente dürfen dabei nicht stehen bleiben.
  useEffect(() => {
    if (fuerNutzer(currentUser?.id ?? null)) standardVerbindung().beenden()
  }, [currentUser?.id])
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
