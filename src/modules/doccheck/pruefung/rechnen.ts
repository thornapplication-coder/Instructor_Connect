import type { Rohdokument } from '../parse/model'
import { ampelAus, type Ampel, type Befund, type Fundstelle } from './befund'
import { befund, type PruefKontext } from './kontext'

/**
 * Rechen- und Plausibilitätsprüfung (Nachtrag N6). Alles Heuristiken —
 * darum nennt jeder Befund die gerechneten Werte, damit ein Mensch in einem
 * Blick sieht, ob die Regel trifft („Summe der Zeilen: 24:00; ausgewiesen:
 * 16:00").
 *
 * Tabellen kommen aus dem einheitlichen Seitentext: DOCX- und XLSX-Zeilen
 * stehen dort als „Zelle | Zelle | Zelle". PDF kennt keine Zellgrenzen —
 * die Tabellenprüfungen sind dort „nicht anwendbar", nicht grün.
 */

export const RECHEN_PUNKTE = ['summen', 'kumuliert', 'session', 'einheiten', 'metar', 'doppelt'] as const
type Punkt = (typeof RECHEN_PUNKTE)[number]

/* ------------------------------- Werte -------------------------------- */

export interface Wert {
  /** Zeitwerte in Minuten, Zahlen als Zahl */
  n: number
  zeit: boolean
}

/** „2:30", „02:30h", „16:00 h", „2,5", „2.5 h", „40" → Wert; sonst null. */
export function wertLesen(s: string): Wert | null {
  const t = s.trim().replace(/\s*(h|hrs?|hours?|std\.?)$/i, '')
  const z = t.match(/^(\d{1,3}):([0-5]\d)$/)
  if (z) return { n: Number(z[1]) * 60 + Number(z[2]), zeit: true }
  if (/^-?\d+(?:[.,]\d+)?$/.test(t)) return { n: Number(t.replace(',', '.')), zeit: false }
  return null
}

export const zeitText = (min: number) => `${Math.floor(min / 60)}:${String(Math.round(min % 60)).padStart(2, '0')}`
const zeigen = (w: Wert) => (w.zeit ? zeitText(w.n) : String(Math.round(w.n * 100) / 100))
const gleich = (a: Wert, b: Wert) => Math.abs(a.n - b.n) < (a.zeit ? 0.5 : 0.01)

/* ------------------------------ Tabellen ------------------------------ */

export interface Tabelle {
  zeilen: string[][]
  seite: string
  /** Text der Zeilen direkt vor der Tabelle (für die Sessiondauer) */
  davor: string[]
}

/** Aufeinanderfolgende Zeilen mit gleicher Zellenzahl (≥ 2) bilden eine Tabelle. */
export function tabellen(roh: Pick<Rohdokument, 'format' | 'pages'>): Tabelle[] {
  if (roh.format === 'pdf') return []
  const out: Tabelle[] = []
  for (const p of roh.pages) {
    const zeilen = p.text.split('\n')
    let akt: Tabelle | null = null
    zeilen.forEach((z, i) => {
      const zellen = z.includes(' | ') ? z.split(' | ').map((c) => c.trim()) : null
      if (zellen && akt && akt.zeilen[0].length === zellen.length) akt.zeilen.push(zellen)
      else if (zellen) {
        akt = { zeilen: [zellen], seite: p.label ?? String(p.index), davor: zeilen.slice(Math.max(0, i - 3), i).filter((x) => !x.includes(' | ')) }
        out.push(akt)
      } else akt = null
    })
  }
  return out.filter((t) => t.zeilen.length >= 2)
}

const SUMME = /^(total|totals|sum|summe|gesamt|insgesamt)\b/i
const KUMULIERT = /cumul|kumul|elapsed|accumulated|laufend/i
const zeile = (z: string[]) => z.join(' | ')

/** Spalten, in denen (außer Kopf und Summe) alle belegten Zellen Werte gleicher Art sind. */
function wertSpalten(t: Tabelle, von: number, bis: number): number[] {
  return t.zeilen[0]
    .map((_, s) => s)
    .filter((s) => {
      const werte = t.zeilen.slice(von, bis).map((z) => z[s]).filter((c) => c)
      const w = werte.map(wertLesen)
      return w.length >= 2 && w.every((x) => x) && w.every((x) => x!.zeit === w[0]!.zeit)
    })
}

function summenPruefen(k: PruefKontext, tabs: Tabelle[]): Omit<Befund, 'id'>[] {
  const out: Omit<Befund, 'id'>[] = []
  for (const t of tabs) {
    let start = 0
    t.zeilen.forEach((z, i) => {
      if (!SUMME.test(z[0] ?? '')) return
      // Kopfzeile überspringen: erste Zeile ohne Wert in den Wertspalten
      const von = t.zeilen.slice(start, i).findIndex((r) => r.slice(1).some((c) => wertLesen(c))) + start
      // Eine Kumuliert-Spalte summiert man nicht — ihre Summenzeile ist der letzte Stand.
      for (const s of wertSpalten(t, von, i).filter((s) => !KUMULIERT.test(t.zeilen[0][s] ?? ''))) {
        const soll = wertLesen(z[s] ?? '')
        if (!soll) continue
        const summe = t.zeilen.slice(von, i).reduce((a, r) => a + (wertLesen(r[s] ?? '')?.n ?? 0), 0)
        const ist: Wert = { n: summe, zeit: soll.zeit }
        if (!gleich(ist, soll)) out.push(befund(k, { quelle: 'rechnen', pruefpunkt: 'summen', kategorie: 'Inconsistency', prioritaet: 'High', text: `Table total does not match: sum of rows ${zeigen(ist)}, stated ${zeigen(soll)}.`, fundstellen: [{ seite: t.seite, ort: 'Table', auszug: zeile(z) }] }))
      }
      start = i + 1
    })
  }
  return out
}

const DAUER = /duration|dauer|time|zeit|min/i

function kumuliertPruefen(k: PruefKontext, tabs: Tabelle[]): Omit<Befund, 'id'>[] {
  const out: Omit<Befund, 'id'>[] = []
  for (const t of tabs) {
    const kopf = t.zeilen[0]
    const kum = kopf.findIndex((c) => KUMULIERT.test(c))
    const dauer = kopf.findIndex((c, i) => i !== kum && DAUER.test(c) && !KUMULIERT.test(c))
    if (kum < 0 || dauer < 0) continue
    for (let i = 2; i < t.zeilen.length; i++) {
      const [vorher, d, ist] = [wertLesen(t.zeilen[i - 1][kum] ?? ''), wertLesen(t.zeilen[i][dauer] ?? ''), wertLesen(t.zeilen[i][kum] ?? '')]
      if (!vorher || !d || !ist || SUMME.test(t.zeilen[i][0] ?? '')) continue
      const soll: Wert = { n: vorher.n + d.n, zeit: ist.zeit }
      if (!gleich(soll, ist)) out.push(befund(k, { quelle: 'rechnen', pruefpunkt: 'kumuliert', kategorie: 'Inconsistency', prioritaet: 'Medium', text: `Cumulative time does not add up: ${zeigen(vorher)} + ${zeigen(d)} = ${zeigen(soll)}, stated ${zeigen(ist)}.`, fundstellen: [{ seite: t.seite, ort: 'Table', auszug: zeile(t.zeilen[i]) }] }))
    }
  }
  return out
}

const SESSION = /\b(session|lesson|fstd|ffs|ftd|sim(?:ulator)?|einheit)\b[^|]{0,40}?(\d{1,2}:\d{2}|\d+(?:[.,]\d+)?)\s*(?:h|hrs?|hours?|std)\b/i

/** Sessiondauer (N6): Summe der Zeitblöcke gegen die Dauer, die direkt über der Tabelle steht. */
function sessionPruefen(k: PruefKontext, tabs: Tabelle[]): Omit<Befund, 'id'>[] {
  const out: Omit<Befund, 'id'>[] = []
  for (const t of tabs) {
    const angabe = [...t.davor].reverse().map((z) => ({ z, m: z.match(SESSION) })).find((x) => x.m)
    if (!angabe) continue
    // Kopfzeilen, Summen- und Kumuliert-Spalten zählen nicht
    if (t.zeilen[0].some((c) => KUMULIERT.test(c))) continue
    // Kopfzeile („Block | Duration") und Summenzeile zählen nicht mit
    const daten = t.zeilen.filter((z) => !SUMME.test(z[0] ?? '') && z.slice(1).some((c) => wertLesen(c)))
    if (!daten.length) continue
    const spalte = wertSpalten({ ...t, zeilen: daten }, 0, daten.length).find((s) => daten.some((z) => wertLesen(z[s] ?? '')?.zeit))
    if (spalte === undefined) continue
    const summe = daten.reduce((a, z) => a + (wertLesen(z[spalte] ?? '')?.n ?? 0), 0)
    const g = wertLesen(angabe.m![2])!
    const soll = g.zeit ? g.n : g.n * 60
    if (Math.abs(summe - soll) >= 0.5) out.push(befund(k, { quelle: 'rechnen', pruefpunkt: 'session', kategorie: 'Inconsistency', prioritaet: 'Medium', text: `Session timeline adds up to ${zeitText(summe)}, but the session is stated as ${zeitText(soll)}.`, fundstellen: [{ seite: t.seite, auszug: angabe.z }] }))
  }
  return out
}

/* ---------------------------- Einheiten ------------------------------- */

/** Zahl mit Tausendertrennern („11,930", „11 930", „11.930") oder Dezimalstelle. */
const ZAHL = String.raw`(\d{1,3}(?:[ ,.]\d{3})+(?![.,]?\d)|\d+(?:[.,]\d+)?)`
export function zahl(s: string): number {
  if (/^\d{1,3}(?:[ ,.]\d{3})+$/.test(s)) return Number(s.replace(/[ ,.]/g, ''))
  return Number(s.replace(',', '.'))
}

const PAARE: { a: string; b: string; nach: (x: number) => number; abs?: number }[] = [
  { a: 'lbs?', b: 'kg', nach: (x) => x * 0.45359237 },
  { a: 'ft', b: 'm', nach: (x) => x * 0.3048 },
  { a: 'kts?|kt', b: 'km/h', nach: (x) => x * 1.852 },
  { a: 'NM', b: 'km', nach: (x) => x * 1.852 },
  { a: '°C', b: '°F', nach: (x) => x * 1.8 + 32, abs: 1 },
]

export function einheitenPruefen(k: PruefKontext): Omit<Befund, 'id'>[] {
  const out: Omit<Befund, 'id'>[] = []
  for (const p of k.roh.pages) {
    for (const satz of p.text.split(/\n|(?<=[.;])\s+(?=[A-Z])/)) {
      for (const pr of PAARE) {
        const a = satz.match(new RegExp(`${ZAHL}\\s*(?:${pr.a})(?![\\p{L}/])`, 'u'))
        const b = satz.match(new RegExp(`${ZAHL}\\s*(?:${pr.b})(?![\\p{L}/])`, 'u'))
        if (!a || !b) continue
        const [x, y] = [zahl(a[1]), zahl(b[1])]
        const erwartet = pr.nach(x)
        const ok = pr.abs !== undefined ? Math.abs(erwartet - y) <= pr.abs : Math.abs(erwartet - y) <= Math.abs(erwartet) * 0.01
        if (ok) continue
        const einheit = (m: RegExpMatchArray) => m[0].slice(m[1].length).trim()
        out.push(befund(k, { quelle: 'rechnen', pruefpunkt: 'einheiten', kategorie: 'Inconsistency', prioritaet: 'Medium', text: `Unit conversion does not match: ${a[1]} ${einheit(a)} = ${Math.round(erwartet * 10) / 10} ${einheit(b)}, stated ${b[1]} ${einheit(b)} (tolerance 1 %).`, fundstellen: [{ seite: p.label ?? String(p.index), auszug: satz.trim() }] }))
      }
    }
  }
  return out
}

/* ------------------------------- METAR -------------------------------- */

const WIND = /\b(?:\d{3}|VRB)\d{2,3}(?:G\d{2,3})?(?:KT|MPS)\b/
const WETTER = /(?:^|\s)[+-]?(?:VC)?(?:MI|BC|PR|DR|BL|SH|TS|FZ)?(?:DZ|RA|SN|SG|PL|GR|GS|UP|BR|FG|FU|VA|DU|SA|HZ|PO|SQ|FC|SS|DS)+(?=\s|$)/

/** Eine METAR-ähnliche Zeile auf Plausibilität prüfen — liefert die Mängel als englische Sätze. */
export function metarMaengel(z: string): string[] {
  const m: string[] = []
  const nachWind = z.slice((z.match(WIND)?.index ?? 0) + (z.match(WIND)?.[0].length ?? 0))
  const sicht = nachWind.match(/^\s+(\d{4})\b/)?.[1]
  const vis = sicht !== undefined ? Number(sicht) : null
  const wetter = nachWind.match(WETTER)?.[0].trim() ?? ''
  const nebel = /FG/.test(wetter)
  const tt = z.match(/(?:^|\s)(M?\d{1,2})\/(M?\d{1,2})(?=\s|$)/)
  if (tt) {
    const t = (s: string) => (s.startsWith('M') ? -Number(s.slice(1)) : Number(s))
    if (tt[1].replace('M', '').length !== 2 || tt[2].replace('M', '').length !== 2) m.push(`Temperature/dew point group "${tt[1]}/${tt[2]}" is not in ICAO format (two digits each, e.g. 15/04).`)
    else if (t(tt[2]) > t(tt[1])) m.push(`Dew point ${t(tt[2])} °C is above the temperature ${t(tt[1])} °C.`)
    else if ((nebel || /BR/.test(wetter)) && t(tt[1]) - t(tt[2]) > 3) m.push(`${nebel ? 'Fog' : 'Mist'} with a temperature/dew point spread of ${t(tt[1]) - t(tt[2])} °C is implausible.`)
  }
  if (vis !== null && vis < 5000 && !wetter && !/CAVOK/.test(z)) m.push(`Visibility ${vis} m without a present weather group (BR, HZ, FG …).`)
  if (nebel && vis !== null && vis >= 1000) m.push(`FG reported with visibility ${vis} m; fog requires visibility below 1000 m (use BR).`)
  const vv = z.match(/\bVV(\d{3})\b/)
  if (vv && Number(vv[1]) > 10 && (vis === null || vis < 1000)) m.push(`Vertical visibility VV${vv[1]} (${Number(vv[1]) * 100} ft) is implausible with visibility ${vis ?? '?'} m — VV${String(Math.max(1, Math.round(Number(vv[1]) / 100))).padStart(3, '0')}?`)
  return m
}

function metarPruefen(k: PruefKontext): Omit<Befund, 'id'>[] {
  const out: Omit<Befund, 'id'>[] = []
  for (const p of k.roh.pages)
    for (const z of p.text.split('\n'))
      if (WIND.test(z)) for (const t of metarMaengel(z)) out.push(befund(k, { quelle: 'rechnen', pruefpunkt: 'metar', kategorie: 'Inconsistency', prioritaet: 'Medium', text: `Weather scenario: ${t}`, fundstellen: [{ seite: p.label ?? String(p.index), auszug: z.trim() }] }))
  return out
}

/* --------------------------- Doppelte Tokens -------------------------- */

/** Doppelungen, die richtig sind („had had", „that that"). */
const ERLAUBT = new Set(['had', 'that', 'is', 'bye', 'ha', 'so', 'very', 'many', 'more'])

function doppeltPruefen(k: PruefKontext): Omit<Befund, 'id'>[] {
  const fund: Fundstelle[] = []
  const woerter = new Set<string>()
  for (const p of k.roh.pages)
    for (const z of p.text.split('\n'))
      for (const m of z.matchAll(/(?<![\p{L}\p{N}])(\p{L}{2,})\s+\1(?![\p{L}\p{N}])/gu)) {
        const w = m[1]
        if (ERLAUBT.has(w.toLowerCase())) continue
        woerter.add(w)
        fund.push({ seite: p.label ?? String(p.index), auszug: z.trim() })
      }
  if (!fund.length) return []
  return [befund(k, { quelle: 'rechnen', pruefpunkt: 'doppelt', kategorie: 'Editorial', prioritaet: 'Low', text: `Repeated word or waypoint: ${[...woerter].map((w) => `"${w} ${w}"`).join(', ')} (${fund.length}×).`, fundstellen: fund })]
}

/* ------------------------------- Gesamt -------------------------------- */

export function rechenPruefung(k: PruefKontext): { befunde: Omit<Befund, 'id'>[]; ampel: Record<string, Ampel> } {
  const tabs = tabellen(k.roh)
  const befunde = [...summenPruefen(k, tabs), ...kumuliertPruefen(k, tabs), ...sessionPruefen(k, tabs), ...einheitenPruefen(k), ...metarPruefen(k), ...doppeltPruefen(k)]
  const na: Punkt[] = k.roh.format === 'pdf' ? ['summen', 'kumuliert', 'session'] : []
  return { befunde, ampel: ampelAus([...RECHEN_PUNKTE], befunde as Befund[], na) }
}
