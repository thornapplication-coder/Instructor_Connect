import { CheckCheck, ChevronDown, ChevronRight, Download, Eye, FileDown, FileSpreadsheet, RotateCcw, SearchCheck, Undo2 } from 'lucide-react'
import { Fragment, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge, Button, Card, CardHeading, Field, inputCls, selectCls } from '../../../components/ui'
import { toast } from '../../../components/Toast'
import { downloadCsv } from '../../../csv'
import { lokalIso } from '../../../datum'
import { useStore } from '../../../store'
import {
  auditEintraege,
  auftraege,
  bestaetigen,
  bestaetigenMit,
  ohneBegruendung,
  blattWaehlen,
  csvExport,
  dokNamen,
  listeLesen,
  paketStand,
  sammelKandidaten,
  zaehlen,
  zeilen,
  zielAendern,
  zieleAuffrischen,
  zuordnungAendern,
  zuruecknehmen,
  verlorenBei,
  kannZurueckschreiben,
  istVeraltet,
  spaltenWahl,
  rueckschreibAuftrag,
  neueBefunde,
  neuesBlatt,
  type Filter,
  type ReCheckSitzung,
  nachLauf,
} from '../recheck/ablauf'
import { werteLaden, werteSpeichern } from '../recheck/profil'
import { ausgabeName, listenWerte, rueckschreiben, werteVorschlagen, type WerteZuordnung } from '../recheck/rueckschreiben'
import { ROLLEN, type Rolle, type Ziel } from '../recheck/fremdliste'
import { LISTE_MAX_MB, listeGroessePruefen } from '../referenz/liste'
import { remark, STATUS_NAME, type Fundstelle, type ReStatus } from '../recheck/pruefen'
import { setzen, useSitzung } from '../sitzung'
import { aktiv } from '../settings'
import type { Befund } from '../pruefung/befund'
import { standardVerbindung } from '../verbindung'
import { useViewer } from './Viewer'
import { DateiName } from './Dokumente'

/**
 * Re-Check externer Findinglisten (Nachtrag N3) — regelbasierter Teil.
 * Vier Schritte untereinander: Liste, Spalten, Dokumente, Vorschläge.
 * Die KI-Prüfung inhaltlicher Befunde und das Rückschreiben in die
 * Originaldatei (N3.5) folgen; bis dahin ist der Export eine CSV.
 */

const TON: Record<ReStatus, 'ok' | 'wait' | 'bad' | 'dim'> = { resolved: 'ok', partial: 'wait', open: 'bad', unverifiable: 'dim', justify: 'wait' }
const STATI: ReStatus[] = ['resolved', 'partial', 'open', 'justify', 'unverifiable']
const spalteName = (i: number) => String.fromCharCode(65 + i)

const aendernRe = (f: (r: ReCheckSitzung) => ReCheckSitzung) => setzen((s) => (s.recheck ? { ...s, recheck: f(s.recheck) } : s))

function Schritt({ n, titel, children }: { n: number; titel: string; children: React.ReactNode }) {
  return (
    <Card className="space-y-stack p-4">
      <div className="flex items-center gap-2.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/15 text-small font-semibold text-accent">{n}</span>
        <CardHeading>{titel}</CardHeading>
      </div>
      {children}
    </Card>
  )
}

/** Bestätigen — eine Stelle für Desktop und mobil, damit beide dieselbe Audit-Zeile schreiben. */
function useBestaetigen() {
  const { t } = useTranslation('doccheck')
  const { currentUser, now, docCheckRecheckConfirm } = useStore()
  const { recheck: r } = useSitzung()
  return (alle: number[]) => {
    // Nur, was ohne Begründung bestätigt werden darf — und nur das ins Audit (DC-09)
    const zs = r ? ohneBegruendung(r, alle) : []
    if (!r?.ergebnisse || !zs.length) return
    aendernRe((x) => bestaetigen(x, zs, currentUser!.id, now()))
    docCheckRecheckConfirm(r.datei, auditEintraege(r, zs.map((z) => ({ zeile: z, status: r.ergebnisse!.find((e) => e.zeile === z)!.status }))))
    toast(t('recheck.bestaetigtToast', { count: zs.length }))
  }
}

/**
 * Freigabe einer Zeile (N11): Vorschlag übernehmen oder einen anderen
 * Status wählen. Bei Abweichung oder „Begründung erforderlich" ist die
 * Begründung Pflicht. Ins Audit gehen nur Nummer und Status — die
 * Begründung ist freier Text und steht im Export, nicht im Protokoll.
 */
function Freigabe({ r, zeile, vorschlag, schmal = false }: { r: ReCheckSitzung; zeile: number; vorschlag: ReStatus; schmal?: boolean }) {
  const { t } = useTranslation('doccheck')
  const { currentUser, now, docCheckRecheckConfirm } = useStore()
  const [status, setStatus] = useState<ReStatus>(vorschlag)
  const [text, setText] = useState('')
  const pflicht = status !== vorschlag || status === 'justify'
  const bestaetigen = () => {
    const neu = bestaetigenMit(r, zeile, currentUser!.id, now(), status, text)
    if (neu === 'begruendungFehlt') return toast(t('recheck.freigabe.begruendungFehlt'), 'wait')
    if (neu === 'unbekannt') return
    aendernRe((x) => {
      const n = bestaetigenMit(x, zeile, currentUser!.id, now(), status, text)
      return typeof n === 'string' ? x : n
    })
    docCheckRecheckConfirm(r.datei, auditEintraege(r, [{ zeile, status }]))
    toast(t('recheck.bestaetigtToast', { count: 1 }))
  }
  return (
    <div className={schmal ? 'flex flex-col gap-2' : 'flex flex-wrap items-end justify-end gap-2'}>
      <Field label={t('recheck.freigabe.status')}>
        <select className={selectCls} value={status} onChange={(e) => setStatus(e.target.value as ReStatus)} onClick={(e) => e.stopPropagation()}>
          {STATI.map((s) => (
            <option key={s} value={s}>{`${t(`recheck.status.${s}`)}${s === vorschlag ? ` (${t('recheck.freigabe.vorschlag')})` : ''}`}</option>
          ))}
        </select>
      </Field>
      {pflicht && (
        <Field label={t('recheck.freigabe.begruendung')}>
          <input className={schmal ? inputCls : `${inputCls} min-w-[18rem]`} value={text} onChange={(e) => setText(e.target.value)} onClick={(e) => e.stopPropagation()} placeholder={t('recheck.freigabe.begruendungPh')} />
        </Field>
      )}
      <Button className={schmal ? 'w-full' : undefined} onClick={bestaetigen} disabled={pflicht && text.trim().length < 5}>
        <span className="flex items-center justify-center gap-1.5"><CheckCheck size={15} /> {t('recheck.bestaetigen', { status: t(`recheck.status.${status}`) })}</span>
      </Button>
    </div>
  )
}

/**
 * Mobil (Nachtrag Kap. 18): Ergebnisse ansehen und Vorschläge bestätigen —
 * starten nur am Desktop. Gezeigt wird, was in dieser Sitzung geprüft wurde.
 */
export function ReCheckMobil() {
  const { t } = useTranslation('doccheck')
  const { state, now } = useStore()
  const { recheck: r } = useSitzung()
  const bestaetigenZeilen = useBestaetigen()
  const [nurOffen, setNurOffen] = useState(true)
  const [offen, setOffen] = useState<number | null>(null)
  const name = (id: string) => state.users.find((u) => u.id === id)?.name ?? id
  if (!r?.ergebnisse) {
    return (
      <Card className="space-y-stack p-4 text-center text-small text-dim">
        <p>{t('recheck.mobil.leer')}</p>
      </Card>
    )
  }
  const anzahl = zaehlen(r)
  const liste = zeilen(r, { status: 'alle', dok: 'alle', nurAbweichung: false }).filter(({ befund }) => !nurOffen || !r.bestaetigt[befund.zeile])
  const sammel = sammelKandidaten(r)
  return (
    <div className="space-y-stack">
      <Card className="space-y-stack p-4">
        <p className="break-words text-small font-semibold">
          <DateiName name={r.datei} />
        </p>
        <div className="flex flex-wrap gap-1.5">
          {STATI.map((s) => (
            <Badge key={s} tone={TON[s]}>{`${t(`recheck.status.${s}`)}: ${anzahl[s]}`}</Badge>
          ))}
        </div>
        <label className="flex min-h-11 items-center gap-2 text-small">
          <input type="checkbox" className="h-5 w-5 accent-accent" checked={nurOffen} onChange={(e) => setNurOffen(e.target.checked)} />
          {t('recheck.mobil.nurOffen')}
        </label>
        {sammel.length > 0 && (
          <Button variant="ghost" className="w-full" onClick={() => bestaetigenZeilen(sammel)}>
            <span className="flex items-center justify-center gap-1.5"><CheckCheck size={16} /> {t('recheck.sammel', { count: sammel.length })}</span>
          </Button>
        )}
      </Card>
      {liste.length === 0 && <p className="py-section text-center text-small text-dim">{t('recheck.mobil.alleBestaetigt')}</p>}
      {liste.map(({ befund: b, ergebnis: e }) => {
        const ok = r.bestaetigt[b.zeile]
        const auf = offen === b.zeile
        return (
          <Card key={b.zeile} className="space-y-tight p-4 text-small">
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 font-semibold">
                {b.ref} · {b.dokument || '—'}
              </p>
              <Badge tone={TON[e.status]}>{t(`recheck.status.${e.status}`)}</Badge>
            </div>
            <p className="break-words">{b.befund || b.empfehlung}</p>
            {/* Was bestätigt wird, muss sichtbar sein — wie am Desktop die geforderte Korrektur (DC-09) */}
            {b.befund && b.empfehlung && <p className="break-words text-micro text-dim">{b.empfehlung}</p>}
            <p className="text-micro text-dim">
              {t('recheck.col.team')}: {b.teamStatus || '—'}
              {e.abweichung && <span className="text-wait"> · {t('recheck.abweichung')}</span>}
            </p>
            <button className="flex min-h-11 items-center gap-1 text-micro text-accent" onClick={() => setOffen(auf ? null : b.zeile)} aria-expanded={auf}>
              {auf ? <ChevronDown size={14} /> : <ChevronRight size={14} />} {t('recheck.remark')}
            </button>
            {auf && <p className="whitespace-pre-wrap break-words rounded-xl border border-line/10 bg-surface/60 p-3 font-mono text-micro leading-relaxed">{remark(e, lokalIso(now()), r.sprache)}</p>}
            {ok ? (
              <p className="text-micro text-ok">{t('recheck.bestaetigtVon', { name: name(ok.von) })}</p>
            ) : e.status === 'justify' ? (
              // „Begründung erforderlich" nur mit Begründung — auch mobil (N11, DC-09)
              <Freigabe r={r} zeile={b.zeile} vorschlag={e.status} schmal />
            ) : (
              <Button className="w-full" onClick={() => bestaetigenZeilen([b.zeile])}>
                <span className="flex items-center justify-center gap-1.5"><CheckCheck size={15} /> {t('recheck.bestaetigen', { status: t(`recheck.status.${e.status}`) })}</span>
              </Button>
            )}
          </Card>
        )
      })}
      <p className="text-center text-micro text-dim">{t('recheck.mobil.startDesktop')}</p>
    </div>
  )
}

export function ReCheckTab() {
  const { t } = useTranslation('doccheck')
  const { state, now, docCheckSettings } = useStore()
  const sitzung = useSitzung()
  const { docs, recheck: r } = sitzung
  const oeffnen = useViewer()
  const eingabe = useRef<HTMLInputElement>(null)
  const [laeuft, setLaeuft] = useState(false)
  const [offen, setOffen] = useState<number | null>(null)
  const [filter, setFilter] = useState<Filter>({ status: 'alle', dok: 'alle', nurAbweichung: false })
  const ziele = dokNamen(docs)
  const stand = paketStand(docs)
  const name = (id: string) => state.users.find((u) => u.id === id)?.name ?? id
  // Kostet ein Wechsel Bestätigungen, wird vorher gefragt — still verworfen
  // war stundenlange Freigabearbeit (Audit 11/2026, DC-02).
  const verlustOk = (n: number) => !n || window.confirm(t('recheck.verlustFrage', { count: n }))

  // Neue Prüfdokumente: „Quelle fehlt" erneut zuordnen — vielleicht ist sie jetzt da.
  // Bestätigungen bleiben dabei; der Hinweis „veraltet" sagt, dass neu zu prüfen ist.
  useEffect(() => {
    aendernRe((x) => zieleAuffrischen(x, docs))
  }, [stand])

  const laden = async (f: File | undefined) => {
    if (!f) return
    try {
      // Größe vor dem Einlesen — eine präparierte Riesendatei soll gar nicht erst in den Speicher (SEC-01)
      listeGroessePruefen(f.size)
      const daten = new Uint8Array(await f.arrayBuffer())
      const blaetter = await listeLesen(f.name, daten)
      if (!blaetter.length) return toast(t('recheck.leer', { name: f.name }), 'wait')
      // Original nur bei XLSX behalten — dorthin wird zurückgeschrieben (N3.5).
      const re = blattWaehlen(f.name, blaetter, 0, docs, localStorage, /\.xlsx$/i.test(f.name) ? daten : undefined)
      if (!verlustOk(verlorenBei(r, re))) return
      setzen((s) => ({ ...s, recheck: re }))
      setOffen(null)
      if (re.ausProfil) toast(t('recheck.profilGeladen'))
    } catch (e) {
      // Zu groß — ob gepackt oder entpackt — ist keine Formatfrage (Audit 11/2026, DC-16)
      const code = e instanceof Error ? e.message : ''
      toast(code === 'DC-LISTE-GROSS' || code === 'DC-ZIP-GROSS' ? `${f.name}: ${t(`fehler.${code}`, { mb: LISTE_MAX_MB })}` : t('recheck.format', { name: f.name }), 'bad')
    }
  }

  const pruefen = async () => {
    if (!r) return
    setLaeuft(true)
    const stand0 = stand
    const erg = await standardVerbindung().nachpruefen(auftraege(r, localStorage))
    setLaeuft(false)
    if (!erg) return
    let aufgehoben = 0
    aendernRe((x) => {
      const n = nachLauf(x, erg, stand0)
      aufgehoben = n.aufgehoben
      return n.r
    })
    toast(aufgehoben ? `${t('recheck.fertig', { count: erg.length })} ${t('recheck.aufgehoben', { count: aufgehoben })}` : t('recheck.fertig', { count: erg.length }), aufgehoben ? 'wait' : 'ok')
  }

  const bestaetigenZeilen = useBestaetigen()

  // Mehrfachzuordnung als solche zeigen — vorher stand nur das erste Dokument
  // in der Auswahl, geprüft wurde aber gegen alle (Audit 11/2026, DC-05)
  const zielWert = (z: Ziel | undefined) => (!z || z.art === 'fehlt' ? 'fehlt' : z.art === 'paket' ? 'paket' : z.ids.length > 1 ? 'mehrere' : z.ids[0])
  const dokTitel = (id: string) => ziele.find((d) => d.id === id)?.titel ?? id
  const spalten = r ? spaltenWahl(r) : []
  const anzahl = r ? zaehlen(r) : null
  const liste = r ? zeilen(r, filter) : []
  const sammel = r ? sammelKandidaten(r) : []
  const veraltet = istVeraltet(r, stand)
  const dokWerte = r ? Object.keys(r.ziele) : []

  return (
    <div className="space-y-section">
      <p className="text-small leading-relaxed text-dim">{t('recheck.einleitung')}</p>

      <Schritt n={1} titel={t('recheck.schritt1')}>
        <button
          type="button"
          onClick={() => eingabe.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            void laden(e.dataTransfer.files[0])
          }}
          className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line/15 bg-bg/40 px-3 py-stack text-small text-dim transition hover:border-accent/50 hover:text-ink"
        >
          <FileSpreadsheet size={18} aria-hidden /> {r ? t('recheck.andereListe') : t('recheck.drop')}
        </button>
        <input ref={eingabe} type="file" accept=".xlsx,.csv,.txt" className="hidden" onChange={(e) => { void laden(e.target.files?.[0]); e.target.value = '' }} />
        {r && (
          <div className="flex flex-wrap items-end gap-stack">
            <p className="min-w-0 flex-1 break-words text-small font-medium">
              <DateiName name={r.datei} />
              <span className="block text-micro font-normal text-dim">{r.kopf >= 0 ? t('recheck.befunde', { count: r.befunde.length, zeile: r.kopf + 1 }) : t('recheck.befundeOhneKopf', { count: r.befunde.length })}</span>
            </p>
            {r.blaetter.length > 1 && (
              <Field label={t('recheck.blatt')}>
                <select
                  className={selectCls}
                  value={r.blatt}
                  onChange={(e) => {
                    const neu = blattWaehlen(r.datei, r.blaetter, Number(e.target.value), docs, localStorage, r.original)
                    if (verlustOk(verlorenBei(r, neu))) setzen((s) => ({ ...s, recheck: neu }))
                  }}
                >
                  {r.blaetter.map((b, i) => (
                    <option key={b.name} value={i}>{b.name}</option>
                  ))}
                </select>
              </Field>
            )}
            {r.ausProfil && <Badge tone="accent">{t('recheck.ausProfil')}</Badge>}
          </div>
        )}
      </Schritt>

      {r && (
        <Schritt n={2} titel={t('recheck.schritt2')}>
          {r.kopf >= 0 ? <p className="text-micro text-dim">{t('recheck.spaltenHinweis')}</p> : <p className="rounded-lg border border-wait/40 bg-wait/10 px-2.5 py-1.5 text-small text-ink">{t('recheck.ohneKopf')}</p>}
          <div className="grid gap-stack sm:grid-cols-2 xl:grid-cols-3">
            {ROLLEN.map((rolle: Rolle) => (
              <Field key={rolle} label={t(`recheck.rolle.${rolle}`)}>
                <select
                  className={selectCls}
                  value={r.zuordnung[rolle] ?? ''}
                  onChange={(e) => {
                    const spalte = e.target.value === '' ? null : Number(e.target.value)
                    if (verlustOk(verlorenBei(r, zuordnungAendern(r, rolle, spalte, docs)))) aendernRe((x) => zuordnungAendern(x, rolle, spalte, docs))
                  }}
                >
                  <option value="">{t('recheck.keineSpalte')}</option>
                  {spalten.map((k, i) => (
                    <option key={i} value={i}>{`${spalteName(i)} – ${!k.text ? '…' : k.beispiel ? t('recheck.spalteBeispiel', { wert: k.text.length > 40 ? `${k.text.slice(0, 40)}…` : k.text }) : k.text}`}</option>
                  ))}
                </select>
              </Field>
            ))}
          </div>
          {r.zuordnung.befund === undefined && <p className="text-small text-bad">{t('recheck.befundFehlt')}</p>}
        </Schritt>
      )}

      {r && dokWerte.length > 0 && (
        <Schritt n={3} titel={t('recheck.schritt3')}>
          <p className="text-micro text-dim">{t('recheck.dokHinweis')}</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] text-small">
              <thead>
                <tr className="border-b border-line/15 text-left text-micro uppercase tracking-wide text-dim">
                  <th className="pb-1.5 pr-3 font-semibold">{t('recheck.wertInListe')}</th>
                  <th className="pb-1.5 font-semibold">{t('recheck.pruefenGegen')}</th>
                </tr>
              </thead>
              <tbody>
                {dokWerte.map((w) => {
                  const z = r.ziele[w]
                  return (
                    <tr key={w} className="border-b border-line/[0.06] last:border-0">
                      <td className="py-2 pr-3 font-medium">{w || <span className="text-dim">{t('recheck.ohneWert')}</span>}</td>
                      <td className="py-2">
                        <select
                          // Je Zeile benannt — sonst hieß jede Auswahl nur „Prüfen gegen"
                          aria-label={`${t('recheck.pruefenGegen')}: ${w || t('recheck.ohneWert')}`}
                          className={`${selectCls} ${z?.art === 'fehlt' ? 'border-wait/60' : ''}`}
                          value={zielWert(z)}
                          onChange={(e) => {
                            const v = e.target.value
                            if (v === 'mehrere') return
                            aendernRe((x) => zielAendern(x, w, v === 'fehlt' ? { art: 'fehlt' } : v === 'paket' ? { art: 'paket' } : { art: 'dok', ids: [v] }))
                          }}
                        >
                          {z?.art === 'dok' && z.ids.length > 1 && <option value="mehrere">{t('recheck.mehrere', { namen: z.ids.map(dokTitel).join(', ') })}</option>}
                          {ziele.map((d) => (
                            <option key={d.id} value={d.id}>{d.titel}</option>
                          ))}
                          <option value="paket">{t('recheck.paketweit')}</option>
                          <option value="fehlt">{t('recheck.quelleFehlt')}</option>
                        </select>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-end justify-between gap-stack">
            <Field label={t('recheck.sprache')}>
              <select className={selectCls} value={r.sprache} onChange={(e) => aendernRe((x) => ({ ...x, sprache: e.target.value as 'de' | 'en' }))}>
                <option value="de">{t('recheck.spracheDe')}</option>
                <option value="en">{t('recheck.spracheEn')}</option>
              </select>
            </Field>
            <div className="flex flex-col items-end gap-tight">
              <Button onClick={pruefen} disabled={laeuft || !ziele.length || !r.befunde.length || r.zuordnung.befund === undefined}>
                <span className="flex items-center gap-1.5"><SearchCheck size={16} /> {laeuft ? t('recheck.laeuft') : r.ergebnisse ? t('recheck.erneut', { count: r.befunde.length }) : t('recheck.start', { count: r.befunde.length })}</span>
              </Button>
              {!ziele.length && <p className="text-micro text-wait">{t('recheck.keinPaket')}</p>}
            </div>
          </div>
        </Schritt>
      )}

      {r?.ergebnisse && anzahl && (
        <Schritt n={4} titel={t('recheck.schritt4')}>
          {veraltet && (
            <p className="flex items-center gap-2 rounded-xl border border-wait/40 bg-wait/10 px-3 py-2 text-small">
              <RotateCcw size={15} className="shrink-0 text-wait" aria-hidden /> {t('recheck.veraltet')}
            </p>
          )}
          <div className="flex flex-wrap gap-1.5">
            {STATI.map((s) => (
              <Badge key={s} tone={TON[s]}>{`${t(`recheck.status.${s}`)}: ${anzahl[s]}`}</Badge>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-stack">
            <Field label={t('recheck.filterStatus')}>
              <select className={selectCls} value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value as Filter['status'] })}>
                <option value="alle">{t('recheck.alle')}</option>
                {STATI.map((s) => (
                  <option key={s} value={s}>{t(`recheck.status.${s}`)}</option>
                ))}
              </select>
            </Field>
            <Field label={t('recheck.filterDok')}>
              <select className={selectCls} value={filter.dok} onChange={(e) => setFilter({ ...filter, dok: e.target.value })}>
                <option value="alle">{t('recheck.alle')}</option>
                {dokWerte.map((w) => (
                  <option key={w} value={w}>{w || t('recheck.ohneWert')}</option>
                ))}
              </select>
            </Field>
            <label className="flex min-h-11 cursor-pointer items-center gap-2 text-small">
              <input type="checkbox" className="h-5 w-5 accent-accent" checked={filter.nurAbweichung} onChange={(e) => setFilter({ ...filter, nurAbweichung: e.target.checked })} />
              {t('recheck.nurAbweichung')}
            </label>
            <div className="ml-auto flex flex-wrap gap-2">
              <Button variant="ghost" disabled={!sammel.length} onClick={() => bestaetigenZeilen(sammel)}>
                <span className="flex items-center gap-1.5"><CheckCheck size={16} /> {t('recheck.sammel', { count: sammel.length })}</span>
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  // Ortszeit: Mit toISOString() trugen Remark, Spaltenkopf und Dateiname
                  // bis 01:00 (Sommer 02:00) den Vortag (Audit 11/2026, EXM-01)
                  const datum = lokalIso(now())
                  downloadCsv(ausgabeName(r.datei, datum, 'csv'), csvExport(r, datum, name, docCheckSettings.csvTrenner))
                  toast(t('recheck.exportiert'))
                }}
              >
                <span className="flex items-center gap-1.5"><Download size={16} /> {t('recheck.csv')}</span>
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-line/10">
            <table className="w-full min-w-[52rem] text-small">
              <thead>
                <tr className="border-b border-line/15 bg-bg/40 text-left text-micro uppercase tracking-wide text-dim">
                  <th className="w-8 px-2 py-2" />
                  <th className="whitespace-nowrap px-2 py-2 font-semibold">{t('recheck.col.nr')}</th>
                  <th className="whitespace-nowrap px-2 py-2 font-semibold">{t('recheck.col.dok')}</th>
                  <th className="whitespace-nowrap px-2 py-2 font-semibold">{t('recheck.col.befund')}</th>
                  <th className="whitespace-nowrap px-2 py-2 font-semibold">{t('recheck.col.team')}</th>
                  <th className="whitespace-nowrap px-2 py-2 font-semibold">{t('recheck.col.vorschlag')}</th>
                  <th className="whitespace-nowrap px-2 py-2 font-semibold">{t('recheck.col.bestaetigt')}</th>
                </tr>
              </thead>
              <tbody>
                {liste.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-3 py-section text-center text-dim">{t('recheck.keineTreffer')}</td>
                  </tr>
                )}
                {liste.map(({ befund: b, ergebnis: e }) => {
                  const auf = offen === b.zeile
                  const ok = r.bestaetigt[b.zeile]
                  const fund: { f: Fundstelle; art: 'rest' | 'belegt' | 'aus'; label: string }[] = [
                    ...e.rest.map((f) => ({ f, art: 'rest' as const, label: t('recheck.rest') })),
                    ...e.belegt.map((f) => ({ f, art: 'belegt' as const, label: t('recheck.belegt') })),
                    // Nicht gezählt (N3.4) — sichtbar, damit niemand dem Ausschluss blind folgen muss
                    ...(e.ausgenommen ?? []).map((f) => ({ f, art: 'aus' as const, label: f.quelle ? t('recheck.aus.bibliothekVon', { quelle: f.quelle }) : t(`recheck.aus.${f.grund}`) })),
                  ]
                  return (
                    <Fragment key={b.zeile}>
                      <tr className="cursor-pointer border-b border-line/[0.06] align-top hover:bg-line/[0.03]" onClick={() => setOffen(auf ? null : b.zeile)}>
                        <td className="px-2 py-2.5 text-dim">
                          {/* Ein echter Knopf wie im Findings-Reiter: Freigabe, Begründung und „Seite anzeigen"
                              liegen im Aufklappbereich, und der ging nur per Maus auf (Audit 11/2026, DC-08) */}
                          <button
                            type="button"
                            className="-m-1 flex items-center rounded p-1"
                            aria-expanded={auf}
                            aria-controls={`rc-${b.zeile}`}
                            aria-label={t('recheck.aufklappen', { nr: b.ref })}
                            onClick={(ev) => {
                              ev.stopPropagation()
                              setOffen(auf ? null : b.zeile)
                            }}
                          >
                            {auf ? <ChevronDown size={15} aria-hidden /> : <ChevronRight size={15} aria-hidden />}
                          </button>
                        </td>
                        <td className="whitespace-nowrap px-2 py-2.5 font-semibold">{b.ref}</td>
                        <td className="whitespace-nowrap px-2 py-2.5">{b.dokument || '—'}</td>
                        <td className="max-w-[26rem] break-words px-2 py-2.5">
                          {b.befund || b.empfehlung}
                          {b.befund && b.empfehlung && <span className="block text-micro text-dim">{b.empfehlung}</span>}
                        </td>
                        <td className="whitespace-nowrap px-2 py-2.5">
                          {b.teamStatus || '—'}
                          {e.behauptungWiderlegt && <span className="block text-micro text-bad">{t('recheck.widerlegt')}</span>}
                        </td>
                        <td className="whitespace-nowrap px-2 py-2.5">
                          <Badge tone={TON[e.status]}>{t(`recheck.status.${e.status}`)}</Badge>
                          {e.abweichung && <span className="mt-1 block text-micro text-wait">{t('recheck.abweichung')}</span>}
                        </td>
                        <td className="whitespace-nowrap px-2 py-2.5 text-micro">
                          {ok ? (
                            <>
                              <span className="text-ok">{t('recheck.bestaetigtVon', { name: name(ok.von) })}</span>
                              {ok.status !== e.status && <span className="block text-wait">{t('recheck.freigabe.abweichendAls', { status: t(`recheck.status.${ok.status}`) })}</span>}
                            </>
                          ) : (
                            <span className="text-dim">—</span>
                          )}
                        </td>
                      </tr>
                      {auf && (
                        <tr id={`rc-${b.zeile}`} className="border-b border-line/[0.06] bg-bg/40">
                          <td colSpan={7} className="space-y-stack px-4 py-3">
                            <p className="text-micro text-dim">{t(`recheck.grund.${e.grund}`)}</p>
                            {fund.length > 0 && (
                              <ul className="space-y-tight">
                                {fund.map(({ f, art, label }, i) => (
                                  <li key={i} className="flex items-start gap-2 text-small">
                                    <Badge tone={art === 'rest' ? 'bad' : art === 'belegt' ? 'ok' : 'dim'}>{label}</Badge>
                                    <span className="w-44 shrink-0 text-micro text-dim">{[f.dok, f.kapitel, f.seite].filter(Boolean).join(' · ')}</span>
                                    <span className="min-w-0 flex-1 break-words font-mono text-micro leading-relaxed">{f.auszug}</span>
                                    <button
                                      className="flex shrink-0 items-center gap-1 text-micro text-accent hover:underline"
                                      onClick={(ev) => {
                                        ev.stopPropagation()
                                        oeffnen({ docId: f.dokId, seite: f.index, q: f.text })
                                      }}
                                    >
                                      <Eye size={13} /> {t('findings.seiteAnzeigen')}
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            )}
                            <div className="space-y-tight">
                              <p className="text-micro font-semibold uppercase tracking-wide text-dim">{t('recheck.remark')}</p>
                              <p className="whitespace-pre-wrap break-words rounded-xl border border-line/10 bg-surface/60 p-3 font-mono text-micro leading-relaxed">{remark(e, lokalIso(now()), r.sprache)}</p>
                            </div>
                            <div className="flex justify-end gap-2">
                              {ok ? (
                                <Button variant="ghost" onClick={() => aendernRe((x) => zuruecknehmen(x, b.zeile))}>
                                  <span className="flex items-center gap-1.5"><Undo2 size={15} /> {t('recheck.zuruecknehmen')}</span>
                                </Button>
                              ) : (
                                <Freigabe r={r} zeile={b.zeile} vorschlag={e.status} />
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="text-micro text-dim">{t('recheck.folgt')}</p>
        </Schritt>
      )}

      {r && kannZurueckschreiben(r) && <Rueckschreiben r={r} />}
    </div>
  )
}

const ZU_SCHREIBEN: ReStatus[] = ['resolved', 'partial', 'open', 'justify', 'unverifiable']

/**
 * Schritt 5: In die Originaldatei zurückschreiben (N3.5). Nur bestätigte
 * Vorschläge; Status aus der Werteliste der Fremdliste, Zuordnung im
 * Listenprofil gemerkt. Ausgabe als NEUE Datei — das Original bleibt.
 */
function Rueckschreiben({ r }: { r: ReCheckSitzung }) {
  const { t } = useTranslation('doccheck')
  const { now, docCheckSettings } = useStore()
  const kopf = r.blaetter[r.blatt].zeilen[r.kopf] ?? []
  // Neue Befunde (N3.1 Schritt 6): was DocCheck im Paket findet — Prüfdokumente
  // und, im Paketmodus, die Paketbefunde. Restfundstellen alter Befunde fallen heraus.
  const { docs, paketModus, paketErgebnis } = useSitzung()
  const eigene: Befund[] = [
    ...docs.filter((d) => d.rolle === 'review' && d.z?.pruefung).flatMap((d) => d.z!.pruefung!.befunde.map((b) => ({ ...b, dokName: d.felder.titel || d.name }))),
    ...(paketModus && aktiv(docCheckSettings, 'packageCheck') ? (paketErgebnis?.ergebnis.befunde ?? []) : []),
  ]
  const neu = neueBefunde(r, eigene, docs)
  const [mitNeuen, setMitNeuen] = useState(true)
  const [werteListe, setWerteListe] = useState<string[]>([])
  const [werte, setWerte] = useState<WerteZuordnung | null>(null)
  const [laeuft, setLaeuft] = useState(false)
  const sp = r.zuordnung.status
  const ersteZeile = r.befunde.find((b) => b.excelZeile)?.excelZeile ?? 1

  useEffect(() => {
    let aktiv = true
    const vorhandene = r.befunde.map((b) => b.teamStatus)
    void (sp === undefined ? Promise.resolve([] as string[]) : listenWerte(r.original!, r.blaetter[r.blatt].name, sp, ersteZeile, vorhandene)).then((liste) => {
      if (!aktiv) return
      setWerteListe(liste)
      setWerte(werteLaden(kopf, localStorage) ?? werteVorschlagen(liste))
    })
    return () => {
      aktiv = false
    }
  }, [r.original, r.blatt, sp])

  const anzahl = Object.keys(r.bestaetigt).length
  // Erst erneut prüfen: Remarks und Status kämen sonst aus einem Lauf gegen ein früheres Ziel (DC-02, `istVeraltet`)
  const veraltet = istVeraltet(r, paketStand(docs))
  const schreiben = async () => {
    if (!werte) return
    setLaeuft(true)
    try {
      const datum = lokalIso(now())
      const blatt = mitNeuen && neu.liste.length ? neuesBlatt(r, neu.liste, werte, datum) : undefined
      const { daten } = await rueckschreiben(r.original!, rueckschreibAuftrag(r, werte, datum, blatt))
      werteSpeichern(kopf, werte, localStorage)
      const url = URL.createObjectURL(new Blob([daten], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
      const a = document.createElement('a')
      a.href = url
      a.download = ausgabeName(r.datei, datum)
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      toast(t('recheck.rs.fertig', { name: a.download }))
    } catch {
      toast(t('recheck.rs.fehler'), 'bad')
    } finally {
      setLaeuft(false)
    }
  }

  return (
    <Schritt n={5} titel={t('recheck.rs.titel')}>
      <p className="text-micro leading-relaxed text-dim">{t('recheck.rs.hinweis')}</p>
      {sp === undefined ? (
        <p className="text-small text-wait">{t('recheck.rs.ohneStatus')}</p>
      ) : (
        <div className="grid gap-stack sm:grid-cols-2 xl:grid-cols-3">
          {ZU_SCHREIBEN.map((s) => (
            <Field key={s} label={t('recheck.rs.wert', { status: t(`recheck.status.${s}`) })}>
              <select
                className={selectCls}
                value={werte?.[s] ?? ''}
                onChange={(e) => werte && setWerte({ ...werte, [s]: e.target.value || null })}
              >
                <option value="">{t('recheck.rs.unveraendert')}</option>
                {werteListe.map((w) => (
                  <option key={w} value={w}>{w}</option>
                ))}
              </select>
            </Field>
          ))}
        </div>
      )}
      <label className="flex min-h-11 cursor-pointer items-start gap-2.5 rounded-xl border border-line/10 p-3 text-small">
        <input type="checkbox" className="mt-0.5 h-5 w-5 accent-accent" checked={mitNeuen && neu.liste.length > 0} disabled={!neu.liste.length} onChange={(e) => setMitNeuen(e.target.checked)} />
        <span>
          {t('recheck.rs.neu', { count: neu.liste.length, blatt: r.sprache === 'de' ? 'Neue Findings' : 'New findings' })}
          <span className="block text-micro text-dim">
            {neu.liste.length ? t('recheck.rs.neuNummern', { count: neu.liste.length, von: neu.liste[0].nr, bis: neu.liste.at(-1)!.nr }) : t('recheck.rs.neuKeine')}
            {neu.ausgenommen > 0 && ` ${t('recheck.rs.neuAusgenommen', { count: neu.ausgenommen })}`}
          </span>
        </span>
      </label>
      <div className="flex flex-wrap items-center justify-between gap-stack">
        <p className="text-small">
          {t('recheck.rs.zeilen', { count: anzahl })}
          {anzahl < r.befunde.length && <span className="block text-micro text-dim">{t('recheck.rs.nurBestaetigt')}</span>}
          {veraltet && <span className="block text-micro text-wait">{t('recheck.rs.veraltet')}</span>}
        </p>
        <Button onClick={schreiben} disabled={laeuft || veraltet || !werte || (!anzahl && !(mitNeuen && neu.liste.length))}>
          <span className="flex items-center gap-1.5"><FileDown size={16} /> {t('recheck.rs.start')}</span>
        </Button>
      </div>
    </Schritt>
  )
}
