import { CheckCheck, ChevronDown, ChevronRight, Eye, FilePlus2, FileUp, Link2, ScanText, X } from 'lucide-react'
import { Fragment, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge, Button } from '../../../components/ui'
import { toast } from '../../../components/Toast'
import { hochladen, bibliotheksVergleich, pdfDazulegen } from '../hochladen'
import { useStore } from '../../../store'
import { aktiv, pruefSchalter } from '../settings'
import { ocrAusfuehren, type OcrPdf, type OcrTesseract } from '../ocr'
import { pdfjsLaden } from '../pdfjsLaden'
import { abbruchAnfordern, aktualisiert, befundZahl, bestaetigen, datei, dateiEntfernen, duplikatFuer, entfernen, feldSetzen, offenePflichtfelder, setzen, useSitzung, type Feld, type Rolle, type SitzungsDok } from '../sitzung'
import { standardVerbindung } from '../verbindung'
import { leseMeldung } from '../pruefung/befund'
import { umbruchStellen } from '../dateiUmbruch'
import { useViewer } from './Viewer'

/**
 * Prüf- und Sitzungsdokumente (Spez. 6.1): Ablage, Liste, Metadaten.
 * Dieselbe Liste für beide Spalten — sie unterscheiden sich nur in der
 * Rolle (Sitzungsdokumente haben einen Rang und gelten als Master).
 */

const TYPEN: Record<Rolle, string[]> = {
  review: ['OM', 'TM', 'PLM', 'CMM', 'FORM', 'OTHER'],
  master: ['AFM', 'QRH', 'POH', 'SOP', 'AVIONICS', 'SUPPLEMENT', 'IR', 'AMC', 'GM', 'OTHER'],
}

/**
 * Dateiname, der an „_", „-", „." umbricht statt mitten im Wort (UID-05).
 * `break-words` greift erst, wenn ein Teil allein breiter ist als die Spalte.
 */
export function DateiName({ name }: { name: string }) {
  return (
    <>
      {umbruchStellen(name).map((teil, i) => (
        <Fragment key={i}>
          {i > 0 && <wbr />}
          {teil}
        </Fragment>
      ))}
    </>
  )
}

const feldCls = 'w-full rounded-lg border border-field bg-bg/60 px-2.5 py-1.5 text-small text-ink outline-none transition focus:border-accent/60 focus:ring-2 focus:ring-accent/20'

export function DokListe({ rolle }: { rolle: Rolle }) {
  const { t } = useTranslation('doccheck')
  const { docs } = useSitzung()
  const { docCheckSettings } = useStore()
  const eigene = docs.filter((d) => d.rolle === rolle)
  const input = useRef<HTMLInputElement>(null)
  const [ziehen, setZiehen] = useState(false)

  const annehmen = async (liste: FileList | null) => {
    if (!liste?.length) return
    const { abgelehnt } = await hochladen([...liste], rolle, standardVerbindung(), undefined, { paaren: aktiv(docCheckSettings, 'pdfPairing'), pruefen: pruefSchalter(docCheckSettings) })
    for (const a of abgelehnt) toast(t(`upload.abgelehnt.${a.grund}`, { name: a.name }), 'bad')
  }

  return (
    <div className="space-y-stack">
      <button
        type="button"
        onClick={() => input.current?.click()}
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
        className={`flex w-full flex-col items-center justify-center gap-tight rounded-2xl border-2 border-dashed px-4 py-section text-center text-small transition ${ziehen ? 'border-accent bg-accent/10 text-ink' : 'border-line/15 bg-bg/40 text-dim hover:border-accent/50 hover:text-ink'}`}
      >
        {rolle === 'review' ? <FileUp size={22} aria-hidden /> : <FilePlus2 size={22} aria-hidden />}
        <span>{t(rolle === 'review' ? 'review.drop' : 'session.drop')}</span>
        <span className="text-micro">{t('upload.formate')}</span>
      </button>
      <input
        ref={input}
        type="file"
        multiple
        accept=".pdf,.docx,.xlsx"
        className="hidden"
        onChange={(e) => {
          void annehmen(e.target.files)
          e.target.value = ''
        }}
      />
      {eigene.map((d) => (
        <DokKarte key={d.id} d={d} />
      ))}
    </div>
  )
}

function DokKarte({ d }: { d: SitzungsDok }) {
  const { t } = useTranslation('doccheck')
  const zustand = useSitzung()
  const { docCheckSettings } = useStore()
  const pdfEingabe = useRef<HTMLInputElement>(null)
  const [paart, setPaart] = useState(false)
  const oeffnen = useViewer()
  const [ocr, setOcr] = useState<{ fertig: number; gesamt: number } | null>(null)
  const offen = offenePflichtfelder(d)
  // Angaben eingeklappt, sobald nichts mehr zu tun ist (Pflichtfelder voll,
  // Erkanntes bestätigt) — vorher wuchs jede Karte auf volle Formularhöhe
  // und schob die nächsten aus dem Blick (UX-Prüfung 01.11.2026).
  const [angabenAuf, setAngabenAuf] = useState(false)
  const angabenZeigen = angabenAuf || offen.length > 0 || d.erkannt.length > 0
  // Fertig gelesen ansagen: Der Fortschrittsbalken verschwand still, und wer
  // nicht hinsah oder eine Sprachausgabe nutzt, erfuhr es nie
  // (Barrierefreiheitsprüfung 01.11.2026). Der Toast trägt role="status".
  const statusVorher = useRef(d.status)
  useEffect(() => {
    // Ein Scan ohne Textebene oder ein Master ist gelesen, aber nicht geprüft — „0 Befunde" klang nach bestanden (Audit 11/2026, DC-03, DCF#5)
    if (statusVorher.current === 'liest' && d.status === 'fertig' && d.z) {
      const m = leseMeldung(d.z, d.rolle === 'review')
      toast(t(`upload.${m.schluessel}`, { name: d.name, count: m.count }), m.ton)
    } else if (statusVorher.current === 'liest' && d.status === 'fehler') toast(t('upload.nichtGelesen', { name: d.name }), 'bad')
    statusVorher.current = d.status
  }, [d.status, d.name, d.z, d.rolle, t])
  // Entfernen in zwei Schritten: Gelesenes und Prüfergebnis sind danach weg
  const [wegFragen, setWegFragen] = useState(false)
  useEffect(() => {
    if (!wegFragen) return
    const uhr = setTimeout(() => setWegFragen(false), 4000)
    return () => clearTimeout(uhr)
  }, [wegFragen])
  const dup = d.status === 'fertig' ? duplikatFuer(d, zustand, bibliotheksVergleich()) : null
  const format = d.z?.format ?? d.name.split('.').pop()?.toLowerCase()
  // Im Paketmodus zählen die Paketbefunde dieses Dokuments mit — wie in Findings (DC-14)
  const zahl = befundZahl(d, zustand.paketErgebnis?.ergebnis, !!zustand.paketModus && aktiv(docCheckSettings, 'packageCheck'))

  const weg = () => {
    standardVerbindung().entfernen(d.id)
    dateiEntfernen(d.id)
    setzen((z) => entfernen(z, d.id))
  }

  const ocrStarten = async () => {
    const daten = datei(d.id)
    if (!daten || !d.z) return
    setOcr({ fertig: 0, gesamt: d.z.ocrKandidaten.length })
    try {
      const seiten = await ocrAusfuehren(
        daten,
        d.z.ocrKandidaten,
        {
          pdfjs: () => pdfjsLaden() as unknown as Promise<OcrPdf>,
          tesseract: () => import('tesseract.js') as unknown as Promise<OcrTesseract>,
          basis: new URL('doccheck/', document.baseURI).href,
          leinwand: (b, h) => Object.assign(document.createElement('canvas'), { width: b, height: h }),
        },
        (fertig, gesamt) => setOcr({ fertig, gesamt }),
      )
      const v = standardVerbindung()
      const fertigGemeldet = new Promise<void>((ok) => {
        const ab = v.beiOcr((z) => {
          if (z.id !== d.id) return
          setzen((s) => aktualisiert(s, z))
          ab()
          ok()
        })
      })
      v.ocrEinspielen(d.id, seiten)
      await fertigGemeldet
      toast(t('ocr.fertig', { count: seiten.length }))
    } catch {
      toast(t('ocr.fehler'), 'bad')
    } finally {
      setOcr(null)
    }
  }

  const feld = (k: Feld, label: string, typ: 'text' | 'date' | 'number' = 'text') => (
    <label className="block">
      <span className="mb-0.5 flex items-center gap-1.5 text-micro text-dim">
        {label}
        {k === 'revision' && <span aria-hidden>*</span>}
        {d.erkannt.includes(k) && <span className="rounded bg-accent/15 px-1 text-micro text-ink">{t('upload.erkannt')}</span>}
      </span>
      <input
        type={typ}
        className={`${feldCls} ${offen.includes(k) ? '!border-wait' : ''}`}
        value={d.felder[k]}
        min={typ === 'number' ? 1 : undefined}
        aria-invalid={offen.includes(k) || undefined}
        onChange={(e) => {
          setzen((z) => feldSetzen(z, d.id, k, e.target.value))
          if (k === 'titel') standardVerbindung().titel(d.id, e.target.value)
        }}
      />
    </label>
  )

  return (
    <div className="space-y-tight rounded-2xl border border-line/10 bg-bg/40 p-3">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 rounded-md bg-accent/15 px-1.5 text-micro font-bold uppercase">{format}</span>
        <p className="min-w-0 flex-1 break-words text-small font-medium">
          <DateiName name={d.name} />
        </p>
        {wegFragen ? (
          <button
            autoFocus
            onClick={() => {
              weg()
              toast(t('upload.entfernt', { name: d.name }))
            }}
            className="-my-1 shrink-0 rounded-full bg-bad/15 px-2.5 py-1 text-micro font-semibold text-ink hover:bg-bad/25"
          >
            {t('upload.entfernenFrage')}
          </button>
        ) : (
          <button onClick={() => (d.status === 'fertig' ? setWegFragen(true) : weg())} aria-label={t('upload.entfernen', { name: d.name })} className="-m-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-dim hover:bg-line/5 hover:text-ink">
            <X size={16} />
          </button>
        )}
      </div>

      {d.status === 'liest' && (
        <div className="space-y-tight">
          <div className="h-1.5 overflow-hidden rounded-full bg-line/10" role="progressbar" aria-valuemin={0} aria-valuemax={d.fortschritt?.gesamt ?? 1} aria-valuenow={d.fortschritt?.seite ?? 0}>
            <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${d.fortschritt ? (100 * d.fortschritt.seite) / d.fortschritt.gesamt : 5}%` }} />
          </div>
          <div className="flex items-center justify-between gap-2 text-micro text-dim">
            <span className="min-w-0">{d.fortschritt ? t('upload.seiteVon', { seite: d.fortschritt.seite, gesamt: d.fortschritt.gesamt }) : t('upload.startet')}</span>
            {/* Abbrechen braucht bis zur nächsten Freigabe des Lesers (DC-01) — bis
                dahin sagt der Knopf, dass er gehört wurde, statt nochmal geklickt zu werden.
                Einzeilig: In der schmalen Spalte brachen Zähler und Knopf sonst beide um. */}
            <button
              className="shrink-0 whitespace-nowrap underline hover:text-ink disabled:no-underline"
              disabled={d.abbruch}
              onClick={() => {
                setzen((z) => abbruchAnfordern(z, d.id))
                standardVerbindung().abbrechen(d.id)
              }}
            >
              {d.abbruch ? t('upload.bricht') : t('upload.abbrechen')}
            </button>
          </div>
        </div>
      )}

      {d.status === 'fehler' && <Badge tone="bad">{t(`fehler.${d.fehler}`, { defaultValue: t('fehler.DC-PARSE') })}</Badge>}

      {d.status === 'fertig' && d.z && (
        <>
          <p className="text-micro text-dim">
            {t('upload.info', { count: d.z.seiten })}
            {d.z.ocrSeiten > 0 && ` · ${t('upload.ocrSeiten', { count: d.z.ocrSeiten })}`}
            {d.z.tabellen > 0 && ` · ${t('upload.tabellen', { count: d.z.tabellen })}`}
          </p>
          {(d.z.pruefung || zahl.paket > 0) && (
            <p className="flex flex-wrap items-center gap-1.5 text-micro">
              <span className="text-dim">{t('pruefungKurz.titel')}:</span>
              {/* Ohne gelesenen Text ist „ohne Befund" keine Aussage (DC-03) */}
              {d.z.ocrKandidaten.length > 0 ? (
                <Badge tone="wait">{t('pruefungKurz.ocrAusstehend')}</Badge>
              ) : d.z.pruefung?.ohneText ? (
                <Badge tone="wait">{t('pruefungKurz.ohneText')}</Badge>
              ) : null}
              {zahl.eigen + zahl.paket === 0 ? (
                !d.z.ocrKandidaten.length && !d.z.pruefung?.ohneText && <Badge tone="ok">{t('pruefungKurz.ohne')}</Badge>
              ) : (
                <>
                  {zahl.eigen > 0 && <Badge tone={zahl.hoch > zahl.paketHoch ? 'bad' : 'wait'}>{t('pruefungKurz.befunde', { count: zahl.eigen })}</Badge>}
                  {/* Paketbefunde liegen beim tieferen Dokument — grün „ohne Befund" stand sonst neben offenen Widersprüchen (DC-14) */}
                  {zahl.paket > 0 && <Badge tone={zahl.paketHoch > 0 ? 'bad' : 'wait'}>{zahl.eigen > 0 ? '+ ' : ''}{t('pruefungKurz.paket', { count: zahl.paket })}</Badge>}
                  {zahl.hoch > 0 && <span className="text-bad">{t('pruefungKurz.hoch', { count: zahl.hoch })}</span>}
                </>
              )}
            </p>
          )}
          {d.z.format === 'docx' && (
            /* Nachtrag N5: Woher kommen die Seitenzahlen? Wer in Word nach
               „Seite 42" sucht, muss wissen, ob das Words Seite ist. */
            <div className="space-y-tight rounded-xl bg-line/5 p-2.5 text-micro">
              <p>
                <span className="text-dim">{t('paar.quelle')}: </span>
                <span className="font-semibold">{t(`paar.${d.z.seitenQuelle}`)}</span>
              </p>
              {/* Ein Satz ist keine Statusmarke: als Pille wurde er in der schmalen Karte
                  zum vierzeiligen Oval (Audit 11/2026, FRD-19) — Hinweisfeld wie im Re-Check */}
              {d.z.pdfPaar?.warnung && <p className="rounded-lg border border-wait/40 bg-wait/10 px-2.5 py-1.5 text-ink">{t(`paar.warnung.${d.z.pdfPaar.warnung}`, { prozent: Math.round(d.z.pdfPaar.abweichung * 100) })}</p>}
              {d.z.seitenQuelle !== 'pdf_pair' && aktiv(docCheckSettings, 'pdfPairing') && (
                <>
                  <p className="text-dim">{t('paar.fehlt')}</p>
                  <Button variant="ghost" className="!min-h-9 !py-1 text-small" disabled={paart} onClick={() => pdfEingabe.current?.click()}>
                    <span className="flex items-center gap-1.5">
                      <Link2 size={15} /> {paart ? t('paar.laeuft') : t('paar.dazulegen')}
                    </span>
                  </Button>
                  <input
                    ref={pdfEingabe}
                    type="file"
                    accept=".pdf"
                    className="hidden"
                    onChange={async (e) => {
                      const f = e.target.files?.[0]
                      e.target.value = ''
                      if (!f) return
                      setPaart(true)
                      try {
                        const z = await pdfDazulegen(d.id, f, standardVerbindung())
                        toast(z.seitenQuelle === 'pdf_pair' ? t('paar.ok') : t('paar.nichtUebernommen'), z.seitenQuelle === 'pdf_pair' ? 'ok' : 'wait')
                      } finally {
                        setPaart(false)
                      }
                    }}
                  />
                </>
              )}
            </div>
          )}
          {d.z.format === 'docx' && (d.z.lenkung.aenderungen > 0 || d.z.lenkung.kommentare > 0 || d.z.lenkung.revisionsbalken > 0) && (
            <p className="text-micro text-dim">{t('upload.lenkung', d.z.lenkung)}</p>
          )}
          {dup && (
            <Badge tone={dup.art === 'identisch' ? 'bad' : 'wait'}>
              {t(`upload.duplikat.${dup.art}`, { mit: dup.mit.bezeichnung, wo: t(`upload.herkunft.${dup.mit.herkunft}`) })}
            </Badge>
          )}
          {d.z.ocrKandidaten.length > 0 && (
            <div className="space-y-tight rounded-xl bg-wait/10 p-2.5 text-micro">
              <p>{t('ocr.frage', { count: d.z.ocrKandidaten.length })}</p>
              {ocr ? (
                <p className="text-dim">{t('ocr.laeuft', ocr)}</p>
              ) : (
                <Button variant="ghost" className="!min-h-9 !py-1 text-small" onClick={ocrStarten}>
                  <span className="flex items-center gap-1.5">
                    <ScanText size={15} /> {t('ocr.starten')}
                  </span>
                </Button>
              )}
            </div>
          )}
          {!angabenZeigen && (
            <button onClick={() => setAngabenAuf(true)} aria-expanded={false} className="flex w-full items-center gap-1.5 rounded-lg py-1 text-left text-micro text-dim hover:text-ink">
              <ChevronRight size={13} aria-hidden />
              <span className="min-w-0 flex-1 truncate">
                {[d.felder.typ && t(`typen.${d.felder.typ}`, { defaultValue: d.felder.typ }), d.felder.titel, d.felder.revision].filter(Boolean).join(' · ')}
              </span>
              <span className="shrink-0 text-accent">{t('upload.angabenBearbeiten')}</span>
            </button>
          )}
          {angabenZeigen && (
          <div className="space-y-tight">
            {angabenAuf && offen.length === 0 && d.erkannt.length === 0 && (
              <button onClick={() => setAngabenAuf(false)} aria-expanded className="flex items-center gap-1.5 text-micro text-dim hover:text-ink">
                <ChevronDown size={13} aria-hidden /> {t('upload.angabenZu')}
              </button>
            )}
            <label className="block">
              <span className="mb-0.5 flex items-center gap-1.5 text-micro text-dim">
                {t('upload.typ')}
                {d.erkannt.includes('typ') && <span className="rounded bg-accent/15 px-1 text-micro text-ink">{t('upload.erkannt')}</span>}
              </span>
              <select className={feldCls} value={d.felder.typ} onChange={(e) => setzen((z) => feldSetzen(z, d.id, 'typ', e.target.value))}>
                <option value="">—</option>
                {/* Ein erkannter Typ außerhalb der Liste bleibt sichtbar, statt
                    als leere Auswahl „erkannt" zu behaupten. */}
                {d.felder.typ && !TYPEN[d.rolle].includes(d.felder.typ) && <option value={d.felder.typ}>{t(`typen.${d.felder.typ}`, { defaultValue: d.felder.typ })}</option>}
                {TYPEN[d.rolle].map((k) => (
                  <option key={k} value={k}>
                    {t(`typen.${k}`)}
                  </option>
                ))}
              </select>
            </label>
            {feld('titel', t('upload.titel'))}
            {feld('nummer', t('upload.nummer'))}
            {feld('revision', t('upload.revision'))}
            {/* wait, nicht bad: ein fehlendes Pflichtfeld mahnt, kaputt ist nichts */}
            {offen.includes('revision') && <p className="text-micro text-wait">{t('upload.pflicht')}</p>}
            {feld('datum', t('upload.datum'), 'date')}
            {d.rolle === 'master' && feld('rang', t('upload.rang'), 'number')}
          </div>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            <Button variant="ghost" className="!min-h-9 !py-1 text-small" onClick={() => oeffnen({ docId: d.id, seite: 1 })}>
              <span className="flex items-center gap-1.5">
                <Eye size={15} /> {t('upload.ansehen')}
              </span>
            </Button>
            {d.erkannt.length > 0 && (
              <Button variant="ghost" className="!min-h-9 !py-1 text-small" onClick={() => setzen((z) => bestaetigen(z, d.id))}>
                <span className="flex items-center gap-1.5">
                  <CheckCheck size={15} /> {t('upload.bestaetigen')}
                </span>
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
