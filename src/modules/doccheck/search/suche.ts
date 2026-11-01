import MiniSearch from 'minisearch'
import type { DocPage } from '../parse/model'
import { regelIds } from '../parse/regeln'

/**
 * Suchindex über eingelesene Dokumente (Spez. 7.6).
 *
 * Zwei Indizes, weil zwei Arten von Fragen: Die Volltextsuche (MiniSearch,
 * unscharf, mit Wortanfängen) findet „battery bus failure" auch als
 * „battery buses". Für CAS-Meldungen („BATT 1 OFF BUS"), Zahlen mit Einheit
 * („155 KIAS") und Regel-IDs („AMC1 ORA.ATO.230") ist Unschärfe aber ein
 * Fehler: „BATT 2 OFF BUS" ist eine andere Meldung. Diese Treffer kommen aus
 * einem exakten Index und stehen vorn.
 */

export interface IndexDok {
  id: string
  titel: string
  pages: DocPage[]
}

interface Chunk {
  id: string
  docId: string
  docTitle: string
  seite: number
  label: string
  sectionPath: string
  regRefs: string
  text: string
}

export interface Treffer {
  docId: string
  docTitle: string
  seite: number
  label?: string
  ausschnitt: string
  exakt: boolean
  score: number
}

/** Seiten über ca. 1 500 Zeichen werden in überlappende Stücke geteilt. */
export const CHUNK = 1500
export const UEBERLAPPUNG = 200

export function stuecke(text: string): string[] {
  if (text.length <= CHUNK) return [text]
  const out: string[] = []
  for (let i = 0; i < text.length; i += CHUNK - UEBERLAPPUNG) {
    out.push(text.slice(i, i + CHUNK))
    if (i + CHUNK >= text.length) break
  }
  return out
}

const EINHEITEN = 'KIAS|KCAS|KTAS|KT|KTS|FT|FPM|NM|LBS?|KG|PSI|HPA|INHG|MB|°C|°F|%|RPM|VDC|VAC|A|V|SEC|MIN'
const ZAHL_EINHEIT = new RegExp(`\\b\\d+(?:[.,]\\d+)?\\s?(?:${EINHEITEN})\\b`, 'gi')
/** Folge großgeschriebener Wörter/Zahlen mit mindestens einem Wort aus Großbuchstaben. */
const GROSS_FOLGE = /\b[A-Z][A-Z0-9/-]+(?:\s+[A-Z0-9][A-Z0-9/-]*)*\b/g

const norm = (s: string) => s.replace(/\s+/g, ' ').trim()

/** Schlüssel für den exakten Index: Großbuchstaben-Wörter, Zahl+Einheit, Regel-IDs. */
export function exakteSchluessel(text: string): string[] {
  const out = new Set<string>()
  for (const m of text.matchAll(GROSS_FOLGE)) for (const w of m[0].split(/\s+/)) if (/[A-Z]{2}/.test(w)) out.add(w)
  for (const m of text.matchAll(ZAHL_EINHEIT)) out.add(norm(m[0]).toUpperCase().replace(/(\d)\s?([A-Z°%])/, '$1 $2'))
  for (const r of regelIds(text)) {
    out.add(r)
    // „AMC1 ORA.ATO.230(a)" soll auch unter „AMC1 ORA.ATO.230" stehen —
    // gesucht wird meist die Regel, nicht der Unterabsatz.
    out.add(r.replace(/(\([a-z0-9]+\))+$/, ''))
  }
  return [...out]
}

/** Ist die Anfrage eine Exaktsuche? CAS-artig, Zahl+Einheit oder Regel-ID. */
export function istExakt(q: string): boolean {
  const t = norm(q)
  if (regelIds(t).length && regelIds(t)[0] === t) return true
  if (new RegExp(`^${ZAHL_EINHEIT.source}$`, 'i').test(t)) return true
  return /^[A-Z0-9/-]+(?:\s+[A-Z0-9/-]+)+$/.test(t) && /[A-Z]{2}/.test(t)
}

function ausschnitt(text: string, pos: number, laenge: number): string {
  const von = Math.max(0, pos - 80)
  const bis = Math.min(text.length, pos + laenge + 80)
  return `${von > 0 ? '…' : ''}${norm(text.slice(von, bis))}${bis < text.length ? '…' : ''}`
}

export class Suchindex {
  private ms = new MiniSearch<Chunk>({
    fields: ['text', 'sectionPath', 'label', 'docTitle', 'regRefs'],
    storeFields: ['docId', 'docTitle', 'seite', 'label', 'text'],
    searchOptions: { boost: { regRefs: 3, sectionPath: 2 }, prefix: true, fuzzy: 0.2, combineWith: 'AND' },
  })
  private exakt = new Map<string, Set<string>>()
  private chunks = new Map<string, Chunk>()
  private docs = new Map<string, string[]>()

  hinzufuegen(d: IndexDok): void {
    this.entfernen(d.id)
    const ids: string[] = []
    for (const p of d.pages) {
      stuecke(p.text).forEach((text, i) => {
        const c: Chunk = {
          id: `${d.id}#${p.index}#${i}`,
          docId: d.id,
          docTitle: d.titel,
          seite: p.index,
          label: p.label ?? '',
          sectionPath: (p.sectionPath ?? []).join(' > '),
          regRefs: (p.regRefs ?? []).join(' '),
          text,
        }
        ids.push(c.id)
        this.chunks.set(c.id, c)
        for (const k of exakteSchluessel(text)) {
          let s = this.exakt.get(k)
          if (!s) this.exakt.set(k, (s = new Set()))
          s.add(c.id)
        }
      })
    }
    this.ms.addAll(ids.map((id) => this.chunks.get(id)!))
    this.docs.set(d.id, ids)
  }

  entfernen(docId: string): void {
    const ids = this.docs.get(docId)
    if (!ids) return
    for (const id of ids) {
      this.ms.discard(id)
      this.chunks.delete(id)
    }
    for (const [k, s] of this.exakt) {
      for (const id of ids) s.delete(id)
      if (!s.size) this.exakt.delete(k)
    }
    this.docs.delete(docId)
  }

  get anzahlDokumente(): number {
    return this.docs.size
  }

  /**
   * Exakte Treffer zuerst (Phrase wörtlich, Leerraum normalisiert), danach
   * die Volltexttreffer — ohne doppelte Seiten.
   */
  suchen(q: string, max = 20): Treffer[] {
    const anfrage = norm(q)
    if (!anfrage) return []
    const out: Treffer[] = []
    const gesehen = new Set<string>()
    const seiteKey = (c: Chunk) => `${c.docId}#${c.seite}`

    const schluessel = exakteSchluessel(anfrage)
    if (schluessel.length) {
      // Kandidaten = Schnittmenge über alle Schlüssel, dann Phrase prüfen.
      let kand: string[] | null = null
      for (const k of schluessel) {
        const s = this.exakt.get(k) ?? new Set<string>()
        kand = kand === null ? [...s] : kand.filter((x) => s.has(x))
      }
      for (const id of kand ?? []) {
        const c = this.chunks.get(id)!
        const flach = norm(c.text)
        const pos = flach.indexOf(anfrage)
        if (pos < 0 || gesehen.has(seiteKey(c))) continue
        gesehen.add(seiteKey(c))
        out.push({ docId: c.docId, docTitle: c.docTitle, seite: c.seite, label: c.label || undefined, ausschnitt: ausschnitt(flach, pos, anfrage.length), exakt: true, score: Infinity })
      }
      out.sort((a, b) => a.docTitle.localeCompare(b.docTitle) || a.seite - b.seite)
    }
    // Bei einer reinen Exaktsuche keine unscharfen Treffer: „BATT 2 OFF BUS"
    // ist für „BATT 1 OFF BUS" kein Ergebnis, sondern ein Fehler.
    if (!istExakt(anfrage)) {
      for (const r of this.ms.search(anfrage)) {
        const c = this.chunks.get(r.id as string)
        if (!c || gesehen.has(seiteKey(c))) continue
        gesehen.add(seiteKey(c))
        const erstes = r.terms[0] ?? ''
        const pos = Math.max(0, c.text.toLowerCase().indexOf(erstes.toLowerCase()))
        out.push({ docId: c.docId, docTitle: c.docTitle, seite: c.seite, label: c.label || undefined, ausschnitt: ausschnitt(c.text, pos, erstes.length), exakt: false, score: r.score })
      }
    }
    return out.slice(0, max)
  }
}
