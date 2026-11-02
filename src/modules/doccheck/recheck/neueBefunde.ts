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

/** Trenner der Prüfungen, deren Auszug „<Treffer> — <Kontext>" lautet (Reste, Platzhalter, Glossar, Formalprüfung). */
const TRENNER = ' — '

/**
 * Nötige Überlappung zweier Vergleichsformen: 20 Zeichen, bei kurzen
 * Auszügen 80 % des kürzeren. Der KÜRZERE muss mindestens 8 Zeichen haben:
 * Ein Stummel wie „PF" steckt in fast jedem Rest und verschluckte sonst
 * einen echten neuen Befund.
 */
function noetig(a: string, b: string): number {
  const kuerzer = Math.min(a.length, b.length)
  return kuerzer < 8 ? Infinity : Math.min(20, Math.ceil(kuerzer * 0.8))
}

/** Haben a und b eine gemeinsame Teilzeichenkette der Länge n? */
function ueberlappen(a: string, b: string, n: number): boolean {
  if (n > Math.min(a.length, b.length)) return false
  const [k, l] = a.length <= b.length ? [a, b] : [b, a]
  for (let i = 0; i + n <= k.length; i++) if (l.includes(k.slice(i, i + n))) return true
  return false
}

/**
 * Längste Übereinstimmung von a und b, die eine Stelle des Treffers t in a
 * mit einer in b deckt: vom Treffer aus nach links und rechts, solange beide
 * gleich laufen. So zählt nur DIESELBE Stelle — „TBD" in einem anderen
 * Absatz hat eine andere Umgebung.
 */
function umTreffer(a: string, b: string, t: string): number {
  let best = 0
  for (let i = a.indexOf(t); i >= 0; i = a.indexOf(t, i + 1)) {
    for (let j = b.indexOf(t); j >= 0; j = b.indexOf(t, j + 1)) {
      let links = 0
      while (i - links > 0 && j - links > 0 && a[i - links - 1] === b[j - links - 1]) links++
      let rechts = 0
      while (i + t.length + rechts < a.length && j + t.length + rechts < b.length && a[i + t.length + rechts] === b[j + t.length + rechts]) rechts++
      best = Math.max(best, links + t.length + rechts)
    }
  }
  return best
}

/**
 * Ist diese Fundstelle eine Restfundstelle eines alten Befunds?
 *
 * Auszüge sind verschieden geschnitten: Der Rest beginnt mitten im Satz
 * („…a/c is prepared"), der neue Befund trägt vorn seinen Treffer
 * („TBD — The a/c is prepared …"). Gegenseitiges Enthaltensein fand deshalb
 * dieselbe Stelle nicht, und derselbe Mangel stand zweimal in der Liste —
 * als „Not resolved" und auf „Neue Findings" (Audit 11/2026, DC-04). Jetzt
 * zählt die Überlappung; beim Format „<Treffer> — <Kontext>" muss der
 * Treffer der beanstandete Text des alten Befunds sein (`Fundstelle.text`)
 * und im Rest in derselben Umgebung stehen.
 */
export function istRest(dokId: string, auszug: string, ergebnisse: ReErgebnis[]): boolean {
  const k = auszug.indexOf(TRENNER)
  const treffer = k > 0 ? vergleichsform(auszug.slice(0, k)) : ''
  const kontext = vergleichsform(k > 0 ? auszug.slice(k + TRENNER.length) : auszug)
  const verankert = !!treffer && kontext.includes(treffer)
  // Ohne Treffer im Kontext (etwa Word-Check: „Text — Art (Farbe)") zählt jedes Stück für sich und das Ganze
  const stuecke = verankert ? [] : [...new Set([vergleichsform(auszug), treffer, kontext])].filter(Boolean)
  if (!verankert && !stuecke.length) return false
  return ergebnisse.some((e) =>
    e.rest.some((r) => {
      if (r.dokId !== dokId) return false
      const b = vergleichsform(r.auszug)
      if (verankert) {
        // Derselbe Mangel heißt derselbe beanstandete Text: Ein „the the" im Satz,
        // in dem ein alter „TBD"-Befund offen ist, ist ein eigener Befund — an der
        // Umgebung allein galt er als Dublette (Gegenprüfung Audit 11/2026, DC-04)
        const gesucht = vergleichsform(r.text ?? '')
        if (gesucht && !gesucht.includes(treffer) && !treffer.includes(gesucht)) return false
        return umTreffer(kontext, b, treffer) >= noetig(kontext, b)
      }
      return stuecke.some((s) => ueberlappen(s, b, noetig(s, b)))
    }),
  )
}

/**
 * Wie nennt die Liste dieses Dokument? Ein Wert der Spalte „Dokument",
 * dessen Ziel GENAU dieses Dokument ist (bei mehreren Schreibweisen wie
 * „APX 4"/„APPENDIX 4" die erste); sonst `ersatz` — das Paketkürzel, ohne
 * Kürzel der Titel. Ein Wert, der auf mehrere Dokumente zeigt, nennt keines
 * davon: Vorher gewann der erste Wert, der das Dokument ENTHIELT, und ein
 * Befund in APX 4 stand unter „TM", weil „TM" auf beide zeigte (Audit
 * 11/2026, DC-05).
 */
export function dokumentWert(dokId: string, ziele: Record<string, Ziel>, ersatz: string): string {
  const treffer = Object.entries(ziele).find(([, z]) => z.art === 'dok' && z.ids.length === 1 && z.ids[0] === dokId)
  return treffer?.[0] ?? ersatz
}

const RANG: Record<Prioritaet, number> = { High: 0, Medium: 1, Low: 2 }

export function neueBefundeFuer(
  befunde: Befund[],
  ergebnisse: ReErgebnis[],
  refs: string[],
  ziele: Record<string, Ziel>,
  /** Paketkürzel je Dokument — einheitliche Bezeichnung, wo kein Listenwert genau dieses Dokument meint */
  kuerzel: Record<string, string> = {},
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
      dokument: dokumentWert(b.dokId, ziele, kuerzel[b.dokId] || b.dokName),
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
