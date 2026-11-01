import type { DocPage } from '../parse/model'
import { AMC_GM, IR, CS, normalisieren, regelIds } from '../parse/regeln'
import { ampelAus, type Ampel, type Befund, type Fundstelle } from './befund'
import { befund, editierabstand, type PruefKontext } from './kontext'

/**
 * Prüfung der Regelwerksverweise (Nachtrag N8): Jede Regel-ID im
 * Prüfdokument wird gegen die Regeln geprüft, die in den geladenen
 * Regelwerks-Dokumenten DEFINIERT sind — heute Master- und
 * Sitzungsdokumente (z. B. ein EAR-Auszug), mit Phase 3 die Bibliothek.
 *
 * - ID existiert, Absatz auch → „Verified (rule-based)", kein Befund
 * - ID oder Absatz fehlt → „To verify" mit der nächstliegenden ID
 * - Regelwerk nicht geladen → „To verify – source not in library"
 *
 * Keine erfundenen Regelzitate: DocCheck behauptet nie, eine Regel sage
 * etwas — nur, ob es sie im geladenen Stand gibt.
 */

export const REGELWERK_PUNKTE = ['regelids', 'absaetze', 'quelle'] as const

export interface RegelQuelle {
  titel: string
  pages: DocPage[]
}

export interface RegelEintrag {
  /** „ORA.ATO.125", „AMC1 ORA.ATO.125", „CS-FCD.100" */
  schluessel: string
  familie: string
  absaetze: Set<string>
  quelle: string
}

export interface RegelIndex {
  eintraege: Map<string, RegelEintrag>
  familien: Set<string>
  quellen: string[]
}

export interface Verweis {
  /** „AMC1" / „GM2" / leer */
  art: string
  basis: string
  absaetze: string[]
  text: string
}

/** „AMC1 ORA.ATO.230(a)(1)" → Art, Basis, Absätze. */
export function zerlegen(id: string): Verweis {
  const m = id.match(/^((?:AMC|GM)\d*)\s+(.*)$/)
  const art = m?.[1] ?? ''
  const rest = m?.[2] ?? id
  const basis = rest.replace(/(?:\([a-z0-9]+\))+$/i, '')
  const absaetze = rest.slice(basis.length).match(/\([a-z0-9]+\)/gi) ?? []
  return { art, basis: basis.trim(), absaetze, text: id }
}

/** Regelwerksfamilie: „ORA.ATO.125" → „ORA.ATO", „FCL.725" → „FCL", „MED.B.001" → „MED.B", „CS-FCD.100" → „CS-FCD". */
export function familie(basis: string): string {
  if (basis.startsWith('CS')) return basis.match(/^CS-(?:[A-Z]+|\d+)/)?.[0] ?? basis
  // Alles ab der Nummer weg: „FCL.740.A" → „FCL", „CAT.OP.MPA.150" → „CAT.OP.MPA"
  return basis.replace(/\.\d{3,4}.*$/, '')
}

const schluessel = (v: Pick<Verweis, 'art' | 'basis'>) => (v.art ? `${v.art} ${v.basis}` : v.basis)
const REGEL_AM_ANFANG = new RegExp(`^(?:${AMC_GM.source}|${IR.source}|${CS.source})`)
// Absatzmarke am Zeilenanfang — auch allein auf der Zeile, wie in PDF-Auszügen üblich
const ABSATZ = /^((?:\((?:[a-z]|[ivx]+|\d+)\))+)(?:\s|$)/
const ROEMISCH = /^\((?:i|ii|iii|iv|v|vi|vii|viii|ix|x)\)$/

/**
 * Index der in den Quellen DEFINIERTEN Regeln: Zeilen, die mit einer
 * Regel-ID beginnen (Überschrift), dazu deren Absätze (a) → (1) → (i).
 * Erwähnungen mitten im Text definieren nichts — ein Regelwerk zitiert
 * andere Regeln, ohne sie zu enthalten.
 */
export function regelIndex(quellen: RegelQuelle[]): RegelIndex {
  const eintraege = new Map<string, RegelEintrag>()
  for (const q of quellen) {
    let akt: RegelEintrag | null = null
    let e1 = ''
    let e2 = ''
    for (const p of q.pages)
      for (const roh of p.text.split('\n')) {
        const z = roh.trim()
        const kopf = z.match(REGEL_AM_ANFANG)
        if (kopf) {
          const v = zerlegen(normalisieren(kopf[0]).replace(/(?:\([a-z0-9]+\))+$/i, ''))
          const k = schluessel(v)
          akt = eintraege.get(k) ?? { schluessel: k, familie: familie(v.basis), absaetze: new Set(), quelle: q.titel }
          eintraege.set(k, akt)
          // „GM1 ORA.ATO.230(a)" ist die Leitlinie ZU Absatz (a) — dieser Absatz existiert
          const inKopf = normalisieren(kopf[0]).match(/(?:\([a-z0-9]+\))+$/i)?.[0]
          if (inKopf) akt.absaetze.add(inKopf)
          e1 = e2 = ''
          continue
        }
        const a = akt && z.match(ABSATZ)
        if (!a || !akt) continue
        for (const t of a[1].match(/\([^)]+\)/g)!) {
          // (i) nach einer Ziffer ist römisch (Ebene 3), sonst ein Buchstabe.
          // Mehrdeutig ist der Buchstabe, der auf den aktuellen folgt — etwa
          // (i) nach (h)(2): Dann gelten beide Lesarten, statt einen echten
          // Absatz (i) als „not found" zu melden (Fachprüfung 01.11.2026).
          const naechster = e1 ? `(${String.fromCharCode(e1.charCodeAt(1) + 1)})` : ''
          if (/^\(\d+\)$/.test(t) && e1) {
            e2 = `${e1}${t}`
            akt.absaetze.add(e2)
          } else if (ROEMISCH.test(t) && e2) {
            akt.absaetze.add(`${e2}${t}`)
            if (t === naechster) akt.absaetze.add(t)
          } else if (/^\([a-z]\)$/.test(t)) {
            e1 = t
            e2 = ''
            akt.absaetze.add(e1)
          }
        }
      }
  }
  const familien = new Set([...eintraege.values()].map((e) => e.familie))
  return { eintraege, familien, quellen: [...new Set([...eintraege.values()].map((e) => e.quelle))] }
}

export type Ergebnis = { status: 'verified' } | { status: 'unbelegt' } | { status: 'fehlt'; naechste?: string } | { status: 'absatz'; vorhanden: string[] } | { status: 'quelle' }

/** Nächstliegende ID derselben Art und Familie — Hinweis, kein Ersatz. */
function naechste(v: Verweis, index: RegelIndex): string | undefined {
  const kandidaten = [...index.eintraege.values()].filter((e) => e.familie === familie(v.basis) && e.schluessel.startsWith(v.art))
  return kandidaten.sort((a, b) => editierabstand(a.schluessel, schluessel(v)) - editierabstand(b.schluessel, schluessel(v)))[0]?.schluessel
}

export function verweisPruefen(id: string, index: RegelIndex): Ergebnis {
  const v = zerlegen(id)
  if (!index.familien.has(familie(v.basis))) return { status: 'quelle' }
  const e = index.eintraege.get(schluessel(v))
  if (!e) return { status: 'fehlt', naechste: naechste(v, index) }
  if (!v.absaetze.length) return { status: 'verified' }
  // Ohne erfasste Absätze lässt sich ein Absatzverweis weder widerlegen noch
  // belegen — „nicht widerlegbar", nicht „verified" (Fachprüfung 01.11.2026)
  if (!e.absaetze.size) return { status: 'unbelegt' }
  const pfad = v.absaetze.join('')
  return e.absaetze.has(pfad) ? { status: 'verified' } : { status: 'absatz', vorhanden: [...e.absaetze].filter((a) => !a.slice(3).includes('(')).sort() }
}

export interface RegelwerkStand {
  quellen: string[]
  verweise: number
  verifiziert: number
  /** Regel vorhanden, Absatz im Auszug nicht erfasst — weder belegt noch widerlegt */
  nichtWiderlegbar: number
  zuPruefen: number
  ohneQuelle: number
}

export function regelwerkPruefung(k: PruefKontext, index: RegelIndex): { befunde: Omit<Befund, 'id'>[]; ampel: Record<string, Ampel>; stand: RegelwerkStand } {
  const befunde: Omit<Befund, 'id'>[] = []
  const stand: RegelwerkStand = { quellen: index.quellen, verweise: 0, verifiziert: 0, nichtWiderlegbar: 0, zuPruefen: 0, ohneQuelle: 0 }
  // Ohne geladenes Regelwerk ist nichts prüfbar — nicht anwendbar statt hunderter „To verify"
  if (!index.eintraege.size) return { befunde, ampel: ampelAus([...REGELWERK_PUNKTE], [], [...REGELWERK_PUNKTE]), stand }
  const ohne = new Map<string, Fundstelle[]>()
  const gesehen = new Set<string>()
  for (const p of k.roh.pages) {
    for (const z of p.text.split('\n')) {
      for (const id of regelIds(z)) {
        stand.verweise++
        const r = verweisPruefen(id, index)
        const fs: Fundstelle = { seite: p.label ?? String(p.index), auszug: z.trim() }
        if (r.status === 'verified') stand.verifiziert++
        else if (r.status === 'unbelegt') stand.nichtWiderlegbar++
        else if (r.status === 'quelle') {
          stand.ohneQuelle++
          const f = familie(zerlegen(id).basis)
          ohne.set(f, [...(ohne.get(f) ?? []), fs])
        } else {
          stand.zuPruefen++
          // Jede falsche ID nur einmal je Dokument melden, mit allen Fundstellen
          if (gesehen.has(id)) {
            befunde.find((b) => b.text.startsWith(`Rule reference ${id} `))?.fundstellen.push(fs)
            continue
          }
          gesehen.add(id)
          const text =
            r.status === 'fehlt'
              ? `Rule reference ${id} not found in the loaded regulation (${index.quellen.join(', ')}).${r.naechste ? ` Nearest existing: ${r.naechste}.` : ''}`
              : `Rule reference ${id} — paragraph not found. ${zerlegen(id).art ? `${zerlegen(id).art} ` : ''}${zerlegen(id).basis} has ${r.vorhanden.join(', ')}.`
          befunde.push({ ...befund(k, { quelle: 'regelwerk', pruefpunkt: r.status === 'fehlt' ? 'regelids' : 'absaetze', kategorie: 'Inconsistency', prioritaet: 'Medium', text, fundstellen: [fs] }), verifizierung: 'To verify' })
        }
      }
    }
  }
  for (const [f, fs] of ohne) {
    befunde.push({ ...befund(k, { quelle: 'regelwerk', pruefpunkt: 'quelle', kategorie: 'Document Control', prioritaet: 'Low', text: `${fs.length} rule reference${fs.length === 1 ? '' : 's'} to ${f} cannot be verified: source not in library.`, fundstellen: fs }), verifizierung: 'To verify – source not in library' })
  }
  return { befunde, ampel: ampelAus([...REGELWERK_PUNKTE], befunde as Befund[]), stand }
}
