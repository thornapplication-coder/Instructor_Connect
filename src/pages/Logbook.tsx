import { BookOpen, Download, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { musterZurAuswahl } from '../aircraftScope'
import { Badge, Button, Card, CardGrid, CardHeading, Field, inputCls, Modal, Page, SectionHeading, selectCls, TopBar } from '../components/ui'
import { toast } from '../components/Toast'
import { csvRow, downloadCsv } from '../csv'
import {
  darfLogbuchOeffnen,
  filtereEintraege,
  formatDauer,
  LEERES_LOGBUCH,
  LOGBOOK_KATEGORIEN,
  logbuchVon,
  parseDauer,
  sichtbareEintraege,
  summiere,
  type LogbookEintrag,
  type LogbookFilter,
} from '../logbook'
import { useStore } from '../store'

/**
 * my AAA Logbook — die eigene Instruktorentätigkeit, aus den Formularen
 * abgeleitet (src/logbook.ts), plus manuelle Einträge.
 *
 * Bearbeiten und Löschen gibt es NUR im eigenen Logbuch: Ein
 * Tätigkeitsnachweis, den ein anderer nachbessern kann, ist keiner. Fremde
 * Logbücher sind je nach Rolle sichtbar (Superadmin/Training Admin ganz,
 * Gruppenadmin in seinen Mustern), aber nie schreibbar.
 */

/* Filterleisten-Optik wie in der Formularablage: kompakte Felder, die sich
   nebeneinander legen — nicht die w-full-Felder der Formulare. Die
   Datumsfelder brauchen zusaetzlich eine feste Breite: WebKit gibt einem
   leeren <input type="date"> sonst fast keine Eigenbreite, und am iPad
   standen zwei winzige Pillen da, die erst beim Antippen aufgingen. */
const filterCls =
  'min-h-11 rounded-xl border border-field bg-bg/60 px-3 py-2 text-small text-ink outline-none transition focus:border-accent/60 focus:ring-2 focus:ring-accent/20'

/** Eingabefeld fuer eine Dauer als HH:MM — dieselbe Schreibweise wie in den
 *  Formularen, damit niemand raten muss, ob 90 Minuten oder 1:30 gemeint ist. */
function DauerFeld({ label, wert, onChange }: { label: string; wert: number; onChange: (min: number) => void }) {
  const [text, setText] = useState(formatDauer(wert))
  return (
    <Field label={label}>
      <input
        className={inputCls}
        value={text}
        placeholder="00:00"
        inputMode="numeric"
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          const min = parseDauer(text)
          setText(formatDauer(min))
          onChange(min)
        }}
      />
    </Field>
  )
}

function ManuellModal({ onClose, vorlage }: { onClose: () => void; vorlage?: LogbookEintrag }) {
  const { t } = useTranslation()
  const { state, currentUser, logbookAddManual, logbookUpdateManual } = useStore()
  const [datum, setDatum] = useState(vorlage?.datum ?? new Date().toISOString().slice(0, 10))
  const [muster, setMuster] = useState(vorlage?.aircraftType ?? '')
  const [kategorie, setKategorie] = useState(vorlage?.kategorie ?? 'Other Training')
  const [frei, setFrei] = useState('')
  const [dauer, setDauer] = useState(vorlage?.session ?? 0)
  const [notiz, setNotiz] = useState(vorlage?.notiz ?? '')
  const istFrei = !LOGBOOK_KATEGORIEN.includes(kategorie as (typeof LOGBOOK_KATEGORIEN)[number])
  const gewaehlt = istFrei && frei.trim() ? frei.trim() : kategorie
  const valid = datum && dauer > 0 && (!istFrei || frei.trim() || vorlage)

  return (
    <Modal title={vorlage ? t('logbook.editEntry') : t('logbook.addEntry')} onClose={onClose}>
      <div className="space-y-stack">
        <Field label={t('logbook.date')}>
          <input type="date" className={inputCls} value={datum} onChange={(e) => setDatum(e.target.value)} />
        </Field>
        <Field label={t('logbook.aircraft')}>
          <select value={muster} onChange={(e) => setMuster(e.target.value)} className={selectCls}>
            <option value="">{t('logbook.noAircraft')}</option>
            {musterZurAuswahl(currentUser, [...state.settings.aircraftTypes].sort((a, b) => a.localeCompare(b))).map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('logbook.category')}>
          <select
            value={istFrei ? '__frei' : kategorie}
            onChange={(e) => setKategorie(e.target.value === '__frei' ? '' : e.target.value)}
            className={selectCls}
          >
            {LOGBOOK_KATEGORIEN.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
            <option value="__frei">{t('logbook.freeCategory')}</option>
          </select>
        </Field>
        {istFrei && (
          <Field label={t('logbook.freeCategoryName')}>
            <input className={inputCls} value={frei || (vorlage && istFrei ? kategorie : '')} onChange={(e) => setFrei(e.target.value)} />
          </Field>
        )}
        <DauerFeld label={t('logbook.duration')} wert={dauer} onChange={setDauer} />
        <Field label={t('logbook.note')}>
          <input className={inputCls} value={notiz} onChange={(e) => setNotiz(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            disabled={!valid}
            onClick={() => {
              const eintrag = { datum, aircraftType: muster, kategorie: gewaehlt, dauer, notiz: notiz.trim() }
              if (vorlage) logbookUpdateManual(vorlage.id, eintrag)
              else logbookAddManual(eintrag)
              toast(t('toast.logbookSaved'))
              onClose()
            }}
          >
            {t('common.save')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

/** Korrektur eines ABGELEITETEN Eintrags: nur die Teilzeiten und die Notiz —
 *  Datum, Muster und Piloten kommen aus dem unterschriebenen Formular und
 *  bleiben dort. */
function KorrekturModal({ eintrag, onClose }: { eintrag: LogbookEintrag; onClose: () => void }) {
  const { t } = useTranslation()
  const { logbookOverride } = useStore()
  const [briefing, setBriefing] = useState(eintrag.briefing)
  const [session, setSession] = useState(eintrag.session)
  const [debriefing, setDebriefing] = useState(eintrag.debriefing)
  const [notiz, setNotiz] = useState(eintrag.notiz)
  const sim = eintrag.kategorie === 'Simulator Training'

  return (
    <Modal title={t('logbook.editEntry')} onClose={onClose}>
      <div className="space-y-stack">
        <p className="rounded-xl border border-line/10 bg-surface/60 p-3.5 text-small leading-relaxed text-dim">{t('logbook.derivedHint')}</p>
        {sim && <DauerFeld label={t('logbook.briefing')} wert={briefing} onChange={setBriefing} />}
        <DauerFeld label={sim ? t('logbook.session') : t('logbook.duration')} wert={session} onChange={setSession} />
        {sim && <DauerFeld label={t('logbook.debriefing')} wert={debriefing} onChange={setDebriefing} />}
        <Field label={t('logbook.note')}>
          <input className={inputCls} value={notiz} onChange={(e) => setNotiz(e.target.value)} />
        </Field>
        <div className="flex justify-between gap-2">
          <Button variant="ghost" onClick={() => { logbookOverride(eintrag.id, null); toast(t('toast.logbookReset')); onClose() }}>
            {t('logbook.resetToForm')}
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={() => {
                logbookOverride(eintrag.id, { briefing, session, debriefing, notiz: notiz.trim() || undefined })
                toast(t('toast.logbookSaved'))
                onClose()
              }}
            >
              {t('common.save')}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

export function Logbook() {
  const { t } = useTranslation()
  const { state, currentUser, logbookOverride, logbookDeleteManual } = useStore()
  const [ownerId, setOwnerId] = useState(currentUser!.id)
  const [filter, setFilter] = useState<LogbookFilter>({})
  const [zeigeManuell, setZeigeManuell] = useState(false)
  const [bearbeite, setBearbeite] = useState<LogbookEintrag | null>(null)

  /* Wessen Logbuecher darf diese Person oeffnen? Das eigene immer;
     Superadmin, Training Admin und Gruppenadmin auch fremde (der
     Gruppenadmin sieht darin nur seine Muster — src/logbook.ts). */
  const waehlbar = [...state.users]
    .filter((u) => darfLogbuchOeffnen(currentUser!, u.id))
    .sort((a, b) => (a.id === currentUser!.id ? -1 : b.id === currentUser!.id ? 1 : a.name.localeCompare(b.name)))
  const owner = state.users.find((u) => u.id === ownerId) ?? currentUser!
  const eigenes = ownerId === currentUser!.id

  const stand = (state.logbook ?? {})[ownerId] ?? LEERES_LOGBUCH
  const alle = sichtbareEintraege(currentUser!, ownerId, logbuchVon(state.gradingRecords, ownerId, stand))
  const eintraege = filtereEintraege(alle, filter)
  const s = summiere(eintraege)

  const musterListe = [...new Set(alle.map((e) => e.aircraftType).filter(Boolean))].sort()
  const kategorien = [...new Set(alle.map((e) => e.kategorie))].sort()
  const formTypen = [...new Set(alle.map((e) => e.formTypeId).filter(Boolean) as string[])].sort()

  const exportiere = () => {
    let csv = csvRow(['my AAA Logbook', owner.name])
    csv += csvRow(['Exported', new Date().toISOString().slice(0, 10)])
    csv += csvRow([])
    csv += csvRow(['Date', 'Category', 'Aircraft', 'Form', 'Pilots', 'Briefing', 'Session', 'Debriefing', 'Total', 'Note'])
    eintraege.forEach((e) => {
      csv += csvRow([e.datum, e.kategorie, e.aircraftType, e.formTypeId ?? 'manual', e.piloten.join('; '), formatDauer(e.briefing), formatDauer(e.session), formatDauer(e.debriefing), formatDauer(e.gesamt), e.notiz])
    })
    csv += csvRow([])
    csv += csvRow(['Total', formatDauer(s.gesamt)])
    downloadCsv(`aaa-logbook_${owner.name.replace(/[^\w-]+/g, '-')}.csv`, csv)
    toast(t('toast.downloaded'))
  }

  return (
    <>
      <TopBar
        title={t('logbook.title')}
        back="/"
        right={
          eigenes ? (
            /* Dieselbe Pille wie „New contact" im Verzeichnis — die Kopfzeile
               traegt ueberall denselben Aktionsknopf, nicht je Seite einen
               anderen. */
            <button
              onClick={() => setZeigeManuell(true)}
              className="min-h-11 flex items-center gap-1 rounded-full bg-accent px-3 py-1.5 text-small font-semibold text-bg hover:brightness-110"
            >
              <Plus size={15} /> {t('logbook.addEntry')}
            </button>
          ) : undefined
        }
      />
      <Page>
        <div className="space-y-section">
          {waehlbar.length > 1 && (
            <Field label={t('logbook.person')}>
              <select value={ownerId} onChange={(e) => { setOwnerId(e.target.value); setFilter({}) }} className={selectCls}>
                {waehlbar.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.id === currentUser!.id ? t('logbook.me', { name: u.name }) : u.name}
                  </option>
                ))}
              </select>
            </Field>
          )}

          {/* Summen zuerst: Die Frage an ein Logbuch ist „wie viel", nicht „was".
              Links die Gesamtzeit, rechts je Kategorie eine eigene Zeile —
              vorher standen alle Zahlen gleichrangig nebeneinander, und ab
              der zweiten Kategorie war nicht mehr zu sehen, was wozu gehoert. */}
          <Card className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardHeading>{t('logbook.summary')}</CardHeading>
              <button onClick={exportiere} className="flex min-h-11 items-center gap-1.5 text-small text-dim transition hover:text-accent">
                <Download size={15} /> {t('logbook.export')}
              </button>
            </div>
            <div className="mt-1 flex flex-col gap-4 sm:flex-row sm:items-center">
              <div className="shrink-0 sm:border-r sm:border-line/10 sm:pr-8">
                <p className="text-display font-bold leading-tight tabular-nums">{formatDauer(s.gesamt)}</p>
                <p className="text-small text-dim">{t('logbook.entries', { count: s.eintraege })}</p>
              </div>
              {Object.keys(s.jeKategorie).length > 0 && (
                <dl className="min-w-0 flex-1 space-y-tight sm:max-w-sm">
                  {Object.entries(s.jeKategorie)
                    .sort(([, a], [, b]) => b - a)
                    .map(([k, min]) => (
                      <div key={k} className="flex items-baseline justify-between gap-3 border-b border-line/[0.06] pb-1.5 last:border-0 last:pb-0">
                        <dt className="min-w-0 truncate text-small text-dim">{k}</dt>
                        <dd className="font-semibold tabular-nums">{formatDauer(min)}</dd>
                      </div>
                    ))}
                </dl>
              )}
            </div>
          </Card>

          {/* Filter wie in der Formularablage: eine Zeile kompakter Felder,
              die sich am Handy umbricht — keine seitenbreiten Auswahlfelder. */}
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex min-w-0 items-center gap-1.5 text-small text-dim">
              {t('logbook.from')}
              <input type="date" className={`${filterCls} w-36`} value={filter.von ?? ''} onChange={(e) => setFilter({ ...filter, von: e.target.value || undefined })} />
            </label>
            <label className="flex min-w-0 items-center gap-1.5 text-small text-dim">
              {t('logbook.to')}
              <input type="date" className={`${filterCls} w-36`} value={filter.bis ?? ''} onChange={(e) => setFilter({ ...filter, bis: e.target.value || undefined })} />
            </label>
            <select value={filter.muster ?? ''} onChange={(e) => setFilter({ ...filter, muster: e.target.value || undefined })} aria-label={t('logbook.aircraft')} className={filterCls}>
              <option value="">{t('logbook.allAircraft')}</option>
              {musterListe.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <select value={filter.kategorie ?? ''} onChange={(e) => setFilter({ ...filter, kategorie: e.target.value || undefined })} aria-label={t('logbook.category')} className={filterCls}>
              <option value="">{t('logbook.allCategories')}</option>
              {kategorien.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
            <select value={filter.formTyp ?? ''} onChange={(e) => setFilter({ ...filter, formTyp: e.target.value || undefined })} aria-label={t('logbook.formType')} className={filterCls}>
              <option value="">{t('logbook.allForms')}</option>
              {formTypen.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
            <input
              className={`${filterCls} min-w-36 flex-1`}
              placeholder={t('logbook.pilot')}
              aria-label={t('logbook.pilot')}
              value={filter.pilot ?? ''}
              onChange={(e) => setFilter({ ...filter, pilot: e.target.value || undefined })}
            />
          </div>

          <p role="status" className="sr-only">
            {t('logbook.resultCount', { shown: eintraege.length, total: alle.length })}
          </p>

          <div className="space-y-stack">
            <SectionHeading>{t('logbook.entries', { count: eintraege.length })}</SectionHeading>
            {eintraege.length === 0 && (
              <Card className="p-6 text-center text-small text-dim">
                <BookOpen size={22} className="mx-auto mb-2 opacity-60" />
                {alle.length === 0 ? t('logbook.empty') : t('logbook.noMatch')}
              </Card>
            )}
            <CardGrid>
              {eintraege.map((e) => (
              <Card key={`${e.quelle}-${e.id}`} className="p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold tabular-nums">{e.datum}</span>
                  <Badge tone={e.kategorie === 'Simulator Training' ? 'accent' : 'dim'}>{e.kategorie}</Badge>
                  {e.aircraftType && <Badge tone="dim">{e.aircraftType}</Badge>}
                  {e.formTypeId && <Badge tone="dim">{e.formTypeId}</Badge>}
                  {e.quelle === 'manuell' && <Badge tone="wait">{t('logbook.manual')}</Badge>}
                  <span className="ml-auto text-lead font-bold tabular-nums">{formatDauer(e.gesamt)}</span>
                </div>
                <p className="mt-1 text-small text-dim">
                  {e.kategorie === 'Simulator Training'
                    ? t('logbook.parts', { briefing: formatDauer(e.briefing), session: formatDauer(e.session), debriefing: formatDauer(e.debriefing) })
                    : null}
                  {e.piloten.length > 0 && <span className="block">{e.piloten.join(', ')}</span>}
                  {e.notiz && <span className="block italic">{e.notiz}</span>}
                </p>
                {eigenes && (
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={() => setBearbeite(e)}
                      className="min-h-11 flex items-center gap-1 rounded-lg px-2 text-micro text-dim transition hover:bg-line/5 hover:text-ink"
                    >
                      <Pencil size={13} /> {t('common.edit')}
                    </button>
                    <button
                      onClick={() => {
                        if (!window.confirm(t('logbook.deleteConfirm'))) return
                        if (e.quelle === 'manuell') logbookDeleteManual(e.id)
                        else logbookOverride(e.id, { geloescht: true })
                        toast(t('toast.logbookDeleted'))
                      }}
                      className="min-h-11 flex items-center gap-1 rounded-lg px-2 text-micro text-danger/80 transition hover:bg-danger/10 hover:text-danger"
                    >
                      <Trash2 size={13} /> {t('common.delete')}
                    </button>
                  </div>
                )}
                </Card>
              ))}
            </CardGrid>
          </div>
        </div>
      </Page>
      {zeigeManuell && <ManuellModal onClose={() => setZeigeManuell(false)} />}
      {bearbeite && bearbeite.quelle === 'manuell' && <ManuellModal vorlage={bearbeite} onClose={() => setBearbeite(null)} />}
      {bearbeite && bearbeite.quelle === 'formular' && <KorrekturModal eintrag={bearbeite} onClose={() => setBearbeite(null)} />}
    </>
  )
}
