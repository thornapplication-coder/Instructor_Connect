import { BookOpen, ChevronDown, Download, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { musterZurAuswahl } from '../aircraftScope'
import { Badge, Button, Card, CardGrid, CardHeading, Field, inputCls, Modal, Page, SectionHeading, selectCls, TopBar } from '../components/ui'
import { toast } from '../components/Toast'
import { downloadCsv } from '../csv'
import {
  darfLogbuchOeffnen,
  entfernteFormularEintraege,
  filtereEintraege,
  formatDauer,
  LEERES_LOGBUCH,
  LOGBOOK_KATEGORIEN,
  logbuchCsvZeilen,
  logbuchDateiName,
  logbuchSicht,
  logbuchVon,
  nachMonaten,
  parseDauerEingabe,
  summiere,
  zeilenAlsCsv,
  type LogbookEintrag,
  type LogbookFilter,
} from '../logbook'
import { useStore } from '../store'
import { formatDate, lokalerTag, monatsName } from '../datum'

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
   standen zwei winzige Pillen da, die erst beim Antippen aufgingen.
   Exportiert fuer die Admin-Auswertung — vorher stand die Klassenliste dort
   als Kopie, und beiden fehlte `placeholder:text-dim`: Der Platzhalter
   „Pilot" lag im Browser-Grau bei 2,05:1 (Audit 11/2026, UID-11/A11Y-10). */
export const filterCls =
  'min-h-11 rounded-xl border border-field bg-bg/60 px-3 py-2 text-small text-ink placeholder:text-dim outline-none transition focus:border-accent/60 focus:ring-2 focus:ring-accent/20'

/**
 * Eingabefeld fuer eine Dauer als HH:MM — dieselbe Schreibweise wie in den
 * Formularen, damit niemand raten muss, ob 90 Minuten oder 1:30 gemeint ist.
 *
 * Audit 11/2026, KERN-02: Am iPhone hat der Ziffernblock keinen Doppelpunkt,
 * und alles ausser „H:MM" wurde beim Verlassen still zu 00:00. Jetzt liest
 * `parseDauerEingabe` auch „130"; was mehrdeutig bleibt („90"), steht als
 * Meldung am Feld, der Text bleibt stehen, und nach oben geht nur ein
 * gueltiger Wert — `onGueltig` sperrt das Speichern. `pflicht`: 00:00 ist
 * keine Antwort (Dauer eines eigenen Eintrags, Session einer Korrektur).
 */
function DauerFeld({
  label,
  wert,
  onChange,
  onGueltig,
  pflicht = false,
}: {
  label: string
  wert: number
  onChange: (min: number) => void
  onGueltig: (ok: boolean) => void
  pflicht?: boolean
}) {
  const { t } = useTranslation()
  const [text, setText] = useState(formatDauer(wert))
  const [fehler, setFehler] = useState<'unlesbar' | 'leer' | null>(null)
  const meldungId = useId()
  const pruefe = (v: string) => {
    const min = parseDauerEingabe(v)
    return { min, fehler: min === null ? ('unlesbar' as const) : pflicht && min === 0 ? ('leer' as const) : null }
  }
  return (
    <div>
      <Field label={label}>
        <input
          className={inputCls}
          value={text}
          placeholder="00:00"
          inputMode="numeric"
          aria-invalid={fehler !== null || undefined}
          aria-describedby={meldungId}
          onChange={(e) => {
            setText(e.target.value)
            const p = pruefe(e.target.value)
            if (p.min !== null) onChange(p.min)
            onGueltig(p.fehler === null)
            // Die Meldung verschwindet, sobald die Eingabe stimmt — erscheinen
            // soll sie erst beim Verlassen, nicht bei jeder halben Eingabe.
            if (p.fehler === null) setFehler(null)
          }}
          onBlur={() => {
            const p = pruefe(text)
            setFehler(p.fehler)
            if (p.min !== null && p.fehler === null) setText(formatDauer(p.min))
          }}
        />
      </Field>
      {/* Die Meldung als eigenes Element mit role="alert" — eine Rolle, die
          erst nachtraeglich auf einen vorhandenen Absatz kommt, lesen nicht
          alle Sprachausgaben vor. */}
      {fehler ? (
        <p id={meldungId} role="alert" className="mt-1.5 text-micro leading-relaxed text-danger">
          {fehler === 'unlesbar' ? t('logbook.durationInvalid', { text: text.trim() }) : t('logbook.durationRequired')}
        </p>
      ) : (
        <p id={meldungId} className="mt-1.5 text-micro leading-relaxed text-dim">
          {t('logbook.durationHint')}
        </p>
      )}
    </div>
  )
}

function ManuellModal({ onClose, vorlage }: { onClose: () => void; vorlage?: LogbookEintrag }) {
  const { t } = useTranslation()
  const { state, currentUser, logbookAddManual, logbookUpdateManual } = useStore()
  // Heute in Ortszeit — die eine Regel aus datum.ts statt einer lokalen Kopie (EXM-01).
  const [datum, setDatum] = useState(vorlage?.datum ?? lokalerTag(Date.now() + state.timeOffsetMs))
  const [muster, setMuster] = useState(vorlage?.aircraftType ?? '')
  const [kategorie, setKategorie] = useState(vorlage?.kategorie ?? 'Other Training')
  const [frei, setFrei] = useState('')
  const [dauer, setDauer] = useState(vorlage?.session ?? 0)
  const [dauerOk, setDauerOk] = useState(true)
  const [notiz, setNotiz] = useState(vorlage?.notiz ?? '')
  const istFrei = !LOGBOOK_KATEGORIEN.includes(kategorie as (typeof LOGBOOK_KATEGORIEN)[number])
  const gewaehlt = istFrei && frei.trim() ? frei.trim() : kategorie
  const valid = datum && dauerOk && dauer > 0 && (!istFrei || frei.trim() || vorlage)

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
        <DauerFeld label={t('logbook.duration')} wert={dauer} onChange={setDauer} onGueltig={setDauerOk} pflicht />
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
  const [ungueltig, setUngueltig] = useState<Record<string, boolean>>({})
  const gueltig = (feld: string) => (ok: boolean) => setUngueltig((u) => ({ ...u, [feld]: !ok }))
  const sim = eintrag.kategorie === 'Simulator Training'
  /* Session > 0: Eine Korrektur auf 00:00 nahm die Session-Zeit still aus
     dem Taetigkeitsnachweis (KERN-02) — wer die Session nicht zaehlen will,
     entfernt den Eintrag; das laesst sich zuruecknehmen. */
  const valid = session > 0 && !Object.values(ungueltig).some(Boolean)

  return (
    <Modal title={t('logbook.editEntry')} onClose={onClose}>
      <div className="space-y-stack">
        <p className="rounded-xl border border-line/10 bg-surface/60 p-3.5 text-small leading-relaxed text-dim">{t('logbook.derivedHint')}</p>
        {sim && <DauerFeld label={t('logbook.briefing')} wert={briefing} onChange={setBriefing} onGueltig={gueltig('briefing')} />}
        <DauerFeld label={sim ? t('logbook.session') : t('logbook.duration')} wert={session} onChange={setSession} onGueltig={gueltig('session')} pflicht />
        {sim && <DauerFeld label={t('logbook.debriefing')} wert={debriefing} onChange={setDebriefing} onGueltig={gueltig('debriefing')} />}
        <Field label={t('logbook.note')}>
          <input className={inputCls} value={notiz} onChange={(e) => setNotiz(e.target.value)} />
        </Field>
        {/* flex-wrap: Drei Knöpfe passen im Dialog nicht in eine Zeile.
            Ohne Umbruch schrumpften sie, und `overflow-wrap: anywhere`
            (index.css) trennte mitten im Wort — „Abbreche/n",
            „Speicher/n". So rücken Abbrechen/Speichern in die nächste
            Zeile, rechtsbündig. */}
        <div className="flex flex-wrap justify-between gap-2">
          <Button variant="ghost" onClick={() => { logbookOverride(eintrag, null); toast(t('toast.logbookReset')); onClose() }}>
            {t('logbook.resetToForm')}
          </Button>
          <div className="ml-auto flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button
              disabled={!valid}
              onClick={() => {
                logbookOverride(eintrag, { briefing, session, debriefing, notiz: notiz.trim() || undefined })
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
  const { t, i18n } = useTranslation()
  const { state, currentUser, logbookOverride, logbookDeleteManual } = useStore()
  /* Zeitreise der Sandbox beachten: der Rest der App rechnet mit dem
     versetzten Jetzt, das Logbuch tat es nicht. */
  const jetzt = () => Date.now() + state.timeOffsetMs
  const [ownerId, setOwnerId] = useState(currentUser!.id)
  const [filter, setFilter] = useState<LogbookFilter>({})
  const [zeigeManuell, setZeigeManuell] = useState(false)
  const [bearbeite, setBearbeite] = useState<LogbookEintrag | null>(null)
  const [zeigeEntfernte, setZeigeEntfernte] = useState(false)

  /* Wessen Logbuecher darf diese Person oeffnen? Das eigene immer;
     Superadmin, Training Admin und Gruppenadmin auch fremde (der
     Gruppenadmin sieht darin nur seine Muster — src/logbook.ts). */
  const waehlbar = [...state.users]
    .filter((u) => darfLogbuchOeffnen(currentUser!, u.id))
    .sort((a, b) => (a.id === currentUser!.id ? -1 : b.id === currentUser!.id ? 1 : a.name.localeCompare(b.name)))
  const owner = state.users.find((u) => u.id === ownerId) ?? currentUser!
  const eigenes = ownerId === currentUser!.id

  const stand = (state.logbook ?? {})[ownerId] ?? LEERES_LOGBUCH
  /* Die Sicht sagt auch, WAS sie auslaesst (KERN-03): Ein Gruppenadmin sah
     beim fremden Logbuch „Noch keine Eintraege", wo nur seine Muster nichts
     enthielten. */
  const sicht = logbuchSicht(currentUser!, ownerId, logbuchVon(state.gradingRecords, ownerId, stand))
  const alle = sicht.eintraege
  const eintraege = filtereEintraege(alle, filter)
  /* Entfernte Formular-Eintraege nur im eigenen Logbuch — zuruecknehmen
     kann sie nur, wer sie entfernt hat (KERN-05). */
  const entfernte = eigenes ? entfernteFormularEintraege(state.gradingRecords, ownerId, stand) : []
  const s = summiere(eintraege)

  const musterListe = [...new Set(alle.map((e) => e.aircraftType).filter(Boolean))].sort()
  const kategorien = [...new Set(alle.map((e) => e.kategorie))].sort()
  const formTypen = [...new Set(alle.map((e) => e.formTypeId).filter(Boolean) as string[])].sort()

  const exportiere = () => {
    // Aufbau in src/logbook.ts (logbuchCsvZeilen) — dort getestet (KERN-14).
    // Name mit Stand-Datum und Umlauten (logbuchDateiName, EXM-10/FN-01);
    // derselbe Zeitpunkt wie im Dateikopf.
    const am = jetzt()
    const zeilen = logbuchCsvZeilen({ inhaber: owner.name, sicht, eintraege, filter, exportiertAm: am, exportiertVon: currentUser!.name })
    downloadCsv(logbuchDateiName(owner.name, am, 'csv'), zeilenAlsCsv(zeilen))
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

          {sicht.bereich && (
            <p role="note" className="rounded-xl border border-line/10 bg-surface/60 p-3.5 text-small leading-relaxed text-dim">
              {t('logbook.scopeHint', { muster: sicht.bereich.join(', ') || '—' })}
              {sicht.ausgeblendet > 0 && <> {t('logbook.scopeHidden', { count: sicht.ausgeblendet })}</>}
            </p>
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

          {/* Filter wie in der Formularablage: ab sm eine Zeile kompakter
              Felder. Am Telefon ein ruhiges Raster aus zwei gleich breiten
              Spalten — Von/Bis nebeneinander, Beschriftung ueber dem Feld.
              Vorher brach die Zeile zufaellig um: „Von" stand allein, die
              Datumsfelder begannen versetzt, die Auswahlfelder waren
              ungleich breit (Audit 11/2026, MOB-10). */}
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-end">
            <label className="flex min-w-0 flex-col gap-1 text-small text-dim">
              {t('logbook.from')}
              <input type="date" className={`${filterCls} w-full sm:w-36`} value={filter.von ?? ''} onChange={(e) => setFilter({ ...filter, von: e.target.value || undefined })} />
            </label>
            <label className="flex min-w-0 flex-col gap-1 text-small text-dim">
              {t('logbook.to')}
              <input type="date" className={`${filterCls} w-full sm:w-36`} value={filter.bis ?? ''} onChange={(e) => setFilter({ ...filter, bis: e.target.value || undefined })} />
            </label>
            <select value={filter.muster ?? ''} onChange={(e) => setFilter({ ...filter, muster: e.target.value || undefined })} aria-label={t('logbook.aircraft')} className={`${filterCls} w-full min-w-0 sm:w-auto`}>
              <option value="">{t('logbook.allAircraft')}</option>
              {musterListe.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <select value={filter.kategorie ?? ''} onChange={(e) => setFilter({ ...filter, kategorie: e.target.value || undefined })} aria-label={t('logbook.category')} className={`${filterCls} w-full min-w-0 sm:w-auto`}>
              <option value="">{t('logbook.allCategories')}</option>
              {kategorien.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
            <select value={filter.formTyp ?? ''} onChange={(e) => setFilter({ ...filter, formTyp: e.target.value || undefined })} aria-label={t('logbook.formType')} className={`${filterCls} w-full min-w-0 sm:w-auto`}>
              <option value="">{t('logbook.allForms')}</option>
              {formTypen.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
            <input
              className={`${filterCls} w-full min-w-0 sm:w-auto sm:min-w-36 sm:flex-1`}
              placeholder={t('logbook.pilot')}
              aria-label={t('logbook.pilot')}
              value={filter.pilot ?? ''}
              onChange={(e) => setFilter({ ...filter, pilot: e.target.value || undefined })}
            />
          </div>

          <p role="status" className="sr-only">
            {t('logbook.resultCount', { shown: eintraege.length, total: alle.length })}
          </p>

          {/* Monatsweise gegliedert, lueckenlos: Ein Monat ohne Eintrag steht
              als leere Gruppe da (src/logbook.ts, nachMonaten) — ein fehlender
              Monat saehe aus wie ein Uebertragungsfehler. */}
          {eintraege.length === 0 && (
            <Card className="p-6 text-center text-small text-dim">
              <BookOpen size={22} className="mx-auto mb-2" />
              {alle.length > 0
                ? t('logbook.noMatch')
                : sicht.ausgeblendet > 0
                  ? t('logbook.scopeEmpty', { name: owner.name, muster: sicht.bereich?.join(', ') || '—' })
                  : t('logbook.empty')}
            </Card>
          )}
          {nachMonaten(eintraege).map((g) =>
            g.art === 'luecke' ? (
              /* Mehrere leere Monate am Stueck: eine Zeile statt achtzig.
                 Die Aussage „hier war nichts" bleibt, das Scrollen entfaellt. */
              <p key={`l-${g.von}`} className="border-l-2 border-line/15 pl-3 text-small text-dim">
                {t('logbook.gapMonths', { von: monatsName(g.von, i18n.language), bis: monatsName(g.bis, i18n.language), count: g.monate })}
              </p>
            ) : (
            <section key={g.monat} className="space-y-stack">
              <SectionHeading
                right={
                  g.eintraege.length > 0 ? (
                    <span className="shrink-0 text-micro font-semibold normal-case tracking-normal text-dim">
                      {t('logbook.entries', { count: g.eintraege.length })} · {formatDauer(summiere(g.eintraege).gesamt)}
                    </span>
                  ) : undefined
                }
              >
                {monatsName(g.monat, i18n.language)}
              </SectionHeading>
              {g.eintraege.length === 0 ? (
                <p className="text-small text-dim">{t('logbook.emptyMonth')}</p>
              ) : (
                <CardGrid>
                  {g.eintraege.map((e) => (
                    <Card key={`${e.quelle}-${e.id}`} className="p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold tabular-nums">{formatDate(e.datum)}</span>
                        <Badge tone={e.kategorie === 'Simulator Training' ? 'accent' : 'dim'}>{e.kategorie}</Badge>
                        {e.aircraftType && <Badge tone="dim">{e.aircraftType}</Badge>}
                        {e.formTypeId && <Badge tone="dim">{e.formTypeId}</Badge>}
                        {e.quelle === 'manuell' && <Badge tone="wait">{t('logbook.manual')}</Badge>}
                        {/* Abweichung vom unterschriebenen Formular sichtbar
                            machen — die Formularnummer allein wirkte
                            formulargedeckt (KERN-04). */}
                        {e.korrigiert && <Badge tone="wait">{t('logbook.adjusted')}</Badge>}
                        {/* Keine Zeit im Formular: sagen, statt 00:00 als
                            gemessen auszugeben (GTY-03). */}
                        {e.zeitFehlt && <Badge tone="wait">{t('logbook.timeMissing')}</Badge>}
                        <span className="ml-auto text-lead font-bold tabular-nums">{formatDauer(e.gesamt)}</span>
                      </div>
                      <p className="mt-1 text-small text-dim">
                        {e.kategorie === 'Simulator Training'
                          ? t('logbook.parts', { briefing: formatDauer(e.briefing), session: e.zeitFehlt ? '—' : formatDauer(e.session), debriefing: formatDauer(e.debriefing) })
                          : null}
                        {e.zeitFehlt && <span className="block">{t('logbook.timeMissingHint')}</span>}
                        {e.korrigiert && <span className="block">{t('logbook.adjustedFrom', { zeit: formatDauer(e.korrigiert.gesamt) })}</span>}
                        {e.piloten.length > 0 && <span className="block">{e.piloten.join(', ')}</span>}
                        {e.notiz && <span className="block italic">{e.notiz}</span>}
                      </p>
                      {eigenes && (
                        <div className="mt-2 flex gap-2">
                          <button
                            onClick={() => setBearbeite(e)}
                            className="min-h-11 flex items-center gap-1 rounded-lg px-2 text-micro text-dim transition hover:bg-line/5 hover:text-ink"
                          >
                            <Pencil size={13} /> {e.zeitFehlt ? t('logbook.addTime') : t('common.edit')}
                          </button>
                          <button
                            onClick={() => {
                              /* Ein eigener Eintrag ist endgueltig weg; ein
                                 Formular-Eintrag laesst sich unten
                                 zuruecknehmen — der Dialog sagt, welcher Fall
                                 vorliegt (KERN-05). */
                              if (!window.confirm(t(e.quelle === 'manuell' ? 'logbook.deleteConfirm' : 'logbook.deleteConfirmForm'))) return
                              if (e.quelle === 'manuell') logbookDeleteManual(e.id)
                              else logbookOverride(e, { geloescht: true })
                              toast(t('toast.logbookDeleted'))
                            }}
                            className="min-h-11 flex items-center gap-1 rounded-lg px-2 text-micro text-danger transition hover:bg-danger/10"
                          >
                            <Trash2 size={13} /> {t('common.delete')}
                          </button>
                        </div>
                      )}
                    </Card>
                  ))}
                </CardGrid>
              )}
            </section>
            ),
          )}

          {entfernte.length > 0 && (
            <section className="space-y-stack">
              {/* Eingeklappt: Der Bereich ist ein Ausweg fuer Fehlgriffe,
                  nicht Teil des Nachweises. Der Knopf IN der Ueberschrift
                  (Akkordeon-Muster) — so bleibt sie eine Ueberschrift.
                  Der Fokusring liegt INNEN (`-outline-offset-2`, dazu px-1
                  Luft zum Text): SectionHeading kuerzt ihren Titel mit
                  `truncate`, also overflow hidden, und schnitt den
                  Ring mit 2 px Abstand nach aussen vollstaendig ab — per
                  Tastatur war nicht zu sehen, wo man stand (Gegenpruefung
                  P10). */}
              <SectionHeading>
                <button
                  onClick={() => setZeigeEntfernte(!zeigeEntfernte)}
                  aria-expanded={zeigeEntfernte}
                  aria-controls="logbuch-entfernte"
                  className="flex min-h-11 items-center gap-1.5 rounded-md px-1 text-left uppercase transition hover:text-accent focus-visible:-outline-offset-2"
                >
                  {t('logbook.removedTitle', { count: entfernte.length })}
                  <ChevronDown size={14} aria-hidden className={`shrink-0 transition ${zeigeEntfernte ? 'rotate-180' : ''}`} />
                </button>
              </SectionHeading>
              <div id="logbuch-entfernte" className={zeigeEntfernte ? 'space-y-stack' : 'hidden'}>
                <p className="text-small leading-relaxed text-dim">{t('logbook.removedHint')}</p>
                <CardGrid>
                  {entfernte.map((e) => (
                    <Card key={e.id} className="p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold tabular-nums">{formatDate(e.datum)}</span>
                        <Badge tone="dim">{e.kategorie}</Badge>
                        {e.aircraftType && <Badge tone="dim">{e.aircraftType}</Badge>}
                        {e.formTypeId && <Badge tone="dim">{e.formTypeId}</Badge>}
                        <span className="ml-auto text-lead font-bold tabular-nums">{formatDauer(e.gesamt)}</span>
                      </div>
                      {e.piloten.length > 0 && <p className="mt-1 text-small text-dim">{e.piloten.join(', ')}</p>}
                      <button
                        onClick={() => {
                          logbookOverride(e, null)
                          toast(t('toast.logbookRestored'))
                        }}
                        className="mt-2 flex min-h-11 items-center gap-1 rounded-lg px-2 text-micro text-dim transition hover:bg-line/5 hover:text-ink"
                      >
                        <RotateCcw size={13} /> {t('logbook.restore')}
                      </button>
                    </Card>
                  ))}
                </CardGrid>
              </div>
            </section>
          )}
        </div>
      </Page>
      {zeigeManuell && <ManuellModal onClose={() => setZeigeManuell(false)} />}
      {bearbeite && bearbeite.quelle === 'manuell' && <ManuellModal vorlage={bearbeite} onClose={() => setBearbeite(null)} />}
      {bearbeite && bearbeite.quelle === 'formular' && <KorrekturModal eintrag={bearbeite} onClose={() => setBearbeite(null)} />}
    </>
  )
}
