import { Bug, Radio } from 'lucide-react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatDateTime } from '../../../datum'
import { SANDBOX } from '../../../sandbox/flag'
import { useStore } from '../../../store'
import { Badge, Button, Card, CardHeading, Field, inputCls, selectCls } from '../../../components/ui'
import { testaufruf } from '../llm/client'
import type { Antwortstand } from '../llm/sse'
import { FEATURES, preiseVollstaendig } from '../settings'

/**
 * Administration (nur Superadmin, Spez. 6.8) — in Phase 1a die Teile, die
 * ohne Backend ehrlich funktionieren: Feature-Schalter, Modellwahl,
 * Proxy-Testaufruf (simuliert), Audit-Log und die Fehlerprobe.
 */
export function AdminTab({ onFehlerProbe }: { onFehlerProbe: () => void }) {
  const { t } = useTranslation('doccheck')
  const { state, docCheckSettings: s, updateDocCheckSettings } = useStore()
  const [stand, setStand] = useState<Antwortstand | null>(null)
  const [laeuft, setLaeuft] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  const abbruch = useRef<AbortController | null>(null)
  const name = (id: string) => state.users.find((u) => u.id === id)?.name ?? id
  const audit = state.docCheck?.audit ?? []

  const test = async () => {
    abbruch.current = new AbortController()
    setLaeuft(true)
    setFehler(null)
    setStand(null)
    try {
      await testaufruf(s, { sandbox: SANDBOX, model: s.standardModell, onStand: setStand, pauseMs: 25, signal: abbruch.current.signal })
    } catch (e) {
      setFehler((e as Error).message)
    } finally {
      setLaeuft(false)
    }
  }

  return (
    <div className="space-y-section">
      <div className="grid gap-stack xl:grid-cols-2">
        <Card className="space-y-stack p-4">
          <CardHeading>{t('admin.features')}</CardHeading>
          <p className="text-micro text-dim">{t('admin.featuresHint')}</p>
          <ul className="divide-y divide-line/5">
            {FEATURES.map((f) => (
              <li key={f}>
                <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 text-small">
                  <span className={f === 'doccheck' ? 'font-semibold' : ''}>{t(`feature.${f}`)}</span>
                  <input
                    type="checkbox"
                    className="h-5 w-5 accent-accent"
                    checked={s.features[f]}
                    onChange={(e) => updateDocCheckSettings({ features: { [f]: e.target.checked } as never })}
                  />
                </label>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="space-y-stack p-4">
          <CardHeading>{t('admin.models')}</CardHeading>
          <table className="w-full text-small">
            <thead>
              <tr className="border-b border-line/15 text-left text-micro uppercase tracking-wide text-dim">
                <th className="pb-1.5 font-semibold">{t('admin.modelName')}</th>
                <th className="pb-1.5 font-semibold">max_tokens</th>
                <th className="pb-1.5 font-semibold">{t('admin.prices')}</th>
              </tr>
            </thead>
            <tbody>
              {s.modelle.map((m) => (
                <tr key={m.id} className="border-b border-line/[0.06] last:border-0">
                  <td className="py-2 pr-3">
                    <span className="font-semibold">{m.name}</span>
                    <span className="block font-mono text-micro text-dim">{m.id}</span>
                  </td>
                  <td className="py-2">{m.maxTokens.toLocaleString('de-AT')}</td>
                  <td className="py-2">{preiseVollstaendig(m) ? <Badge tone="ok">{t('admin.pricesOk')}</Badge> : <Badge tone="wait">{t('admin.pricesMissing')}</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="grid gap-stack sm:grid-cols-2">
            <Field label={t('admin.standard')}>
              <select className={selectCls} value={s.standardModell} onChange={(e) => updateDocCheckSettings({ standardModell: e.target.value })}>
                {s.modelle.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </Field>
            <Field label={t('admin.fallback')}>
              <select className={selectCls} value={s.ausweichModell} onChange={(e) => updateDocCheckSettings({ ausweichModell: e.target.value })}>
                {s.modelle.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </Field>
          </div>
          <Field label={t('admin.budget')}>
            <input
              className={inputCls}
              type="number"
              min={0}
              inputMode="decimal"
              defaultValue={s.monatsbudgetUsd ?? ''}
              placeholder={t('admin.budgetPh')}
              onBlur={(e) => updateDocCheckSettings({ monatsbudgetUsd: e.target.value === '' ? null : Math.max(0, Number(e.target.value)) })}
            />
          </Field>
          <Field label={t('admin.organisation')}>
            <input
              className={inputCls}
              defaultValue={s.organisation}
              maxLength={120}
              placeholder={t('admin.organisationPh')}
              onBlur={(e) => e.target.value.trim() !== s.organisation && updateDocCheckSettings({ organisation: e.target.value.trim() })}
            />
          </Field>
          <label className="flex items-start gap-2.5 text-small">
            <input type="checkbox" className="mt-0.5 h-5 w-5 accent-accent" checked={s.gateSperrt} onChange={(e) => updateDocCheckSettings({ gateSperrt: e.target.checked })} />
            <span>
              {t('admin.gateSperrt')}
              <span className="block text-micro text-dim">{t('admin.gateSperrtHint')}</span>
            </span>
          </label>
          <label className="flex items-start gap-2.5 text-small opacity-60">
            <input type="checkbox" className="mt-0.5 h-5 w-5 accent-accent" checked={s.echteKiInSandbox} disabled readOnly />
            <span>
              {t('admin.realAi')}
              <span className="block text-micro text-dim">{t('admin.realAiHint')}</span>
            </span>
          </label>
        </Card>
      </div>

      <Card className="space-y-stack p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardHeading>{t('admin.proxyTest')}</CardHeading>
          <Badge tone="accent">{t('status.simulated')}</Badge>
        </div>
        <p className="text-micro text-dim">{t('admin.proxyTestHint')}</p>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={test} disabled={laeuft}>
            <span className="flex items-center gap-1.5"><Radio size={16} /> {laeuft ? t('admin.proxyRunning') : t('admin.proxyStart')}</span>
          </Button>
          {laeuft && (
            <Button variant="ghost" onClick={() => abbruch.current?.abort()}>
              {t('admin.cancel')}
            </Button>
          )}
        </div>
        {(stand || fehler) && (
          <div className="space-y-tight rounded-xl border border-line/10 bg-bg/40 p-3">
            {stand && (
              <p className="font-mono text-small leading-relaxed" aria-live="polite">
                {stand.text}
                {laeuft && <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-accent align-middle" />}
              </p>
            )}
            {stand && !laeuft && (
              <p className="text-micro text-dim">
                {t('admin.usage', { model: s.standardModell, input: stand.verbrauch.input, output: stand.verbrauch.output, stop: stand.stopGrund || '—' })}
              </p>
            )}
            {fehler && <p className="text-small text-bad">{t('admin.error', { code: fehler })}</p>}
          </div>
        )}
      </Card>

      <Card className="space-y-stack p-4">
        <CardHeading>{t('admin.audit')}</CardHeading>
        {audit.length === 0 ? (
          <p className="text-small text-dim">{t('admin.auditEmpty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-small">
              <thead>
                <tr className="border-b border-line/15 text-left text-micro uppercase tracking-wide text-dim">
                  <th className="pb-1.5 font-semibold">{t('admin.auditWhen')}</th>
                  <th className="pb-1.5 font-semibold">{t('admin.auditWho')}</th>
                  <th className="pb-1.5 font-semibold">{t('admin.auditWhat')}</th>
                  <th className="pb-1.5 font-semibold">{t('admin.auditTarget')}</th>
                  <th className="pb-1.5 font-semibold">{t('admin.auditValue')}</th>
                </tr>
              </thead>
              <tbody>
                {audit.slice(0, 50).map((a) => (
                  <tr key={a.id} className="border-b border-line/[0.06] last:border-0">
                    <td className="py-1.5 pr-3 text-dim">{formatDateTime(a.at)}</td>
                    <td className="py-1.5 pr-3">{name(a.von)}</td>
                    <td className="py-1.5 pr-3">{t(`auditAction.${a.aktion}`)}</td>
                    <td className="py-1.5 pr-3">{a.aktion === 'zugang' || a.aktion === 'admin' || a.aktion === 'rolle' ? name(a.ziel) : a.ziel}</td>
                    <td className="py-1.5 font-mono text-micro">{a.wert}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="space-y-stack p-4">
        <CardHeading>{t('admin.risks')}</CardHeading>
        <ul className="list-disc space-y-tight pl-5 text-small text-dim">
          <li>{t('admin.risk1')}</li>
          <li>{t('admin.risk2')}</li>
          <li>{t('admin.risk3')}</li>
        </ul>
      </Card>

      {SANDBOX && (
        <Card className="space-y-stack p-4">
          <CardHeading>{t('admin.errorProbe')}</CardHeading>
          <p className="text-micro text-dim">{t('admin.errorProbeHint')}</p>
          <Button variant="danger" onClick={onFehlerProbe}>
            <span className="flex items-center gap-1.5"><Bug size={16} /> {t('admin.errorProbeBtn')}</span>
          </Button>
        </Card>
      )}
    </div>
  )
}
