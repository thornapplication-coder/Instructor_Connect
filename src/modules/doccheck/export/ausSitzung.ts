import { lokalIso } from '../../../datum'
import { lesestand, type Befund } from '../pruefung/befund'
import { offenePflichtfelder, type Feld, type SitzungsDok } from '../sitzung'
import { paketVergleich } from '../paket/struktur'
import type { ExportDokument, ExportEingabe } from './datenstand'

/**
 * Brücke von der Sitzung zum Export-Datenstand. Rein, damit testbar, was
 * in den Export kommt: nur FERTIG gelesene Dokumente, nur Befunde von
 * Prüfdokumenten (plus Paketbefunde, wenn der Paketmodus läuft).
 *
 * Hochgeladene Master-Dokumente sind in der Sandbox Sitzungsdokumente —
 * „Session document – not released" (Spez. 7.2), nicht Bibliothek: Die
 * Bibliothek ist ein freigegebener Bestand, ein Upload ist es nicht.
 */

type Ablage = Pick<Storage, 'getItem' | 'setItem'>
export const LAUF_KEY = 'dc-export-lauf'

/** Laufende Nummer der Export-ID je Tag (Kap. 10.1: `DC-2026-10-31-0007`) — der Tag steht vorn in `datum`, aus `exportZeitpunkt` der lokale. */
export function naechsteLaufnummer(ablage: Ablage, datum: string): number {
  const tag = datum.slice(0, 10)
  let n = 1
  try {
    const alt = JSON.parse(ablage.getItem(LAUF_KEY) ?? 'null') as { tag?: string; n?: number } | null
    if (alt?.tag === tag && typeof alt.n === 'number') n = alt.n + 1
  } catch {
    /* kaputter Eintrag → neu zählen */
  }
  try {
    ablage.setItem(LAUF_KEY, JSON.stringify({ tag, n }))
  } catch {
    /* ohne Speicher gilt die Nummer nur für diesen Export */
  }
  return n
}

/**
 * Datum und Laufnummer eines neuen Exports — für die Sitzung UND für den
 * geladenen Prüfstand, damit beide denselben Tag zählen.
 *
 * Ortszeit mit Versatz (`lokalIso`), nicht `toISOString()`: Export-ID,
 * Review date, Dateiname und Laufnummer schneiden den Tag mit `slice(0,
 * 10)` heraus, und das war der UTC-Tag — um 00:30 in Wien stand überall
 * der Vortag, und die Laufnummer zählte über Mitternacht weiter (Audit
 * 11/2026, EXM-01).
 */
export function exportZeitpunkt(jetzt: number, ablage: Ablage): { datum: string; laufnummer: number } {
  const datum = lokalIso(jetzt)
  return { datum, laufnummer: naechsteLaufnummer(ablage, datum) }
}

/**
 * Prüfer für Kennung, Bericht, Briefing und Prüfstand: der Name aus dem
 * Konto, die Funktion NUR, wenn eine eingetragen ist. „Function" meint die
 * Funktion in der ATO (Spez. 10.2: „Name, Function"), nicht die Rolle in
 * der App — vorher stand in jedem Export „Reviewed by: …, Superadmin", ein
 * Mitglied erschiene als „…, Member" (Audit 11/2026, EXP-13). Die Eingabe
 * im Reiter Prüfung gehört zur KI-Prüfung (Phase 4); bis sie in die
 * Sitzung kommt, bleibt die Funktion leer, statt geraten zu werden.
 */
export function prueferAus(konto: { name: string } | null | undefined, funktion?: string): { name: string; funktion: string } {
  return { name: konto?.name.trim() ?? '', funktion: funktion?.trim() ?? '' }
}

/**
 * Dokumente des Exports: Prüfdokumente vor Master-Dokumenten; im
 * Paketmodus die Prüfdokumente in der Reihenfolge des Pakets (Ebene,
 * Kürzel) statt in der des Hochladens. Das erste ist das Hauptdokument in
 * Kennung, Fußzeile, Dateiname und auf der Titelfolie — vorher stand dort
 * ein zuerst geladener Annex ohne einen einzigen Befund, das Training
 * Manual erst an vierter Stelle (Audit 11/2026, EXP-08). Die Reihenfolge
 * steht damit auch im Prüfstand, ein geladener Stand nennt dasselbe
 * Hauptdokument.
 */
export function exportDokumente(docs: SitzungsDok[], paketModus = false): ExportDokument[] {
  const vorn = (d: SitzungsDok) => (d.rolle === 'review' ? 0 : 1)
  return docs
    .filter((d) => d.status === 'fertig' && d.z)
    .sort((a, b) => vorn(a) - vorn(b) || (paketModus && a.paket && b.paket ? paketVergleich(a.paket, b.paket) : 0))
    .map((d) => ({
      id: d.id,
      rolle: d.rolle === 'review' ? 'review' : 'session',
      name: d.name,
      typ: d.felder.typ,
      titel: d.felder.titel,
      nummer: d.felder.nummer,
      revision: d.felder.revision,
      datum: d.felder.datum,
      rang: d.rolle === 'master' ? d.felder.rang : '',
      seiten: d.z!.seiten,
      sha256: d.z!.sha256,
    }))
}

/** Ein Prüfdokument des Exports mit offener Pflichtangabe. */
export interface PflichtLuecke {
  id: string
  name: string
  felder: Feld[]
  /** Hauptdokument des Exports — nur dessen Revision steht im Dateinamen („…_RevNA") */
  haupt: boolean
}

/**
 * Prüfdokumente des Exports, denen eine Pflichtangabe fehlt — Spez. 11.2:
 * „Jedes Prüfdokument hat die Pflichtangabe Revision". Die Dokumentkarte
 * warnte, der Export-Reiter nicht: Ein Bericht ohne Revision ging wortlos
 * hinaus, der Dateiname trug „RevNA" (Audit 11/2026, DC-17). Der Rückfall
 * „NA" bleibt — es fehlte nur die Warnung dort, wo der Bericht entsteht.
 *
 * Dieselbe Regel wie die Karte (`offenePflichtfelder`), dieselben
 * Dokumente in derselben Reihenfolge wie der Export (`exportDokumente`),
 * damit `haupt` das Dokument trifft, das im Dateinamen steht. Gezählt
 * wird das FELD: Eine Revision aus dem Dateinamen (`revisionAusDateiname`)
 * legt `fertig` schon hinein, und nur das Feld kommt in den Export — ein
 * geleertes Feld ist eine Lücke, auch wenn der Dateiname eine Revision trüge.
 */
export function pflichtLuecken(docs: SitzungsDok[], paketModus = false): PflichtLuecke[] {
  const nachId = new Map(docs.map((d) => [d.id, d]))
  return exportDokumente(docs, paketModus)
    .filter((e) => e.rolle === 'review')
    .flatMap((e, i) => {
      const d = nachId.get(e.id)!
      const felder = offenePflichtfelder(d)
      return felder.length ? [{ id: d.id, name: d.felder.titel.trim() || d.name, felder, haupt: i === 0 }] : []
    })
}

export function exportEingabe(a: {
  docs: SitzungsDok[]
  /** Prüfen als Paket — ordnet die Prüfdokumente nach der Paketstruktur (EXP-08) */
  paketModus?: boolean
  paketBefunde: Befund[]
  /** Paketmodus mit Ergebnis — nur dann steht die Paketprüfung unter „Checks performed" (EXP-01) */
  paketGeprueft: boolean
  datum: string
  laufnummer: number
  appVersion: string
  organisation: string
  pruefer: { name: string; funktion: string }
  bibliothek: string
}): ExportEingabe {
  const pruef = a.docs.filter((d) => d.rolle === 'review' && d.status === 'fertig' && d.z?.pruefung)
  return {
    datum: a.datum,
    laufnummer: a.laufnummer,
    appVersion: a.appVersion,
    organisation: a.organisation,
    art: 'erst',
    pruefer: a.pruefer,
    bibliothek: a.bibliothek,
    dokumente: exportDokumente(a.docs, a.paketModus),
    befunde: [...pruef.flatMap((d) => d.z!.pruefung!.befunde.map((b) => ({ ...b, dokName: d.felder.titel || d.name }))), ...a.paketBefunde],
    // Nur Gruppen, die gelaufen sind — daraus entsteht auch „Checks performed" (EXP-01/DC-12)
    ampeln: pruef.map((d) => ({ dokId: d.id, gruppen: Object.fromEntries(Object.entries(d.z!.pruefung!.ampel).filter(([, v]) => v && Object.keys(v).length)) as ExportEingabe['ampeln'][number]['gruppen'] })),
    // Ein Scan ohne Texterkennung ist nicht „ready" (DC-03)
    lesestand: lesestand(pruef.map((d) => d.z!)),
    paketGeprueft: a.paketGeprueft,
  }
}
