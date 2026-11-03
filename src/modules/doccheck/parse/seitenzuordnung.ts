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
  /**
   * Fußnote oder Textfeld (FRD-13): steht hinter ihrem Anker, in Word aber
   * nicht im Textfluss — die Fußnote am Seitenfuß, das Textfeld frei auf
   * der Seite. Im Word-PDF wird sie gesucht, verschiebt den Lesezeiger aber
   * nicht (siehe `pdfZuordnung`).
   */
  nachgereicht?: boolean
}

const HOCH: Record<string, string> = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', i: 'ⁱ', v: 'ᵛ', x: 'ˣ' }

/**
 * Verweiszeichen hochgestellt, wie Word es zeigt — im DOCX-Leser wie im
 * PDF-Leser, damit „FCL.810¹" auf beiden Seiten gleich aussieht. Die
 * Vergleichsform macht per NFKC wieder „1" daraus.
 */
export function hoch(s: string): string {
  return [...s].map((c) => HOCH[c] ?? c).join('')
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

const NUMMER = /^\s*\d+(?:\.\d+)*\.?\s+(?=\S)/

/** Trägt ein Titel eine führende Kapitelnummer („1.2 Scope")? */
export function hatNummer(titel: string): boolean {
  return NUMMER.test(titel)
}

/** Titel ohne führende Kapitelnummer: „1.2 Scope" → „Scope". */
export function ohneNummer(titel: string): string {
  return titel.replace(NUMMER, '')
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
  const eintraege = toc.filter((t) => t.seite !== null).map((t) => ({ f: vergleichsform(t.titel), ohne: vergleichsform(ohneNummer(t.titel)), seite: t.seite! }))
  const anker: { i: number; seite: number }[] = []
  let j = 0
  einheiten.forEach((e, i) => {
    if (!e.ebene) return
    const f = vergleichsform(e.text)
    // Überschrift ohne Nummer gegen den Eintrag ohne Nummer (FRD-01) — sonst
    // findet „General" keinen Anker an „1 General".
    const nr = hatNummer(e.text)
    for (let k = j; k < eintraege.length; k++) {
      const ef = nr ? eintraege[k].f : eintraege[k].ohne
      if (ef === f || (f.length > 8 && ef.startsWith(f)) || (ef.length > 8 && f.startsWith(ef))) {
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
/** Höchstens so viel PDF-Text (Vergleichsform) vor dem Seitenwechsel gilt als Seitenfuß — Fußnoten, Fußzeile. */
const SEITENFUSS_MAX = 1500
/** … und so viel danach als Kopf der nächsten Seite. */
const SEITENKOPF_MAX = 300
/** So viele Zeichen der Einheit werden hinter dem Seitenwechsel gesucht … */
const WEITER_PROBE = 16
/** … mindestens aber so viele — ein kürzerer Rest fände sich zufällig. */
const WEITER_MIN = 6

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
    // Bis zu drei Ziffern, die nur im PDF stehen (Fußnotenziffer, Feldergebnis),
    // werden übersprungen statt den Rest der Einheit als fehlend zu zählen —
    // sonst scheiterte das passende PDF schon an einer Fußnote (Audit
    // 11/2026, FRD-06).
    let gleich = 0
    let imPdf = 0
    // Übersprungene PDF-Bereiche (Versatz ab pos, Länge)
    const uebersprungen: { ab: number; n: number }[] = []
    const springen = (n: number) => {
      uebersprungen.push({ ab: imPdf, n })
      imPdf += n
    }
    while (gleich < f.length) {
      if (pdf[pos + imPdf] === f[gleich]) {
        gleich++
        imPdf++
        continue
      }
      let k = 1
      while (k <= 3 && /\d/.test(pdf[pos + imPdf + k - 1] ?? '') && pdf[pos + imPdf + k] !== f[gleich]) k++
      if (k <= 3 && /\d/.test(pdf[pos + imPdf + k - 1] ?? '') && pdf[pos + imPdf + k] === f[gleich]) {
        springen(k)
        continue
      }
      // Läuft ein Absatz über den Seitenwechsel, stehen im PDF die Fußnoten
      // der Seite (und eine Kopfzeile der nächsten) zwischen seinen Hälften.
      // Ohne Weiterlesen hinter der Grenze zählte die zweite Hälfte als
      // fehlend — bei jedem seitenübergreifenden Absatz über einer Fußnote
      // (Gegenprüfung Audit 11/2026). Übersprungen wird nur PDF-Text; die
      // Einheit selbst muss hinter der Grenze weiter genau passen.
      // Gesucht nur im Kopf der nächsten Seite — nicht im ganzen Rest des PDF.
      const grenze = starts[seiteVon(pos + imPdf)]
      const rest = f.slice(gleich, gleich + WEITER_PROBE)
      const imKopf = grenze !== undefined && grenze - (pos + imPdf) <= SEITENFUSS_MAX && rest.length >= WEITER_MIN ? pdf.slice(grenze, grenze + SEITENKOPF_MAX + rest.length).indexOf(rest) : -1
      if (imKopf < 0) break
      springen(grenze + imKopf - (pos + imPdf))
    }
    fehlend += f.length - gleich
    // Eine Fußnote steht im PDF am Seitenfuß, HINTER dem Rest der Seite.
    // Rückte der Zeiger dorthin, fand die nächste Überschrift ihren Text erst
    // wieder im Inhaltsverzeichnis — „2.2 Course Phases" stand auf S. 2, und
    // die Nummerierung meldete „2.1 missing" (Gegenprüfung Audit 11/2026).
    if (!e.nachgereicht) zeiger = pos + Math.max(imPdf, probe.length)
    // PDF-Versatz → Versatz in der Vergleichsform der Einheit (ohne Übersprungenes)
    const inEinheit = (p: number) => p - uebersprungen.reduce((n, u) => n + Math.max(0, Math.min(u.n, p - u.ab)), 0)
    const erste = seiteVon(pos)
    const teile: Schnitt[] = [{ seite: erste, ab: 0 }]
    for (let s = erste; s < starts.length && starts[s] < pos + imPdf; s++) {
      teile.push({ seite: s + 1, ab: originalIndex(e.text, inEinheit(starts[s] - pos)) })
    }
    schnitte.push(teile)
    if (!e.nachgereicht) vorige = teile[teile.length - 1].seite
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
  // reduce statt Math.max(...): Bei mehr als etwa 150 000 Einheiten (sehr
  // große DOCX) lief der Aufruf sonst über den Stapel.
  const max = seiteJe.reduce((m, s) => (s > m ? s : m), 1)
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
