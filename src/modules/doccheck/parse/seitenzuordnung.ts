import { aufbereiten } from './aufbereiten'
import type { DocPage, OutlineNode, Rechtscharakter, WordExtrakt } from './model'

/**
 * Seitenangaben bei DOCX (Nachtrag N5).
 *
 * Der Browser bricht DOCX nicht so um wie Word — im Anlassfall lagen eigene
 * Darstellungen bis zu 7 Seiten daneben. Wer in Word „Seite 42" sucht,
 * braucht aber Words Seite 42. Zwei Wege dahin:
 *
 *  1. Word-PDF-Paar: Das aus Word exportierte PDF hat Words Umbruch. Jede
 *     Einheit (Absatz, Tabellenzeile) wird dort per Textsuche gefunden.
 *  2. Ohne PDF: Das Inhaltsverzeichnis trägt Words Seitenzahl je Überschrift.
 *     Dazwischen wird anteilig nach Textmenge geschätzt — „S. 42 (±1)".
 *
 * Der Abschnittspfad bleibt in beiden Fällen dabei und ist maßgeblich.
 */

export interface Einheit {
  text: string
  seite: number
  ebene?: number
}

/** Vergleichsform: nur Buchstaben und Ziffern, klein. Leerraum, Tabellen-
 *  trenner, Silbentrennung und Bindestrich-Varianten fallen heraus. */
export function vergleichsform(s: string): string {
  return s.toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, '')
}

/** Eintrag des Inhaltsverzeichnisses → Titel und Seite (letzte Zahl nach Tab/Punkten). */
export function tocEintrag(text: string): { titel: string; seite: number | null } {
  const m = text.match(/^(.*?)[\s.…·]*\t?\s*(\d{1,4})\s*$/)
  if (!m || !m[1].trim()) return { titel: text.replace(/\t/g, ' ').trim(), seite: null }
  return { titel: m[1].replace(/\t/g, ' ').replace(/[\s.]+$/, '').trim(), seite: Number(m[2]) }
}

/** Ein veraltetes Inhaltsverzeichnis (Seitenzahlen fallen zurück) taugt
 *  nicht zur Abbildung — dann lieber „ca." als eine falsche Zahl. */
export function tocPlausibel(toc: WordExtrakt['toc']): boolean {
  const zahlen = toc.map((t) => t.seite).filter((s): s is number => s !== null)
  if (zahlen.length < 2) return false
  return zahlen.every((z, i) => i === 0 || z >= zahlen[i - 1])
}

/**
 * Seite je Einheit über das Inhaltsverzeichnis. Liefert null, wenn sich
 * weniger als zwei Überschriften einem Eintrag zuordnen lassen.
 */
export function tocZuordnung(einheiten: Einheit[], toc: WordExtrakt['toc'], gesamt?: number): number[] | null {
  if (!tocPlausibel(toc)) return null
  const eintraege = toc.filter((t) => t.seite !== null).map((t) => ({ f: vergleichsform(t.titel), seite: t.seite! }))
  const anker: { i: number; seite: number }[] = []
  let j = 0
  einheiten.forEach((e, i) => {
    if (!e.ebene) return
    const f = vergleichsform(e.text)
    for (let k = j; k < eintraege.length; k++) {
      if (eintraege[k].f === f || (f.length > 8 && eintraege[k].f.startsWith(f)) || (eintraege[k].f.length > 8 && f.startsWith(eintraege[k].f))) {
        anker.push({ i, seite: eintraege[k].seite })
        j = k + 1
        return
      }
    }
  })
  if (anker.length < 2) return null

  // Textmenge kumuliert bis zum ANFANG jeder Einheit.
  const kum: number[] = []
  let summe = 0
  for (const e of einheiten) {
    kum.push(summe)
    summe += e.text.length
  }
  const erster = anker[0]
  const letzter = anker[anker.length - 1]
  const proSeite = (kum[letzter.i] - kum[erster.i]) / Math.max(1, letzter.seite - erster.seite) || 2500
  const ende = gesamt && gesamt >= letzter.seite ? gesamt : letzter.seite + Math.ceil((summe - kum[letzter.i]) / proSeite)

  // Stützstellen: Anfang, alle Anker, Ende.
  const stuetz = [{ c: 0, seite: Math.min(1, erster.seite) }, ...anker.map((a) => ({ c: kum[a.i], seite: a.seite })), { c: summe, seite: ende + 1 }]
  return einheiten.map((_, i) => {
    const c = kum[i]
    let k = 0
    while (k < stuetz.length - 2 && stuetz[k + 1].c <= c) k++
    const a = stuetz[k]
    const b = stuetz[k + 1]
    const anteil = b.c > a.c ? (c - a.c) / (b.c - a.c) : 0
    const s = a.seite + Math.floor(anteil * (b.seite - a.seite))
    // Gedeckelt durch die Seite der nächsten Überschrift (N5.2) bzw. das
    // Dokumentende — die Stützstelle „Ende" liegt eine Seite dahinter.
    const deckel = k + 1 === stuetz.length - 1 ? ende : b.seite
    return Math.max(1, Math.min(s, deckel))
  })
}

/**
 * Einheiten im Word-PDF finden. Abweichung = Anteil des DOCX-Textes, der im
 * PDF nicht wiederzufinden ist (N5.2: > 2 % → Warnung, Fallback).
 */
export interface Schnitt {
  seite: number
  /** Index im Originaltext der Einheit, ab dem diese Seite gilt */
  ab: number
}

/** Index im Originaltext, an dem das n-te Vergleichszeichen steht. */
function originalIndex(text: string, n: number): number {
  let gezaehlt = 0
  for (let i = 0; i < text.length; i++) {
    if (vergleichsform(text[i])) {
      if (gezaehlt === n) return i
      gezaehlt++
    }
  }
  return text.length
}

/**
 * Einheiten im Word-PDF finden. Läuft eine Einheit über eine PDF-Seitengrenze,
 * wird sie dort geteilt — sonst bekäme ein Zitat aus der zweiten Hälfte eines
 * langen Absatzes die Seite, auf der der Absatz BEGINNT.
 * Abweichung = Anteil des DOCX-Textes, der im PDF nicht wiederzufinden ist
 * (N5.2: > 2 % → Warnung, Fallback).
 */
export function pdfZuordnung(einheiten: Einheit[], pdfSeiten: string[]): { seiten: number[]; schnitte: Schnitt[][]; abweichung: number } {
  const starts: number[] = []
  let pdf = ''
  for (const s of pdfSeiten) {
    starts.push(pdf.length)
    pdf += vergleichsform(s)
  }
  const seiteVon = (pos: number) => {
    let lo = 0
    let hi = starts.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (starts[mid] <= pos) lo = mid
      else hi = mid - 1
    }
    return lo + 1
  }
  let zeiger = 0
  let gesamt = 0
  let fehlend = 0
  let vorige = 1
  const schnitte: Schnitt[][] = []
  const seiten = einheiten.map((e) => {
    const f = vergleichsform(e.text)
    if (f.length < 6) {
      schnitte.push([{ seite: vorige, ab: 0 }])
      return vorige
    }
    gesamt += f.length
    const probe = f.slice(0, 40)
    let pos = pdf.indexOf(probe, zeiger)
    if (pos < 0) pos = pdf.indexOf(probe)
    if (pos < 0) {
      fehlend += f.length
      schnitte.push([{ seite: vorige, ab: 0 }])
      return vorige
    }
    // Übereinstimmung über die ganze Einheit, nicht nur den Anfang: Ein
    // geänderter Satzschluss zählt als Abweichung.
    let gleich = 0
    while (gleich < f.length && pdf[pos + gleich] === f[gleich]) gleich++
    fehlend += f.length - gleich
    zeiger = pos + Math.max(gleich, probe.length)
    const erste = seiteVon(pos)
    const teile: Schnitt[] = [{ seite: erste, ab: 0 }]
    for (let s = erste; s < starts.length && starts[s] < pos + gleich; s++) {
      teile.push({ seite: s + 1, ab: originalIndex(e.text, starts[s] - pos) })
    }
    schnitte.push(teile)
    vorige = teile[teile.length - 1].seite
    return erste
  })
  return { seiten, schnitte, abweichung: gesamt ? fehlend / gesamt : 0 }
}

/** Einheiten an ihren Schnitten in Stücke teilen (für den Seitenaufbau). */
export function teilen(einheiten: Einheit[], schnitte: Schnitt[][]): { einheiten: Einheit[]; seiten: number[] } {
  const out: Einheit[] = []
  const seiten: number[] = []
  einheiten.forEach((e, i) => {
    const t = schnitte[i]
    t.forEach((s, k) => {
      const bis = k + 1 < t.length ? t[k + 1].ab : e.text.length
      const text = e.text.slice(s.ab, bis).trim()
      if (!text) return
      // Die Überschrift-Ebene gehört nur dem ersten Stück.
      out.push({ text, seite: s.seite, ...(k === 0 && e.ebene ? { ebene: e.ebene } : {}) })
      seiten.push(s.seite)
    })
  })
  return { einheiten: out, seiten }
}

/** Seiten 1…max aus Einheiten und ihrer Seite bauen — mit Abschnittspfad und Gliederung. */
export function seitenAusEinheiten(
  einheiten: Einheit[],
  seiteJe: number[],
  label: (n: number) => string,
  vorgabe?: Rechtscharakter,
): { pages: DocPage[]; outline: OutlineNode[] } {
  const max = Math.max(1, ...seiteJe)
  const zeilen: string[][] = Array.from({ length: max }, () => [])
  const ebenen: { text: string; ebene: number }[][] = Array.from({ length: max }, () => [])
  einheiten.forEach((e, i) => {
    zeilen[seiteJe[i] - 1].push(e.text)
    if (e.ebene) ebenen[seiteJe[i] - 1].push({ text: e.text, ebene: e.ebene })
  })
  let pfad: string[] = []
  const outline: OutlineNode[] = []
  const pfade = ebenen.map((liste, i) => {
    for (const u of liste) {
      pfad = [...pfad.slice(0, u.ebene - 1), u.text]
      outline.push({ titel: u.text, ebene: u.ebene, vonSeite: i + 1 })
    }
    return [...pfad]
  })
  const { pages } = aufbereiten(zeilen, { vorgabe, kopfFuss: false, labels: zeilen.map((_, i) => label(i + 1)) })
  pages.forEach((p, i) => {
    if (pfade[i].length) p.sectionPath = pfade[i]
    else delete p.sectionPath
  })
  return { pages, outline }
}

/** PDF-Datum „D:20261101093000+01'00'" → ms (UTC-Versatz berücksichtigt). */
export function pdfDatum(s?: string): number | null {
  const m = s?.match(/^D:(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?(Z|[+-]\d{2}'?\d{2}'?)?/)
  if (!m) return null
  const [, j, mo = '01', t = '01', h = '00', mi = '00', se = '00', tz] = m
  let ms = Date.UTC(+j, +mo - 1, +t, +h, +mi, +se)
  if (tz && tz !== 'Z') {
    const v = tz[0] === '-' ? -1 : 1
    const [hh, mm] = tz.slice(1).replace(/'/g, '').match(/\d{2}/g)!.map(Number)
    ms -= v * (hh * 60 + (mm ?? 0)) * 60000
  }
  return ms
}
