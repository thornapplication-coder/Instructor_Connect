import { Archive, FileSpreadsheet, FileText, FolderOpen, Presentation, Save, Sheet, X } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import i18n from 'i18next'
import { useTranslation } from 'react-i18next'
import { Badge, Button, Card, CardHeading } from '../../../components/ui'
import { toast } from '../../../components/Toast'
import { useStore } from '../../../store'
import { APP_VERSION } from '../../../types'
import { aktuellerStand, SANDBOX_STAENDE, standLabel } from '../library'
import { aktiv } from '../settings'
import { useSitzung } from '../sitzung'
import { exportEingabe, naechsteLaufnummer } from '../export/ausSitzung'
import { datenstand, type Datenstand } from '../export/datenstand'
import { erzeugen, paket, type Datei, type Format } from '../export/ausgabe'
import { datenstandAus, hashAbgleich, pruefstandLesen, type Pruefstand } from '../export/pruefstand'
import type { DocCheckFeature } from '../types'

/**
 * Exporte (Spez. v1.1 Kap. 10) und Prüfstand (Kap. 12). Jeder Klick friert
 * einen NEUEN Datenstand ein — mit eigener Export-ID —, damit nichts
 * exportiert wird, was die Tabelle nicht mehr zeigt.
 */

const FORMATE: { format: Exclude<Format, 'json'>; feature: DocCheckFeature; key: string; Icon: typeof Sheet }[] = [
  { format: 'xlsx', feature: 'exportExcel', key: 'excel', Icon: FileSpreadsheet },
  { format: 'docx', feature: 'exportWord', key: 'word', Icon: FileText },
  { format: 'csv', feature: 'exportCsv', key: 'csv', Icon: Sheet },
  { format: 'pptx', feature: 'exportPptx', key: 'pptx', Icon: Presentation },
]

function herunterladen(d: Datei) {
  const url = URL.createObjectURL(new Blob([d.daten], { type: d.mime }))
  const a = document.createElement('a')
  a.href = url
  a.download = d.name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Datenstand aus der laufenden Sitzung — Prüfer englisch (Export), Rolle aus dem englischen Paket. */
function useAusSitzung(): { erstellen: () => Datenstand; befunde: number; dokumente: number } {
  const { docs, paketModus, paketErgebnis } = useSitzung()
  const { docCheckSettings, currentUser, now } = useStore()
  const paketBefunde = paketModus && aktiv(docCheckSettings, 'packageCheck') ? (paketErgebnis?.ergebnis.befunde ?? []) : []
  const pruef = docs.filter((d) => d.rolle === 'review' && d.z?.pruefung)
  return {
    befunde: pruef.reduce((n, d) => n + d.z!.pruefung!.befunde.length, 0) + paketBefunde.length,
    dokumente: pruef.length,
    erstellen: () => {
      const datum = new Date(now()).toISOString()
      return datenstand(
        exportEingabe({
          docs,
          paketBefunde,
          datum,
          laufnummer: naechsteLaufnummer(localStorage, datum),
          appVersion: APP_VERSION,
          organisation: docCheckSettings.organisation,
          pruefer: { name: currentUser?.name ?? '', funktion: currentUser ? i18n.getFixedT('en')(`roles.${currentUser.role}`) : '' },
          bibliothek: standLabel(aktuellerStand(SANDBOX_STAENDE)),
        }),
      )
    },
  }
}

/** Formatknöpfe — dieselben für die Sitzung und für einen geladenen Prüfstand. */
function Knoepfe({ stand, mitPruefstand }: { stand: () => Datenstand | null; mitPruefstand: boolean }) {
  const { t } = useTranslation('doccheck')
  const { docCheckSettings, currentUser, now } = useStore()
  const [laeuft, setLaeuft] = useState<string | null>(null)
  const an = FORMATE.filter((f) => aktiv(docCheckSettings, f.feature))
  const ausfuehren = async (was: string, f: (d: Datenstand) => Promise<Datei>) => {
    const d = stand()
    if (!d) return
    setLaeuft(was)
    try {
      const datei = await f(d)
      herunterladen(datei)
      toast(t('export.fertig', { name: datei.name }))
    } catch {
      toast(t('export.fehler'), 'bad')
    } finally {
      setLaeuft(null)
    }
  }
  const kontext = () => ({ userId: currentUser?.id ?? '', ts: new Date(now()).toISOString() })
  return (
    <div className="space-y-stack">
      <div className="grid gap-stack sm:grid-cols-2">
        {FORMATE.map(({ format, feature, key, Icon }) => {
          const ein = aktiv(docCheckSettings, feature)
          return (
            <button
              key={format}
              disabled={!ein || laeuft !== null}
              onClick={() => void ausfuehren(format, (d) => erzeugen(d, format, { ...kontext(), formate: [format] }))}
              // Abgeschaltet: gestrichelt und Symbol gedämpft — nicht per Deckkraft, die drückte den Hinweistext unter 3:1
              className={`flex min-h-11 items-center gap-3 rounded-2xl border p-4 text-left transition ${ein ? 'border-line/10 hover:bg-line/5' : 'cursor-not-allowed border-dashed border-line/25'}`}
            >
              <Icon size={22} className={`shrink-0 ${ein ? 'text-accent' : 'text-dim'}`} aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block text-small font-semibold">{laeuft === format ? t('export.laeuft') : t(`export.${key}`)}</span>
                <span className="block text-micro text-dim">{ein ? t(`export.${key}Hint`) : t('export.off')}</span>
              </span>
            </button>
          )
        })}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" disabled={laeuft !== null || !an.length} onClick={() => void ausfuehren('zip', (d) => paket(d, an.map((f) => f.format), kontext()))}>
          <span className="flex items-center gap-1.5"><Archive size={16} /> {laeuft === 'zip' ? t('export.laeuft') : t('export.zip')}</span>
        </Button>
        {mitPruefstand && (
          <Button variant="ghost" disabled={laeuft !== null} onClick={() => void ausfuehren('json', (d) => erzeugen(d, 'json', { ...kontext(), formate: ['json'] }))}>
            <span className="flex items-center gap-1.5"><Save size={16} /> {laeuft === 'json' ? t('export.laeuft') : t('export.save')}</span>
          </Button>
        )}
      </div>
    </div>
  )
}

/** Prüfstand öffnen — die Datei kommt von außen: geprüft, nie geraten (pruefstandLesen). */
export function PruefstandLaden({ onGeladen }: { onGeladen: (p: Pruefstand, datei: string) => void }) {
  const { t } = useTranslation('doccheck')
  const eingabe = useRef<HTMLInputElement>(null)
  return (
    <>
      <Button variant="ghost" onClick={() => eingabe.current?.click()}>
        <span className="flex items-center gap-1.5"><FolderOpen size={16} /> {t('export.load')}</span>
      </Button>
      <input
        ref={eingabe}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (!f) return
          const p = pruefstandLesen(await f.text())
          if (typeof p === 'string') toast(t(`export.ladefehler.${p}`), 'bad')
          else {
            onGeladen(p, f.name)
            toast(t('export.geladen', { name: f.name, count: p.findings.length }))
          }
        }}
      />
    </>
  )
}

const TON = { High: 'bad', Medium: 'wait', Low: 'accent' } as const

/** Geladener Prüfstand: Kennung, Befunde, Hash-Abgleich und Exporte daraus. */
export function PruefstandAnsicht({ p, datei, onSchliessen }: { p: Pruefstand; datei: string; onSchliessen: () => void }) {
  const { t } = useTranslation('doccheck')
  const { docs } = useSitzung()
  const { now } = useStore()
  const abgleich = hashAbgleich(p, docs.filter((d) => d.z).map((d) => ({ sha256: d.z!.sha256 })))
  return (
    <Card className="space-y-stack p-4">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <CardHeading>{t('export.geladenTitel')}</CardHeading>
          <p className="truncate text-micro text-dim">
            {datei} · {p.createdAt.slice(0, 10)} · {p.reviewer.name}
          </p>
        </div>
        <button onClick={onSchliessen} aria-label={t('export.schliessen')} className="-m-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-dim hover:bg-line/5 hover:text-ink">
          <X size={18} />
        </button>
      </div>
      <ul className="space-y-tight text-small">
        {abgleich.map((a) => (
          <li key={a.id} className="flex items-center justify-between gap-2">
            <span className="min-w-0 truncate">{a.titel}</span>
            <Badge tone={a.da ? 'ok' : 'dim'}>{a.da ? t('export.hashOk') : t('export.hashFehlt')}</Badge>
          </li>
        ))}
      </ul>
      <ul className="divide-y divide-line/[0.06] rounded-2xl border border-line/10">
        {p.findings.length === 0 && <li className="p-3 text-small text-dim">{t('findings.empty')}</li>}
        {p.findings.map((f) => (
          <li key={f.id} className="space-y-tight p-3 text-small">
            <p className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-micro">{f.id}</span>
              <Badge tone={TON[f.priority]}>{t(`prio.${f.priority}`)}</Badge>
              <span className="text-micro text-dim">{[f.document, f.pageLabel].filter(Boolean).join(' · ')}</span>
            </p>
            <p lang="en">{f.description}</p>
          </li>
        ))}
      </ul>
      <Knoepfe stand={() => datenstandAus(p, new Date(now()).toISOString(), naechsteLaufnummer(localStorage, new Date(now()).toISOString()))} mitPruefstand={false} />
    </Card>
  )
}

export function ExportTab() {
  const { t } = useTranslation('doccheck')
  const s = useAusSitzung()
  const [geladen, setGeladen] = useState<{ p: Pruefstand; datei: string } | null>(null)
  const leer = s.dokumente === 0
  const zahl = useMemo(() => t('export.stand', { count: s.befunde, dokumente: s.dokumente }), [s.befunde, s.dokumente, t])
  return (
    <div className="space-y-section">
      <div className="space-y-stack">
        <p className="text-small">{leer ? t('export.keineDokumente') : zahl}</p>
        {!leer && <Knoepfe stand={s.erstellen} mitPruefstand />}
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-line/10 pt-section">
        <PruefstandLaden onGeladen={(p, datei) => setGeladen({ p, datei })} />
        <span className="text-micro text-dim">{t('export.ladenHinweis')}</span>
      </div>
      {geladen && <PruefstandAnsicht p={geladen.p} datei={geladen.datei} onSchliessen={() => setGeladen(null)} />}
      <p className="text-micro text-dim">{t('export.language')}</p>
    </div>
  )
}

/** Mobiler Bereich „Befunde" (Spez. 6.9): Prüfstand öffnen, Befunde ansehen, exportieren. */
export function BefundeMobil() {
  const { t } = useTranslation('doccheck')
  const [geladen, setGeladen] = useState<{ p: Pruefstand; datei: string } | null>(null)
  if (geladen) return <PruefstandAnsicht p={geladen.p} datei={geladen.datei} onSchliessen={() => setGeladen(null)} />
  return (
    <Card className="space-y-stack p-4 text-small">
      <p className="text-dim">{t('mobile.openState')}</p>
      <PruefstandLaden onGeladen={(p, datei) => setGeladen({ p, datei })} />
    </Card>
  )
}
