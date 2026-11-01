import geschwisterRegeln from '../config/sibling-rules.json'
import type { DocPage } from '../parse/model'
import { vergleichsform } from '../parse/seitenzuordnung'
import { ampelAus, idsVergeben, type Ampel, type Befund, type Fundstelle } from '../pruefung/befund'
import { dokForm } from '../recheck/fremdliste'
import { editierabstand } from '../pruefung/kontext'
export { editierabstand }
import type { OutlineNode } from '../parse/model'
import { abschnitte, kapitelNummern, kreise, nurVerweis, uebungsNummern, verweiseIn, vorhanden } from '../pruefung/verweise'

/**
 * Paketweite Prüfungen (Nachtrag N1.2, N2): Anhangsliste, Revisionsstand,
 * Hierarchieregel, Geschwistergruppen, Reste der Gegenfassung,
 * Fix-Propagation. Alles regelbasiert, im Worker, ohne KI.
 *
 * Befundtexte englisch (Export), wie bei allen regelbasierten Prüfungen.
 */

export interface Mitglied {
  id: string
  dokName: string
  kuerzel: string
  ebene: number
  gruppe: string
  variante: string
  revision: string
  datum: string
  pages: DocPage[]
  /** Gliederung — für Verweisziele und Zirkelverweise (N7) */
  outline?: Pick<OutlineNode, 'titel'>[]
}

/** Eine Korrektur, die der Re-Check in einem Dokument bestätigt hat (Fix-Propagation, N2.1). */
export interface Korrektur {
  ref: string
  dokId: string
  weg: string
}

export interface UebersichtZeile {
  id: string
  kuerzel: string
  ebene: number
  dokName: string
  revision: string
  datum: string
  /** weicht vom Dokument der Ebene 1 ab */
  abweichung: ('revision' | 'datum')[]
}

export const PAKET_PUNKTE = ['liste', 'stand', 'hierarchie', 'geschwister', 'gegenfassung', 'propagation', 'verweise'] as const

export interface PaketErgebnis {
  befunde: Befund[]
  uebersicht: UebersichtZeile[]
  ampel: Record<string, Ampel>
}

type Roh = Omit<Befund, 'id'>

const befund = (m: Mitglied, x: Pick<Roh, 'pruefpunkt' | 'kategorie' | 'prioritaet' | 'text' | 'fundstellen'> & Partial<Pick<Roh, 'weitere'>>): Roh => ({
  quelle: 'paket',
  dokId: m.id,
  dokName: m.dokName,
  verifizierung: 'Verified (rule-based)',
  status: 'Open',
  ...x,
})

const name = (m: Mitglied) => m.kuerzel || m.dokName

/** Absätze (Zeilen) mit Seite — für Fundstellen. */
function absaetze(m: Mitglied): { text: string; seite: string }[] {
  return m.pages.flatMap((p) => p.text.split(/\n+/).map((t) => ({ text: t.replace(/\s+/g, ' ').trim(), seite: p.label ?? String(p.index) })).filter((a) => a.text))
}

/* ----------------------------- Anhangsliste ----------------------------- */

export interface ListenEintrag {
  schluessel: string
  bezeichnung: string
  titel: string
  zeile: string
  seite: string
}

const LISTE = /^(appendix|apx|annex|anx|anhang|anlage)\s+(\d+[a-z]?|[a-z])\b\s*[-–—:.]?\s*(.*?)\s*(?:\.{2,}\s*\d+|\t\d+)?$/i

/**
 * Einträge der Anhangsliste im Dokument der Ebene 1 — Zeilen, die mit
 * „Appendix 4 – …" beginnen. Ein Satz („Appendix 4 describes …") endet mit
 * Punkt und ist kein Listeneintrag; ein Verweis mitten im Satz auch nicht.
 */
export function anhangListe(m: Mitglied): ListenEintrag[] {
  const out = new Map<string, ListenEintrag>()
  for (const a of absaetze(m)) {
    const x = a.text.match(LISTE)
    if (!x || x[3].length > 80 || /[.!?]$/.test(x[3])) continue
    const art = /^(annex|anx|anlage)$/i.test(x[1]) ? 'ANX' : 'APX'
    const bezeichnung = `${art} ${x[2].toUpperCase()}`
    const schluessel = dokForm(bezeichnung)
    if (!out.has(schluessel)) out.set(schluessel, { schluessel, bezeichnung, titel: x[3].trim(), zeile: a.text, seite: a.seite })
  }
  return [...out.values()]
}

function listePruefen(m1: Mitglied, alle: Mitglied[]): Roh[] {
  const eintraege = anhangListe(m1)
  if (!eintraege.length) return []
  const out: Roh[] = []
  const unten = alle.filter((m) => m.ebene > m1.ebene)
  for (const e of eintraege) {
    const m = unten.find((x) => dokForm(x.kuerzel) === e.schluessel)
    if (!m) {
      if (/\breserved\b|\breserviert\b/i.test(e.titel)) continue
      out.push(befund(m1, { pruefpunkt: 'liste', kategorie: 'Gap', prioritaet: 'Medium', text: `${e.bezeichnung} is listed in ${name(m1)} but is not part of the package. Submit it with the package or mark the entry as "Reserved".`, fundstellen: [{ seite: e.seite, auszug: e.zeile }] }))
    } else if (e.titel && !vergleichsform(m.dokName).includes(vergleichsform(e.titel))) {
      out.push(befund(m, { pruefpunkt: 'liste', kategorie: 'Inconsistency', prioritaet: 'Low', text: `Title of ${name(m)} does not match the list in ${name(m1)}: listed as "${e.titel}", document title "${m.dokName}".`, fundstellen: [{ auszug: m.dokName }], weitere: [{ dokId: m1.id, dokName: m1.dokName, fundstelle: { seite: e.seite, auszug: e.zeile } }] }))
    }
  }
  for (const m of unten) {
    if (!m.kuerzel || eintraege.some((e) => e.schluessel === dokForm(m.kuerzel))) continue
    out.push(befund(m1, { pruefpunkt: 'liste', kategorie: 'Document Control', prioritaet: 'Medium', text: `${name(m)} is part of the package but is not listed in ${name(m1)}.`, fundstellen: [{ auszug: eintraege.map((e) => e.bezeichnung).join(', ') }], weitere: [{ dokId: m.id, dokName: m.dokName }] }))
  }
  return out
}

/* ---------------------------- Revisionsstand ---------------------------- */

export function uebersicht(alle: Mitglied[]): UebersichtZeile[] {
  const m1 = [...alle].sort((a, b) => a.ebene - b.ebene)[0]
  return [...alle]
    .sort((a, b) => a.ebene - b.ebene || a.kuerzel.localeCompare(b.kuerzel, 'de', { numeric: true }))
    .map((m) => ({
      id: m.id,
      kuerzel: m.kuerzel,
      ebene: m.ebene,
      dokName: m.dokName,
      revision: m.revision,
      datum: m.datum,
      abweichung: m === m1 ? [] : (['revision', 'datum'] as const).filter((k) => m[k] && m1?.[k] && m[k].trim() !== m1[k].trim()),
    }))
}

function standPruefen(alle: Mitglied[], zeilen: UebersichtZeile[]): Roh[] {
  const m1 = alle.find((m) => m.id === zeilen[0]?.id)
  if (!m1) return []
  return zeilen.flatMap((z) => {
    const m = alle.find((x) => x.id === z.id)!
    return z.abweichung.map((k) =>
      befund(m, { pruefpunkt: 'stand', kategorie: 'Document Control', prioritaet: 'Low', text: `${k === 'revision' ? 'Revision' : 'Date'} of ${name(m)} ("${m[k]}") differs from ${name(m1)} ("${m1[k]}"). Confirm that the package is meant to be submitted with different ${k === 'revision' ? 'revisions' : 'dates'}.`, fundstellen: [{ auszug: m[k] }], weitere: [{ dokId: m1.id, dokName: m1.dokName, fundstelle: { auszug: m1[k] } }] }),
    )
  })
}

/* ---------------------------- Hierarchieregel --------------------------- */

export interface Stundenangabe {
  schluessel: string
  bezeichnung: string
  stunden: number
  auszug: string
  seite: string
}

const STUNDEN = /^(.{3,60}?)\s*[:–—-]\s*(\d{1,4}(?:[.,]\d+)?|\d{1,3}:\d{2})\s*(?:h|hrs?|hours?|std\.?|stunden)\b/i

/** „FFS training: 16 hours", „WBT – 2:30 h" → Stunden je Bezeichnung. */
export function stundenangaben(m: Mitglied): Stundenangabe[] {
  const out: Stundenangabe[] = []
  for (const a of absaetze(m)) {
    const x = a.text.match(STUNDEN)
    if (!x) continue
    const w = x[2].includes(':') ? Number(x[2].split(':')[0]) + Number(x[2].split(':')[1]) / 60 : Number(x[2].replace(',', '.'))
    out.push({ schluessel: vergleichsform(x[1]), bezeichnung: x[1].trim(), stunden: w, auszug: a.text, seite: a.seite })
  }
  return out
}

/**
 * Hierarchieregel (N1.1): Widerspricht ein tieferes Dokument einem höheren,
 * wird der Befund beim TIEFEREN geführt, das höhere steht unter „Other
 * Affected Documents". Verglichen wird mit dem nächsthöheren Dokument, das
 * dieselbe Größe nennt. Die Ausnahme (höheres Dokument selbst regelwidrig)
 * braucht den Abgleich mit der Bibliothek und folgt mit Phase 3.
 */
function hierarchiePruefen(alle: Mitglied[]): Roh[] {
  const angaben = new Map(alle.map((m) => [m.id, stundenangaben(m)]))
  const out: Roh[] = []
  for (const m of alle) {
    for (const a of angaben.get(m.id)!) {
      const hoeher = alle
        .filter((h) => h.ebene < m.ebene)
        .sort((x, y) => y.ebene - x.ebene)
        .map((h) => ({ h, a: angaben.get(h.id)!.find((x) => x.schluessel === a.schluessel) }))
        .find((x) => x.a)
      if (!hoeher || Math.abs(hoeher.a!.stunden - a.stunden) < 1e-6) continue
      out.push(
        befund(m, {
          pruefpunkt: 'hierarchie',
          kategorie: 'Inconsistency',
          prioritaet: 'High',
          text: `${a.bezeichnung}: ${name(m)} states ${a.stunden} h, the higher-level document ${name(hoeher.h)} states ${hoeher.a!.stunden} h. ${name(hoeher.h)} governs; correct ${name(m)}.`,
          fundstellen: [{ seite: a.seite, auszug: a.auszug }],
          weitere: [{ dokId: hoeher.h.id, dokName: hoeher.h.dokName, fundstelle: { seite: hoeher.a!.seite, auszug: hoeher.a!.auszug } }],
        }),
      )
    }
  }
  return out
}

/* ---------------------------- Geschwister (N2) --------------------------- */

const WORT = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu
const FUELL = new Set(['the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'by', 'for', 'is', 'are', 'der', 'die', 'das', 'und'])
const woerter = (s: string) => (s.match(WORT) ?? []).map((w) => w.toLowerCase())

export function jaccard(a: string[], b: string[]): number {
  const x = new Set(a)
  const y = new Set(b)
  const schnitt = [...x].filter((w) => y.has(w)).length
  return schnitt / (x.size + y.size - schnitt || 1)
}

/** Wortweiser Unterschied über die längste gemeinsame Teilfolge. */
export function wortDiff(a: string[], b: string[]): { weg: string[]; neu: string[] } {
  const n = a.length
  const m = b.length
  const t: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) t[i][j] = a[i] === b[j] ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1])
  const weg: string[] = []
  const neu: string[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      i++
      j++
    } else if (t[i + 1][j] >= t[i][j + 1]) weg.push(a[i++])
    else neu.push(b[j++])
  }
  return { weg: [...weg, ...a.slice(i)], neu: [...neu, ...b.slice(j)] }
}

type Regeln = Record<string, { onlyIn: Record<string, string[]> }>
export const GESCHWISTER_REGELN = Object.fromEntries(Object.entries(geschwisterRegeln).filter(([k]) => !k.startsWith('_'))) as Regeln

/** Gruppentyp aus den Varianten: alle Varianten in der Regel genannt → dieser Typ. */
export function gruppenTyp(varianten: string[], regeln: Regeln = GESCHWISTER_REGELN): string | null {
  return Object.entries(regeln).find(([, r]) => varianten.length > 0 && varianten.every((v) => v in r.onlyIn))?.[0] ?? null
}

const begriffRe = (b: string) => new RegExp(`(?<![\\p{L}\\p{N}])${b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, /^[A-Z0-9]+$/.test(b) ? 'gu' : 'giu')

/** Text ohne die erlaubten Begriffe — was danach noch abweicht, ist verdächtig. */
const ohne = (s: string, begriffe: string[]) => begriffe.reduce((t, b) => t.replace(begriffRe(b), ' '), s)

function geschwisterPruefen(alle: Mitglied[], regeln: Regeln): Roh[] {
  const out: Roh[] = []
  const gruppen = new Map<string, Mitglied[]>()
  for (const m of alle) if (m.gruppe) gruppen.set(m.gruppe, [...(gruppen.get(m.gruppe) ?? []), m])
  const paketText = alle.map((m) => absaetze(m).map((a) => a.text).join('\n')).join('\n').toLowerCase()
  const zaehle = (w: string, ausser: string[]) => {
    let rest = paketText
    for (const a of ausser) rest = rest.split(a.toLowerCase()).join(' ')
    return (rest.match(begriffRe(w)) ?? []).length
  }

  for (const [, ms] of gruppen) {
    if (ms.length < 2) continue
    const typ = gruppenTyp(ms.map((m) => m.variante), regeln)
    const nurIn = typ ? regeln[typ].onlyIn : {}
    // Erlaubt: Begriffe der Fassungen, Variantenbezeichnungen, Kürzel (N2.1)
    const erlaubt = [...new Set([...Object.values(nurIn).flat(), ...ms.flatMap((m) => [m.variante, ...m.kuerzel.split(/\s+/)]).filter(Boolean)])].sort((a, b) => b.length - a.length)
    const bez = (s: string) => ohne(s, erlaubt)

    // Reste der Gegenfassung
    if (typ) {
      for (const m of ms) {
        const eigene = new Set(nurIn[m.variante] ?? [])
        const fremd = Object.entries(nurIn).filter(([v]) => v !== m.variante).flatMap(([, b]) => b).filter((b) => !eigene.has(b))
        for (const b of new Set(fremd)) {
          const treffer = absaetze(m).filter((a) => begriffRe(b).test(a.text))
          if (!treffer.length) continue
          const quelle = Object.entries(nurIn).find(([v, bs]) => v !== m.variante && bs.includes(b))![0]
          out.push(befund(m, { pruefpunkt: 'gegenfassung', kategorie: 'Inconsistency', prioritaet: 'Medium', text: `"${b}" belongs to the ${quelle} version but appears in the ${m.variante} version ${name(m)} (${treffer.length}×).`, fundstellen: treffer.slice(0, 5).map((a) => ({ seite: a.seite, auszug: a.text })) }))
        }
      }
    }

    // Absatzabgleich je Paar
    for (let i = 0; i < ms.length; i++) {
      for (let j = i + 1; j < ms.length; j++) {
        const [A, B] = [ms[i], ms[j]]
        const pb = absaetze(B).filter((a) => woerter(a.text).length >= 3)
        const vergeben = new Set<number>()
        for (const a of absaetze(A)) {
          const wa = woerter(bez(a.text)).filter((w) => !FUELL.has(w))
          if (wa.length < 3) continue
          let best = -1
          let wert = 0
          pb.forEach((b, k) => {
            if (vergeben.has(k)) return
            const s = jaccard(wa, woerter(bez(b.text)).filter((w) => !FUELL.has(w)))
            if (s > wert) [best, wert] = [k, s]
          })
          if (best < 0 || wert < 0.6) continue
          vergeben.add(best)
          const b = pb[best]
          const d = wortDiff(woerter(bez(a.text)).filter((w) => !FUELL.has(w)), woerter(bez(b.text)).filter((w) => !FUELL.has(w)))
          if (!d.weg.length && !d.neu.length) continue // erwartet: nur erlaubte Unterschiede
          const zwei = { a: { dokId: A.id, dokName: A.dokName, fundstelle: { seite: a.seite, auszug: a.text } }, b: { dokId: B.id, dokName: B.dokName, fundstelle: { seite: b.seite, auszug: b.text } } }
          // Tippfehler-Verdacht: genau ein Wort ersetzt, ähnlich geschrieben.
          if (d.weg.length === 1 && d.neu.length === 1 && Math.min(d.weg[0].length, d.neu[0].length) >= 4 && editierabstand(d.weg[0], d.neu[0]) <= 2) {
            // Welches ist falsch? Das Wort, das sonst nirgends im Paket steht.
            const [x, y] = [zaehle(d.weg[0], [a.text, b.text]), zaehle(d.neu[0], [a.text, b.text])]
            const falschInA = x === 0 && y > 0
            const [hier, dort, falsch, richtig] = falschInA ? [zwei.a, zwei.b, d.weg[0], d.neu[0]] : [zwei.b, zwei.a, d.neu[0], d.weg[0]]
            const [m, anderes] = falschInA ? [A, B] : [B, A]
            const sicher = falschInA || (y === 0 && x > 0)
            out.push(befund(m, { pruefpunkt: 'geschwister', kategorie: sicher ? 'Editorial' : 'Inconsistency', prioritaet: 'Medium', text: sicher ? `Spelling differs from sibling document ${name(anderes)}: "${falsch}" here, "${richtig}" there and elsewhere in the package. Correction not carried over?` : `Sibling documents differ in spelling: "${d.neu[0]}" (${name(B)}) vs "${d.weg[0]}" (${name(A)}).`, fundstellen: [hier.fundstelle], weitere: [dort] }))
            continue
          }
          out.push(befund(B, { pruefpunkt: 'geschwister', kategorie: 'Inconsistency', prioritaet: 'Medium', text: `Sibling documents differ in an otherwise identical paragraph: ${d.weg.length ? `"${d.weg.join(' ')}" (${name(A)})` : `nothing in ${name(A)}`} vs ${d.neu.length ? `"${d.neu.join(' ')}" (${name(B)})` : `nothing in ${name(B)}`}. Confirm the difference is intended.`, fundstellen: [zwei.b.fundstelle], weitere: [zwei.a] }))
        }
      }
    }
  }
  return out
}

/* --------------------------- Fix-Propagation --------------------------- */

/**
 * N2.1: Eine im Re-Check bestätigte Korrektur in einem Geschwisterdokument
 * muss in allen anderen Mitgliedern der Gruppe angekommen sein.
 */
function propagationPruefen(alle: Mitglied[], korrekturen: Korrektur[]): Roh[] {
  const out: Roh[] = []
  for (const k of korrekturen) {
    const quelle = alle.find((m) => m.id === k.dokId)
    if (!quelle?.gruppe) continue
    for (const m of alle.filter((x) => x.gruppe === quelle.gruppe && x.id !== quelle.id)) {
      const treffer = absaetze(m).filter((a) => begriffRe(k.weg).test(a.text))
      if (!treffer.length) continue
      out.push(befund(m, { pruefpunkt: 'propagation', kategorie: 'Inconsistency', prioritaet: 'Medium', text: `Correction not carried over to sibling document: finding ${k.ref} was corrected in ${name(quelle)}, but "${k.weg}" is still present in ${name(m)}.`, fundstellen: treffer.slice(0, 5).map((a) => ({ seite: a.seite, auszug: a.text })), weitere: [{ dokId: quelle.id, dokName: quelle.dokName }] }))
    }
  }
  return out
}

/* ------------------------ Verweise zwischen Dokumenten (N7) ------------------------ */

/** APX ↔ ANX tauschen — „Annex 9" gemeint, „Appendix 9" vorhanden? */
const getauscht = (f: string) => (f.startsWith('apx') ? `anx${f.slice(3)}` : f.startsWith('anx') ? `apx${f.slice(3)}` : null)

/**
 * Verweise auf ein ANDERES Dokument (N7): Ziel im Paket? Kapitel bzw. Übung
 * dort vorhanden? Fehlt das Zieldokument, ist der Verweis „Not verifiable –
 * source missing" (N11) — nicht falsch, nur nicht prüfbar. Interne
 * Verweise prüft das Dokument selbst (Formalprüfung bzw. Übungen/Zirkel).
 */
export function verweisePruefen(alle: Mitglied[]): { befunde: Roh[]; gefunden: boolean } {
  const ziel = (dok: string) => alle.find((x) => dokForm(x.kuerzel) === dokForm(dok))
  const ziele = new Map(alle.map((m) => [m.id, { kap: kapitelNummern(m.pages, m.outline ?? []), ueb: uebungsNummern(m.pages) }]))
  const out: Roh[] = []
  const fehlend = new Map<string, { m: Mitglied; dok: string; fs: Fundstelle[]; n: number }>()
  let gefunden = false
  for (const m of alle) {
    for (const a of absaetze(m)) {
      // Einträge der Anhangsliste prüft die Listenprüfung (N1.2)
      if (LISTE.test(a.text)) continue
      for (const v of verweiseIn(a.text, a.seite)) {
        if (!v.dok) continue
        gefunden = true
        const t = ziel(v.dok)
        if (!t) {
          const tausch = getauscht(dokForm(v.dok))
          const anders = tausch ? alle.find((x) => dokForm(x.kuerzel) === tausch) : undefined
          if (anders) {
            out.push(befund(m, { pruefpunkt: 'verweise', kategorie: 'Inconsistency', prioritaet: 'Medium', text: `Reference to ${v.dok}, but the package contains ${name(anders)} and no ${v.dok}. Annex and Appendix mixed up?`, fundstellen: [{ seite: a.seite, auszug: a.text }], weitere: [{ dokId: anders.id, dokName: anders.dokName }] }))
            continue
          }
          const key = `${m.id}|${dokForm(v.dok)}`
          if (!fehlend.has(key)) fehlend.set(key, { m, dok: v.dok, fs: [], n: 0 })
          const f = fehlend.get(key)!
          f.n++
          // Zwei Verweise in derselben Zeile sind EINE Fundstelle
          if (!f.fs.some((x) => x.auszug === a.text && x.seite === a.seite)) f.fs.push({ seite: a.seite, auszug: a.text })
          continue
        }
        if (!v.nummer) continue
        const z = ziele.get(t.id)!
        if (vorhanden(v.nummer, z.kap, z.ueb)) continue
        // Ohne erkennbare Gliederung im Ziel lässt sich nichts sagen
        if (!z.kap.size && !z.ueb.size) continue
        const was = v.uebung ? 'exercise' : 'chapter'
        out.push(befund(m, { pruefpunkt: 'verweise', kategorie: 'Inconsistency', prioritaet: 'Medium', text: `Reference to ${name(t)} ${was} ${v.nummer} — no such ${was} in ${name(t)}.`, fundstellen: [{ seite: a.seite, auszug: a.text }], weitere: [{ dokId: t.id, dokName: t.dokName }] }))
      }
    }
  }
  for (const { m, dok, fs, n } of fehlend.values()) {
    out.push({ ...befund(m, { pruefpunkt: 'verweise', kategorie: 'Document Control', prioritaet: 'Low', text: `Reference to ${dok} cannot be verified: ${dok} is not part of the package (${n}×). Add it to the package or the library.`, fundstellen: fs.slice(0, 5) }), verifizierung: 'Not verifiable – source missing' })
  }

  // Zirkel über Dokumentgrenzen (A → B → A ohne Inhalt); Zirkel in EINEM Dokument meldet dieses selbst
  const kanten = new Map<string, string>()
  const text = new Map<string, string>()
  for (const m of alle) {
    for (const ab of abschnitte(m.pages, m.outline ?? [])) {
      const v = nurVerweis(ab)
      if (!v) continue
      const t = v.dok ? ziel(v.dok) : m
      if (!t) continue
      kanten.set(`${m.id}|${ab.nummer}`, `${t.id}|${v.nummer}`)
      text.set(`${m.id}|${ab.nummer}`, ab.text.trim())
    }
  }
  for (const kreis of kreise(kanten)) {
    const docs = [...new Set(kreis.map((k) => k.split('|')[0]))]
    if (docs.length < 2) continue
    const zeigen = (k: string) => `${name(alle.find((x) => x.id === k.split('|')[0])!)} ${k.split('|')[1]}`
    const erstes = alle.find((x) => x.id === docs[0])!
    out.push(befund(erstes, { pruefpunkt: 'verweise', kategorie: 'Inconsistency', prioritaet: 'Medium', text: `Circular reference without content: ${[...kreis, kreis[0]].map(zeigen).join(' → ')}.`, fundstellen: kreis.filter((k) => k.startsWith(`${erstes.id}|`)).map((k) => ({ ort: k.split('|')[1], auszug: text.get(k) ?? '' })), weitere: docs.slice(1).map((id) => ({ dokId: id, dokName: alle.find((x) => x.id === id)!.dokName })) }))
  }
  return { befunde: out, gefunden }
}

/* ------------------------------- Gesamt -------------------------------- */

export function paketPruefen(alle: Mitglied[], korrekturen: Korrektur[] = [], regeln: Regeln = GESCHWISTER_REGELN): PaketErgebnis {
  const zeilen = uebersicht(alle)
  const m1 = alle.find((m) => m.id === zeilen[0]?.id)
  const liste = m1 && alle.some((m) => m.ebene > m1.ebene) ? listePruefen(m1, alle) : []
  const hierarchie = hierarchiePruefen(alle)
  // Dublettenregel (N10.3): Dieselbe Zeile ist nicht zugleich Hierarchie-
  // und Geschwisterbefund. Der Hierarchiebefund bleibt — er nennt die
  // maßgebliche Quelle; der Geschwisterabgleich wüsste nur „unterschiedlich".
  const schon = new Set(hierarchie.flatMap((b) => b.fundstellen.map((f) => `${b.dokId}|${f.auszug}`)))
  const geschwister = geschwisterPruefen(alle, regeln).filter((b) => !b.fundstellen.some((f) => schon.has(`${b.dokId}|${f.auszug}`)))
  const verweise = verweisePruefen(alle)
  const roh = [...liste, ...standPruefen(alle, zeilen), ...hierarchie, ...geschwister, ...propagationPruefen(alle, korrekturen), ...verweise.befunde]
  const befunde = idsVergeben(roh)
  const hatGruppe = [...new Set(alle.map((m) => m.gruppe).filter(Boolean))].some((g) => alle.filter((m) => m.gruppe === g).length > 1)
  const na: string[] = []
  if (!m1 || !anhangListe(m1).length) na.push('liste')
  if (alle.length < 2) na.push('stand', 'hierarchie')
  if (!hatGruppe) na.push('geschwister', 'gegenfassung', 'propagation')
  else if (!alle.some((m) => m.gruppe && gruppenTyp(alle.filter((x) => x.gruppe === m.gruppe).map((x) => x.variante), regeln))) na.push('gegenfassung')
  if (!korrekturen.length && !na.includes('propagation')) na.push('propagation')
  if (!verweise.gefunden) na.push('verweise')
  return { befunde, uebersicht: zeilen, ampel: ampelAus([...PAKET_PUNKTE], befunde, na) }
}

export type { Fundstelle }
