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

interface Block {
  x: number
  ende: number
  text: string
}

interface RohZeile {
  y: number
  bloecke: Block[]
}

/** Ab diesem Abstand (in Schrifthöhen) beginnt ein neuer Block. */
const BLOCK_LUECKE = 2.2
/** Ab diesem Abstand steht zwischen zwei Stücken ein Leerzeichen. */
const WORT_LUECKE = 0.15
/** Anteil der Zeilen mit Spaltentrennung, ab dem die Seite zweispaltig ist. */
const SPALTEN_ANTEIL = 0.3

function bloeckeBilden(stuecke: TextStueck[]): Block[] {
  const sortiert = [...stuecke].sort((a, b) => a.x - b.x)
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
 * Die Zeilen einer Seite in Lesereihenfolge.
 *
 * Zweispaltig heißt: Ein nennenswerter Teil der Zeilen ist an ähnlicher
 * Stelle getrennt. Dann wird die Trennstelle als Spaltengrenze genommen und
 * erst die linke, dann die rechte Spalte gelesen.
 */
export function seitenZeilen(stuecke: TextStueck[]): string[] {
  const zeilen = rohZeilen(stuecke)
  const getrennt = zeilen.filter((z) => z.bloecke.length === 2)
  if (zeilen.length >= 6 && getrennt.length / zeilen.length >= SPALTEN_ANTEIL) {
    const grenzen = getrennt.map((z) => z.bloecke[1].x).sort((a, b) => a - b)
    const grenze = grenzen[Math.floor(grenzen.length / 2)] - 1
    const links: string[] = []
    const rechts: string[] = []
    for (const z of zeilen) {
      const l = z.bloecke.filter((b) => b.x < grenze).map((b) => b.text)
      const r = z.bloecke.filter((b) => b.x >= grenze).map((b) => b.text)
      if (l.length) links.push(l.join(' | '))
      if (r.length) rechts.push(r.join(' | '))
    }
    return [...links, ...rechts]
  }
  return zeilen.map((z) => z.bloecke.map((b) => b.text).join(' | '))
}
