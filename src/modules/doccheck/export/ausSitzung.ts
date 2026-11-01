import type { Befund } from '../pruefung/befund'
import type { SitzungsDok } from '../sitzung'
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

/** Laufende Nummer der Export-ID je Tag (Kap. 10.1: `DC-2026-10-31-0007`). */
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

export function exportDokumente(docs: SitzungsDok[]): ExportDokument[] {
  return docs
    .filter((d) => d.status === 'fertig' && d.z)
    .sort((a, b) => (a.rolle === b.rolle ? 0 : a.rolle === 'review' ? -1 : 1))
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

export function exportEingabe(a: {
  docs: SitzungsDok[]
  paketBefunde: Befund[]
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
    dokumente: exportDokumente(a.docs),
    befunde: [...pruef.flatMap((d) => d.z!.pruefung!.befunde.map((b) => ({ ...b, dokName: d.felder.titel || d.name }))), ...a.paketBefunde],
    ampeln: pruef.map((d) => ({ dokId: d.id, gruppen: Object.fromEntries(Object.entries(d.z!.pruefung!.ampel).filter(([, v]) => v && Object.keys(v).length)) as ExportEingabe['ampeln'][number]['gruppen'] })),
  }
}
