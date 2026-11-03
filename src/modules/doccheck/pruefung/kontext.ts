import regelnJson from '../config/formal-rules.json'
import type { ErkannteMeta } from '../parse/meta'
import type { Rohdokument, WortAbsatz, WortOrt } from '../parse/model'
import { AMC_GM, CS, IR } from '../parse/regeln'
import { vergleichsform } from '../parse/seitenzuordnung'
import type { Anleitung, Befund, Fundstelle } from './befund'

/**
 * Was alle regelbasierten Prüfungen brauchen: das gelesene Dokument, seine
 * erkannten Metadaten, den Dateinamen und die Regeln aus
 * config/formal-rules.json — plus zwei Helfer, die jede Prüfung sonst selbst
 * schriebe: Befund bauen und eine Textstelle ihrer Seite zuordnen.
 */

export type Regeln = typeof regelnJson
export const REGELN: Regeln = regelnJson

export interface PruefKontext {
  dokId: string
  dokName: string
  roh: Rohdokument
  meta: ErkannteMeta
  regeln: Regeln
}

/** Höchstzahl Fundstellen je Befund — mehr liest niemand, der Rest steht als Zahl im Text. */
export const MAX_FUNDSTELLEN = 25

/** Befund bauen. Die Handlungsanweisung ist Pflicht — sie ist die „Proposed Correction" im Export (Audit 11/2026, EXP-06). */
export function befund(k: PruefKontext, b: Omit<Befund, 'id' | 'dokId' | 'dokName' | 'verifizierung' | 'status' | 'anleitung'> & { anleitung: Anleitung }): Omit<Befund, 'id'> {
  return { ...b, fundstellen: b.fundstellen.slice(0, MAX_FUNDSTELLEN), dokId: k.dokId, dokName: k.dokName, verifizierung: 'Verified (rule-based)', status: 'Open' }
}

/** Seitenbezeichnung einer Seite: gedruckt, sonst die Nummer. */
export function seitenName(p: { index: number; label?: string }): string {
  return p.label ?? String(p.index)
}

/** Findet die Seite, auf der ein Text steht (Vergleichsform, erste 40 Zeichen). */
export function seiteFinder(roh: Rohdokument): (text: string) => string | undefined {
  const formen = roh.pages.map((p) => vergleichsform(p.text))
  return (text) => {
    const f = vergleichsform(text).slice(0, 40)
    if (f.length < 4) return undefined
    const i = formen.findIndex((x) => x.includes(f))
    return i >= 0 ? seitenName(roh.pages[i]) : undefined
  }
}

/** Fundort eines Notenabsatzes — englisch wie alle Fundstellen (Export). */
export function notenOrt(teil: string): string {
  return /endnote/i.test(teil) ? 'Endnote' : 'Footnote'
}

const TEIL_ART: Record<string, string> = { default: 'default', first: 'first-page', even: 'even-page' }

/**
 * Ort einer Kopf- oder Fußzeile: „Footer (footer1.xml)", je Abschnitt
 * „Section 2, default footer (footer1.xml)". Vorher stand der Teil der
 * ZIP-Datei vorn („Section 1, footer1.xml (default)", „header9.xml") — so
 * im Export unter „Chapter / Section", in einem Bericht für die Behörde
 * (Audit 11/2026, Nachtrag TXT#1). Der Dateiname bleibt in Klammern: Eine
 * Kopfzeile, die kein Abschnitt verwendet, ist nur an ihm zu erkennen.
 */
export function teilOrt(teil: string, typ?: string): string {
  const name = teil.replace(/^word\//, '')
  const fuss = /^footer/i.test(name)
  if (typ === undefined) return `${fuss ? 'Footer' : 'Header'} (${name})`
  return `${TEIL_ART[typ] ?? typ} ${fuss ? 'footer' : 'header'} (${name})`
}

export interface PruefAbsatz {
  text: string
  seite?: string
  /** Letzte Überschrift VOR dem Absatz (`wortKapitel` bzw. Gliederung des Seitentexts) */
  kapitel?: string
  ort?: string
  wortOrt?: WortOrt
  /** DOCX: Absatz in einer Tabellenzelle */
  inTabelle?: true
  /** DOCX: Name der Absatzvorlage („caption", „heading 1") */
  stilName?: string
  /** DOCX, Zelle ab Spalte 2: Text der ersten Zelle derselben Zeile (Kürzel einer Abkürzungsliste) */
  ersteZelle?: string
}

/** Erste Zelle der Zeile, in der Absatz `i` steht — rückwärts innerhalb derselben Zeile. */
function ersteZelleVon(alle: WortAbsatz[], i: number): string | undefined {
  const t = alle[i].tabelle
  if (!t || t.spalte === 0) return undefined
  for (let j = i - 1; j >= 0; j--) {
    const x = alle[j]
    if (!x.tabelle || x.ort !== alle[i].ort || x.tabelle.zeile !== t.zeile || x.tabelle.spalte > t.spalte) return undefined
    if (x.tabelle.spalte === 0) return x.text.trim() || undefined
  }
  return undefined
}

/** Höchstlänge eines Kapitels in der Fundstelle — eine falsch formatierte „Überschrift" kann ein ganzer Absatz sein. */
const KAPITEL_MAX = 100

/**
 * Kapitel je Absatz eines Word-Dokuments, parallel zu `alle`: die letzte
 * Überschrift (Gliederungsebene der Absatzvorlage — dieselbe Quelle wie
 * `outline`) VOR dem Absatz. Nicht das Kapitel der Seite: Ein DOCX ohne
 * Umbruchmarken ist eine einzige Seite, und jede Fundstelle trüge das
 * letzte Kapitel — dieselbe Regel wie im Re-Check (`kapitelBei`).
 *
 * Bis 11/2026 trug keine Fundstelle ein Kapitel; die Export-Spalte
 * „Chapter / Section" war meist leer (Audit 11/2026, Nachtrag TXT#1).
 *
 * Kopf- und Fußzeilen gehören zu keinem Kapitel. Fuß- und Endnoten stehen
 * im Extrakt hinter dem ganzen Text, ihr Anker ist dort unbekannt — sie
 * bleiben ohne, statt das letzte Kapitel geraten zu bekommen. Textfelder
 * stehen an ihrem Anker und erben dessen Kapitel.
 */
export function wortKapitel(alle: WortAbsatz[]): (string | undefined)[] {
  let aktuell: string | undefined
  return alle.map((a) => {
    if (a.ort !== 'body' && a.ort !== 'textfeld') return undefined
    if (a.ort === 'body' && a.ebene && !a.toc && a.text.trim()) aktuell = kurz(a.text, KAPITEL_MAX)
    return aktuell
  })
}

/**
 * Verzeichniseintrag mit Punktlinie („2.1 Hours ....... 5"): Die Gliederung
 * eines PDF führt ihn, weil er wie eine Überschrift beginnt — als Kapitel
 * trüge sonst alles zwischen Inhaltsverzeichnis und erstem Kapitel den
 * letzten Verzeichniseintrag.
 */
const VERZEICHNISZEILE = /(?:[.…·]\s*){3,}\d{1,4}\s*$/

/**
 * Kapitel je Zeile des Seitentexts (`pages[i].text.split('\n')`): die
 * letzte Zeile davor, die ein Eintrag der Gliederung (`outline`) auf
 * dieser Seite ist — beim PDF aus der Überschriftenerkennung, beim DOCX aus
 * den Gliederungsebenen der Vorlagen, also dieselben Überschriften wie in
 * `wortKapitel`. Für Prüfungen, die am Seitentext arbeiten (Rechnen, PDF).
 * XLSX-Blätter haben keine Kapitel; ihr Ort ist das Blatt.
 */
export function seitenKapitel(roh: Pick<Rohdokument, 'format' | 'pages'> & Partial<Pick<Rohdokument, 'outline'>>): (string | undefined)[][] {
  if (roh.format === 'xlsx' || !roh.outline?.length) return roh.pages.map((p) => p.text.split('\n').map(() => undefined))
  // Je Seite vorab — bei einem Handbuch mit tausend Seiten und Überschriften sonst Seiten × Gliederung je Aufruf
  const jeSeite = new Map<number, { titel: string; form: string }[]>()
  for (const o of roh.outline) jeSeite.set(o.vonSeite, [...(jeSeite.get(o.vonSeite) ?? []), { titel: o.titel, form: vergleichsform(o.titel) }])
  let aktuell: string | undefined
  return roh.pages.map((p) => {
    const offen = [...(jeSeite.get(p.index) ?? [])]
    return p.text.split('\n').map((z) => {
      if (offen.length && !VERZEICHNISZEILE.test(z)) {
        const form = vergleichsform(z)
        const i = form ? offen.findIndex((o) => o.form === form) : -1
        if (i >= 0) aktuell = kurz(offen.splice(i, 1)[0].titel, KAPITEL_MAX)
      }
      return aktuell
    })
  })
}

/**
 * Absätze in Lesereihenfolge für alle Formate. DOCX: echte Absätze inkl.
 * Textfelder, Tabellenzellen, Kopf-/Fußzeilen. PDF/XLSX: Zeilen der Seiten.
 * Jeder Absatz trägt sein Kapitel (`wortKapitel`, `seitenKapitel`).
 */
export function absaetze(roh: Rohdokument): PruefAbsatz[] {
  if (roh.word) {
    const seite = seiteFinder(roh)
    const alle = roh.word.absaetze
    const kapitel = wortKapitel(alle)
    return alle
      .map((a, i) => ({ a, i }))
      .filter(({ a }) => a.text.trim())
      .map(({ a, i }) => ({ a, zelle0: ersteZelleVon(alle, i), kap: kapitel[i] }))
      .map(({ a, zelle0, kap }) => ({
        text: a.text.replace(/\s+/g, ' ').trim(),
        // Textfelder und Fußnoten stehen seit FRD-13 im Seitentext — ihre Seite ist auffindbar
        seite: a.ort === 'body' || a.ort === 'textfeld' || a.ort === 'fussnote' ? seite(a.text) : undefined,
        ...(kap ? { kapitel: kap } : {}),
        ort: a.ort === 'kopf' || a.ort === 'fuss' ? teilOrt(a.teil) : a.ort === 'textfeld' ? 'Text box' : a.ort === 'fussnote' ? notenOrt(a.teil) : a.tabelle ? `Table row ${a.tabelle.zeile + 1}, column ${a.tabelle.spalte + 1}` : undefined,
        wortOrt: a.ort,
        ...(a.tabelle ? { inTabelle: true as const } : {}),
        ...(a.stilName ? { stilName: a.stilName } : {}),
        ...(zelle0 ? { ersteZelle: zelle0 } : {}),
      }))
  }
  const kapitel = seitenKapitel(roh)
  return roh.pages.flatMap((p, s) =>
    p.text
      .split('\n')
      .map((z, i) => ({ z, kap: kapitel[s][i] }))
      .filter(({ z }) => z.trim())
      .map(({ z, kap }) => ({ text: z.trim(), seite: seitenName(p), ...(kap ? { kapitel: kap } : {}), ...(roh.format === 'xlsx' ? { ort: `Sheet ${p.label ?? p.index}` } : {}) })),
  )
}

export function kurz(s: string, n = 120): string {
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length > n ? `${t.slice(0, n - 1)}…` : t
}

export function fundstelle(a: PruefAbsatz, auszug = a.text): Fundstelle {
  return { ...(a.seite ? { seite: a.seite } : {}), ...(a.kapitel ? { kapitel: a.kapitel } : {}), ...(a.ort ? { ort: a.ort } : {}), auszug: kurz(auszug) }
}

/**
 * Hinweiswörter und Hervorhebungen in Großbuchstaben („NOTE: …", „do NOT")
 * sind keine Abkürzungen — „Used but not in the list: NOTE" stand in jedem
 * Handbuch mit Hinweisen (Audit 11/2026, FRD-16). Ebenso Platzhalter: „TBD"
 * und „XXX" meldet die Restprüfung — als Kürzel gezählt stünde derselbe
 * Rest ein zweites Mal als „Used but not in the list" da.
 */
const HINWEISWOERTER = new Set(['NOTE', 'NOTES', 'CAUTION', 'WARNING', 'DANGER', 'NOT', 'ONLY', 'HINWEIS', 'ACHTUNG', 'WARNUNG', 'VORSICHT', 'GEFAHR', 'TBD', 'TBC', 'TBA', 'XX', 'XXX', 'TODO'])

const EINHEITEN = new Set(['KIAS', 'KTAS', 'KCAS', 'KT', 'FT', 'NM', 'LBS', 'KG', 'PSI', 'HPA', 'FPM', 'RPM', 'VDC', 'VAC', 'II', 'III', 'IV', 'VI', 'VII', 'VIII', 'IX', 'XI', 'XII'])

/**
 * Abkürzungen in einem Text. EINE Regel für Formalprüfung und
 * Referenzliste: Regelkennungen („FCL.930.FI", „AMC1 ORA.ATO.230") werden
 * zuerst entfernt — sonst blieben nach dem CAS-Filter Reste wie „FI" stehen
 * (FRD-16) —, dann CAS-Meldungen (zwei und mehr Großbuchstaben-Wörter in
 * Folge). Einheiten, römische Zahlen und Hinweiswörter zählen nicht.
 */
export function abkuerzungenIn(text: string): string[] {
  const ohneCas = text
    .replace(AMC_GM, ' ')
    .replace(IR, ' ')
    .replace(CS, ' ')
    .replace(/\b[A-Z0-9]{2,}(?:\s+[A-Z0-9]{1,}){1,}\b/g, ' ')
  const out: string[] = []
  // Teile von Kennungen (SBX-REF-01, AT-FFS-0199) sind keine Abkürzungen.
  for (const m of ohneCas.matchAll(/(?<![\w-])[A-Z][A-Z0-9]{1,5}(?![\w-])/g)) {
    const t = m[0]
    if (EINHEITEN.has(t) || HINWEISWOERTER.has(t) || !/[A-Z]{2}/.test(t)) continue
    out.push(t)
  }
  return out
}

/** Im Text benutzte Abkürzungen mit der ersten Seite ihres Auftretens. */
export function verwendeteAbkuerzungen(roh: Rohdokument, ausgenommen: Set<number> = new Set()): Map<string, string> {
  const verwendet = new Map<string, string>()
  roh.pages.forEach((p, i) => {
    if (ausgenommen.has(i)) return
    for (const t of abkuerzungenIn(p.text)) if (!verwendet.has(t)) verwendet.set(t, seitenName(p))
  })
  return verwendet
}

/** Editierabstand (Levenshtein) — für Tippfehler zwischen Geschwistern und die nächstliegende Regel-ID. */
export function editierabstand(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array<number>(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
  return d[a.length][b.length]
}

