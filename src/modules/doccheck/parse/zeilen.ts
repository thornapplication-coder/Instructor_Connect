import { hoch } from './seitenzuordnung'

/**
 * Zeilen aus den Textstücken einer PDF-Seite zusammensetzen (Spez. 7.2).
 *
 * pdf.js liefert Textstücke mit Koordinaten, keine Zeilen. Wer sie in der
 * gelieferten Reihenfolge aneinanderhängt, bekommt bei zweispaltigem Satz
 * und bei Abbildungsbeschriftungen genau die Scheinbefunde aus der
 * Referenzprüfung (Kap. 17 Nr. 2): „or or", zerrissene Sätze, eine
 * Beschriftung mitten im Fließtext.
 *
 * Deshalb: Stücke nach Höhe zu Zeilen bündeln, innerhalb der Zeile nach
 * Abständen in Blöcke trennen — und dann entscheiden, ob die Seite
 * zweispaltig ist (dann Spalte für Spalte) oder nur vereinzelt getrennte
 * Blöcke hat (Tabellen, Beschriftungen: dann mit „ | " getrennt, nie als
 * fortlaufender Satz).
 */

export interface TextStueck {
  str: string
  x: number
  /** Grundlinie, PDF-Koordinaten (wächst nach OBEN) */
  y: number
  w: number
  h: number
}

export interface Block {
  x: number
  ende: number
  text: string
}

export interface RohZeile {
  y: number
  bloecke: Block[]
}

/** Ab diesem Abstand (in Schrifthöhen) beginnt ein neuer Block. */
const BLOCK_LUECKE = 2.2
/** Ab diesem Abstand steht zwischen zwei Stücken ein Leerzeichen. */
const WORT_LUECKE = 0.15
/** Mindestzahl Rumpfzeilen (ohne erste und letzte), bevor überhaupt Spalten erwogen werden. */
const RUMPF_MIN = 6
/** Anteil der Rumpfzeilen, die die Spaltenlücke NICHT überdecken dürfen. */
const LUECKE_FREI = 0.8
/** Mindestanteil der Rumpfzeilen mit Text links bzw. rechts der Lücke. */
const SEITE_MIN = 0.25
/** Mindestanteil fortgesetzter Zeilen je Spalte — Fließtext statt Tabellenzellen. */
const FORTSETZUNG_MIN = 0.3
/** Kopf-/Fußzeile: so viel weiter abgesetzt als der übliche Zeilenabstand. */
const RAND_ABSTAND = 1.8
/** Hochgestellt: höchstens so hoch wie die größte Schrift der Zeile … */
const HOCH_HOEHE = 0.75
/** … und mindestens um diesen Anteil von ihr angehoben. */
const HOCH_VERSATZ = 0.2

/**
 * Hochgestellte Ziffern einer Zeile (Fußnotenzeichen, Exponent) als Hochzahl.
 * Sie stehen klein und angehoben direkt am Wort — als normale Ziffer klebten
 * sie an der Regel: „FCL.810" + „1" wurde „FCL.8101", eine Regel, die es
 * nicht gibt, und ein Befund „not found" (Gegenprüfung Audit 11/2026, FRD-06).
 */
function hochstellen(stuecke: TextStueck[]): TextStueck[] {
  const gross = stuecke.reduce<TextStueck | null>((m, s) => (!m || s.h > m.h ? s : m), null)
  if (!gross) return stuecke
  return stuecke.map((s) => (s.h <= HOCH_HOEHE * gross.h && s.y - gross.y >= HOCH_VERSATZ * gross.h && /^\d{1,3}$/.test(s.str.trim()) ? { ...s, str: hoch(s.str.trim()) } : s))
}

function bloeckeBilden(stuecke: TextStueck[]): Block[] {
  const sortiert = hochstellen(stuecke).sort((a, b) => a.x - b.x)
  const out: Block[] = []
  for (const s of sortiert) {
    const letzter = out[out.length - 1]
    const hoehe = Math.max(s.h, 1)
    if (!letzter || s.x - letzter.ende > BLOCK_LUECKE * hoehe) {
      out.push({ x: s.x, ende: s.x + s.w, text: s.str })
      continue
    }
    const luecke = s.x - letzter.ende
    const brauchtLeer = luecke > WORT_LUECKE * hoehe && !/\s$/.test(letzter.text) && !/^\s/.test(s.str)
    letzter.text += (brauchtLeer ? ' ' : '') + s.str
    letzter.ende = Math.max(letzter.ende, s.x + s.w)
  }
  return out.map((b) => ({ ...b, text: b.text.replace(/\s+/g, ' ').trim() })).filter((b) => b.text)
}

export function rohZeilen(stuecke: TextStueck[]): RohZeile[] {
  const sichtbar = stuecke.filter((s) => s.str.trim())
  // Von oben nach unten; innerhalb gleicher Höhe von links nach rechts.
  const sortiert = [...sichtbar].sort((a, b) => b.y - a.y || a.x - b.x)
  const gruppen: { y: number; h: number; stuecke: TextStueck[] }[] = []
  for (const s of sortiert) {
    const g = gruppen[gruppen.length - 1]
    // Hoch- und tiefgestellte Zeichen liegen etwas versetzt — sie gehören
    // trotzdem zur Zeile, solange der Versatz unter halber Schrifthöhe bleibt.
    if (g && Math.abs(g.y - s.y) <= Math.max(2, 0.5 * Math.max(g.h, s.h))) g.stuecke.push(s)
    else gruppen.push({ y: s.y, h: s.h, stuecke: [s] })
  }
  return gruppen.map((g) => ({ y: g.y, bloecke: bloeckeBilden(g.stuecke) })).filter((z) => z.bloecke.length)
}

/**
 * Senkrechte Lücke zwischen zwei Satzspalten — oder null.
 *
 * Audit 11/2026, FRD-05: Vorher entschied der Anteil der Zeilen mit genau
 * zwei Blöcken. Das hing an zufällig gleichen Grundlinien: Eine einspaltige
 * Seite mit zweispaltiger Abkürzungstabelle galt als zweispaltig (Kürzel
 * und Bedeutungen getrennt), eine kurze Seite schon wegen geteilter Kopf-
 * und Fußzeile, ein echter Zweispalter mit versetzten Grundlinien dagegen
 * nicht. Jetzt: eine Lücke, die fast keine Rumpfzeile überdeckt, mit Text
 * auf beiden Seiten — und auf BEIDEN Seiten Fließtext, der in der nächsten
 * Zeile weiterläuft. Tabellenzellen („ATO" → „ATC", „Approved …" → „Air …")
 * laufen nicht weiter; sie bleiben Zeilen „A | B".
 */
export function spaltenGrenze(rumpf: RohZeile[]): number | null {
  if (rumpf.length < RUMPF_MIN) return null
  const bloecke = rumpf.flatMap((z) => z.bloecke)
  const lo = Math.min(...bloecke.map((b) => b.x))
  const hi = Math.max(...bloecke.map((b) => b.ende))
  if (hi <= lo) return null
  const kanten = [...new Set(bloecke.flatMap((b) => [b.x, b.ende]))].sort((a, b) => a - b)
  // Elementarintervalle zwischen Blockkanten: Überdeckung ist darin konstant.
  const frei = (a: number, b: number) => rumpf.filter((z) => !z.bloecke.some((k) => k.x <= a && k.ende >= b)).length / rumpf.length
  const luecken: { a: number; b: number }[] = []
  for (let i = 0; i + 1 < kanten.length; i++) {
    const [a, b] = [kanten[i], kanten[i + 1]]
    if (frei(a, b) < LUECKE_FREI) continue
    const letzte = luecken[luecken.length - 1]
    if (letzte && letzte.b === a) letzte.b = b
    else luecken.push({ a, b })
  }
  let beste: number | null = null
  let breite = 0
  for (const l of luecken) {
    const m = (l.a + l.b) / 2
    const rel = (m - lo) / (hi - lo)
    if (rel < 0.2 || rel > 0.8 || l.b - l.a <= breite) continue
    const links = rumpf.filter((z) => z.bloecke.some((k) => k.ende <= m)).length / rumpf.length
    const rechts = rumpf.filter((z) => z.bloecke.some((k) => k.x >= m)).length / rumpf.length
    if (links < SEITE_MIN || rechts < SEITE_MIN) continue
    if (fortgesetzt(rumpf, m, 'links') < FORTSETZUNG_MIN || fortgesetzt(rumpf, m, 'rechts') < FORTSETZUNG_MIN) continue
    beste = m
    breite = l.b - l.a
  }
  return beste
}

/** Anteil der Folgezeilen einer Spalte, die klein beginnen — der Satz läuft weiter. */
function fortgesetzt(rumpf: RohZeile[], m: number, seite: 'links' | 'rechts'): number {
  const texte = rumpf
    .filter((z) => !z.bloecke.some((k) => k.x < m && k.ende > m))
    .map((z) => z.bloecke.filter((k) => (seite === 'links' ? k.ende <= m : k.x >= m)).map((k) => k.text).join(' '))
    .filter(Boolean)
  if (texte.length < 3) return 0
  let weiter = 0
  for (let i = 1; i < texte.length; i++) if (/^\p{Ll}/u.test(texte[i]) || /[-‐]$/.test(texte[i - 1])) weiter++
  return weiter / (texte.length - 1)
}

/**
 * Die Zeilen einer Seite in Lesereihenfolge.
 *
 * Zweispaltig (siehe `spaltenGrenze`): erst die linke, dann die rechte
 * Spalte — abschnittsweise zwischen Zeilen, die über die Lücke reichen
 * (Titel, Einleitung). Kopf- und Fußzeile bleiben ganz, sonst stünde „Page 4
 * of 13" hinter der rechten Spalte und die Seitenbezeichnung ginge verloren.
 */
export function seitenZeilen(stuecke: TextStueck[]): string[] {
  const zeilen = rohZeilen(stuecke)
  const ganz = (z: RohZeile) => z.bloecke.map((b) => b.text).join(' | ')
  const grenze = zeilen.length >= 3 ? spaltenGrenze(zeilen.slice(1, -1)) : null
  if (grenze === null) return zeilen.map(ganz)

  const abstaende = zeilen.slice(1).map((z, i) => zeilen[i].y - z.y).sort((a, b) => a - b)
  const ueblich = abstaende[Math.floor(abstaende.length / 2)]
  const n = zeilen.length
  const rand = (i: number) => (i === 0 && zeilen[0].y - zeilen[1].y > RAND_ABSTAND * ueblich) || (i === n - 1 && zeilen[n - 2].y - zeilen[n - 1].y > RAND_ABSTAND * ueblich)
  const out: string[] = []
  let links: string[] = []
  let rechts: string[] = []
  const abschliessen = () => {
    out.push(...links, ...rechts)
    links = []
    rechts = []
  }
  zeilen.forEach((z, i) => {
    if (rand(i) || z.bloecke.some((b) => b.x < grenze && b.ende > grenze)) {
      abschliessen()
      out.push(ganz(z))
      return
    }
    const l = z.bloecke.filter((b) => b.ende <= grenze).map((b) => b.text)
    const r = z.bloecke.filter((b) => b.x >= grenze).map((b) => b.text)
    if (l.length) links.push(l.join(' | '))
    if (r.length) rechts.push(r.join(' | '))
  })
  abschliessen()
  return out
}
