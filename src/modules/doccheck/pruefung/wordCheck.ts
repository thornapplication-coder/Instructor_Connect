import { datumFinden } from '../parse/meta'
import { tocPlausibel, vergleichsform } from '../parse/seitenzuordnung'
import { ampelAus, anzahl, type Befund, type Fundstelle } from './befund'
import { unsichtbar } from './kontrast'
import { befund, kurz, notenOrt, seiteFinder, teilOrt, wortKapitel, type PruefKontext } from './kontext'
import { dokumentSprache, spracheVon } from './sprache'

/**
 * Word-Technik-Check (Nachtrag N4) — das Einreichungs-Gate.
 *
 * Prüft, was im Ausdruck nicht zu sehen ist, aber im eingereichten Dokument
 * steckt. Grundlage ist der Word-Extrakt; jede Regel arbeitet mit WIRKSAMEN
 * Werten (siehe wordStile.ts), sonst gäbe es Fehlalarme wie weiße Schrift
 * auf einer per Vorlage dunklen Tabellenkopfzeile.
 */

export const WORD_PUNKTE = [
  'unsichtbar',
  'markierung',
  'korrektursprache',
  'noProof',
  'kompatibilitaet',
  'eigenschaften',
  'kopfFuss',
  'editionRevision',
  'felder',
  'fragmente',
] as const

const PERSONENNAME = /^(?:[A-ZÄÖÜ][a-zäöüß]+|[A-ZÄÖÜ]\.)(?:[ -][A-ZÄÖÜ][a-zäöüß]+)+$/

/** „E2R0.0", „E1R3" im Dateinamen → Edition und Revision. */
export function ausDateiname(name: string): { edition?: number; revision?: string } {
  const m = name.match(/E(\d+)[\s_-]?R(\d+(?:\.\d+)?)/i)
  return m ? { edition: Number(m[1]), revision: m[2] } : {}
}

export function editionVon(text?: string): number | undefined {
  const m = text?.match(/\bEdition\s*(\d+)|\bEd\.\s*(\d+)/i)
  return m ? Number(m[1] ?? m[2]) : undefined
}

/** Revision ohne Edition: „Rev 2", „Revision 02" → „2"; „Edition 1" ist keine Revision. */
export function revisionVon(text: string): string | undefined {
  return text.match(/\b(?:Rev(?:ision)?\.?)\s*(?:No\.?|Nr\.?)?\s*:?\s*(\d+(?:\.\d+)*[A-Z]?)(?![\w.])/)?.[1].replace(/^0+(?=\d)/, '')
}

/**
 * Kopf-/Fußzeilen-Varianten JE MERKMAL: Revision gegen Revision, Datum
 * gegen Datum, Edition gegen Edition. Teile ohne das Merkmal zählen nicht.
 * Vorher bildete jeder Teil EINE Kette aus allen drei — „Revision 2" oben
 * und „15.03.2026" unten, ein übliches Layout, galten als zwei Varianten
 * (Audit 11/2026, FRD-09). Liefert nur Merkmale mit mehr als einem Wert.
 */
export function kopfFussVarianten<T extends { text: string }>(teile: T[]): Map<string, Map<string, T[]>> {
  const merkmale: [string, (t: string) => string | undefined][] = [
    ['revision', revisionVon],
    ['date', datumFinden],
    ['edition', (t) => editionVon(t)?.toString()],
  ]
  const out = new Map<string, Map<string, T[]>>()
  for (const [name, wert] of merkmale) {
    const werte = new Map<string, T[]>()
    for (const x of teile) {
      const v = wert(x.text)
      if (v) werte.set(v, [...(werte.get(v) ?? []), x])
    }
    if (werte.size > 1) out.set(name, werte)
  }
  return out
}

/**
 * Orte ohne Kapitel, wie Word sie nennt — nicht als Teil der ZIP-Datei
 * („docProps/core.xml", „word/settings.xml"), der so unter „Chapter /
 * Section" im Bericht für die Behörde stand (Audit 11/2026, Nachtrag TXT#1).
 */
const EIGENSCHAFTEN = 'Document properties'
const EINSTELLUNGEN = 'Document settings'

export function wordCheck(k: PruefKontext, dateiname: string): { befunde: Omit<Befund, 'id'>[]; ampel: Record<string, 'ok' | 'wait' | 'bad' | 'na'> } {
  const w = k.roh.word
  if (!w) return { befunde: [], ampel: Object.fromEntries(WORD_PUNKTE.map((p) => [p, 'na'])) }
  const out: Omit<Befund, 'id'>[] = []
  const seite = seiteFinder(k.roh)
  const absatzVon = new Map(w.absaetze.map((a) => [a.nr, a]))
  // Dasselbe Kapitel wie in den übrigen Prüfungen (`absaetze`) — Export-Spalte „Chapter / Section" (Nachtrag TXT#1)
  const kapitel = wortKapitel(w.absaetze)
  const kapitelVon = new Map(w.absaetze.map((a, i) => [a.nr, kapitel[i]]))
  const ortVon = (nr: number): Partial<Fundstelle> => {
    const a = absatzVon.get(nr)
    if (!a) return {}
    if (a.ort === 'kopf' || a.ort === 'fuss') return { ort: teilOrt(a.teil) }
    const s = seite(a.text)
    const kap = kapitelVon.get(nr)
    return { ...(s ? { seite: s } : {}), ...(kap ? { kapitel: kap } : {}), ...(a.ort === 'textfeld' ? { ort: 'Text box' } : a.ort === 'fussnote' ? { ort: notenOrt(a.teil) } : a.tabelle ? { ort: `Table row ${a.tabelle.zeile + 1}, column ${a.tabelle.spalte + 1}` } : {}) }
  }

  // 1 Unsichtbarer Text
  const versteckt = w.laeufe.filter((l) => l.text.trim() && unsichtbar(l.eigenschaften, l.hintergrund))
  if (versteckt.length) {
    const art = (l: (typeof versteckt)[number]) => ({ farbe: 'font colour equals background', vanish: 'hidden (vanish)', groesse: 'font size ≤ 2 pt' })[unsichtbar(l.eigenschaften, l.hintergrund)!]
    out.push(
      befund(k, {
        quelle: 'word',
        pruefpunkt: 'unsichtbar',
        kategorie: 'Document Control',
        prioritaet: 'High',
        text: `[Word check] Invisible text in ${anzahl(versteckt.length, 'place')}: content is part of the submitted file but not visible on screen or in print.`,
        fundstellen: versteckt.map((l) => ({ ...ortVon(l.absatz), auszug: `${kurz(l.text, 90)} — ${art(l)} (${l.eigenschaften.farbe ?? 'auto'} on ${l.hintergrund ?? 'unknown background'})` })),
        anleitung: 'unsichtbar',
      }),
    )
  }

  // 2 Textmarker — Hoch, wenn auf Platzhaltern
  const markiert = w.laeufe.filter((l) => l.eigenschaften.markierung && l.text.trim())
  if (markiert.length) {
    const platzhalter = markiert.filter((l) => /\b(TBD|TBC|XXX+|n{3,})\b|_XX\b|\[.*\]/.test(l.text))
    out.push(
      befund(k, {
        quelle: 'word',
        pruefpunkt: 'markierung',
        kategorie: 'Editorial',
        prioritaet: platzhalter.length ? 'High' : 'Low',
        text: `[Word check] ${anzahl(markiert.length, 'highlighted passage')}${!platzhalter.length ? '' : markiert.length === 1 ? ', on a placeholder' : `, ${platzhalter.length} of them on ${platzhalter.length === 1 ? 'a placeholder' : 'placeholders'}`}.`,
        fundstellen: markiert.map((l) => ({ ...ortVon(l.absatz), auszug: `${kurz(l.text, 90)} (${l.eigenschaften.markierung})` })),
        anleitung: 'markierung',
      }),
    )
  }

  // 3 Korrektursprache: als fremde Sprache markierter Text, der in der Dokumentsprache steht
  const body = w.absaetze.filter((a) => a.ort === 'body')
  const dokSprache = dokumentSprache(body.map((a) => a.text))
  if (dokSprache) {
    const falsch = w.laeufe.filter((l) => {
      const sp = l.eigenschaften.sprache?.slice(0, 2).toLowerCase()
      if (!sp || sp === dokSprache) return false
      const a = absatzVon.get(l.absatz)
      return a !== undefined && spracheVon(a.text) === dokSprache
    })
    const standardFalsch = w.standard.sprache && w.standard.sprache.slice(0, 2).toLowerCase() !== dokSprache
    if (falsch.length || standardFalsch) {
      const nachSprache = new Map<string, number>()
      for (const l of falsch) nachSprache.set(l.eigenschaften.sprache!, (nachSprache.get(l.eigenschaften.sprache!) ?? 0) + l.text.length)
      out.push(
        befund(k, {
          quelle: 'word',
          pruefpunkt: 'korrektursprache',
          kategorie: 'Editorial',
          prioritaet: 'Low',
          text: `[Word check] Proofing language does not match the document language (${dokSprache})${standardFalsch ? `; default style is set to ${w.standard.sprache}` : ''}${nachSprache.size ? `; marked as ${[...nachSprache].map(([s, n]) => `${s} (${n} characters)`).join(', ')}` : ''}. Word does not flag spelling errors in these passages.`,
          fundstellen: [...new Set(falsch.map((l) => l.absatz))].map((nr) => ({ ...ortVon(nr), auszug: `${kurz(absatzVon.get(nr)!.text, 90)} (${falsch.find((l) => l.absatz === nr)!.eigenschaften.sprache})` })),
          anleitung: 'korrektursprache',
        }),
      )
    }
  }

  // 4 „Rechtschreibung nicht prüfen"
  const ohnePruefung = w.laeufe.filter((l) => l.eigenschaften.noProof && l.text.trim())
  if (ohnePruefung.length) {
    out.push(
      befund(k, {
        quelle: 'word',
        pruefpunkt: 'noProof',
        kategorie: 'Editorial',
        prioritaet: 'Low',
        text: `[Word check] "Do not check spelling or grammar" is set on ${anzahl(ohnePruefung.length, 'run')} (${anzahl(ohnePruefung.reduce((s, l) => s + l.text.length, 0), 'character')}). Word reports no errors there.`,
        fundstellen: [...new Set(ohnePruefung.map((l) => l.absatz))].map((nr) => ({ ...ortVon(nr), auszug: kurz(absatzVon.get(nr)!.text, 90) })),
        anleitung: 'noProof',
      }),
    )
  }

  // 5 Kompatibilitätsmodus
  if (w.kompatibilitaet !== undefined && w.kompatibilitaet < 15) {
    out.push(befund(k, { quelle: 'word', pruefpunkt: 'kompatibilitaet', kategorie: 'Document Control', prioritaet: 'Low', text: `[Word check] Document is saved in compatibility mode (Word ${w.kompatibilitaet}). Layout may differ between Word versions.`, fundstellen: [{ ort: EINSTELLUNGEN, auszug: `compatibilityMode = ${w.kompatibilitaet}` }], anleitung: 'kompatibilitaet' }))
  }

  // 6 Dokumenteigenschaften
  const eig: Fundstelle[] = []
  if (!w.eigenschaften.title?.trim()) eig.push({ ort: EIGENSCHAFTEN, auszug: 'Title is empty' })
  else if (k.meta.titel && vergleichsform(w.eigenschaften.title) !== vergleichsform(k.meta.titel)) eig.push({ ort: EIGENSCHAFTEN, auszug: `Title "${w.eigenschaften.title}" differs from cover "${k.meta.titel}"` })
  for (const [feld, wert] of [['Author', w.eigenschaften.creator], ['Last modified by', w.eigenschaften.lastModifiedBy]] as const) {
    if (wert && PERSONENNAME.test(wert.trim())) eig.push({ ort: EIGENSCHAFTEN, auszug: `${feld}: ${wert}` })
  }
  if (eig.length) out.push(befund(k, { quelle: 'word', pruefpunkt: 'eigenschaften', kategorie: 'Document Control', prioritaet: 'Low', text: `[Word check] Document properties need attention (${eig.length}): empty or deviating title, personal names in author fields.`, fundstellen: eig, anleitung: 'eigenschaften' }))

  // 7 Kopf-/Fußzeilen je Abschnitt — Revision, Datum, Edition paketweit einheitlich
  const kopfFuss = w.abschnitte.flatMap((a) => [...a.kopf, ...a.fuss].map((x) => ({ ...x, abschnitt: a.nr })))
  const kfFund: Fundstelle[] = []
  const abweichend: string[] = []
  for (const [name, werte] of kopfFussVarianten(kopfFuss)) {
    // Mehrheit nennen, Abweichler zeigen; ohne klare Mehrheit alle
    const nachZahl = [...werte].sort((a, b) => b[1].length - a[1].length)
    const mehrheit = nachZahl[0][1].length > nachZahl[1][1].length ? nachZahl[0][0] : null
    abweichend.push(`${name} ${nachZahl.map(([v]) => v).join(' / ')}`)
    for (const [wert, liste] of nachZahl) {
      if (wert === mehrheit) continue
      for (const x of liste) kfFund.push({ ort: `Section ${x.abschnitt}, ${teilOrt(x.teil, x.typ)}`, auszug: `${kurz(x.text, 80)} → ${name} ${wert}${mehrheit ? ` (other sections: ${mehrheit})` : ''}` })
    }
  }
  for (const v of w.verwaisteKopfFuss) kfFund.push({ ort: teilOrt(v), auszug: 'Header/footer part not used by any section (leftover)' })
  if (kfFund.length) {
    out.push(
      befund(k, {
        quelle: 'word',
        pruefpunkt: 'kopfFuss',
        kategorie: 'Document Control',
        prioritaet: abweichend.length ? 'Medium' : 'Low',
        text: abweichend.length ? `[Word check] Headers/footers differ between sections (${abweichend.join('; ')}), including sections that are not visible.` : '[Word check] Unused header/footer parts are contained in the file.',
        fundstellen: kfFund,
        anleitung: 'kopfFuss',
      }),
    )
  }

  // 8 Edition/Revision: Deckblatt ↔ Kopf-/Fußzeilen ↔ Dateiname
  const ed: Fundstelle[] = []
  const deckblatt = editionVon(k.meta.revision)
  const datei = ausDateiname(dateiname)
  const kopfEditionen = [...new Set(kopfFuss.map((x) => editionVon(x.text)).filter((x): x is number => x !== undefined))]
  if (deckblatt !== undefined && datei.edition !== undefined && deckblatt !== datei.edition) ed.push({ ort: 'File name', auszug: `${dateiname}: Edition ${datei.edition}, cover: Edition ${deckblatt}` })
  for (const e of kopfEditionen) if (deckblatt !== undefined && e !== deckblatt) ed.push({ ort: 'Header/footer', auszug: `Edition ${e}, cover: Edition ${deckblatt}` })
  if (ed.length) out.push(befund(k, { quelle: 'word', pruefpunkt: 'editionRevision', kategorie: 'Inconsistency', prioritaet: 'Medium', text: '[Word check] Edition/revision is not consistent between cover, headers/footers and file name.', fundstellen: ed, anleitung: 'editionRevision' }))

  // 9 Veraltete Felder: Seitenzahlen des Inhaltsverzeichnisses unplausibel
  // (der Titelabgleich gehört zur Formalprüfung „Inhaltsverzeichnis")
  if (w.toc.length >= 2 && !tocPlausibel(w.toc)) {
    out.push(befund(k, { quelle: 'word', pruefpunkt: 'felder', kategorie: 'Document Control', prioritaet: 'Low', text: '[Word check] Table of contents page numbers are not ascending — the field is probably outdated.', fundstellen: w.toc.map((t) => ({ ort: 'Table of contents', auszug: `${t.titel} … ${t.seite ?? '?'}` })), anleitung: 'felder' }))
  }

  // 10 Verirrte Fragmente vor dem ersten Kapitel. Tabellenzellen zählen nicht:
  // „Revision | 2" oder „Effective date | 15.03.2026" in der Lenkungstabelle
  // des Deckblatts ist ein beschrifteter Wert, kein verirrtes „3.8.3." — jedes
  // Deckblatt mit Lenkungstabelle ergab sonst einen Befund (Audit 11/2026, FRD-10).
  const erstes = w.absaetze.findIndex((a) => a.ort === 'body' && a.ebene)
  const vorher = (erstes < 0 ? [] : w.absaetze.slice(0, erstes)).filter((a) => (a.ort === 'body' || a.ort === 'textfeld') && !a.toc && !a.tabelle && /^[\d.\s]{1,12}$|^[^\p{L}\d]{1,3}$/u.test(a.text.trim()) && a.text.trim())
  if (vorher.length) out.push(befund(k, { quelle: 'word', pruefpunkt: 'fragmente', kategorie: 'Editorial', prioritaet: 'Medium', text: `[Word check] ${anzahl(vorher.length, 'stray fragment')} before the first chapter (cover/title page).`, fundstellen: vorher.map((a) => ({ ...ortVon(a.nr), auszug: a.text.trim() })), anleitung: 'fragmente' }))

  // Was mangels Grundlage nicht geprüft werden konnte, ist „nicht anwendbar",
  // nicht grün (Fachprüfung 01.11.2026)
  const editionQuellen = [deckblatt, datei.edition, ...kopfEditionen].filter((x) => x !== undefined).length
  const na = [
    ...(!dokSprache ? ['korrektursprache'] : []),
    ...(editionQuellen < 2 ? ['editionRevision'] : []),
    ...(w.toc.length < 2 ? ['felder'] : []),
    ...(erstes < 0 ? ['fragmente'] : []),
  ]
  return { befunde: out, ampel: ampelAus([...WORD_PUNKTE], out as Befund[], na) }
}
