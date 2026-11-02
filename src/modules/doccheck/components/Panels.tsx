import { FileUp, Lock } from 'lucide-react'
import { DokListe } from './Dokumente'
import { useTranslation } from 'react-i18next'
import { Badge, Card, CardHeading } from '../../../components/ui'
import { nachSammlung, SANDBOX_DOKUMENTE, SANDBOX_SAMMLUNGEN } from '../library'
import { zahl } from '../../../zahl'
import type { BibliotheksDokument } from '../types'

/**
 * Die drei Spalten der Desktop-Ansicht (Spez. 6.1). In Phase 1a stehen sie
 * mit echtem Bibliotheksbestand (Sandbox), aber ohne Parser: Die Dropzonen
 * sind sichtbar und sagen ehrlich, ab wann sie etwas tun.
 */

export function Phase({ n }: { n: number }) {
  const { t } = useTranslation('doccheck')
  return <Badge tone="dim">{t('phase', { n })}</Badge>
}

/** Eine Ablagefläche, die (noch) nichts annimmt — sichtbar statt versteckt. */
export function Dropzone({ text, phase, icon = <FileUp size={22} /> }: { text: string; phase: number; icon?: React.ReactNode }) {
  return (
    <div
      aria-disabled="true"
      className="flex flex-col items-center justify-center gap-tight rounded-2xl border-2 border-dashed border-line/15 bg-bg/40 px-4 py-section text-center text-small text-dim"
    >
      <span className="text-dim">{icon}</span>
      <span>{text}</span>
      <Phase n={phase} />
    </div>
  )
}

export function ReviewDocsPanel() {
  const { t } = useTranslation('doccheck')
  return (
    <Card className="space-y-stack p-4">
      <CardHeading>{t('cols.review')}</CardHeading>
      <DokListe rolle="review" />
      <p className="text-micro leading-relaxed text-dim">{t('review.hint')}</p>
    </Card>
  )
}

function DokZeile({ d, gewaehlt, onToggle }: { d: BibliotheksDokument; gewaehlt: boolean; onToggle: () => void }) {
  const { t, i18n } = useTranslation('doccheck')
  return (
    <li className="flex items-start gap-2.5 py-2">
      <input
        type="checkbox"
        checked={gewaehlt}
        onChange={onToggle}
        className="mt-0.5 h-5 w-5 shrink-0 accent-accent"
        aria-label={`${t('library.use')}: ${d.typ} ${d.revision}`}
      />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-1.5 text-small font-medium">
          <span className="rounded-md bg-accent/15 px-1.5 text-micro font-bold">{d.typ}</span>
          <span>{d.revision}</span>
          <span className="text-micro font-normal text-dim">· {t('library.rank', { n: d.rang })}</span>
        </p>
        <p className="truncate text-micro text-dim" title={d.titel}>
          {d.titel}
        </p>
        <p className="text-micro text-dim">
          {d.nummer} · {t('library.pages', { n: zahl(d.seiten, i18n.language) })} · {t(`legal.${d.rechtscharakter}`)}
        </p>
      </div>
    </li>
  )
}

export function LibraryPanel({
  darfPflegen,
  auswahl,
  setAuswahl,
}: {
  darfPflegen: boolean
  auswahl: Set<string>
  setAuswahl: (s: Set<string>) => void
}) {
  const { t } = useTranslation('doccheck')
  const aktiv = SANDBOX_DOKUMENTE.filter((d) => d.status === 'aktiv')
  const gruppen = nachSammlung(aktiv, SANDBOX_SAMMLUNGEN)
  const toggle = (id: string) => {
    const n = new Set(auswahl)
    if (n.has(id)) n.delete(id)
    else n.add(id)
    setAuswahl(n)
  }
  return (
    <Card className="space-y-stack p-4">
      <div className="flex items-center justify-between gap-2">
        <CardHeading>{t('cols.library')}</CardHeading>
        {!darfPflegen && (
          <span className="flex items-center gap-1 text-micro text-dim" title={t('library.readonly')}>
            <Lock size={13} aria-hidden /> {t('library.readonlyShort')}
          </span>
        )}
      </div>
      <p className="text-micro text-dim">{t('library.selectionHint', { n: auswahl.size })}</p>
      {gruppen.map((g) => (
        <section key={g.sammlung.id} aria-label={g.sammlung.name}>
          <h4 className="border-b border-line/10 pb-1 text-micro font-bold uppercase tracking-wide text-ink">{g.sammlung.name}</h4>
          <ul className="divide-y divide-line/5">
            {g.docs.map((d) => (
              <DokZeile key={d.id} d={d} gewaehlt={auswahl.has(d.id)} onToggle={() => toggle(d.id)} />
            ))}
          </ul>
        </section>
      ))}
    </Card>
  )
}

export function SessionDocsPanel() {
  const { t } = useTranslation('doccheck')
  return (
    <Card className="space-y-stack p-4">
      <div className="space-y-tight">
        <CardHeading>{t('cols.session')}</CardHeading>
        <Badge tone="wait">{t('session.badge')}</Badge>
      </div>
      <DokListe rolle="master" />
      <p className="text-micro leading-relaxed text-dim">{t('session.hint')}</p>
    </Card>
  )
}
