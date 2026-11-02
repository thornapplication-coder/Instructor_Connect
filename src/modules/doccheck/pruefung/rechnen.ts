import type { Rohdokument } from '../parse/model'
import { ampelAus, type Ampel, type Befund, type Fundstelle } from './befund'
import { befund, type PruefKontext } from './kontext'
import { dokumentSprache, spracheVon, type Sprache } from './sprache'

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
// Hochgestelltes Verweiszeichen am Zellende („1.5¹", „12:30ⁱ") — seit FRD-06
// steht es wie in Word im Text; es gehört nicht zum Wert, sonst fiele die
// ganze Spalte aus der Summenprüfung.
const VERWEIS = /[\u00B9\u00B2\u00B3\u2070\u2074-\u2079\u2071\u1D5B\u02E3]+$/u

export function wertLesen(s: string): Wert | null {
  const t = s.trim().replace(VERWEIS, '').replace(/\s*(h|hrs?|hours?|std\.?)$/i, '')
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
  /** Seite, auf der die Tabelle beginnt */
  seite: string
  /** Seite je Zeile — eine Tabelle kann über eine Seitengrenze gehen (FRD-02) */
  seiten: string[]
  /** Text der Zeilen direkt vor der Tabelle (für die Sessiondauer) */
  davor: string[]
}

/**
 * Zellen einer Tabellenzeile. Leere Randzellen zählen mit, auch wenn die
 * Zeile zugeschnitten wurde: Das Word-PDF-Paar schneidet seine Stücke zu,
 * und aus „ | Dual | Mutual | " wurde „| Dual | Mutual |" — zwei Zellen
 * weniger, und die Zeile fiel aus ihrer Tabelle (FRD-02/FRD-03).
 */
const zellenVon = (z: string) => (/(?:^|\s)\|(?:\s|$)/.test(z) ? ` ${z} `.split(' | ').map((c) => c.trim()) : null)

/**
 * Aufeinanderfolgende Zeilen mit gleicher Zellenzahl (≥ 2) bilden eine Tabelle.
 *
 * DOCX: Die Seiten sind geschätzt oder über das Word-PDF gepaart — eine
 * Seitengrenze kann mitten durch eine Tabelle laufen. Endet Seite n mit
 * einer Tabellenzeile und beginnt n+1 mit einer gleich breiten, ist es
 * dieselbe Tabelle. Vorher bildete jede Seite ihre eigene: Ein fehlerfreies
 * Dokument bekam High-Summenbefunde („13:30 vs 26:00"), und eine falsche
 * Summe mit nur einer Datenzeile auf ihrer Seite fiel durch (Audit 11/2026,
 * FRD-02). XLSX-„Seiten" sind Blätter — dort endet jede Tabelle am Blatt.
 */
export function tabellen(roh: Pick<Rohdokument, 'format' | 'pages'>): Tabelle[] {
  if (roh.format === 'pdf') return []
  const out: Tabelle[] = []
  let akt: Tabelle | null = null
  for (const p of roh.pages) {
    const seite = p.label ?? String(p.index)
    const zeilen = p.text.split('\n')
    // Über die Seitengrenze nur bei DOCX und nur, wenn nichts dazwischen
    // steht; Leerzeilen am Seitenrand trennen nichts.
    const erste = zeilen.findIndex((z) => z.trim())
    const letzte = zeilen.length - 1 - [...zeilen].reverse().findIndex((z) => z.trim())
    const weiter = roh.format === 'docx' && akt !== null && erste >= 0 && zellenVon(zeilen[erste])?.length === akt.zeilen[0].length
    if (!weiter) akt = null
    if (erste < 0) continue
    for (let i = erste; i <= letzte; i++) {
      const zellen = zellenVon(zeilen[i])
      if (zellen && akt && akt.zeilen[0].length === zellen.length) {
        akt.zeilen.push(zellen)
        akt.seiten.push(seite)
      } else if (zellen) {
        akt = { zeilen: [zellen], seite, seiten: [seite], davor: zeilen.slice(Math.max(0, i - 3), i).filter((x) => !x.includes(' | ')) }
        out.push(akt)
      } else akt = null
    }
  }
  return out.filter((t) => t.zeilen.length >= 2)
}

/** „S. 10" bis „S. 11" → „S. 10–11"; gleiche Seite bleibt eine Angabe. */
export function seitenSpanne(von: string, bis: string): string {
  if (von === bis) return von
  const a = von.match(/^(\D*)(\d+)(.*)$/)
  const b = bis.match(/^(\D*)(\d+)(.*)$/)
  return a && b && a[1] === b[1] && a[3] === b[3] ? `${a[1]}${a[2]}–${b[2]}${a[3]}` : `${von} – ${bis}`
}

/**
 * Umkehrung von `seitenSpanne`: die erste Seite — „S. 10–11 (±1)" → „S.
 * 10 (±1)". „Seite anzeigen" sucht die Bezeichnung wörtlich unter den
 * Seiten; eine Spanne fand sich dort nicht, und der Viewer öffnete Seite 1
 * (Gegenprüfung P5 zu FRD-02).
 */
export function seitenAnfang(seite: string): string {
  return seite.includes(' – ') ? seite.split(' – ')[0] : seite.replace(/^(\D*\d+)–\d+/, '$1')
}

/**
 * Kopftext je Spalte: alle Zeilen vor der ersten Zeile mit einem Wert,
 * spaltenweise verkettet. Word-Köpfe sind oft zweizeilig („Flight time"
 * über „Dual | Mutual", „Cumulative" senkrecht verbunden) — wer nur die
 * erste Zeile las, erkannte die Kumuliert-Spalte nicht, wenn sie in der
 * zweiten stand (Audit 11/2026, FRD-03).
 */
export function kopfSpalten(t: Pick<Tabelle, 'zeilen'>): string[] {
  const erste = t.zeilen.findIndex((r) => r.slice(1).some((c) => wertLesen(c)))
  const kopf = t.zeilen.slice(0, Math.max(1, erste))
  return t.zeilen[0].map((_, s) => kopf.map((r) => r[s] ?? '').filter(Boolean).join(' '))
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

/** Zwischensumme — sie prüft die Zeilen seit der letzten (Zwischen-)Summe und zählt selbst nicht zur Gesamtsumme. */
const ZWISCHEN = /^(sub-?totals?|zwischensumme|teilsumme)\b/i

function summenPruefen(k: PruefKontext, tabs: Tabelle[]): { befunde: Omit<Befund, 'id'>[]; verglichen: number } {
  const out: Omit<Befund, 'id'>[] = []
  let verglichen = 0
  for (const t of tabs) {
    const kopf = kopfSpalten(t)
    let abGesamt = 0
    let abZwischen = 0
    t.zeilen.forEach((z, i) => {
      const zwischen = ZWISCHEN.test(z[0] ?? '')
      if (!zwischen && !SUMME.test(z[0] ?? '')) return
      const start = zwischen ? abZwischen : abGesamt
      // Kopfzeile überspringen: erste Zeile mit einem Wert
      const von = t.zeilen.slice(start, i).findIndex((r) => r.slice(1).some((c) => wertLesen(c))) + start
      // Datenzeilen: ohne Zwischensummen — sonst zählte die Gesamtsumme sie doppelt (Fachprüfung 01.11.2026)
      const daten = t.zeilen.slice(von, i).filter((r) => !ZWISCHEN.test(r[0] ?? ''))
      // Eine Kumuliert-Spalte summiert man nicht — ihre Summenzeile ist der letzte Stand.
      for (const s of wertSpalten(t, von, i).filter((s) => !KUMULIERT.test(kopf[s] ?? ''))) {
        const soll = wertLesen(z[s] ?? '')
        if (!soll) continue
        const ist: Wert = { n: daten.reduce((a, r) => a + (wertLesen(r[s] ?? '')?.n ?? 0), 0), zeit: soll.zeit }
        if (daten.length >= 2) verglichen++
        if (!gleich(ist, soll)) out.push(befund(k, { quelle: 'rechnen', pruefpunkt: 'summen', anleitung: 'summen', kategorie: 'Inconsistency', prioritaet: 'High', text: `Table ${zwischen ? 'subtotal' : 'total'} does not match: sum of rows ${zeigen(ist)}, stated ${zeigen(soll)}.`, fundstellen: [{ seite: seitenSpanne(t.seiten[Math.max(0, von)], t.seiten[i]), ort: 'Table', auszug: zeile(z) }] }))
      }
      abZwischen = i + 1
      if (!zwischen) abGesamt = i + 1
    })
  }
  return { befunde: out, verglichen }
}

const DAUER = /duration|dauer|time|zeit|min/i

function kumuliertPruefen(k: PruefKontext, tabs: Tabelle[]): Omit<Befund, 'id'>[] {
  const out: Omit<Befund, 'id'>[] = []
  for (const t of tabs) {
    const kopf = kopfSpalten(t)
    const kum = kopf.findIndex((c) => KUMULIERT.test(c))
    const d0 = kopf.findIndex((c, i) => i !== kum && DAUER.test(c) && !KUMULIERT.test(c))
    if (kum < 0 || d0 < 0) continue
    // Unter einem verbundenen Kopf („Flight time" über Dual | Mutual) zählen
    // alle Unterspalten: In der ersten Kopfzeile ist ihre Zelle die leere
    // Auffüllung der Verbindung, darunter steht ihr eigener Name (FRD-03).
    const dauer = [d0]
    for (let s = d0 + 1; s < kopf.length && s !== kum && !t.zeilen[0][s] && kopf[s]; s++) dauer.push(s)
    for (let i = 2; i < t.zeilen.length; i++) {
      const teile = dauer.map((s) => wertLesen(t.zeilen[i][s] ?? '')).filter((w): w is Wert => w !== null)
      const [vorher, ist] = [wertLesen(t.zeilen[i - 1][kum] ?? ''), wertLesen(t.zeilen[i][kum] ?? '')]
      if (!vorher || !teile.length || !ist || SUMME.test(t.zeilen[i][0] ?? '')) continue
      const d: Wert = { n: teile.reduce((a, w) => a + w.n, 0), zeit: teile[0].zeit }
      const soll: Wert = { n: vorher.n + d.n, zeit: ist.zeit }
      if (!gleich(soll, ist)) out.push(befund(k, { quelle: 'rechnen', pruefpunkt: 'kumuliert', anleitung: 'kumuliert', kategorie: 'Inconsistency', prioritaet: 'Medium', text: `Cumulative time does not add up: ${zeigen(vorher)} + ${zeigen(d)} = ${zeigen(soll)}, stated ${zeigen(ist)}.`, fundstellen: [{ seite: t.seiten[i], ort: 'Table', auszug: zeile(t.zeilen[i]) }] }))
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
    if (kopfSpalten(t).some((c) => KUMULIERT.test(c))) continue
    // Kopfzeile („Block | Duration") und Summenzeile zählen nicht mit
    const daten = t.zeilen.filter((z) => !SUMME.test(z[0] ?? '') && z.slice(1).some((c) => wertLesen(c)))
    if (!daten.length) continue
    const spalte = wertSpalten({ ...t, zeilen: daten }, 0, daten.length).find((s) => daten.some((z) => wertLesen(z[s] ?? '')?.zeit))
    if (spalte === undefined) continue
    const summe = daten.reduce((a, z) => a + (wertLesen(z[spalte] ?? '')?.n ?? 0), 0)
    const g = wertLesen(angabe.m![2])!
    const soll = g.zeit ? g.n : g.n * 60
    if (Math.abs(summe - soll) >= 0.5) out.push(befund(k, { quelle: 'rechnen', pruefpunkt: 'session', anleitung: 'session', kategorie: 'Inconsistency', prioritaet: 'Medium', text: `Session timeline adds up to ${zeitText(summe)}, but the session is stated as ${zeitText(soll)}.`, fundstellen: [{ seite: t.seite, auszug: angabe.z }] }))
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

/**
 * `rund`: Regelwerke runden die metrische Angabe — SERA.5005 schreibt
 * „150 m (500 ft)" und „300 m (1 000 ft)", 1,6 % neben dem genauen Wert.
 * Mit 1 % Toleranz bekam jedes Handbuch, das die VFR-Mindesthöhen zitiert,
 * einen Befund (Audit 11/2026, FRD-08). Ein auf 50 m runder Wert darf
 * darum bis 2,5 % abweichen; „1000 ft (350 m)" bleibt ein Fehler.
 */
const PAARE: { a: string; b: string; nach: (x: number) => number; abs?: number; rund?: { auf: number; toleranz: number } }[] = [
  { a: 'lbs?', b: 'kg', nach: (x) => x * 0.45359237 },
  { a: 'ft', b: 'm', nach: (x) => x * 0.3048, rund: { auf: 50, toleranz: 0.025 } },
  { a: 'kts?|kt', b: 'km/h', nach: (x) => x * 1.852 },
  { a: 'NM', b: 'km', nach: (x) => x * 1.852 },
  { a: '°C', b: '°F', nach: (x) => x * 1.8 + 32, abs: 1 },
]

/**
 * Nur DIREKT verbundene Paare zählen: „11930 lbs (5834 kg)", „11930 lb /
 * 5834 kg", „10000 ft = 3048 m", in beiden Reihenfolgen. Zwei Größen im
 * selben Satz („DH not lower than 200 ft and RVR not less than 550 m")
 * sind keine Umrechnung — die Fachprüfung vom 01.11.2026 fand genau diesen
 * Fehlalarm, und solche Sätze stehen in jedem TM.
 */
const VERBINDUNG = String.raw`\s*(?:\(\s*|\/\s*|=\s*|≈\s*|~\s*|or\s+|bzw\.\s+|i\.\s?e\.\s+)`

export function einheitenPruefen(k: PruefKontext): Omit<Befund, 'id'>[] {
  const out: Omit<Befund, 'id'>[] = []
  const ende = '(?![\\p{L}/])'
  for (const p of k.roh.pages) {
    for (const zeile of p.text.split('\n')) {
      for (const pr of PAARE) {
        const vor = new RegExp(`${ZAHL}\\s*(${pr.a})${ende}${VERBINDUNG}${ZAHL}\\s*(${pr.b})${ende}`, 'gu')
        const rueck = new RegExp(`${ZAHL}\\s*(${pr.b})${ende}${VERBINDUNG}${ZAHL}\\s*(${pr.a})${ende}`, 'gu')
        const paare = [
          ...[...zeile.matchAll(vor)].map((m) => ({ x: m[1], ea: m[2], y: m[3], eb: m[4] })),
          ...[...zeile.matchAll(rueck)].map((m) => ({ x: m[3], ea: m[4], y: m[1], eb: m[2] })),
        ]
        for (const q of paare) {
          const erwartet = pr.nach(zahl(q.x))
          const y = zahl(q.y)
          const abw = Math.abs(erwartet - y)
          const ok = pr.abs !== undefined ? abw <= pr.abs : abw <= Math.abs(erwartet) * 0.01 || (!!pr.rund && y > 0 && y % pr.rund.auf === 0 && abw <= Math.abs(erwartet) * pr.rund.toleranz)
          if (ok) continue
          out.push(befund(k, { quelle: 'rechnen', pruefpunkt: 'einheiten', anleitung: 'einheiten', kategorie: 'Inconsistency', prioritaet: 'Medium', text: `Unit conversion does not match: ${q.x} ${q.ea} = ${Math.round(erwartet * 10) / 10} ${q.eb}, stated ${q.y} ${q.eb} (tolerance 1 %).`, fundstellen: [{ seite: p.label ?? String(p.index), auszug: zeile.trim() }] }))
        }
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
  // Variable Windrichtung („240V300") steht zwischen Wind und Sicht — überspringen
  const nachWind = z.slice((z.match(WIND)?.index ?? 0) + (z.match(WIND)?.[0].length ?? 0)).replace(/^\s+\d{3}V\d{3}\b/, '')
  const sicht = nachWind.match(/^\s+(\d{4})\b/)?.[1]
  const vis = sicht !== undefined ? Number(sicht) : null
  const wetter = nachWind.match(WETTER)?.[0].trim() ?? ''
  // Nur echter Nebel: MIFG, BCFG, PRFG und VCFG sind nach ICAO Annex 3
  // von der 1000-m-Grenze ausgenommen (Fachprüfung 01.11.2026)
  const nebel = /^[+-]?(?:FZ)?FG$/.test(wetter)
  // Temperatur/Taupunkt: die LETZTE passende Gruppe — „RWY 09/27" weiter vorn ist eine Bahn
  const tt = [...z.matchAll(/(?:^|(?<!RWY)\s)(M?\d{1,2})\/(M?\d{1,2})(?=\s|$)/g)].at(-1)
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
      if (WIND.test(z)) for (const t of metarMaengel(z)) out.push(befund(k, { quelle: 'rechnen', pruefpunkt: 'metar', anleitung: 'metar', kategorie: 'Inconsistency', prioritaet: 'Medium', text: `Weather scenario: ${t}`, fundstellen: [{ seite: p.label ?? String(p.index), auszug: z.trim() }] }))
  return out
}

/* --------------------------- Doppelte Tokens -------------------------- */

/**
 * Doppelungen, die richtig sind — je Sprache: „had had", „that that"; im
 * Deutschen Artikel vor Relativpronomen („Fluglehrer, die die Einweisung
 * …", „das Luftfahrzeug, das das …"). Vorher galt die englische Liste für
 * jedes Dokument, und jedes deutsche Handbuch hatte einen Befund (Audit
 * 11/2026, FRD-17).
 */
const ERLAUBT: Partial<Record<Sprache, Set<string>>> = {
  en: new Set(['had', 'that', 'is', 'bye', 'ha', 'so', 'very', 'many', 'more']),
  de: new Set(['die', 'der', 'das', 'den', 'dem', 'des', 'sie', 'wir']),
}

function doppeltPruefen(k: PruefKontext): Omit<Befund, 'id'>[] {
  const fund: Fundstelle[] = []
  const woerter = new Set<string>()
  // Sprache je Zeile, sonst die des Dokuments — eine deutsche Zeile im englischen Handbuch folgt den deutschen Regeln
  const dok = dokumentSprache(k.roh.pages.flatMap((p) => p.text.split('\n')))
  for (const p of k.roh.pages)
    for (const z of p.text.split('\n'))
      for (const m of z.matchAll(/(?<![\p{L}\p{N}])(\p{L}{2,})\s+\1(?![\p{L}\p{N}])/gu)) {
        const w = m[1]
        if (ERLAUBT[spracheVon(z) ?? dok ?? 'en']?.has(w.toLowerCase())) continue
        woerter.add(w)
        fund.push({ seite: p.label ?? String(p.index), auszug: z.trim() })
      }
  if (!fund.length) return []
  return [befund(k, { quelle: 'rechnen', pruefpunkt: 'doppelt', anleitung: 'doppelt', kategorie: 'Editorial', prioritaet: 'Low', text: `Repeated word or waypoint: ${[...woerter].map((w) => `"${w} ${w}"`).join(', ')} (${fund.length}×).`, fundstellen: fund })]
}

/* ------------------------------- Gesamt -------------------------------- */

export function rechenPruefung(k: PruefKontext): { befunde: Omit<Befund, 'id'>[]; ampel: Record<string, Ampel> } {
  const tabs = tabellen(k.roh)
  const summen = summenPruefen(k, tabs)
  const befunde = [...summen.befunde, ...kumuliertPruefen(k, tabs), ...sessionPruefen(k, tabs), ...einheitenPruefen(k), ...metarPruefen(k), ...doppeltPruefen(k)]
  // Nicht anwendbar, wo es nichts zu prüfen gab — Grün hieße sonst „geprüft, in Ordnung" (Fachprüfung 01.11.2026)
  const na: Punkt[] = []
  const zellen0 = (t: Tabelle) => t.zeilen.map((z) => z[0] ?? '')
  // Eine Summenzeile allein reicht nicht: „ok" nur, wenn sie wirklich gegen
  // mindestens zwei Datenzeilen gerechnet wurde (Audit 11/2026, FRD-11 — die
  // Excel-Summe passte zu keiner Spalte und stand trotzdem auf grün).
  if (!tabs.some((t) => zellen0(t).some((c) => SUMME.test(c) || ZWISCHEN.test(c))) || (!summen.verglichen && !summen.befunde.length)) na.push('summen')
  if (!tabs.some((t) => kopfSpalten(t).some((c) => KUMULIERT.test(c)))) na.push('kumuliert')
  if (!tabs.some((t) => t.davor.some((z) => SESSION.test(z)))) na.push('session')
  if (!k.roh.pages.some((p) => p.text.split('\n').some((z) => WIND.test(z)))) na.push('metar')
  return { befunde, ampel: ampelAus([...RECHEN_PUNKTE], befunde as Befund[], na) }
}
