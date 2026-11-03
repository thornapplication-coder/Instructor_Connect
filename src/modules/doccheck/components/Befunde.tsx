import { ChevronDown, ChevronRight, Eye, ScanText, ShieldAlert, ShieldCheck } from 'lucide-react'
import { Fragment, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge, Card, CardHeading, selectCls } from '../../../components/ui'
import { TrafficIcon } from '../../../pages/Grading'
import { useStore } from '../../../store'
import { gate, lesestand, type Ampel, type Befund, type Prioritaet } from '../pruefung/befund'
import { FORMAL_PUNKTE } from '../pruefung/formal'
import { SPRACH_PUNKTE } from '../pruefung/sprachCheck'
import { WORD_PUNKTE } from '../pruefung/wordCheck'
import { REFERENZ_PUNKTE } from '../pruefung/referenzCheck'
import { PAKET_PUNKTE } from '../paket/pruefen'
import { RECHEN_PUNKTE, seitenAnfang } from '../pruefung/rechnen'
import { VERWEIS_PUNKTE } from '../pruefung/verweise'
import { REGELWERK_PUNKTE } from '../pruefung/regelwerk'
import { leerGrund, useSitzung } from '../sitzung'
import { aktiv } from '../settings'
import { befundTabelle } from '../export/ausSitzung'
import { useViewer } from './Viewer'

/**
 * Findings (Spez. 6.3) — in diesem Stand die Befunde der regelbasierten
 * Prüfungen (Formalprüfung, Word-Check, Sprache/Platzhalter). Die KI-Befunde
 * kommen mit der Prüf-Engine dazu und landen in derselben Tabelle.
 */

const PRIO_FARBE: Record<Prioritaet, string> = { High: 'text-prioHigh', Medium: 'text-prioMed', Low: 'text-prioLow' }
const PRIO_PUNKT: Record<Prioritaet, string> = { High: 'bg-prioHigh', Medium: 'bg-prioMed', Low: 'bg-prioLow' }
const AMPEL: Record<Exclude<Ampel, 'na'>, 'green' | 'yellow' | 'red'> = { ok: 'green', wait: 'yellow', bad: 'red' }

type Gruppe = { titel: string; punkte: readonly string[]; ampel: Record<string, Ampel> }

function Chip({ p, a }: { p: string; a: Ampel }) {
  const { t } = useTranslation('doccheck')
  // „nicht anwendbar" in text-dim OHNE zusätzliche Deckkraft: opacity-60
  // drückte den Kontrast unter 4,5:1 (Barrierefreiheitsprüfung 01.11.2026)
  return (
    <span className={`flex items-center gap-1 rounded-full border border-line/15 px-2 py-0.5 text-micro ${a === 'na' ? 'text-dim' : ''}`} title={a === 'na' ? t('gate.na') : undefined}>
      {a === 'na' ? <span className="h-3 w-3 rounded-full border border-dashed border-dim" aria-hidden /> : <TrafficIcon color={AMPEL[a]} size={13} stumm />}
      {t(`punkt.${p}`)}
      <span className="sr-only">: {t(`gate.ampel.${a}`)}</span>
    </span>
  )
}

/**
 * Ampel je Dokument, kompakt: Vorher standen sieben Zeilen mit allen
 * Prüfpunkten je Dokument über der Tabelle und schoben die Befunde bei
 * einem Paket tausende Pixel nach unten (UX-Prüfung 01.11.2026). Jetzt
 * stehen nur die auffälligen Punkte da, der Rest als Zählung; „Alle
 * Prüfpunkte" klappt die volle Ansicht auf.
 */
function Ampelblock({ gruppen }: { gruppen: Gruppe[] }) {
  const { t } = useTranslation('doccheck')
  const [alle, setAlle] = useState(false)
  const da = gruppen.filter((g) => Object.keys(g.ampel).length)
  const punkte = da.flatMap((g) => g.punkte.map((p) => ({ g, p, a: g.ampel[p] ?? 'na' })))
  const auffaellig = punkte.filter((x) => x.a === 'bad' || x.a === 'wait')
  const zahl = (a: Ampel) => punkte.filter((x) => x.a === a).length
  return (
    <div className="space-y-tight">
      {auffaellig.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {auffaellig.map((x) => (
            <Chip key={`${x.g.titel}:${x.p}`} p={x.p} a={x.a} />
          ))}
        </div>
      )}
      <button onClick={() => setAlle(!alle)} aria-expanded={alle} className="flex items-center gap-1 text-micro text-dim hover:text-ink">
        {alle ? <ChevronDown size={13} aria-hidden /> : <ChevronRight size={13} aria-hidden />}
        {t('gate.zusammenfassung', { ok: zahl('ok'), na: zahl('na') })}
      </button>
      {alle &&
        da.map((g) => (
          <div key={g.titel} className="space-y-tight">
            <p className="text-micro font-semibold uppercase tracking-wide text-dim">{g.titel}</p>
            <div className="flex flex-wrap gap-1.5">
              {g.punkte.map((p) => (
                <Chip key={p} p={p} a={g.ampel[p] ?? 'na'} />
              ))}
            </div>
          </div>
        ))}
    </div>
  )
}

export function FindingsTab() {
  const { t } = useTranslation('doccheck')
  const { docs, paketModus, paketErgebnis } = useSitzung()
  // Paketbefunde (N1, N2) nur im Paketmodus — sonst gehören sie zu keiner Prüfung.
  const { docCheckSettings } = useStore()
  const paket = paketModus && aktiv(docCheckSettings, 'packageCheck') ? paketErgebnis?.ergebnis : undefined
  const oeffnen = useViewer()
  const geprueft = docs.filter((d) => d.rolle === 'review' && d.z?.pruefung)
  // Dieselben Befunde mit denselben IDs wie im Export („TM-003" statt „F-01" je
  // Dokument) — sonst fand niemand den Befund aus dem Bericht am Bildschirm
  // wieder (Audit 11/2026, DC-10/UID-07/TXT-03)
  const zeilen = useMemo(() => befundTabelle({ docs, paketModus, paketBefunde: paket?.befunde ?? [] }), [docs, paketModus, paket])
  const alle = useMemo(() => zeilen.map((z) => z.befund), [zeilen])
  const [dok, setDok] = useState('')
  const [prio, setPrio] = useState('')
  const [quelle, setQuelle] = useState('')
  const [offen, setOffen] = useState<string | null>(null)
  const liste = zeilen.filter(({ befund: b }) => (!dok || b.dokId === dok) && (!prio || b.prioritaet === prio) && (!quelle || b.quelle === quelle))
  // Ein Scan ohne Texterkennung ist nicht bewertbar, nicht einreichungsfähig (Audit 11/2026, DC-03)
  const gelesen = lesestand(geprueft.map((d) => d.z!))
  const g = gate(alle, docCheckSettings.gateSperrt, gelesen)
  const schluessel = (b: Befund) => `${b.dokId}:${b.id}`

  return (
    <div className="space-y-section">
      {/* Submission gate (Nachtrag N4.3) — ab Werk Warnung, keine Sperre */}
      {geprueft.length > 0 && (
        <Card className="space-y-stack p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardHeading>{t('gate.titel')}</CardHeading>
            <div className="flex flex-wrap gap-1.5">
              {g.hoch > 0 && (
                <Badge tone="bad">
                  <span className="flex items-center gap-1"><ShieldAlert size={13} /> {t('gate.nichtOk', { count: g.hoch })}</span>
                </Badge>
              )}
              {/* Schlüssel ausgeschrieben, nicht zusammengesetzt — so sieht sie die Textwache (i18n.test.ts) */}
              {g.grund && (
                <Badge tone="wait">
                  <span className="flex items-center gap-1"><ScanText size={13} /> {g.grund === 'ocr' ? t('gate.nichtBewertbar.ocr') : t('gate.nichtBewertbar.ohneText')}</span>
                </Badge>
              )}
              {g.einreichungsfaehig && (
                <Badge tone="ok">
                  <span className="flex items-center gap-1"><ShieldCheck size={13} /> {t('gate.ok')}</span>
                </Badge>
              )}
            </div>
          </div>
          {g.grund && <p className="rounded-xl bg-wait/10 p-3 text-small">{g.grund === 'ocr' ? t('gate.hinweis.ocr', { count: gelesen.ocrSeiten }) : t('gate.hinweis.ohneText', { count: gelesen.ohneText })}</p>}
          {g.hoch > 0 && <p className="rounded-xl bg-bad/10 p-3 text-small">{g.gesperrt ? t('gate.gesperrt') : t('gate.warnung')}</p>}
          {geprueft.map((d) => (
            <div key={d.id} className="space-y-tight border-t border-line/10 pt-3 first:border-0 first:pt-0">
              <p className="text-small font-semibold">
                {d.felder.titel || d.name} <span className="font-normal text-dim">· {d.felder.revision || '—'}</span>
              </p>
              <Ampelblock
                gruppen={[
                  { titel: t('gate.formal'), punkte: FORMAL_PUNKTE, ampel: d.z!.pruefung!.ampel.formal },
                  { titel: t('gate.word'), punkte: WORD_PUNKTE, ampel: d.z!.pruefung!.ampel.word },
                  { titel: t('gate.sprache'), punkte: SPRACH_PUNKTE, ampel: d.z!.pruefung!.ampel.sprache },
                  { titel: t('gate.referenz'), punkte: REFERENZ_PUNKTE, ampel: d.z!.pruefung!.ampel.referenz ?? {} },
                  { titel: t('gate.rechnen'), punkte: RECHEN_PUNKTE, ampel: d.z!.pruefung!.ampel.rechnen ?? {} },
                  { titel: t('gate.verweis'), punkte: VERWEIS_PUNKTE, ampel: d.z!.pruefung!.ampel.verweis ?? {} },
                  { titel: t('gate.regelwerk'), punkte: REGELWERK_PUNKTE, ampel: d.z!.pruefung!.ampel.regelwerk ?? {} },
                ]}
              />
              {d.z!.pruefung!.regelwerk && d.z!.pruefung!.regelwerk.quellen.length > 0 && (
                <p className="text-micro text-dim">{t('gate.regelwerkStand', { ...d.z!.pruefung!.regelwerk, count: d.z!.pruefung!.regelwerk.verweise, quellen: d.z!.pruefung!.regelwerk.quellen.join(', ') })}</p>
              )}
            </div>
          ))}
          {paket && (
            <div className="space-y-tight border-t border-line/10 pt-3">
              <p className="text-small font-semibold">{t('gate.paket')}</p>
              <Ampelblock gruppen={[{ titel: t('gate.paketPunkte'), punkte: PAKET_PUNKTE, ampel: paket.ampel }]} />
            </div>
          )}
        </Card>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <select aria-label={t('findings.filter.dok')} className={`${selectCls} !w-auto !py-1.5`} value={dok} onChange={(e) => setDok(e.target.value)}>
          <option value="">{t('findings.filter.alleDok')}</option>
          {geprueft.map((d) => (
            <option key={d.id} value={d.id}>{d.felder.titel || d.name}</option>
          ))}
        </select>
        <select aria-label={t('findings.filter.prio')} className={`${selectCls} !w-auto !py-1.5`} value={prio} onChange={(e) => setPrio(e.target.value)}>
          <option value="">{t('findings.filter.allePrio')}</option>
          {(['High', 'Medium', 'Low'] as const).map((p) => (
            <option key={p} value={p}>{t(`prio.${p}`)}</option>
          ))}
        </select>
        <select aria-label={t('findings.filter.quelle')} className={`${selectCls} !w-auto !py-1.5`} value={quelle} onChange={(e) => setQuelle(e.target.value)}>
          <option value="">{t('findings.filter.alleQuellen')}</option>
          {(['formal', 'word', 'sprache', 'referenz', 'rechnen', 'verweis', 'regelwerk', ...(paket ? (['paket'] as const) : [])] as const).map((q) => (
            <option key={q} value={q}>{t(`quelle.${q}`)}</option>
          ))}
        </select>
        <span className="ml-auto text-micro text-dim">{t('findings.anzahl', { count: liste.length })}</span>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-line/10">
        <table className="w-full min-w-[46rem] text-small">
          <thead>
            <tr className="border-b border-line/15 bg-bg/40 text-left text-micro uppercase tracking-wide text-dim">
              {/* Keine Status-Spalte: Ohne Bearbeitungsablauf stand dort immer „Open" — eine Attrappe (UX-Prüfung 01.11.2026) */}
              {(['id', 'doc', 'page', 'category', 'priority', 'finding', 'verification'] as const).map((s) => (
                <th key={s} className="whitespace-nowrap px-2 py-2 font-semibold break-normal">{t(`findings.col.${s}`)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {liste.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-major text-center text-dim">{geprueft.length ? t('findings.keineTreffer') : leerGrund(docs) === 'abgeschaltet' ? t('findings.abgeschaltet') : t('findings.empty')}</td>
              </tr>
            )}
            {liste.map(({ befund: b, id }) => {
              const auf = offen === schluessel(b)
              return (
                <Fragment key={schluessel(b)}>
                  <tr className="cursor-pointer border-b border-line/[0.06] align-top hover:bg-line/5" onClick={() => setOffen(auf ? null : schluessel(b))}>
                    <td className="whitespace-nowrap px-2 py-2 font-mono text-micro">
                      {/* Ein echter Knopf: Die Zeile allein war nur mit der Maus aufklappbar, Fundstellen
                          und Viewer ohne Maus unerreichbar (Barrierefreiheitsprüfung 01.11.2026) */}
                      <button
                        className="-m-1 flex items-center gap-1 rounded p-1"
                        aria-expanded={auf}
                        aria-controls={`fs-${schluessel(b)}`}
                        aria-label={t('findings.aufklappen', { id })}
                        onClick={(e) => {
                          e.stopPropagation()
                          setOffen(auf ? null : schluessel(b))
                        }}
                      >
                        {auf ? <ChevronDown size={13} aria-hidden /> : <ChevronRight size={13} aria-hidden />}
                        {id}
                      </button>
                    </td>
                    <td className="px-2 py-2">{b.dokName}</td>
                    <td className="whitespace-nowrap px-2 py-2 text-dim">{b.fundstellen.find((f) => f.seite)?.seite ?? '—'}</td>
                    <td className="px-2 py-2 break-normal">{t(`kategorie.${b.kategorie}`)}</td>
                    <td className={`whitespace-nowrap px-2 py-2 font-semibold ${PRIO_FARBE[b.prioritaet]}`}>
                      <span className="flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${PRIO_PUNKT[b.prioritaet]}`} aria-hidden />{t(`prio.${b.prioritaet}`)}</span>
                    </td>
                    {/* Befundtexte sind immer englisch (Export) — Sprachausgabe soll sie englisch lesen */}
                    <td className="px-2 py-2" lang="en">{b.text}</td>
                    <td className="whitespace-nowrap px-2 py-2">
                      {/* Nicht prüfbar darf nie als „verifiziert" erscheinen (N8, N11). „Regelbasiert
                          belegt" in accent, nicht ok: Es ordnet den Befund ein, erledigt ist er damit nicht. */}
                      {b.verifizierung === 'Not verifiable – source missing' ? (
                        <Badge tone="dim">{t('verifizierung.quelleFehlt')}</Badge>
                      ) : b.verifizierung === 'To verify – source not in library' ? (
                        <Badge tone="dim">{t('verifizierung.ohneBibliothek')}</Badge>
                      ) : b.verifizierung === 'To verify' ? (
                        <Badge tone="wait">{t('verifizierung.zuPruefen')}</Badge>
                      ) : (
                        <Badge tone="accent">{t('verifizierung.regel')}</Badge>
                      )}
                    </td>
                  </tr>
                  {auf && (
                    <tr id={`fs-${schluessel(b)}`} className="border-b border-line/[0.06] bg-bg/40">
                      <td colSpan={7} className="space-y-stack px-4 py-3">
                        <p className="text-micro font-semibold uppercase tracking-wide text-dim">{t('findings.fundstellen', { count: b.fundstellen.length })}</p>
                        <ul className="space-y-tight">
                          {b.fundstellen.map((f, i) => (
                            <li key={i} className="flex items-start gap-2 text-small">
                              <span className="w-28 shrink-0 text-micro text-dim">{[f.seite, f.ort].filter(Boolean).join(' · ') || '—'}</span>
                              <span className="min-w-0 flex-1 font-mono text-micro leading-relaxed">{f.auszug}</span>
                              {f.seite && (
                                <button className="flex shrink-0 items-center gap-1 text-micro text-accent hover:underline" onClick={() => {
                                  const d = geprueft.find((x) => x.id === b.dokId)!
                                  // Eine Tabelle über die Seitengrenze nennt die Spanne („S. 10–11") — geöffnet wird ihre erste Seite
                                  const index = d.z!.labels.findIndex((l) => l === f.seite || l === seitenAnfang(f.seite!))
                                  oeffnen({ docId: b.dokId, seite: index >= 0 ? index + 1 : Number(f.seite) || 1, q: f.auszug.split(' — ')[0].slice(0, 60), befund: id })
                                }}>
                                  <Eye size={13} /> {t('findings.seiteAnzeigen')}
                                </button>
                              )}
                            </li>
                          ))}
                        </ul>
                        {b.weitere?.length ? (
                          <div className="space-y-tight">
                            <p className="text-micro font-semibold uppercase tracking-wide text-dim">{t('findings.weitere')}</p>
                            <ul className="space-y-tight">
                              {b.weitere.map((w, i) => (
                                <li key={i} className="flex items-start gap-2 text-small">
                                  <span className="w-28 shrink-0 font-semibold">{w.dokName}</span>
                                  {w.fundstelle && <span className="min-w-0 flex-1 font-mono text-micro leading-relaxed">{[w.fundstelle.seite, w.fundstelle.auszug].filter(Boolean).join(' · ')}</span>}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                        {b.anleitung && (
                          <div className="rounded-xl border border-accent/30 bg-accent/5 p-3 text-small">
                            <p className="mb-1 text-micro font-semibold uppercase tracking-wide text-dim">{t('findings.anleitung')}</p>
                            {t(`anleitung.${b.anleitung}`)}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
