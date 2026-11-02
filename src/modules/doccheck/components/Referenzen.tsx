import { ListChecks, X } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge, Card, CardHeading } from '../../../components/ui'
import { toast } from '../../../components/Toast'
import { aendern, hinzufuegen } from '../referenz/laden'
import { kopfSpalten, LISTE_MAX_MB, SPALTEN, type ListenArt } from '../referenz/liste'
import { useSitzung, type SitzungsReferenz } from '../sitzung'
import { standardVerbindung } from '../verbindung'
import { DateiName } from './Dokumente'

const ARTEN: ListenArt[] = ['glossar', 'abkuerzungen', 'register', 'kennungen']
const feldCls = 'w-full rounded-lg border border-field bg-bg/60 px-2 py-1 text-small text-ink outline-none focus:border-accent/60'

/**
 * Referenzlisten als Soll (Excel, CSV, Markdown). Wie Prüf- und
 * Sitzungsdokumente nur im Speicher dieses Tabs.
 */
export function ReferenzPanel() {
  const { t } = useTranslation('doccheck')
  const { referenzen = [] } = useSitzung()
  const eingabe = useRef<HTMLInputElement>(null)
  const [ziehen, setZiehen] = useState(false)

  const annehmen = async (liste: FileList | null) => {
    if (!liste?.length) return
    const passend = [...liste].filter((f) => /\.(xlsx|csv|md|txt)$/i.test(f.name))
    for (const f of [...liste].filter((x) => !passend.includes(x))) toast(t('referenz.format', { name: f.name }), 'bad')
    const { unbekannt, fehler } = await hinzufuegen(passend, standardVerbindung())
    for (const u of unbekannt) toast(t('referenz.unbekannt', { name: u }), 'wait')
    for (const f of fehler) toast(`${f.name}: ${t(`fehler.${f.code}`, { mb: LISTE_MAX_MB, defaultValue: t('fehler.DC-PARSE') })}`, 'bad')
  }

  return (
    <Card className="space-y-stack p-4">
      <CardHeading>{t('referenz.titel')}</CardHeading>
      <p className="text-micro leading-relaxed text-dim">{t('referenz.hinweis')}</p>
      <button
        type="button"
        onClick={() => eingabe.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setZiehen(true)
        }}
        onDragLeave={() => setZiehen(false)}
        onDrop={(e) => {
          e.preventDefault()
          setZiehen(false)
          void annehmen(e.dataTransfer.files)
        }}
        className={`flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed px-3 py-stack text-small transition ${ziehen ? 'border-accent bg-accent/10 text-ink' : 'border-line/15 bg-bg/40 text-dim hover:border-accent/50 hover:text-ink'}`}
      >
        <ListChecks size={18} aria-hidden /> {t('referenz.drop')}
      </button>
      <input ref={eingabe} type="file" multiple accept=".xlsx,.csv,.md,.txt" className="hidden" onChange={(e) => { void annehmen(e.target.files); e.target.value = '' }} />
      {referenzen.map((r, i) => (
        <div key={`${r.datei}-${r.blatt ?? ''}-${i}`} className="space-y-tight rounded-xl border border-line/10 bg-bg/40 p-2.5">
          <div className="flex items-start gap-2">
            <p className="min-w-0 flex-1 break-words text-small font-medium">
              <DateiName name={r.datei} />
              {r.blatt && <span className="font-normal text-dim"> / {r.blatt}</span>}
            </p>
            <button onClick={() => aendern(i, null, standardVerbindung())} aria-label={t('referenz.entfernen', { name: r.datei })} className="-m-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-dim hover:bg-line/5 hover:text-ink">
              <X size={14} />
            </button>
          </div>
          <select aria-label={t('referenz.art')} className={feldCls} value={r.liste?.art ?? r.art ?? ''} onChange={(e) => aendern(i, e.target.value as ListenArt, standardVerbindung())}>
            {!r.liste && !r.art && <option value="">{t('referenz.nichtErkannt')}</option>}
            {ARTEN.map((a) => (
              <option key={a} value={a}>{t(`referenz.arten.${a}`)}</option>
            ))}
          </select>
          {/* Gewählte Art, aber die Köpfe passen nicht: Spalten von Hand zuordnen,
              statt dass die Auswahl zurückspringt (Audit 11/2026, DC-13) */}
          {r.art && (r.spalten || !r.liste) && <Spaltenwahl r={r} index={i} art={r.art} />}
          {r.liste ? (
            <Badge tone="ok">{t('referenz.eintraege', { count: r.liste.eintraege.length })}</Badge>
          ) : r.art ? (
            <Badge tone="wait">{t('referenz.pflichtspalte')}</Badge>
          ) : (
            <Badge tone="wait">{t('referenz.spaltenFehlen')}</Badge>
          )}
        </div>
      ))}
    </Card>
  )
}

/** Je Rolle der gewählten Art ein Spaltenfeld — wie die Spaltenzuordnung im Re-Check. */
function Spaltenwahl({ r, index, art }: { r: SitzungsReferenz; index: number; art: ListenArt }) {
  const { t } = useTranslation('doccheck')
  const kennung = useId()
  const { zeile, koepfe } = kopfSpalten(r.zeilen)
  const rollen = Object.keys(SPALTEN[art])
  const setze = (rolle: string, wert: string) => {
    const neu = { ...(r.spalten ?? {}) }
    if (wert === '') delete neu[rolle]
    else neu[rolle] = Number(wert)
    aendern(index, art, standardVerbindung(), neu)
  }
  return (
    <div role="group" aria-labelledby={kennung} className="space-y-tight rounded-lg border border-line/10 p-2">
      <p id={kennung} className="text-micro text-dim">{t('referenz.zuordnen', { zeile: zeile + 1 })}</p>
      {rollen.map((rolle, k) => (
        <label key={rolle} className="block">
          <span className="mb-0.5 block text-micro text-dim">
            {t(`referenz.rollen.${rolle}`)}
            {k === 0 && <span aria-hidden> *</span>}
          </span>
          <select className={feldCls} value={r.spalten?.[rolle] ?? ''} onChange={(e) => setze(rolle, e.target.value)}>
            <option value="">—</option>
            {koepfe.map((kopf, n) => (
              <option key={n} value={n}>
                {kopf ? t('referenz.spalte', { n: n + 1, kopf }) : t('referenz.spalteLeer', { n: n + 1 })}
              </option>
            ))}
          </select>
        </label>
      ))}
    </div>
  )
}
