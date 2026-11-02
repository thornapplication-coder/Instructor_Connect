import { datumFinden, revisionFinden } from '../parse/meta'
import type { Aenderung, WortAbsatz } from '../parse/model'
import { hatNummer, ohneNummer, vergleichsform } from '../parse/seitenzuordnung'
import { ampelAus, anzahl, type Anleitung, type Befund, type Fundstelle, type Prioritaet } from './befund'
import { datumAehnlich, fremdesRegelwerk, kapitelNummern } from './verweise'
import { abkuerzungenIn, absaetze, befund, fundstelle, kurz, seiteFinder, seitenName, verwendeteAbkuerzungen, type PruefAbsatz, type PruefKontext } from './kontext'

/**
 * Formalprüfung (Spez. v1.1 Kap. 8.8) — lokal, ohne KI, sofort nach dem
 * Einlesen. Referenz ist das Verfahren zur Dokumentenlenkung der ATO; hier
 * stehen deshalb KEINE erfundenen Regelzitate, nur der Befund und die
 * Fundstelle.
 */

/** Englische Bezeichnung je Änderungsart — Fundstellen gehen so in den Export (FRD-15). */
export const AENDERUNGSART: Record<Aenderung['art'], string> = {
  ins: 'Inserted',
  del: 'Deleted',
  moveFrom: 'Moved away',
  moveTo: 'Moved here',
  format: 'Formatting changed',
}

export const FORMAL_PUNKTE = ['revisionsstand', 'lep', 'seiten', 'revisionen', 'inhalt', 'nummerierung', 'querverweise', 'abkuerzungen', 'reste'] as const

type Ergebnis = Omit<Befund, 'id'>

/** Beginnt mit dieser Zeile ein Abschnitt (Überschrift, kein Verzeichniseintrag)? */
function abschnittsKopf(zeile: string, synonyme: string[]): boolean {
  const t = zeile.trim().toLowerCase().replace(/^\d+(\.\d+)*\.?\s+/, '')
  // Ein Verzeichniseintrag endet mit einer Seitenzahl.
  return synonyme.some((s) => t === s || (t.startsWith(`${s} `) && !/\d\s*$/.test(t)) || t === `${s}:`)
}

/** Seiten, auf denen ein Abschnitt BEGINNT (Überschrift, kein Verzeichniseintrag). */
export function abschnittSeiten(pages: { text: string }[], synonyme: string[]): number[] {
  const out: number[] = []
  pages.forEach((p, i) => {
    if (p.text.split('\n').some((z) => abschnittsKopf(z, synonyme))) out.push(i)
  })
  return out
}

/** Eintrag einer Abkürzungsliste als Textzeile: „AFM Airplane Flight Manual", „AFM – …", „AFM | …". */
const EINTRAG = /^\s*([A-Z][A-Z0-9/&]{1,9})\s*(?:\||–|-|:|\t|\s{2,}|\s)\s*([A-Za-z].{2,})$/
const KUERZEL = /^[A-Z][A-Z0-9/&]{1,9}$/

/**
 * Abkürzungsliste eines Word-Dokuments: was unter ihrer Überschrift steht,
 * bis zur nächsten Überschrift — Tabellenzeilen „Kürzel | Bedeutung" oder
 * Zeilen „AFM Airplane Flight Manual". Über Absätze, nicht über geschätzte
 * Seiten: Stand Kapitel 1 auf derselben geschätzten Seite wie die Liste,
 * zählten seine Abkürzungen nicht als verwendet, und benutzte Einträge
 * hießen „never used" (Audit 11/2026, FRD-16). `von`/`bis`: Absatzindizes
 * der Liste samt Überschrift.
 */
export function wordAbkuerzungsliste(absaetze: WortAbsatz[], synonyme: string[]): { von: number; bis: number; liste: Map<string, string> } | null {
  const im = (a: WortAbsatz) => a.ort === 'body' || a.ort === 'textfeld'
  const von = absaetze.findIndex((a) => im(a) && !a.toc && !a.tabelle && abschnittsKopf(a.text, synonyme))
  if (von < 0) return null
  const liste = new Map<string, string>()
  let bis = von
  let kuerzel: string | undefined
  for (let i = von + 1; i < absaetze.length; i++) {
    const a = absaetze[i]
    if (!im(a)) continue
    if (a.ebene && !a.tabelle) break
    bis = i
    const t = a.text.trim()
    if (a.tabelle) {
      if (a.tabelle.spalte === 0) kuerzel = KUERZEL.test(t) ? t : undefined
      else if (a.tabelle.spalte === 1 && kuerzel && t) liste.set(kuerzel, t)
    } else {
      const m = t.match(EINTRAG)
      if (m) liste.set(m[1], m[2])
    }
  }
  return { von, bis, liste }
}

/**
 * „Revision 2" bleibt, „2" wird „revision 2" — der erkannte Wert trägt das
 * Wort oft schon, und „Document is at revision Revision 2" stand in allen
 * Exporten (Audit 11/2026, TXT-07/UID-14).
 */
export function revisionNennen(rev: string): string {
  const t = rev.trim()
  return /^(?:rev|edition|ed\.|issue|ausgabe|amendment)/i.test(t) ? t : `revision ${t}`
}

/**
 * Beschriftung einer Abbildung oder Tabelle: eine kurze Zeile, die mit
 * „Figure 3"/„Tabelle 2" beginnt — ein Verweis im Fließtext („Table 3 shows
 * …") ist keine. In einer Word-Tabellenzelle nur mit der Vorlage „Caption"
 * bzw. „Beschriftung": Die Revisionszeile „Tabelle 2 ergänzt" ergab sonst
 * Lücke UND Doppelung (Audit 11/2026, FRD-18).
 */
export function istBeschriftung(a: Pick<PruefAbsatz, 'text' | 'inTabelle' | 'stilName'>): boolean {
  return a.text.length <= 120 && (!a.inTabelle || /caption|beschriftung/i.test(a.stilName ?? ''))
}

/**
 * Kapitelverweis ohne Schlüsselwort: „see 9.4", „refer to 7.3", „gemäß
 * 2.1" — in Handbüchern die häufigste Form, vorher prüfte sie keine Regel
 * (Audit 11/2026, FRD-14). Nur Nummern mit Punkt („see 4" ist zu unsicher).
 */
const KURZVERWEIS = /\b(?:see|refer to|siehe|gemäß|according to|in accordance with|iaw)\s+(\d+(?:\.\d+)+)(?!\.?\d)/giu
/** Zahl mit Einheit („refer to 7.3 NM", „see 5.1 kg") ist kein Kapitel. */
const EINHEIT_DANACH = /^\s*(?:%|‰|°|(?:NM|nm|km|m|ft|kts?|KT|KIAS|KTAS|KCAS|kg|lbs?|LBS|t|h|hrs?|hours?|Std|Stunden|min|minutes?|Minuten|days?|Tagen?|s|sec|mm|cm|l|ltr|litres?|liters?|Liter|USG|gal|hPa|mbar|inHg|psi|PSI|fpm|FPM|rpm|RPM|Hz|kHz|MHz|percent|Prozent)(?![\p{L}\d]))/u
/** Kapitel eines ANDEREN Dokuments („see 2.3 of the AFM", „gemäß 4.1 des OM-A") — nicht hier zu suchen. */
const ANDERES_DOKUMENT = /^\s*(?:of|in|des|der|im)\s+(?:the\s+)?(?:[A-Z][A-Z0-9]+(?:-[A-Z0-9]+)?\b|(?:\p{Lu}[\p{L}-]*\s+){1,3}(?:Manual|Handbook|Handbuch)\b)/u

/** Kurzverweise einer Zeile, ohne Einheiten, Daten und Ziele in anderen Dokumenten oder Regelwerken. */
export function kurzverweise(zeile: string): RegExpMatchArray[] {
  return [...zeile.matchAll(KURZVERWEIS)].filter((m) => {
    const danach = zeile.slice(m.index! + m[0].length)
    return !datumAehnlich(m[1]) && !EINHEIT_DANACH.test(danach) && !ANDERES_DOKUMENT.test(danach) && !fremdesRegelwerk(danach)
  })
}

/** Letzte Zahl einer Revisionsangabe („Edition 2 Rev 1.0" → 1, „Revision 3" → 3). */
export function revNummer(rev?: string): number | undefined {
  const m = rev?.match(/\bRev(?:ision)?\.?\s*(\d+(?:\.\d+)?)/i) ?? rev?.match(/(\d+(?:\.\d+)?)\s*$/)
  return m ? Number(m[1]) : undefined
}

/** Lücken und Doppelungen in hierarchischen Nummern („1", „1.1", „1.3"). */
export function nummernPruefen(nummern: string[]): { luecken: string[]; doppelt: string[] } {
  const gesehen = new Set<string>()
  const doppelt: string[] = []
  const letzte = new Map<string, number>()
  const luecken: string[] = []
  for (const n of nummern) {
    if (gesehen.has(n)) doppelt.push(n)
    gesehen.add(n)
    const teile = n.split(/[.-]/)
    const eltern = teile.slice(0, -1).join('.')
    const x = Number(teile[teile.length - 1])
    const vorher = letzte.get(eltern)
    const erwartet = vorher === undefined ? 1 : vorher + 1
    if (x > erwartet) luecken.push(`${eltern ? `${eltern}.` : ''}${erwartet}${x - 1 > erwartet ? `–${eltern ? `${eltern}.` : ''}${x - 1}` : ''}`)
    if (vorher === undefined || x > vorher) letzte.set(eltern, x)
  }
  return { luecken, doppelt }
}

/** Seitenbezeichnung ohne Gesamtzahl: „Page 7 of 13" → „Page 7", „Seite 3 von 10" → „Seite 3". */
export function ohneGesamt(label: string): string {
  return label.replace(/\s*(?:of|von|\/)\s*\d+\s*$/i, '').trim()
}

const NUR_NUMMER = /^\d+(?:[-.]\d+)*$/
/** Nummer am Ende einer Seitenkennung, mit Kapitelpräfix: „Page 7" → „7", „3-12" → „3-12". */
const seitenNummer = (s: string) => s.match(/(\d+(?:[-.]\d+)*)\s*$/)?.[1]

/** Dieselbe Seite? Wörtlich gleich — oder, wenn eine Seite nur eine Nummer nennt, gleiche Nummer („7" in der Seitenspalte ↔ „Page 7"). */
export function gleicheSeite(a: string, b: string): boolean {
  return vergleichsform(a) === vergleichsform(b) || ((NUR_NUMMER.test(a) || NUR_NUMMER.test(b)) && seitenNummer(a) === seitenNummer(b))
}

export interface LepZeile {
  /** Seitenkennung, wie sie im LEP steht („Page 1", „7", „6-04-15 Page 2") */
  seite: string
  rev?: string
  datum?: string
}

const REV_WORT = /\b(?:Rev(?:ision)?\.?|Issue|Edition|Ausgabe)\s*\d/i
const DATUM = /\b\d{1,2}\.\d{1,2}\.\d{4}\b|\b\d{4}-\d{2}-\d{2}\b/

/**
 * Einträge einer List of Effective Pages — als Tabelle („Page | Revision |
 * Date", dann „1 | 2 | 15.03.2026") oder als Textzeile („Page 1 Rev 2
 * 01.03.2026"). Ein Eintrag braucht Revision oder Datum; eine Zeile wie
 * „Total pages: 13" ist keiner.
 */
export function lepZeilen(text: string): LepZeile[] {
  const out: LepZeile[] = []
  let spalten: { rev: number; datum: number } | null = null
  for (const z of text.split('\n')) {
    const zellen = z.includes(' | ') ? z.split(' | ').map((c) => c.trim()) : null
    if (zellen && !/\d/.test(zellen[0])) {
      // Kopfzeile: Spalten für Revision und Datum merken
      const rev = zellen.findIndex((c) => /^(?:rev|issue|edition|ausgabe|stand)/i.test(c))
      const datum = zellen.findIndex((c) => /^(?:date|datum|effective|gültig)/i.test(c))
      if (rev > 0 || datum > 0) spalten = { rev, datum }
      continue
    }
    const t = z.trim()
    // Erste Zelle bzw. bei Text alles vor Revision oder Datum; nur Zahlen („7 3") → die erste
    const vorne = zellen ? zellen[0] : t.split(new RegExp(`\\s+(?=${REV_WORT.source}|${DATUM.source})`, 'i'))[0].trim()
    const seite = /^[\d.-]+(?:\s+[\d.-]+)+$/.test(vorne) ? vorne.split(/\s+/)[0] : vorne
    if (!seitenNummer(seite)) continue
    const rev = zellen && spalten && spalten.rev > 0 ? zellen[spalten.rev] : revisionFinden(t)
    const datum = zellen && spalten && spalten.datum > 0 ? datumFinden(zellen[spalten.datum] ?? '') : datumFinden(t)
    if (!rev && !datum) continue
    out.push({ seite, ...(rev ? { rev } : {}), ...(datum ? { datum } : {}) })
  }
  return out
}

export function formalPruefung(k: PruefKontext): { befunde: Ergebnis[]; ampel: Record<string, 'ok' | 'wait' | 'bad' | 'na'> } {
  const { roh, regeln } = k
  const pages = roh.pages
  const out: Ergebnis[] = []
  const na: string[] = []
  const neu = (pruefpunkt: string, kategorie: Befund['kategorie'], prioritaet: Prioritaet, text: string, fundstellen: Fundstelle[], anleitung: Anleitung) =>
    out.push(befund(k, { quelle: 'formal', pruefpunkt, kategorie, prioritaet, text, fundstellen, anleitung }))
  const alle = absaetze(roh)
  const istPdf = roh.format === 'pdf'

  /* 1 Revisionsstand — Kopf-/Fußzeilen aller Seiten identisch, passend zum Deckblatt */
  if (istPdf && pages.some((p) => p.rand?.length)) {
    const werte = pages.map((p) => {
      const t = (p.rand ?? []).join(' | ')
      return { p, rev: revisionFinden(t), datum: datumFinden(t) }
    })
    const mehrheit = (f: 'rev' | 'datum') => {
      const z = new Map<string, number>()
      for (const w of werte) if (w[f]) z.set(w[f]!, (z.get(w[f]!) ?? 0) + 1)
      return [...z].sort((a, b) => b[1] - a[1])[0]?.[0]
    }
    const rev = mehrheit('rev')
    const datum = mehrheit('datum')
    const abweichend = werte.filter((w) => (rev && w.rev && w.rev !== rev) || (datum && w.datum && w.datum !== datum))
    const fs: Fundstelle[] = abweichend.map((w) => ({ seite: seitenName(w.p), auszug: `${w.rev ?? '—'} / ${w.datum ?? '—'} (majority: ${rev ?? '—'} / ${datum ?? '—'})` }))
    if (rev && k.meta.revision && revNummer(rev) !== revNummer(k.meta.revision)) fs.unshift({ seite: seitenName(pages[0]), ort: 'Cover', auszug: `Cover: ${k.meta.revision}, headers/footers: ${rev}` })
    if (fs.length) neu('revisionsstand', 'Document Control', 'Medium', `Revision/date in headers and footers is not identical on all pages or does not match the cover (${anzahl(fs.length, 'deviation')}).`, fs, 'revisionsstand')
  } else na.push('revisionsstand')

  /* 2 List of Effective Pages — gegen die tatsächlichen Seiten */
  const lep = abschnittSeiten(pages, regeln.abschnitte.lep)
  const labels = pages.map((p) => p.label).filter((l): l is string => !!l)
  if (istPdf && lep.length && labels.length >= 3) {
    // Über die Seitennummer, nicht über die wörtliche Fußzeile: „Page 2 of 13"
    // steht so in keinem LEP, und jede Seite galt als fehlend (Audit 11/2026,
    // FRD-07). Die alte Textsuche bleibt Rückfall, wenn sich keine Zeile
    // als Eintrag lesen lässt.
    const zeilen = lep.flatMap((i) => lepZeilen(pages[i].text))
    const mitLabel = pages.filter((p): p is typeof p & { label: string } => !!p.label)
    const fs: Fundstelle[] = []
    const lepSeite = seitenName(pages[lep[0]])
    let fehlend: typeof mitLabel
    let ueber: string[]
    let abweichend = 0
    if (zeilen.length) {
      // Ein Deckblatt trägt meist keine Seitenzahl, das LEP führt es trotzdem
      // als „1": Eine reine Nummer meint dann die physische Seite, sofern die
      // keine eigene Bezeichnung hat. Sonst stand in jedem Handbuch mit
      // schlichtem Deckblatt „Listed in LEP but not in document: 1"
      // (Gegenprüfung P5, Fremddokumente TM/AH).
      const ohneBezeichnung = (s: string) => /^\d+$/.test(s) && !!pages[Number(s) - 1] && !pages[Number(s) - 1].label
      fehlend = mitLabel.filter((p) => !zeilen.some((z) => gleicheSeite(z.seite, ohneGesamt(p.label))))
      ueber = [...new Set(zeilen.filter((z) => !mitLabel.some((p) => gleicheSeite(z.seite, ohneGesamt(p.label))) && !ohneBezeichnung(z.seite)).map((z) => z.seite))]
      // Revision und Datum je Eintrag gegen den Stand in Kopf-/Fußzeile der Seite (Spez. 8.8)
      for (const p of mitLabel) {
        const z = zeilen.find((x) => gleicheSeite(x.seite, ohneGesamt(p.label)))
        const rand = (p.rand ?? []).join(' | ')
        const [rev, datum] = [revisionFinden(rand), datumFinden(rand)]
        const revAnders = z?.rev && rev && revNummer(z.rev) !== undefined && revNummer(z.rev) !== revNummer(rev)
        const datumAnders = z?.datum && datum && z.datum !== datum
        if (!z || (!revAnders && !datumAnders)) continue
        abweichend++
        fs.push({ seite: lepSeite, auszug: `${ohneGesamt(p.label)}: LEP ${[z.rev, z.datum].filter(Boolean).join(' / ')}, page ${[rev, datum].filter(Boolean).join(' / ')}` })
      }
    } else {
      const lepText = vergleichsform(lep.map((i) => pages[i].text).join(' '))
      fehlend = mitLabel.filter((p) => !lepText.includes(vergleichsform(p.label)))
      const vorhanden = new Set(labels.map(vergleichsform))
      // Nur innerhalb einer Zeile: „Pages⏎Page 1" ist keine Seitenangabe.
      ueber = [...new Set(lep.flatMap((i) => pages[i].text.match(/(?:\b[\w.-]+[ \t]+)?\bPage[ \t]*\d+\b/gi) ?? []))].filter((x) => !vorhanden.has(vergleichsform(x)))
    }
    fs.unshift(...fehlend.map((p) => ({ seite: lepSeite, auszug: `Missing in LEP: ${ohneGesamt(p.label)}` })), ...ueber.map((x) => ({ seite: lepSeite, auszug: `Listed in LEP but not in document: ${x}` })))
    if (fs.length) neu('lep', 'Document Control', 'Medium', `List of Effective Pages does not match the actual pages (${fehlend.length} missing, ${ueber.length} surplus${abweichend ? `, ${abweichend} with a different revision or date` : ''}).`, fs, 'lep')
  } else na.push('lep')

  /* 3 Seitennummerierung — Lücken, Doppelungen, „Page x of y" */
  // XLSX: Die „Seiten" sind Blätter mit Namen — keine Nummerierung, nichts zu
  // prüfen; vorher stand der Punkt auf grün (Audit 11/2026, FRD-11).
  if (labels.length >= 3 && !roh.word && roh.format !== 'xlsx') {
    const fs: Fundstelle[] = []
    const vonGesamt = pages.map((p) => p.label?.match(/(\d+)\s*(?:of|von|\/|\|)\s*(\d+)\s*$/i)).filter(Boolean) as RegExpMatchArray[]
    if (vonGesamt.length >= 3) {
      const gesamt = new Set(vonGesamt.map((m) => Number(m[2])))
      if (gesamt.size > 1) fs.push({ auszug: `Different totals in "x of y": ${[...gesamt].join(', ')}` })
    }
    const gruppen = new Map<string, { n: number; p: (typeof pages)[number] }[]>()
    for (const p of pages) {
      const m = p.label?.match(/^(.*?)(\d+)(?:\s*(?:of|von|\/|\|)\s*\d+)?\s*$/i)
      if (!m) continue
      gruppen.set(m[1], [...(gruppen.get(m[1]) ?? []), { n: Number(m[2]), p }])
    }
    for (const [prefix, liste] of gruppen) {
      for (let i = 1; i < liste.length; i++) {
        const a = liste[i - 1].n
        const b = liste[i].n
        if (b === a) fs.push({ seite: seitenName(liste[i].p), auszug: `Duplicate page number: ${prefix}${b}` })
        else if (b > a + 1) fs.push({ seite: seitenName(liste[i].p), auszug: `Gap: ${prefix}${a + 1}${b - 1 > a + 1 ? `–${b - 1}` : ''} missing` })
      }
    }
    if (fs.length) neu('seiten', 'Document Control', 'Medium', `Page numbering has gaps, duplicates or inconsistent totals (${fs.length}).`, fs, 'seiten')
  } else na.push('seiten')

  /* 4 Revisionsverzeichnis / Highlights of Change */
  const revVz = abschnittSeiten(pages, regeln.abschnitte.revisionen)
  const docRev = revNummer(k.meta.revision)
  if (revVz.length && docRev !== undefined) {
    const eintraege = revVz.flatMap((i) => pages[i].text.split('\n')).map((z) => z.match(/^\s*(?:Rev(?:ision)?\.?\s*)?(\d+(?:\.\d+)?)\s*[|\s]+.*?(\d{1,2}\.\d{1,2}\.\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}\s+\p{L}+\s+\d{4})/iu)).filter(Boolean) as RegExpMatchArray[]
    const letzte = eintraege.length ? Math.max(...eintraege.map((m) => Number(m[1]))) : undefined
    if (letzte !== undefined && letzte !== docRev) neu('revisionen', 'Document Control', 'Medium', `Last entry in the record of revisions (${letzte}) does not match the document (${revisionNennen(k.meta.revision!)}).`, [{ seite: seitenName(pages[revVz[0]]), auszug: kurz(eintraege[eintraege.length - 1][0]) }], 'revisionen')
  }
  if (docRev !== undefined && docRev > 0 && !abschnittSeiten(pages, regeln.abschnitte.hoc).length) {
    neu('revisionen', 'Document Control', 'Medium', `Document is at ${revisionNennen(k.meta.revision!)} but contains no highlights of change.`, [{ seite: seitenName(pages[0]), auszug: k.meta.revision ?? '' }], 'revisionen')
  }
  if (!revVz.length && (docRev === undefined || docRev === 0)) na.push('revisionen')

  /* 5 Inhaltsverzeichnis — Einträge gegen die Überschriften */
  const ueberschriften = roh.outline.map((o) => o.titel)
  const formU = new Set(ueberschriften.map(vergleichsform))
  if (roh.word?.toc.length) {
    const tocFormen = new Set(roh.word.toc.map((t) => vergleichsform(t.titel)))
    const tocOhneNr = new Set(roh.word.toc.map((t) => vergleichsform(ohneNummer(t.titel))))
    // Trägt eine Überschrift keine Nummer, zählt beim Abgleich nur der Titel
    // (Audit 11/2026, FRD-01): Sonst wäre „1 General" im Verzeichnis gegen
    // „General" im Text ein Fehlalarm, obwohl der Befundtext „compared by
    // title only" verspricht. Wer eine Nummer trägt, muss sie auch treffen.
    const unnummeriert = new Set(roh.outline.filter((o) => !hatNummer(o.titel)).map((o) => vergleichsform(o.titel)))
    const maxEbene = Math.max(...roh.word.toc.map((t) => t.ebene))
    const fs: Fundstelle[] = [
      ...roh.word.toc.filter((t) => !formU.has(vergleichsform(t.titel)) && !unnummeriert.has(vergleichsform(ohneNummer(t.titel)))).map((t) => ({ ort: 'Table of contents', auszug: `Entry without matching heading: ${t.titel}` })),
      ...roh.outline.filter((o) => o.ebene <= maxEbene && !tocFormen.has(vergleichsform(o.titel)) && (hatNummer(o.titel) || !tocOhneNr.has(vergleichsform(o.titel)))).map((o) => ({ ort: 'Headings', auszug: `Heading missing in table of contents: ${o.titel}` })),
    ]
    if (fs.length) neu('inhalt', 'Inconsistency', 'Low', `Table of contents does not match the headings (${fs.length}). DOCX: compared by title only.`, fs, 'inhalt')
  } else {
    const tocSeiten = abschnittSeiten(pages, regeln.abschnitte.inhalt)
    const eintraege = tocSeiten.flatMap((i) => pages[i].text.split('\n').map((z) => z.match(/^(\d+(?:\.\d+)*)\.?\s+(.+?)[\s.…]+(\d{1,4})\s*$/)).filter(Boolean)) as RegExpMatchArray[]
    if (eintraege.length >= 2 && ueberschriften.length) {
      const nurZahlen = pages.every((p) => !p.label || /^\d+$/.test(p.label))
      const fs: Fundstelle[] = []
      for (const m of eintraege) {
        const titel = `${m[1]} ${m[2].trim()}`
        const o = roh.outline.find((x) => vergleichsform(x.titel) === vergleichsform(titel))
        if (!o) fs.push({ seite: seitenName(pages[tocSeiten[0]]), auszug: `Entry without matching heading: ${titel}` })
        else if (nurZahlen && Number(m[3]) !== o.vonSeite && Number(m[3]) !== Number(pages[o.vonSeite - 1]?.label)) fs.push({ seite: seitenName(pages[tocSeiten[0]]), auszug: `${titel}: listed on page ${m[3]}, found on page ${seitenName(pages[o.vonSeite - 1])}` })
      }
      if (fs.length) neu('inhalt', 'Inconsistency', 'Low', `Table of contents does not match the headings (${fs.length}).`, fs, 'inhalt')
    } else na.push('inhalt')
  }

  /* 6 Nummerierung — Überschriften, Abbildungen, Tabellen */
  const nummernU = ueberschriften.map((t) => t.match(/^(\d+(?:\.\d+)*)\s/)?.[1]).filter((x): x is string => !!x)
  const fsNr: Fundstelle[] = []
  let nummeriert = nummernU.length >= 2
  if (nummernU.length >= 2) {
    const r = nummernPruefen(nummernU)
    fsNr.push(...r.luecken.map((l) => ({ ort: 'Headings', auszug: `Gap in heading numbering: ${l} missing` })), ...r.doppelt.map((d) => ({ ort: 'Headings', auszug: `Duplicate heading number: ${d}` })))
  }
  const beschriftungen = alle.filter(istBeschriftung)
  for (const art of ['Figure', 'Table']) {
    const re = art === 'Figure' ? /^(?:Figure|Fig\.|Abbildung|Abb\.)\s+(\d+(?:[.-]\d+)*)/i : /^(?:Table|Tabelle|Tab\.)\s+(\d+(?:[.-]\d+)*)/i
    const unterschriften = beschriftungen.map((a) => ({ a, m: a.text.match(re) })).filter((x) => x.m)
    const nr = unterschriften.map((x) => x.m![1].replace(/-/g, '.'))
    if (nr.length >= 2) {
      nummeriert = true
      const r = nummernPruefen(nr)
      fsNr.push(...r.luecken.map((l) => ({ auszug: `${art} numbering gap: ${art} ${l} missing` })), ...r.doppelt.map((d) => ({ ...fundstelle(unterschriften.find((x) => x.m![1].replace(/-/g, '.') === d)!.a), auszug: `Duplicate ${art.toLowerCase()} number: ${art} ${d}` })))
    }
  }
  if (fsNr.length) neu('nummerierung', 'Editorial', 'Low', `Numbering of headings, figures or tables has gaps or duplicates (${fsNr.length}).`, fsNr, 'nummerierung')
  // Nichts Nummeriertes → nichts geprüft: nicht anwendbar, nicht grün
  if (!nummeriert) na.push('nummerierung')

  /* 7 Querverweise — existiert das Ziel? */
  // Kapitelnummern aus der Gliederung UND aus nummerierten Absätzen (N7):
  // Mit der Kurzform „see 1.4.1.1" wäre sonst jeder Verweis auf einen
  // nummerierten Absatz ohne Überschriftvorlage ein toter Verweis.
  const kapitel = new Set([...nummernU, ...kapitelNummern(pages, roh.outline)])
  const kapitelDa = (ziel: string) => kapitel.has(ziel) || [...kapitel].some((n) => n.startsWith(`${ziel}.`))
  const anhaenge = new Set(alle.flatMap((a) => [...a.text.matchAll(/^(?:Appendix|Annex|Anhang|Anlage)\s+([A-Z0-9]+)/gi)].map((m) => m[1].toUpperCase())))
  const bilder = new Set(beschriftungen.map((a) => a.text.match(/^(?:Figure|Fig\.|Abbildung|Abb\.)\s+(\d+(?:[.-]\d+)*)/i)?.[1]?.replace(/-/g, '.')).filter(Boolean) as string[])
  const tabellen = new Set(beschriftungen.map((a) => a.text.match(/^(?:Table|Tabelle|Tab\.)\s+(\d+(?:[.-]\d+)*)/i)?.[1]?.replace(/-/g, '.')).filter(Boolean) as string[])
  const fsVerweis: Fundstelle[] = []
  let verweise = 0
  let geprueft = 0
  for (const a of alle) {
    for (const m of a.text.matchAll(/\b(?:see|refer to|refer|siehe|gemäß)\s+(chapter|section|para(?:graph)?|appendix|annex|figure|fig\.|table|kapitel|abschnitt|anhang|abbildung|abb\.|tabelle)\s+([A-Z]?\d+(?:\.\d+)*[A-Z]?|[A-Z])\b/gi)) {
      // Ziel in einem fremden Regelwerk („Annex I (Part-FCL)") — nicht im Dokument zu suchen
      if (fremdesRegelwerk(a.text.slice(m.index! + m[0].length))) continue
      const art = m[1].toLowerCase()
      const ziel = m[2].replace(/-/g, '.')
      // Ohne Ziele dieser Art lässt sich der Verweis weder belegen noch
      // widerlegen — er zählt nicht als geprüft (Audit 11/2026, FRD-01: ein
      // Word-Dokument ohne gelesene Kapitelnummern stand sonst auf grün).
      const [ziele, ok] = /^(chapter|section|para|paragraph|kapitel|abschnitt)$/.test(art)
        ? [kapitel, kapitelDa(ziel)]
        : /^(appendix|annex|anhang)$/.test(art)
          ? [anhaenge, anhaenge.has(ziel.toUpperCase())]
          : /^(figure|fig\.|abbildung|abb\.)$/.test(art)
            ? [bilder, bilder.has(ziel)]
            : [tabellen, tabellen.has(ziel)]
      verweise++
      if (!ziele.size) continue
      geprueft++
      if (!ok) fsVerweis.push(fundstelle(a, `${m[0]} — target not found`))
    }
    for (const m of kurzverweise(a.text)) {
      verweise++
      if (!kapitel.size) continue
      geprueft++
      if (!kapitelDa(m[1])) fsVerweis.push(fundstelle(a, `${m[0]} — target not found`))
    }
  }
  if (fsVerweis.length) neu('querverweise', 'Inconsistency', 'Medium', `Cross-references point to targets that do not exist in the document (${fsVerweis.length}).`, fsVerweis, 'querverweise')
  if ((!kapitel.size && !anhaenge.size && !bilder.size && !tabellen.size) || (verweise > 0 && geprueft === 0)) na.push('querverweise')

  /* 8 Abkürzungen — Liste gegen Verwendung */
  const abkSeiten = abschnittSeiten(pages, regeln.abschnitte.abkuerzungen)
  const wordListe = roh.word ? wordAbkuerzungsliste(roh.word.absaetze, regeln.abschnitte.abkuerzungen) : null
  const abkBefund = (ohneEintrag: [string, string | undefined][], unbenutzt: string[], listenSeite: string | undefined) => {
    const fs = [...ohneEintrag.map(([t, s]) => ({ ...(s ? { seite: s } : {}), auszug: `Used but not in the list: ${t}` })), ...unbenutzt.map((t) => ({ ...(listenSeite ? { seite: listenSeite } : {}), auszug: `Listed but never used: ${t}` }))]
    if (fs.length) neu('abkuerzungen', 'Editorial', 'Low', `Abbreviation list does not match the text (${ohneEintrag.length} without entry, ${unbenutzt.length} unused).`, fs, 'abkuerzungen')
  }
  if (roh.word && wordListe?.liste.size) {
    // DOCX: Liste und Verwendung über Absätze (FRD-16); Kopf-/Fußzeilen und Verzeichniseinträge zählen nicht
    const rest = roh.word.absaetze.filter((a, i) => (i < wordListe.von || i > wordListe.bis) && (a.ort === 'body' || a.ort === 'textfeld' || a.ort === 'fussnote') && !a.toc)
    const seite = seiteFinder(roh)
    const verwendet = new Map<string, string | undefined>()
    for (const a of rest) for (const t of abkuerzungenIn(a.text)) if (!verwendet.has(t)) verwendet.set(t, seite(a.text))
    const unbenutzt = [...wordListe.liste.keys()].filter((t) => !verwendet.has(t) && !rest.some((a) => a.text.includes(t)))
    abkBefund([...verwendet].filter(([t]) => !wordListe.liste.has(t)), unbenutzt, abkSeiten.length ? seitenName(pages[abkSeiten[0]]) : undefined)
  } else if (abkSeiten.length) {
    // Folgeseiten gehören nur dazu, wenn sie überwiegend aus Einträgen
    // bestehen — sonst zählte der Text danach als Liste, und jede dort
    // benutzte Abkürzung erschiene als „nie verwendet".
    const istListe = (x: number) => {
      const z = pages[x]?.text.split('\n').filter((l) => l.trim()) ?? []
      return z.length > 0 && z.filter((l) => EINTRAG.test(l)).length / z.length >= 0.6
    }
    const listenSeiten = new Set(abkSeiten.flatMap((i) => [i, ...(istListe(i + 1) ? [i + 1, ...(istListe(i + 2) ? [i + 2] : [])] : [])]))
    const liste = new Map<string, string>()
    for (const i of listenSeiten) {
      for (const z of pages[i].text.split('\n')) {
        const m = z.match(EINTRAG)
        if (m) liste.set(m[1], m[2])
      }
    }
    const verwendet = verwendeteAbkuerzungen(roh, listenSeiten)
    const unbenutzt = [...liste.keys()].filter((t) => !verwendet.has(t) && !pages.some((p, i) => !listenSeiten.has(i) && p.text.includes(t)))
    abkBefund([...verwendet].filter(([t]) => !liste.has(t)), unbenutzt, seitenName(pages[abkSeiten[0]]))
  } else na.push('abkuerzungen')

  /* 9 Reste aus der Bearbeitung */
  const fsHoch: Fundstelle[] = []
  const fsMittel: Fundstelle[] = []
  for (const r of regeln.reste) {
    const re = new RegExp(r.muster, `g${r.flags ?? ''}`)
    for (const a of alle) for (const m of a.text.matchAll(re)) (r.prioritaet === 'High' ? fsHoch : fsMittel).push(fundstelle(a, `${m[0]} — ${a.text}`))
  }
  const l = roh.lenkung
  if (l.aenderungen.length) fsHoch.push(...l.aenderungen.map((x) => ({ ort: 'Tracked change', auszug: kurz(`${AENDERUNGSART[x.art]}${x.autor ? ` by ${x.autor}` : ''}: ${x.text}`) })))
  if (l.kommentare.length) fsHoch.push(...l.kommentare.map((x) => ({ ort: 'Comment', auszug: kurz(`${x.autor ? `${x.autor}: ` : ''}${x.text}`) })))
  if (fsHoch.length) neu('reste', 'Document Control', 'High', `Unresolved editing remnants: open tracked changes, comments or broken field references (${fsHoch.length}).`, fsHoch, 'resteHoch')
  if (fsMittel.length) neu('reste', 'Editorial', 'Medium', `Editing remnants such as TBD, XXX, [insert …], DRAFT (${fsMittel.length}).`, fsMittel, 'reste')

  return { befunde: out, ampel: ampelAus([...FORMAL_PUNKTE], out as Befund[], na) }
}
