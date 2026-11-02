import { CheckCircle2, MessageSquareText } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatDate } from '../../../datum'
import { useStore } from '../../../store'
import { Badge, Button, Card, CardHeading, Field, inputCls } from '../../../components/ui'
import { toast } from '../../../components/Toast'
import { darf } from '../access'
import { erinnerungAb, faelligeErinnerungen, offeneEmpfehlungen, SANDBOX_DOKUMENTE, SANDBOX_EMPFEHLUNGEN, SANDBOX_SAMMLUNGEN, SANDBOX_STAENDE } from '../library'
import { aktiv, preiseVollstaendig } from '../settings'
import { Dropzone, Phase } from './Panels'
import { Suche } from './Suche'
import { useSitzung } from '../sitzung'
import { regelStand } from '../pruefung/befund'
import { PaketPanel, PaketUmschalter } from './Paket'

/* ------------------------------ Prüfung ------------------------------ */

/**
 * Was HEUTE schon prüft, steht zuoberst: Vorher öffnete DocCheck mit einem
 * KI-Formular, dessen Startknopf gesperrt ist — die regelbasierte Prüfung,
 * die beim Einlesen längst gelaufen war, fand man nur über „Findings"
 * (UX-Prüfung 01.11.2026).
 */
function RegelStand({ zuFindings }: { zuFindings: () => void }) {
  const { t } = useTranslation('doccheck')
  const docs = useSitzung().docs.filter((d) => d.rolle === 'review' && d.z?.pruefung)
  // „1 Prüfdokument geprüft: 0 Befunde" stand auch bei einem Scan ohne Textebene (Audit 11/2026, DC-03, DCF#5)
  const s = regelStand(docs.map((d) => d.z!))
  return (
    <div className="flex flex-wrap items-center justify-between gap-stack rounded-2xl border border-accent/30 bg-accent/5 p-4">
      <div className="min-w-0 text-small">
        <p className="flex items-center gap-1.5 font-semibold">
          <CheckCircle2 size={16} className="text-ok" aria-hidden /> {t('pruefung.regel.titel')}
        </p>
        {!docs.length && <p className="text-dim">{t('pruefung.regel.leer')}</p>}
        {s.geprueft > 0 && <p className="text-dim">{t('pruefung.regel.stand', { count: s.geprueft, befunde: s.befunde, hoch: s.hoch })}</p>}
        {s.ocr > 0 && <p className="text-ink">{t('pruefung.regel.nichtBewertbar.ocr', { count: s.ocr })}</p>}
        {s.ohneText > 0 && <p className="text-ink">{t('pruefung.regel.nichtBewertbar.ohneText', { count: s.ohneText })}</p>}
      </div>
      {docs.length > 0 && <Button onClick={zuFindings}>{t('pruefung.regel.zuFindings')}</Button>}
    </div>
  )
}

export function PruefungTab({ modell, zuFindings }: { modell: string; zuFindings: () => void }) {
  const { t } = useTranslation('doccheck')
  const { t: tApp } = useTranslation()
  const { currentUser, docCheckSettings } = useStore()
  const [arten, setArten] = useState({ technik: true, regulatorik: true, redaktion: true, konsistenz: true })
  const pruefDocs = useSitzung().docs.filter((d) => d.rolle === 'review' && d.status === 'fertig').length
  const [art, setArt] = useState<'erst' | 'revision'>('erst')
  const [funktion, setFunktion] = useState(() => tApp(`roles.${currentUser!.role}`))
  const m = docCheckSettings.modelle.find((x) => x.id === modell)
  const { paketModus } = useSitzung()
  return (
    <div className="space-y-section">
      <RegelStand zuFindings={zuFindings} />
      {aktiv(docCheckSettings, 'packageCheck') && (
        <>
          <Field label={t('paket.modus')} group>
            <PaketUmschalter />
          </Field>
          {paketModus && <PaketPanel />}
        </>
      )}
      <div className="flex items-center gap-2 border-t border-line/10 pt-section">
        <CardHeading>{t('pruefung.ki')}</CardHeading>
        <Phase n={4} />
      </div>
      <Field label={t('pruefung.arten')} group>
        <div className="grid gap-tight sm:grid-cols-2">
          {(['technik', 'regulatorik', 'redaktion', 'konsistenz'] as const).map((k) => {
            // Konsistenz braucht mindestens zwei Pruefdokumente (Spez. 6.2).
            const gesperrt = k === 'konsistenz' && pruefDocs < 2
            return (
              <label key={k} className={`flex min-h-11 items-center gap-2.5 rounded-xl border border-line/10 px-3 py-2 text-small ${gesperrt ? 'opacity-60' : 'cursor-pointer'}`}>
                <input
                  type="checkbox"
                  className="h-5 w-5 accent-accent"
                  checked={arten[k] && !gesperrt}
                  disabled={gesperrt}
                  onChange={(e) => setArten({ ...arten, [k]: e.target.checked })}
                />
                <span>
                  {t(`pruefung.${k}`)}
                  {gesperrt && <span className="block text-micro text-dim">{t('pruefung.konsistenzHint')}</span>}
                </span>
              </label>
            )
          })}
        </div>
      </Field>
      <Field label={t('pruefung.kontext')}>
        <textarea className={`${inputCls} min-h-[5.5rem]`} placeholder={t('pruefung.kontextPh')} />
      </Field>
      <div className="grid gap-stack 2xl:grid-cols-2">
        <Field label={t('pruefung.art')} group>
          <div className="flex gap-2">
            {(['erst', 'revision'] as const).map((k) => (
              <button
                key={k}
                onClick={() => setArt(k)}
                aria-pressed={art === k}
                className={`min-h-11 flex-1 rounded-xl border px-3 text-small transition ${art === k ? 'border-accent/60 bg-accent/15 font-semibold' : 'border-line/15 hover:bg-line/5'}`}
              >
                {t(`pruefung.${k}`)}
              </button>
            ))}
          </div>
        </Field>
        <Field label={t('pruefung.geprueftVon')} group>
          <div className="grid grid-cols-2 gap-2">
            <input className={inputCls} value={currentUser!.name} readOnly aria-label={t('pruefung.name')} />
            <input className={inputCls} value={funktion} onChange={(e) => setFunktion(e.target.value)} aria-label={t('pruefung.funktion')} />
          </div>
        </Field>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-stack rounded-2xl border border-line/10 bg-bg/40 p-4">
        <div className="text-small">
          <p className="font-semibold">{t('pruefung.kosten')}</p>
          <p className="text-dim">{m && preiseVollstaendig(m) ? t('pruefung.kostenBereit') : t('pruefung.kostenFehlt', { modell: m?.name ?? modell })}</p>
        </div>
        <div className="flex items-center gap-2">
          <Phase n={4} />
          <Button disabled>{t('pruefung.start')}</Button>
        </div>
      </div>
      {!aktiv(docCheckSettings, 'formalCheck') && <p className="text-micro text-dim">{t('pruefung.formalAus')}</p>}
    </div>
  )
}

/* -------------------------------- Chat ------------------------------- */

export function ChatTab() {
  const { t } = useTranslation('doccheck')
  const { docCheckSettings } = useStore()
  if (!aktiv(docCheckSettings, 'chat')) return <p className="py-major text-center text-small text-dim">{t('chat.off')}</p>
  return (
    <div className="space-y-section">
      <div className="space-y-stack">
        <CardHeading>{t('suche.titel')}</CardHeading>
        <Suche />
      </div>
      <div className="flex flex-col items-center justify-center gap-tight rounded-2xl border border-line/10 bg-bg/40 p-section text-center text-small text-dim">
        <MessageSquareText size={26} aria-hidden />
        <p className="max-w-md">{t('chat.hint')}</p>
        <Phase n={7} />
      </div>
    </div>
  )
}

/* ------------------------------ Revisionen --------------------------- */

export function RevisionenTab() {
  const { t } = useTranslation('doccheck')
  const empf = offeneEmpfehlungen(SANDBOX_EMPFEHLUNGEN)
  return (
    <div className="grid gap-stack xl:grid-cols-2">
      <Card className="space-y-stack p-4">
        <CardHeading>{t('rev.staende')}</CardHeading>
        <ol className="space-y-tight text-small">
          {[...SANDBOX_STAENDE].reverse().map((s) => (
            <li key={s.nummer} className="flex gap-3">
              <span className="w-12 shrink-0 font-semibold">Lib {s.nummer}</span>
              <span className="w-24 shrink-0 text-dim">{formatDate(s.at)}</span>
              <span>{s.notiz}</span>
            </li>
          ))}
        </ol>
      </Card>
      <Card className="space-y-stack p-4">
        <CardHeading>{t('rev.empfehlungen', { n: empf.length })}</CardHeading>
        {empf.length === 0 && <p className="text-small text-dim">{t('rev.keine')}</p>}
        {empf.map((e) => (
          <div key={e.id} className="space-y-tight rounded-xl border border-line/10 p-3 text-small">
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
          </div>
        ))}
        <p className="text-micro text-dim">{t('rev.dokumente')}</p>
      </Card>
    </div>
  )
}

/* -------------------------------- Export ----------------------------- */

/* -------------------------- Bibliothek verwalten --------------------- */

export function VerwaltenTab() {
  const { t } = useTranslation('doccheck')
  const { state, now, docCheckRolle, docCheckConfirmRevision } = useStore()
  const bestaetigt = state.docCheck?.bestaetigt ?? {}
  const faellig = new Set(faelligeErinnerungen(SANDBOX_DOKUMENTE, bestaetigt, now()).map((d) => d.id))
  const sammlungName = (id: string) => SANDBOX_SAMMLUNGEN.find((s) => s.id === id)?.name ?? id
  return (
    <div className="space-y-section">
      <div className="grid gap-stack md:grid-cols-2">
        <Dropzone text={t('verwalten.neu')} phase={3} />
        <Dropzone text={t('verwalten.revision')} phase={3} />
      </div>
      <div className="overflow-x-auto rounded-2xl border border-line/10">
        <table className="w-full min-w-[44rem] text-small">
          <thead>
            <tr className="border-b border-line/15 bg-bg/40 text-left text-micro uppercase tracking-wide text-dim">
              <th className="px-3 py-2 font-semibold">{t('verwalten.col.doc')}</th>
              <th className="px-3 py-2 font-semibold">{t('verwalten.col.collection')}</th>
              <th className="px-3 py-2 font-semibold">{t('verwalten.col.status')}</th>
              <th className="px-3 py-2 font-semibold">{t('verwalten.col.reminder')}</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {SANDBOX_DOKUMENTE.map((d) => (
              <tr key={d.id} className="border-b border-line/[0.06] last:border-0">
                <td className="px-3 py-2.5">
                  <span className="font-semibold">{d.typ}</span> {d.revision}
                  <span className="block text-micro text-dim">{d.nummer}</span>
                </td>
                <td className="px-3 py-2.5">{sammlungName(d.sammlung)}</td>
                <td className="px-3 py-2.5">
                  <Badge tone={d.status === 'aktiv' ? 'ok' : 'dim'}>{t(`verwalten.${d.status}`)}</Badge>
                </td>
                <td className="px-3 py-2.5">
                  {d.status === 'archiviert' ? (
                    <span className="text-dim">—</span>
                  ) : faellig.has(d.id) ? (
                    <Badge tone="wait">{t('verwalten.faellig', { datum: formatDate(erinnerungAb(d, bestaetigt[d.id])) })}</Badge>
                  ) : (
                    <span className="text-dim">{t('verwalten.naechste', { datum: formatDate(erinnerungAb(d, bestaetigt[d.id])) })}</span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-right">
                  {faellig.has(d.id) && darf(docCheckRolle, 'erinnerungBestaetigen') && (
                    <Button
                      variant="ghost"
                      className="!min-h-9 !py-1.5 text-small"
                      onClick={() => {
                        docCheckConfirmRevision(d.id)
                        toast(t('verwalten.bestaetigtToast', { doc: `${d.typ} ${d.revision}` }))
                      }}
                    >
                      <span className="flex items-center gap-1.5"><CheckCircle2 size={15} /> {t('verwalten.bestaetigen')}</span>
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
