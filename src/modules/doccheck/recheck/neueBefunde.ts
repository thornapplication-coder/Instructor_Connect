import type { Befund, Prioritaet } from '../pruefung/befund'
import { vergleichsform } from '../parse/seitenzuordnung'
import type { ReErgebnis } from './pruefen'
import type { Ziel } from './fremdliste'

/**
 * Neue Befunde beim Re-Check (Nachtrag N3.1 Schritt 6, N3.5, Kap. 13.3):
 * Was DocCheck im aktuellen Paket findet und in der Fremdliste noch nicht
 * steht, kommt GETRENNT dazu — als eigenes Blatt, nicht als Zeilen der
 * fremden Liste —, fortlaufend nummeriert im Anschluss an deren höchste
 * Nummer.
 *
 * Dublettenregel (N3.4, N10.3, Kap. 13.3): Eine Restfundstelle eines alten
 * Befunds steht in dessen Remark und wird NIE zusätzlich als neuer Befund
 * geführt. Sonst stünde derselbe Mangel zweimal in der Liste, einmal als
 * „Not resolved" und einmal als neu — und beide würden getrennt abgearbeitet.
 */

export interface NeuerBefund {
  nr: string
  dokId: string
  /** Wert für die Spalte „Dokument/Bereich" — wie die Liste das Dokument nennt */
  dokument: string
  seite: string
  kapitel: string
  befund: string
  prioritaet: Prioritaet
  kategorie: Befund['kategorie']
  verifizierung: Befund['verifizierung']
}

/**
 * Nächste Nummern im Format der Liste: „20" → „21", „F-020" → „F-021",
 * „TM 7" → „TM 8". Maßgeblich ist die höchste Zahl am Ende einer Nummer;
 * Präfix und Stellenzahl kommen von der Nummer, die sie trägt. Ohne
 * Nummern in der Liste beginnt die Zählung bei 1.
 */
export function naechsteNummern(refs: string[], n: number): string[] {
  let bester: { praefix: string; zahl: number; stellen: number } = { praefix: '', zahl: 0, stellen: 1 }
  for (const r of refs) {
    const m = r.trim().match(/^(.*?)(\d+)$/)
    if (!m || r.trim().startsWith('#')) continue
    const zahl = Number(m[2])
    if (zahl > bester.zahl) bester = { praefix: m[1], zahl, stellen: m[2].length }
  }
  return Array.from({ length: n }, (_, i) => `${bester.praefix}${String(bester.zahl + i + 1).padStart(bester.stellen, '0')}`)
}

/** Ist diese Fundstelle eine Restfundstelle eines alten Befunds? */
export function istRest(dokId: string, auszug: string, ergebnisse: ReErgebnis[]): boolean {
  const a = vergleichsform(auszug)
  if (!a) return false
  return ergebnisse.some((e) =>
    e.rest.some((r) => {
      if (r.dokId !== dokId) return false
      const b = vergleichsform(r.auszug)
      // Auszüge sind unterschiedlich lang geschnitten — Enthaltensein in
      // beide Richtungen. Der KÜRZERE muss mindestens 8 Zeichen haben: Ein
      // Stummel wie „PF" steckt in fast jedem Rest und verschluckte sonst
      // einen echten neuen Befund.
      return Math.min(a.length, b.length) >= 8 && (a.includes(b) || b.includes(a))
    }),
  )
}

/** Wie nennt die Liste dieses Dokument? Der erste Wert der Spalte „Dokument", der darauf zeigt. */
export function dokumentWert(dokId: string, ziele: Record<string, Ziel>, ersatz: string): string {
  const treffer = Object.entries(ziele).find(([, z]) => z.art === 'dok' && z.ids.includes(dokId))
  return treffer?.[0] ?? ersatz
}

const RANG: Record<Prioritaet, number> = { High: 0, Medium: 1, Low: 2 }

export function neueBefundeFuer(
  befunde: Befund[],
  ergebnisse: ReErgebnis[],
  refs: string[],
  ziele: Record<string, Ziel>,
): { liste: NeuerBefund[]; ausgenommen: number } {
  let ausgenommen = 0
  const bleiben = befunde.filter((b) => {
    // Ein Befund ohne Fundstelle außerhalb der Reste ist ganz eine Dublette
    const eigene = b.fundstellen.filter((f) => !istRest(b.dokId, f.auszug, ergebnisse))
    if (b.fundstellen.length && !eigene.length) {
      ausgenommen++
      return false
    }
    return true
  })
  // Wichtigstes zuerst, innerhalb gleicher Priorität nach Dokument — die
  // Nummern sollen nicht davon abhängen, in welcher Reihenfolge der Worker lieferte
  const sortiert = [...bleiben].sort((a, b) => RANG[a.prioritaet] - RANG[b.prioritaet] || a.dokName.localeCompare(b.dokName) || a.id.localeCompare(b.id))
  const nummern = naechsteNummern(refs, sortiert.length)
  const liste = sortiert.map((b, i) => {
    const f = b.fundstellen.find((x) => !istRest(b.dokId, x.auszug, ergebnisse)) ?? b.fundstellen[0]
    return {
      nr: nummern[i],
      dokId: b.dokId,
      dokument: dokumentWert(b.dokId, ziele, b.dokName),
      seite: f?.seite ?? '',
      kapitel: f?.ort ?? '',
      befund: b.text,
      prioritaet: b.prioritaet,
      kategorie: b.kategorie,
      verifizierung: b.verifizierung,
    }
  })
  return { liste, ausgenommen }
}
