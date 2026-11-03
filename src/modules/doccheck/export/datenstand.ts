import { exportOrt, nichtBewertbar, seiteEnglisch, type Ampel, type Befund, type Kategorie, type Lesestand, type Prioritaet } from '../pruefung/befund'
import en from '../i18n/en.json' with { type: 'json' }
import L from './labels.en.json' with { type: 'json' }

/**
 * Eingefrorener Export-Datenstand (Spez. v1.1 Kap. 10.1, 10.2).
 *
 * EIN Stand, vier Formate: Excel, Word, CSV und PowerPoint lesen dieselbe
 * Struktur, damit Inhalt, Reihenfolge, IDs und Zahlen überall gleich sind.
 * Wer einen Wert in einem Format ausrechnet statt ihn hier abzulesen, baut
 * die zweite Wahrheit — dieselbe Lehre wie beim Logbuch.
 *
 * Alles ist englisch (Kap. 10.1 Nr. 4) und kommt aus `labels.en.json` bzw.
 * dem englischen DocCheck-Sprachpaket — unabhängig von der Oberfläche.
 */

/** Layout-Version der Exporte (Kap. 10.1 Nr. 2) — erhöhen nur mit Changelog-Eintrag. */
export const EXPORT_LAYOUT_VERSION = '1.0'

/**
 * Sprachauszeichnung aller Office-Exporte. Britisch wie der Text
 * („Organisation", „font colour", „recognised"). Ohne Auszeichnung prüfte
 * Word bzw. LibreOffice auf einem deutschen System den englischen Bericht
 * gegen das deutsche Wörterbuch und markierte das PDF als Deutsch;
 * pptxgenjs schrieb „en-US" (Audit 11/2026, EXM-02).
 */
export const SPRACHE = 'en-GB'

export type Gesamt = 'ready' | 'afterCorrection' | 'notReady' | 'notAssessable'

export interface ExportDokument {
  id: string
  rolle: 'review' | 'master' | 'session'
  name: string
  typ: string
  titel: string
  nummer: string
  revision: string
  datum: string
  rang: string
  seiten: number
  sha256: string
}

export interface ExportBefund {
  /** eindeutig über alle Dokumente — die Prüfungen nummerieren je Dokument */
  id: string
  dokId: string
  /** Prioritätsrang und Seitenzahl für die Sortierung (Dokument → Seite → Priorität) */
  seiteNr: number
  spalten: string[]
  kategorie: Kategorie
  prioritaet: Prioritaet
  verifizierung: string
}

export interface AmpelZeile {
  dokument: string
  gruppe: string
  punkt: string
  ampel: Ampel
}

/**
 * Ampel als Matrix Prüfpunkt × Prüfdokument (`ampelMatrix`): Spalten mit
 * dem Präfix der Befund-IDs als Kopf, je Zeile die Ampel jeder Spalte —
 * `null`, wo der Prüfpunkt für das Dokument nicht lief (z. B. Word-Check
 * bei einem PDF).
 */
export interface AmpelMatrix {
  spalten: { dokument: string; kuerzel: string }[]
  zeilen: { gruppe: string; punkt: string; ampeln: (Ampel | null)[] }[]
}

export interface Datenstand {
  exportId: string
  /** Tag des Exports, ISO (`2026-11-02`) — für Kennung, Dateiname und alles, was byte-gleich bleiben soll */
  datum: string
  /**
   * Zeitpunkt des Exports, ISO mit Uhrzeit und Versatz, wie übergeben
   * (`lokalIso`). Nur für die Report history im Word-Bericht, der vorher als
   * „Timestamp" bloß den Tag nannte (Audit 11/2026, EXP-19). Excel bleibt
   * beim Tag: gleiche Eingabe → gleiche Datei.
   */
  zeit: string
  layout: string
  appVersion: string
  organisation: string
  art: 'erst' | 'revision'
  pruefer: { name: string; funktion: string }
  bibliothek: string
  /** „Checks performed": was an diesem Stand WIRKLICH geprüft wurde, englisch (`pruefungenAus`) */
  pruefungen: string[]
  /**
   * KI-Modell(e) der Prüfung, leer = es lief keine KI-Prüfung (bis Phase 4
   * immer). Daran hängt „AI model(s)" in der Kennung und, ob das Excel die
   * leeren KI-Spalten zuklappen darf (`ausgeblendeteSpalten`, EXP-12).
   */
  modelle: string
  /** Hauptdokument: das erste Prüfdokument — im Paketmodus das ranghöchste (`exportDokumente` ordnet nach Ebene) */
  haupt: ExportDokument | null
  dokumente: ExportDokument[]
  befunde: ExportBefund[]
  /** Category × Priority, in der Reihenfolge von labels.en.json */
  zaehlung: Record<Kategorie, Record<Prioritaet, number>>
  zuPruefen: number
  ampeln: AmpelZeile[]
  gesamt: Gesamt
  top5: string[]
  dateiStamm: string
}

export interface ExportEingabe {
  datum: string
  laufnummer: number
  appVersion: string
  organisation: string
  art: 'erst' | 'revision'
  pruefer: { name: string; funktion: string }
  bibliothek: string
  dokumente: ExportDokument[]
  /** Befunde je Prüfdokument und aus der Paketprüfung */
  befunde: Befund[]
  /** Ampel je Prüfdokument: Gruppe → Prüfpunkt → Ampel — nur Gruppen, die gelaufen sind */
  ampeln: { dokId: string; gruppen: Record<string, Record<string, Ampel>> }[]
  /** Was von den Prüfdokumenten gelesen ist — Pflicht, damit kein Weg einen Scan als „ready" exportiert (DC-03) */
  lesestand: Lesestand
  /** Lief die Paketprüfung (Paketmodus mit Ergebnis)? Pflicht aus demselben Grund: sonst stünde sie immer unter „Checks performed" (EXP-01) */
  paketGeprueft: boolean
  /** KI-Modell(e), wenn eine KI-Prüfung lief — fehlt bis Phase 4 */
  modelle?: string
}

const RANG: Record<Prioritaet, number> = { High: 0, Medium: 1, Low: 2 }

/**
 * „S. 12", „ca. 3", „Page 12 (±1)", „Pages 10–11", „6-04-15 Page 2" →
 * erste Zahl; ohne Zahl ganz ans Ende. Deutsche und englische Fassung
 * (`seiteEnglisch`) ergeben dieselbe Zahl — die Sortierung hängt nicht
 * daran, ob ein Stand frisch oder aus einem Prüfstand kommt.
 */
export function seitenZahl(label: string | undefined): number {
  const m = label?.match(/\d+/)
  return m ? Number(m[0]) : Number.MAX_SAFE_INTEGER
}

/** Export-ID nach Kap. 10.1: `DC-2026-10-31-0007`. */
export function exportId(datum: string, laufnummer: number): string {
  return `DC-${datum.slice(0, 10)}-${String(Math.max(1, laufnummer)).padStart(4, '0')}`
}

/** Teil eines Dateinamens: nur Buchstaben, Ziffern, „." und „-"; Punkte am Rand ergäben versteckte bzw. von Windows gestrichene Namen. */
const sauber = (s: string) => s.replace(/[^\p{L}\p{N}.-]+/gu, '-').replace(/-+/g, '-').replace(/^[-.]+|[-.]+$/g, '')

/** Führendes „Rev", „Rev.", „Revision:" oder „R" vor einer Zahl — nicht das „Rev" in „Review". */
const REV_PRAEFIX = /^(?:rev(?:ision)?(?![a-z])\.?|r(?=\s*\d))\s*:?\s*/i
/** Bestandteile einer Revisionsangabe: „Edition 1", „Issue 3", „Rev. 3", „R0.1", „Amendment 2" — ein Buchstabe als Wert nur nach Leerraum, sonst wäre „issued" Issue „d". */
const REV_TEIL = /\b(edition|ed|issue|iss|revision|rev|r|amendment|amdt|amd)(?:\.?\s*(\d+(?:\.\d+)*[a-z]?)|\.?\s+([a-z]))\b/gi
const REV_BUCHSTABE: Record<string, string> = { edition: 'E', ed: 'E', issue: 'I', iss: 'I', revision: 'R', rev: 'R', r: 'R', amendment: 'A', amdt: 'A', amd: 'A' }

/**
 * Revision in Kurzform für den Dateinamen (Kap. 10.2: `…_Rev<No>`):
 * „Edition 1 Revision 0.0" → „E1R0.0", „Issue 3 Revision 2" → „I3R2",
 * „Rev. 3 / Amendment 2" → „3-A2", „Rev 0.1" → „0.1". Vorher wurde nur ein
 * führendes „Rev" entfernt, und aus „Edition 1 Revision 0.0" wurde
 * „…_RevEdition-1-Revision-0.0" (Audit 11/2026, EXP-18). Ohne erkennbaren
 * Bestandteil bleibt die Angabe, wie sie ist.
 */
export function revisionKurz(rev: string): string {
  const teile = [...rev.matchAll(REV_TEIL)].map((m) => [REV_BUCHSTABE[m[1].toLowerCase()], m[2] ?? m[3]] as const)
  if (!teile.length) return sauber(rev.trim().replace(REV_PRAEFIX, ''))
  // Ein führendes R steckt schon im „_Rev" des Stamms; ein Amendment hängt mit „-" an
  return teile.map(([b, wert], i) => (i === 0 && b === 'R' ? wert : b === 'A' ? `-A${wert}` : `${b}${wert}`)).join('').replace(/^-/, '')
}

/**
 * Revision für Fußzeile und Titelfolie: „Rev 0.1" aus „0.1", „R0.1" oder
 * „Revision 0.1"; eine Angabe, die selbst mit Edition, Issue oder
 * Amendment beginnt, bleibt wörtlich — vorher stand dort „Rev Edition 1
 * Revision 0.0" (Audit 11/2026, EXP-18).
 */
export function revisionAngabe(rev: string): string {
  const r = rev.trim()
  if (!r || /^(?:edition|ed\.|issue|iss\.|amendment|amdt\.?|amd\.?)(?![a-z])/i.test(r)) return r
  return `Rev ${r.replace(REV_PRAEFIX, '')}`.trim()
}

/** Auf `max` Zeichen (Codepunkte) kürzen, mit „…" am Ende. */
function auslassung(s: string, max: number): string {
  const z = Array.from(s)
  return z.length <= max ? s : `${z.slice(0, Math.max(0, max - 1)).join('').trimEnd()}…`
}

/** Auf `max` Zeichen kürzen, am letzten „-" davor, sofern es nicht in der vorderen Hälfte liegt — Wortende statt Wortrest. */
function stammKuerzen(s: string, max: number): string {
  const z = Array.from(s)
  if (z.length <= max) return s
  const kurz = z.slice(0, max).join('')
  const grenze = kurz.lastIndexOf('-')
  return (z[max] !== '-' && grenze >= max / 2 ? kurz.slice(0, grenze) : kurz).replace(/[-.]+$/, '')
}

/**
 * Höchstlängen im Dateinamen (Audit 11/2026, EXM-05): Ein Titel aus den
 * DOCX-Eigenschaften oder von Hand ist unbegrenzt, und der Stamm wuchs auf
 * über 255 Zeichen — auf keinem Dateisystem speicherbar, und Excel öffnet
 * ab 218 Zeichen PFAD nicht mehr. Mit 80 + 20 bleibt der längste Name
 * („….doccheck.json") unter 140 Zeichen.
 */
export const STAMM_DOKUMENT_MAX = 80
export const STAMM_REVISION_MAX = 20

/**
 * Dateinamen-Stamm nach Kap. 10.2: `2026-10-31_Review_<Document>_Rev<No>`.
 * Mit weiteren Prüfdokumenten nennt `<Document>` ihre Zahl
 * („TM-CL30-plus-3") — vorher trug ein Paket den Namen des zuerst
 * geladenen Dokuments allein (Audit 11/2026, EXP-08).
 */
export function dateiStamm(datum: string, dok: ExportDokument | null, weitere = 0): string {
  const plus = weitere > 0 ? `-plus-${weitere}` : ''
  const name = stammKuerzen(sauber(dok ? dok.nummer || dok.titel || dok.name.replace(/\.[a-z0-9]+$/i, '') : 'Package') || 'Document', STAMM_DOKUMENT_MAX - plus.length) + plus
  const rev = stammKuerzen(sauber(revisionKurz(dok?.revision ?? '')), STAMM_REVISION_MAX) || 'NA'
  return `${datum.slice(0, 10)}_Review_${name}_Rev${rev}`
}

/**
 * Gesamtbewertung als VORSCHLAG aus den regelbasierten Befunden: offene
 * Hoch-Befunde → nicht einreichungsfähig; Seiten ohne gelesenen Text →
 * nicht bewertbar; sonst jeder offene Befund → nach Korrektur. Bestätigt
 * wird sie vom Prüfer (Dropdown im Excel).
 *
 * Ein Scan ohne Textebene hat keine Befunde und ging deshalb als „Ready
 * for submission" in den Export (Audit 11/2026, DC-03). Ein offener
 * Hoch-Befund bleibt vorrangig: Er sagt sicher „nicht bereit", gleich was
 * auf den ungelesenen Seiten steht; „nach Korrektur" dagegen verspräche,
 * dass sonst nichts fehlt.
 */
export function gesamtVorschlag(befunde: Pick<Befund, 'prioritaet'>[], gelesen: Lesestand): Gesamt {
  if (befunde.some((b) => b.prioritaet === 'High')) return 'notReady'
  if (nichtBewertbar(gelesen)) return 'notAssessable'
  return befunde.length ? 'afterCorrection' : 'ready'
}

const korrektur = (schluessel?: string) => (schluessel ? ((en.anleitung as Record<string, string>)[schluessel] ?? '') : '')
const punktName = (p: string) => (en.punkt as Record<string, string>)[p] ?? p
const gruppenName = (g: string) => ((en.gate as Record<string, unknown>)[g] as string | undefined) ?? g

/**
 * Präfix der Befund-IDs je Prüfdokument: Typ (TM, PLM …), ein zweites
 * Dokument gleichen Typs TM2; ohne Typ DOC1, DOC2 … Paketbefunde PKG.
 *
 * DOCn zählt nur die Dokumente OHNE Typ — vorher zählte es die Stelle unter
 * allen Prüfdokumenten, und ein Paket bekam DOC2, DOC3, DOC6 mit Lücken
 * (Audit 11/2026, EXP-09). Ein Präfix wird nie zweimal vergeben, auch nicht,
 * wenn ein Typ selbst „TM2" oder „PKG" heißt — die IDs sind eindeutig.
 */
export function praefixe(dokumente: Pick<ExportDokument, 'id' | 'typ'>[]): Map<string, string> {
  const out = new Map<string, string>()
  const belegt = new Set(['PKG'])
  let ohneTyp = 0
  for (const d of dokumente) {
    const basis = d.typ.toUpperCase().replace(/[^A-Z0-9]+/g, '') || `DOC${++ohneTyp}`
    let p = basis
    for (let n = 2; belegt.has(p); n++) p = `${basis}${n}`
    belegt.add(p)
    out.set(d.id, p)
  }
  return out
}

/**
 * Steuerzeichen, die XML 1.0 verbietet (Tab, Zeilenumbruch und Wagenrücklauf
 * bleiben). Ein einziges „\u0002" aus einem PDF-Text oder einem geladenen
 * Prüfstand machte das PowerPoint-Briefing zu nicht wohlgeformtem XML
 * (Audit 11/2026, SEC-04).
 */
const STEUERZEICHEN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g

/**
 * Entfernt sie EINMAL beim Einfrieren aus jedem Text des Datenstands — in
 * `datenstand()` und `datenstandAus()`. Je Format gefiltert trügen CSV,
 * Excel, Word, PowerPoint und Prüfstand sonst verschiedene Texte für
 * denselben Befund: die zweite Wahrheit, nur unsichtbar.
 */
export function ohneSteuerzeichen<T>(wert: T): T {
  if (typeof wert === 'string') return wert.replace(STEUERZEICHEN, '') as T
  if (Array.isArray(wert)) return wert.map(ohneSteuerzeichen) as T
  if (wert && typeof wert === 'object') return Object.fromEntries(Object.entries(wert).map(([k, v]) => [k, ohneSteuerzeichen(v)])) as T
  return wert
}

/**
 * „Checks performed" aus den Ampelgruppen, die an diesem Stand gelaufen
 * sind, plus der Paketprüfung, wenn sie lief. Vorher eine feste Liste: Der
 * Bericht nannte Formal- und Word-Check auch dann, wenn der Superadmin sie
 * abgeschaltet hatte, und „References between documents" auch ohne
 * Paketmodus — ein Dokument ohne Befunde wurde so „Ready for submission"
 * nach Prüfungen, die nie liefen (Audit 11/2026, EXP-01/DC-12). Reihenfolge
 * wie in labels.en.json.
 */
export function pruefungenAus(ampeln: ExportEingabe['ampeln'], paketGeprueft: boolean): string[] {
  const gelaufen = new Set(ampeln.flatMap((a) => Object.entries(a.gruppen).filter(([, p]) => Object.keys(p).length).map(([g]) => g)))
  if (paketGeprueft) gelaufen.add('paket')
  const bekannt = Object.keys(L.checks)
  return [...bekannt.filter((g) => gelaufen.has(g)), ...[...gelaufen].filter((g) => !bekannt.includes(g))].map((g) => (L.checks as Record<string, string>)[g] ?? gruppenName(g))
}

/**
 * Befunde in Export-Reihenfolge mit ihrer Export-ID — die EINE Rechnung für
 * Sortierung und Nummer, aus der `datenstand()` und `befundIds()` lesen.
 * Dokument → Seite → Priorität (Kap. 10.2); Paketbefunde ohne eigenes
 * Dokument zuletzt.
 */
function nummerieren(e: Pick<ExportEingabe, 'dokumente' | 'befunde'>): { b: Befund; id: string }[] {
  const praefix = praefixe(e.dokumente.filter((d) => d.rolle === 'review'))
  const reihenfolge = new Map(e.dokumente.map((d, i) => [d.id, i]))
  const sortiert = [...e.befunde].sort(
    (a, b) =>
      (reihenfolge.get(a.dokId) ?? 1e9) - (reihenfolge.get(b.dokId) ?? 1e9) ||
      seitenZahl(a.fundstellen.find((f) => f.seite)?.seite) - seitenZahl(b.fundstellen.find((f) => f.seite)?.seite) ||
      RANG[a.prioritaet] - RANG[b.prioritaet] ||
      a.id.localeCompare(b.id),
  )
  const zaehler = new Map<string, number>()
  return sortiert.map((b) => {
    const p = praefix.get(b.dokId) ?? 'PKG'
    const n = (zaehler.get(p) ?? 0) + 1
    zaehler.set(p, n)
    return { b, id: `${p}-${String(n).padStart(3, '0')}` }
  })
}

/**
 * Schlüssel eines Befunds der Sitzung: Die Prüfungen nummerieren je
 * Dokument („F-01" steht in jedem Dokument), erst mit dem Dokument ist er
 * eindeutig. Paketbefunde zählen über das ganze Paket („P-03") und haben
 * eine eigene Quelle — sie treffen nie die ID einer Dokumentprüfung.
 */
export function befundSchluessel(b: Pick<Befund, 'dokId' | 'id'>): string {
  return JSON.stringify([b.dokId, b.id])
}

/**
 * Export-ID je Befund (`befundSchluessel` → „TM-003") — für die
 * Oberfläche. Sie zeigte „F-01" je Dokument, der Bericht „TM-003" über alle
 * Dokumente; wer einen Befund aus Excel oder Word am Bildschirm suchte,
 * fand ihn nicht (Spez. 6.3, 10.1: IDs in allen Formaten identisch; Audit
 * 11/2026, DC-10/UID-07/TXT-03). Aus derselben Rechnung wie `datenstand()`,
 * nicht nachgebaut — sonst liefen die IDs beim ersten neuen Sortierschlüssel
 * auseinander.
 */
export function befundIds(e: Pick<ExportEingabe, 'dokumente' | 'befunde'>): Map<string, string> {
  return new Map(nummerieren(e).map(({ b, id }) => [befundSchluessel(b), id]))
}

export function datenstand(e: ExportEingabe): Datenstand {
  const pruef = e.dokumente.filter((d) => d.rolle === 'review')
  const haupt = pruef[0] ?? null
  const dok = new Map(e.dokumente.map((d) => [d.id, d]))
  const reihenfolge = new Map(e.dokumente.map((d, i) => [d.id, i]))

  const befunde: ExportBefund[] = nummerieren(e).map(({ b, id }) => {
    const d = dok.get(b.dokId)
    const f = b.fundstellen.find((x) => x.seite) ?? b.fundstellen[0]
    // Kapitel unter „Chapter / Section", die Stelle darin unter „Paragraph / Line" (Nachtrag TXT#1)
    const ort = exportOrt(f)
    const spalten = [
      id,
      d ? d.titel || d.name : b.dokName,
      d?.nummer ?? '',
      d ? [d.revision, d.datum].filter(Boolean).join(' / ') : '',
      ort.kapitel,
      // Export englisch: „S. 12 (±1)" → „Page 12 (±1)" (EXP-07/TXT-01)
      seiteEnglisch(f?.seite ?? ''),
      ort.absatz,
      f?.auszug ?? '',
      '',
      '',
      '',
      '',
      '',
      b.kategorie,
      '',
      b.prioritaet,
      b.text,
      korrektur(b.anleitung),
      (b.weitere ?? []).map((w) => w.dokName).join(', '),
      b.verifizierung,
      'New',
      '',
      '',
      'Open',
    ]
    return { id, dokId: b.dokId, seiteNr: seitenZahl(f?.seite), spalten, kategorie: b.kategorie, prioritaet: b.prioritaet, verifizierung: b.verifizierung }
  })

  const zaehlung = Object.fromEntries(L.categories.map((k) => [k, Object.fromEntries(L.priorities.map((p) => [p, 0]))])) as Datenstand['zaehlung']
  for (const b of befunde) zaehlung[b.kategorie][b.prioritaet]++

  // Ampeln in derselben Dokumentreihenfolge wie die Befunde — im Paketmodus also nach Paketstruktur (EXP-08)
  const nachDokument = (id: string) => reihenfolge.get(id) ?? 1e9
  const ampeln: AmpelZeile[] = [...e.ampeln].sort((a, b) => nachDokument(a.dokId) - nachDokument(b.dokId)).flatMap((a) => {
    const name = dok.get(a.dokId)?.titel || dok.get(a.dokId)?.name || a.dokId
    return Object.entries(a.gruppen).flatMap(([g, punkte]) => Object.entries(punkte).map(([p, ampel]) => ({ dokument: name, gruppe: gruppenName(g), punkt: punktName(p), ampel })))
  })

  // Top 5: wichtigste zuerst, bei Gleichstand in Export-Reihenfolge
  const top5 = [...befunde]
    .map((b, i) => ({ b, i }))
    .sort((x, y) => RANG[x.b.prioritaet] - RANG[y.b.prioritaet] || x.i - y.i)
    .slice(0, 5)
    .map((x) => x.b.id)

  return ohneSteuerzeichen({
    exportId: exportId(e.datum, e.laufnummer),
    datum: e.datum.slice(0, 10),
    zeit: e.datum,
    layout: EXPORT_LAYOUT_VERSION,
    appVersion: e.appVersion,
    organisation: e.organisation.trim(),
    art: e.art,
    pruefer: e.pruefer,
    bibliothek: e.bibliothek,
    pruefungen: pruefungenAus(e.ampeln, e.paketGeprueft),
    modelle: e.modelle?.trim() ?? '',
    haupt,
    dokumente: e.dokumente,
    befunde,
    zaehlung,
    zuPruefen: befunde.filter((b) => b.verifizierung.startsWith('To verify')).length,
    ampeln,
    gesamt: gesamtVorschlag(befunde, e.lesestand),
    top5,
    dateiStamm: dateiStamm(e.datum, haupt, Math.max(0, pruef.length - 1)),
  })
}

/**
 * Ampel der Prüfpunkte als Matrix — abgeleitet aus `ampeln`, nicht neu
 * gerechnet. Der Word-Bericht setzte jede Zeile Dokument × Prüfpunkt
 * untereinander in die Executive Summary; bei einem Paket waren das acht
 * Seiten, überwiegend „Not applicable", vor zwei Seiten Befunden (Audit
 * 11/2026, EXP-10). Die Ampel je Prüfpunkt bleibt (Spez. 10.5 Nr. 4), nur
 * die Form wird dichter: eine Zeile je Prüfpunkt.
 *
 * Der Spaltenkopf ist das ID-Präfix des Dokuments — aus den Befund-IDs
 * selbst, wo es Befunde gibt, damit ein älterer Prüfstand dieselben Präfixe
 * zeigt wie seine Befunde; sonst nach `praefixe`.
 */
export function ampelMatrix(d: Pick<Datenstand, 'ampeln' | 'dokumente' | 'befunde'>): AmpelMatrix {
  const pruef = d.dokumente.filter((x) => x.rolle === 'review')
  const vorschlag = praefixe(pruef)
  const kuerzel = new Map<string, string>()
  for (const x of pruef) {
    const name = x.titel || x.name
    const ausId = d.befunde.find((b) => b.dokId === x.id)?.id.replace(/-\d+$/, '')
    if (!kuerzel.has(name)) kuerzel.set(name, ausId ?? vorschlag.get(x.id)!)
  }
  const spalten = [...new Set(d.ampeln.map((a) => a.dokument))].map((dokument) => ({ dokument, kuerzel: kuerzel.get(dokument) ?? dokument }))
  const spalte = new Map(spalten.map((s, i) => [s.dokument, i]))
  const zeilen = new Map<string, AmpelMatrix['zeilen'][number]>()
  for (const a of d.ampeln) {
    const schluessel = JSON.stringify([a.gruppe, a.punkt])
    const z = zeilen.get(schluessel) ?? { gruppe: a.gruppe, punkt: a.punkt, ampeln: spalten.map(() => null) }
    z.ampeln[spalte.get(a.dokument)!] = a.ampel
    zeilen.set(schluessel, z)
  }
  return { spalten, zeilen: [...zeilen.values()] }
}

/** „Checks performed" als Text — dieselbe Angabe in Kennung, Word-Scope und Folie 2. */
export function pruefungenText(d: Pick<Datenstand, 'pruefungen'>): string {
  return d.pruefungen.join(', ') || L.noChecks
}

/**
 * „Location" eines Befunds in den Top-5-Tabellen von Word und PowerPoint:
 * Kapitel und Seite, soweit vorhanden. Die Folie zeigte vorher unter
 * „Chapter" das Kapitel ODER, wenn es fehlte, die Seite — meist also
 * Seitenangaben unter „Chapter" (Audit 11/2026, TXT-16).
 */
export function fundort(b: Pick<ExportBefund, 'spalten'>): string {
  return [b.spalten[4], b.spalten[5]].filter(Boolean).join(' · ')
}

/** Prüfdokumente neben dem Hauptdokument. */
export function weitereDokumente(d: Pick<Datenstand, 'haupt' | 'dokumente'>): number {
  return d.haupt ? d.dokumente.filter((x) => x.rolle === 'review').length - 1 : 0
}

const weitereText = (n: number) => (n === 1 ? L.further.one : L.further.other.replace('{n}', String(n)))

/**
 * „Document under review" in Kennung und auf dem Word-Deckblatt: das
 * Hauptdokument mit Titel, Nummer, Revision und Datum, dazu die Zahl der
 * weiteren Prüfdokumente. Vorher nannten Deckblatt, Kennung, Fußzeile,
 * Dateiname und Titelfolie bei einem Paket nur das zuerst geladene
 * Dokument — als wäre es allein geprüft (Audit 11/2026, EXP-08). Leer ohne
 * Prüfdokument; den Ersatz wählt die Stelle.
 */
export function dokumentAngabe(d: Pick<Datenstand, 'haupt' | 'dokumente'>): string {
  const h = d.haupt
  if (!h) return ''
  const n = weitereDokumente(d)
  const basis = [h.titel || h.name, h.nummer, h.revision, h.datum].filter(Boolean).join(' · ')
  return n ? `${basis} ${weitereText(n)} (see “${L.sheets.sources}”)` : basis
}

/** Kurzform für Fußzeile und Titelfolie: „Training Manual Rev 0.1 + 2 further documents"; `titel` ersetzt den Titel (gekürzt). */
export function dokumentKurz(d: Pick<Datenstand, 'haupt' | 'dokumente'>, titel?: string): string {
  const h = d.haupt
  if (!h) return 'Package'
  const n = weitereDokumente(d)
  return [titel ?? (h.titel || h.name), revisionAngabe(h.revision), n ? weitereText(n) : ''].filter(Boolean).join(' ')
}

/** Review Identification Block (Kap. 10.2) — gleiche Felder in Excel, Word und PowerPoint. */
export function kennung(d: Datenstand): [string, string][] {
  const masters = d.dokumente.filter((x) => x.rolle !== 'review').length
  return [
    ...(d.organisation ? ([[L.ident.organisation, d.organisation]] as [string, string][]) : []),
    [L.ident.document, dokumentAngabe(d) || '—'],
    [L.ident.reviewType, L.reviewType[d.art]],
    [L.ident.reviewDate, d.datum],
    [L.ident.reviewedBy, [d.pruefer.name, d.pruefer.funktion].filter(Boolean).join(', ')],
    [L.ident.library, d.bibliothek],
    [L.ident.masters, `${masters} (see “${L.sheets.sources}”)`],
    [L.ident.checks, pruefungenText(d)],
    [L.ident.models, d.modelle || L.noModel],
    [L.ident.overall, L.overall[d.gesamt]],
    [L.ident.exportId, d.exportId],
    [L.ident.versions, `InstructorConnect ${d.appVersion} · Layout ${d.layout}`],
    [L.ident.disclaimer, L.disclaimer],
  ]
}

/**
 * Höchstlänge der Fußzeile ohne Seitenangabe und Disclaimer, in allen
 * Formaten gleich. Excel erlaubt für Kopf-/Fußzeilen 255 Zeichen
 * INSGESAMT, und der linke Teil lief bei langer Organisation und langem
 * Titel in den rechten („Page x of y · Disclaimer") — 110 Zeichen Arial 8
 * passen auf A4 quer neben ihn (Audit 11/2026, EXP-04).
 */
export const FUSS_MAX = 110
const TITEL_MIN = 20
const ORGANISATION_MIN = 12

/**
 * Fußzeile (Kap. 10.2) ohne Seitenangabe — die setzt jedes Format selbst.
 * Wird sie länger als `max`, kürzt sie zuerst den Dokumenttitel, dann die
 * Organisation, jeweils mit „…"; Revision und Zahl der weiteren Dokumente
 * bleiben ganz, solange das reicht. Die Export-ID bleibt immer ganz — an ihr
 * findet man den Stand (im LibreOffice-Druck stand sonst „DC-2026-1…").
 */
export function fussText(d: Datenstand, max = FUSS_MAX): string {
  const laenge = (s: string) => Array.from(s).length
  let titel = d.haupt ? d.haupt.titel || d.haupt.name : undefined
  let organisation = d.organisation
  let dokument = () => dokumentKurz(d, titel)
  const text = () => [organisation, L.product, dokument(), d.exportId].filter(Boolean).join(' · ')
  const zuviel = () => laenge(text()) - max
  if (titel !== undefined && zuviel() > 0) titel = auslassung(titel, Math.max(TITEL_MIN, laenge(titel) - zuviel()))
  if (zuviel() > 0) organisation = auslassung(organisation, Math.max(ORGANISATION_MIN, laenge(organisation) - zuviel()))
  // Reicht das nicht (lange Revisionsangabe, viele weitere Dokumente), gibt die Dokumentangabe hinten nach
  if (zuviel() > 0) {
    const kurz = auslassung(dokument(), Math.max(1, laenge(dokument()) - zuviel()))
    dokument = () => kurz
  }
  return auslassung(text(), max)
}

export const LABELS = L
