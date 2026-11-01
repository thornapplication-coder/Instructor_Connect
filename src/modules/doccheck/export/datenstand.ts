import type { Ampel, Befund, Kategorie, Prioritaet } from '../pruefung/befund'
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

export type Gesamt = 'ready' | 'afterCorrection' | 'notReady'

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

export interface Datenstand {
  exportId: string
  datum: string
  layout: string
  appVersion: string
  organisation: string
  art: 'erst' | 'revision'
  pruefer: { name: string; funktion: string }
  bibliothek: string
  /** Hauptdokument: das erste Prüfdokument */
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
  /** Ampel je Prüfdokument: Gruppe → Prüfpunkt → Ampel */
  ampeln: { dokId: string; gruppen: Record<string, Record<string, Ampel>> }[]
}

const RANG: Record<Prioritaet, number> = { High: 0, Medium: 1, Low: 2 }

/** „S. 12", „ca. 3", „12 (±1)", „6-04-15 Page 2" → erste Zahl; ohne Zahl ganz ans Ende. */
export function seitenZahl(label: string | undefined): number {
  const m = label?.match(/\d+/)
  return m ? Number(m[0]) : Number.MAX_SAFE_INTEGER
}

/** Export-ID nach Kap. 10.1: `DC-2026-10-31-0007`. */
export function exportId(datum: string, laufnummer: number): string {
  return `DC-${datum.slice(0, 10)}-${String(Math.max(1, laufnummer)).padStart(4, '0')}`
}

/** Dateinamen-Stamm nach Kap. 10.2: `2026-10-31_Review_<Document>_Rev<No>`. */
export function dateiStamm(datum: string, dok: ExportDokument | null): string {
  const sauber = (s: string) => s.replace(/[^\p{L}\p{N}.-]+/gu, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
  const name = sauber(dok ? dok.nummer || dok.titel || dok.name.replace(/\.[a-z0-9]+$/i, '') : 'Package') || 'Document'
  const rev = sauber((dok?.revision ?? '').replace(/^(?:Rev(?:ision)?\.?|R)\s*/i, '')) || 'NA'
  return `${datum.slice(0, 10)}_Review_${name}_Rev${rev}`
}

/**
 * Gesamtbewertung als VORSCHLAG aus den regelbasierten Befunden: offene
 * Hoch-Befunde → nicht einreichungsfähig; sonst jeder offene Befund →
 * nach Korrektur. Bestätigt wird sie vom Prüfer (Dropdown im Excel).
 */
export function gesamtVorschlag(befunde: Pick<Befund, 'prioritaet'>[]): Gesamt {
  if (befunde.some((b) => b.prioritaet === 'High')) return 'notReady'
  return befunde.length ? 'afterCorrection' : 'ready'
}

const korrektur = (schluessel?: string) => (schluessel ? ((en.anleitung as Record<string, string>)[schluessel] ?? '') : '')
const punktName = (p: string) => (en.punkt as Record<string, string>)[p] ?? p
const gruppenName = (g: string) => ((en.gate as Record<string, unknown>)[g] as string | undefined) ?? g

/** Präfix der Befund-IDs je Dokument: Typ (TM, PLM …), sonst DOC1, DOC2; Paketbefunde PKG. */
function praefixe(dokumente: ExportDokument[]): Map<string, string> {
  const out = new Map<string, string>()
  const vergeben = new Map<string, number>()
  dokumente.forEach((d, i) => {
    const basis = (d.typ || `DOC${i + 1}`).toUpperCase().replace(/[^A-Z0-9]+/g, '') || `DOC${i + 1}`
    const n = (vergeben.get(basis) ?? 0) + 1
    vergeben.set(basis, n)
    out.set(d.id, n === 1 ? basis : `${basis}${n}`)
  })
  return out
}

export function datenstand(e: ExportEingabe): Datenstand {
  const pruef = e.dokumente.filter((d) => d.rolle === 'review')
  const haupt = pruef[0] ?? null
  const dok = new Map(e.dokumente.map((d) => [d.id, d]))
  const praefix = praefixe(pruef)
  const reihenfolge = new Map(e.dokumente.map((d, i) => [d.id, i]))

  // Dokument → Seite → Priorität (Kap. 10.2); Paketbefunde ohne eigenes Dokument zuletzt
  const sortiert = [...e.befunde].sort(
    (a, b) =>
      (reihenfolge.get(a.dokId) ?? 1e9) - (reihenfolge.get(b.dokId) ?? 1e9) ||
      seitenZahl(a.fundstellen.find((f) => f.seite)?.seite) - seitenZahl(b.fundstellen.find((f) => f.seite)?.seite) ||
      RANG[a.prioritaet] - RANG[b.prioritaet] ||
      a.id.localeCompare(b.id),
  )
  const zaehler = new Map<string, number>()
  const befunde: ExportBefund[] = sortiert.map((b) => {
    const d = dok.get(b.dokId)
    const p = praefix.get(b.dokId) ?? 'PKG'
    const n = (zaehler.get(p) ?? 0) + 1
    zaehler.set(p, n)
    const id = `${p}-${String(n).padStart(3, '0')}`
    const f = b.fundstellen.find((x) => x.seite) ?? b.fundstellen[0]
    const spalten = [
      id,
      d ? d.titel || d.name : b.dokName,
      d?.nummer ?? '',
      d ? [d.revision, d.datum].filter(Boolean).join(' / ') : '',
      f?.ort ?? '',
      f?.seite ?? '',
      '',
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

  const ampeln: AmpelZeile[] = e.ampeln.flatMap((a) => {
    const name = dok.get(a.dokId)?.titel || dok.get(a.dokId)?.name || a.dokId
    return Object.entries(a.gruppen).flatMap(([g, punkte]) => Object.entries(punkte).map(([p, ampel]) => ({ dokument: name, gruppe: gruppenName(g), punkt: punktName(p), ampel })))
  })

  // Top 5: wichtigste zuerst, bei Gleichstand in Export-Reihenfolge
  const top5 = [...befunde]
    .map((b, i) => ({ b, i }))
    .sort((x, y) => RANG[x.b.prioritaet] - RANG[y.b.prioritaet] || x.i - y.i)
    .slice(0, 5)
    .map((x) => x.b.id)

  return {
    exportId: exportId(e.datum, e.laufnummer),
    datum: e.datum.slice(0, 10),
    layout: EXPORT_LAYOUT_VERSION,
    appVersion: e.appVersion,
    organisation: e.organisation.trim(),
    art: e.art,
    pruefer: e.pruefer,
    bibliothek: e.bibliothek,
    haupt,
    dokumente: e.dokumente,
    befunde,
    zaehlung,
    zuPruefen: befunde.filter((b) => b.verifizierung.startsWith('To verify')).length,
    ampeln,
    gesamt: gesamtVorschlag(befunde),
    top5,
    dateiStamm: dateiStamm(e.datum, haupt),
  }
}

/** Review Identification Block (Kap. 10.2) — gleiche Felder in Excel, Word und PowerPoint. */
export function kennung(d: Datenstand): [string, string][] {
  const h = d.haupt
  const masters = d.dokumente.filter((x) => x.rolle !== 'review').length
  return [
    ...(d.organisation ? ([[L.ident.organisation, d.organisation]] as [string, string][]) : []),
    [L.ident.document, h ? [h.titel || h.name, h.nummer, h.revision, h.datum].filter(Boolean).join(' · ') : '—'],
    [L.ident.reviewType, L.reviewType[d.art]],
    [L.ident.reviewDate, d.datum],
    [L.ident.reviewedBy, [d.pruefer.name, d.pruefer.funktion].filter(Boolean).join(', ')],
    [L.ident.library, d.bibliothek],
    [L.ident.masters, `${masters} (see “${L.sheets.sources}”)`],
    [L.ident.checks, L.checks.join(', ')],
    [L.ident.models, L.noModel],
    [L.ident.overall, L.overall[d.gesamt]],
    [L.ident.exportId, d.exportId],
    [L.ident.versions, `InstructorConnect ${d.appVersion} · Layout ${d.layout}`],
    [L.ident.disclaimer, L.disclaimer],
  ]
}

/** Fußzeile (Kap. 10.2) ohne Seitenangabe — die setzt jedes Format selbst. */
export function fussText(d: Datenstand): string {
  const h = d.haupt
  const dokument = h ? `${h.titel || h.name}${h.revision ? ` Rev ${h.revision.replace(/^(?:Rev(?:ision)?\.?|R)\s*/i, '')}` : ''}` : 'Package'
  return [d.organisation, L.product, dokument, d.exportId].filter(Boolean).join(' · ')
}

export const LABELS = L
