import type { DocPage } from '../parse/model'
import { seiteEnglisch } from '../pruefung/befund'
import { formatDate } from '../../../datum'
import { anweisungAus, type Anweisung } from './anweisung'
import type { FremdBefund, Ziel } from './fremdliste'

/**
 * Regelbasierte Nachprüfung eines Befunds aus einer Fremdliste (N3.1
 * Schritt 4, N3.4). Der Kern ist die Restfundstellen-Regel: „Resolved"
 * nur, wenn der beanstandete Text im GANZEN Paket nicht mehr vorkommt —
 * im Anlassfall waren 10 von 13 Schreibweisen-Befunden nur dort behoben,
 * wo die Liste hinzeigte.
 *
 * Die Seitenzahl der Liste bezieht sich auf die Vorrevision (N3.3) und wird
 * NICHT zum Suchen verwendet; der Remark nennt die Seite der aktuellen.
 */

export type ReStatus = 'resolved' | 'partial' | 'open' | 'unverifiable' | 'justify'

/** Warum dieser Vorschlag — damit die Tabelle es ohne Raten erklären kann. */
export type Grund =
  | 'wegUndDa' // alles Geforderte umgesetzt
  | 'nurAbwesend' // nur ein Zitat ohne Handlungswort, und das fehlt jetzt — kein Nachweis der Korrektur
  | 'restAnderesDok' // im genannten Dokument behoben, anderswo im Paket noch da
  | 'teilweise' // einige Varianten/Ergänzungen fehlen noch
  | 'unveraendert' // nichts umgesetzt
  | 'nurEmpfehlung' // als Empfehlung formuliert und nicht umgesetzt
  | 'quelleFehlt' // genanntes Dokument nicht im Paket
  | 'keinText' // Zieldokument ohne durchsuchbaren Text (Scan ohne OCR)
  | 'keineAnweisung' // Befund lässt sich nicht regelbasiert greifen → KI (später)

export interface PaketDok {
  id: string
  titel: string
  pages: DocPage[]
  /** Überschriften mit Startseite — für das Kapitel an der Fundstelle */
  outline?: { titel: string; vonSeite: number }[]
}

export interface Fundstelle {
  dokId: string
  dok: string
  kapitel: string
  seite: string
  /** Seite im Dokument (ab 1) — für den Viewer */
  index: number
  auszug: string
  /** der gesuchte Text */
  text: string
}

export interface ReErgebnis {
  ref: string
  zeile: number
  status: ReStatus
  grund: Grund
  anweisung: Anweisung
  /** Text, der noch da ist, aber weg sein sollte */
  rest: Fundstelle[]
  /** Text, der da sein soll und gefunden wurde (Nachweis) */
  belegt: Fundstelle[]
  /** Text, der da sein soll und fehlt */
  fehlt: string[]
  /** Team-Kommentar behauptet eine Korrektur, die Prüfung sieht sie nicht */
  behauptungWiderlegt: boolean
  /** Vorschlag weicht vom Team-Status ab */
  abweichung: boolean
  /** Treffer, die nach N3.4 KEINE Restfundstelle sind — gezeigt, nicht gezählt */
  ausgenommen: Ausgenommen[]
}

/**
 * Warum ein Treffer nicht zählt (N3.4): Verbform eines Nomen/Verb-Paars
 * („to call out" bei einem „callout"-Befund), als Zitat erkennbar, oder
 * wörtlich in einem Master-Dokument belegt (Regelwerk/OEM-Zitat).
 */
export type Ausnahme = 'verb' | 'zitat' | 'bibliothek'
export type Ausgenommen = Fundstelle & { grund: Ausnahme; quelle?: string }

const norm = (s: string) => s.replace(/\u00AD/g, '').replace(/\s+/g, ' ').toLowerCase()

/** Team-Status, der „erledigt" meint (Spaltenwerte der Fremdliste). */
const ERLEDIGT = /\b(closed|resolved|completed?|done|fixed|erledigt|geschlossen|behoben|abgeschlossen|umgesetzt|ok)\b/i

export function teamErledigt(s: string): boolean {
  return ERLEDIGT.test(s) && !/\b(not|nicht|un|partial|teilweise)\b/i.test(s)
}

/** Wörter, nach denen eine getrennte Schreibung das Verb ist: „to call out", „shall call out". */
const VERB_VOR = /(?:^|[^\p{L}])(to|shall|will|must|should|can|cannot|may|might|would|could|not|please|also)\s$/u
const ANFZ = /["“”„«»]/g

/**
 * Liegt Position i zwischen Anführungszeichen? Gezählt wird nur innerhalb
 * der Zeile bzw. des Absatzes [von, bis): ungerade Zahl davor, mindestens
 * eines danach. Ein Fenster über Absatzgrenzen könnte ein Zitatpaar
 * anschneiden und einen echten Rest als Zitat ausgeben — der Fehler muss
 * in die sichere Richtung gehen (im Zweifel Rest).
 */
export function inZitat(n: string, i: number, laenge: number, von = 0, bis = n.length): boolean {
  const vor = n.slice(von, i).match(ANFZ)?.length ?? 0
  const nach = n.slice(i + laenge, bis).match(ANFZ)?.length ?? 0
  return vor % 2 === 1 && nach > 0
}

/** Seitentext normalisiert, mit Startpositionen der Zeilen/Absätze. */
function zeilenText(text: string): { t: string; starts: number[] } {
  const zeilen = text.replace(/\u00AD/g, '').split(/\n+/).map((z) => z.replace(/\s+/g, ' ').trim()).filter(Boolean)
  const starts: number[] = []
  let pos = 0
  for (const z of zeilen) {
    starts.push(pos)
    pos += z.length + 1
  }
  return { t: zeilen.join(' '), starts }
}

const kompakt = (s: string) => norm(s).replace(/[\s-]+/g, '')

interface Pruefer {
  soll?: string[]
  /** Normalisierte Texte der Master-Dokumente — für „in der Bibliothek belegbar" */
  quellen?: { titel: string; n: string }[]
}

/**
 * Fundstellen von `text`. Treffer, die in einer Fundstelle des Soll-Texts
 * liegen, zählen nicht: Bei „ATO.106" → „AT.ATO.106" ist die Korrektur
 * selbst kein Rest. Ausnahmen nach N3.4 landen in `ausgenommen`.
 */
function suchen(docs: PaketDok[], text: string, max = 12, opt: Pruefer = {}): { treffer: Fundstelle[]; ausgenommen: Ausgenommen[] } {
  const soll = opt.soll ?? []
  const ausgenommen: Ausgenommen[] = []
  // Nomen/Verb-Paar: getrennt geschriebenes Suchwort, dessen Soll die
  // zusammengeschriebene Form ist („call out" → „callout").
  const verbPaar = /[\s-]/.test(text.trim()) && soll.some((s) => kompakt(s) === kompakt(text) && !/[\s-]/.test(s.trim()))
  const ausnahme = (n: string, i: number, q: string, starts: number[]): { grund: Ausnahme; quelle?: string } | null => {
    if (verbPaar && VERB_VOR.test(n.slice(Math.max(0, i - 12), i))) return { grund: 'verb' }
    let z = 0
    while (z + 1 < starts.length && starts[z + 1] <= i) z++
    if (inZitat(n, i, q.length, starts[z] ?? 0, starts[z + 1] ?? n.length)) return { grund: 'zitat' }
    if (opt.quellen?.length) {
      // Der Satz um den Treffer (höchstens je 80 Zeichen) — ein Satz, der
      // wörtlich im Master steht, ist ein Zitat. Ein festes Fenster liefe
      // über die Satzgrenze und fände sich dort nie.
      const vor = n.slice(Math.max(0, i - 80), i)
      const nach = n.slice(i + q.length, i + q.length + 80)
      const anfang = vor.search(/[^.;:!?"“”„]*$/)
      const ende = nach.search(/[.;:!?"“”„]/)
      const umfeld = (vor.slice(anfang) + q + (ende < 0 ? nach : nach.slice(0, ende))).trim()
      if (umfeld.length >= q.length + 20) {
        const q2 = opt.quellen.find((x) => x.n.includes(umfeld))
        if (q2) return { grund: 'bibliothek', quelle: q2.titel }
      }
    }
    return null
  }
  const q = norm(text)
  if (!q) return { treffer: [], ausgenommen }
  const huellen = soll.map(norm).filter((x) => x !== q && x.includes(q))
  const umhuellt = (n: string, i: number) =>
    huellen.some((h) => {
      for (let k = n.indexOf(h); k >= 0; k = n.indexOf(h, k + 1)) if (k <= i && i + q.length <= k + h.length) return true
      return false
    })
  const out: Fundstelle[] = []
  for (const d of docs)
    for (const p of d.pages) {
      const { t, starts } = zeilenText(p.text)
      const n = t.toLowerCase()
      let i = n.indexOf(q)
      while (i >= 0 && out.length < max) {
        // Nur ganze Wörter: „Rev" ist kein Rest in „Revision".
        const vor = n[i - 1]
        const nach = n[i + q.length]
        const wortgrenze = (c: string | undefined) => !c || !/[\p{L}\p{N}]/u.test(c)
        if ((wortgrenze(vor) || !/[\p{L}\p{N}]/u.test(q[0])) && !umhuellt(n, i)) {
          if (wortgrenze(nach) || !/[\p{L}\p{N}]/u.test(q[q.length - 1])) {
            const a = Math.max(0, i - 40)
            const e = Math.min(t.length, i + q.length + 40)
            const f: Fundstelle = {
              dokId: d.id,
              dok: d.titel,
              kapitel: kapitelBei(d, p, n, i),
              seite: p.label ?? String(p.index),
              index: p.index,
              auszug: `${a > 0 ? '…' : ''}${t.slice(a, e).trim()}${e < t.length ? '…' : ''}`,
              text,
            }
            const aus = ausnahme(n, i, q, starts)
            if (!aus) out.push(f)
            else if (ausgenommen.length < max) ausgenommen.push({ ...f, ...aus })
          }
        }
        i = n.indexOf(q, i + q.length)
      }
    }
  return { treffer: out, ausgenommen }
}

/**
 * Kapitel an der Fundstelle, nicht das der Seite: Ein DOCX ohne
 * Umbruchmarken ist eine einzige „Seite", deren sectionPath das LETZTE
 * Kapitel nennt. Maßgeblich ist die letzte Überschrift VOR dem Treffer.
 */
function kapitelBei(d: PaketDok, p: DocPage, n: string, i: number): string {
  let best = ''
  let bestPos = -1
  for (const o of d.outline ?? []) {
    if (o.vonSeite !== p.index) continue
    const k = n.indexOf(norm(o.titel))
    if (k >= 0 && k <= i && k >= bestPos) {
      best = o.titel
      bestPos = k
    }
  }
  if (best) return best
  const vorher = (d.outline ?? []).filter((o) => o.vonSeite < p.index).at(-1)
  return vorher?.titel ?? p.sectionPath?.at(-1) ?? ''
}

const hatText = (docs: PaketDok[]) => docs.some((d) => d.pages.some((p) => p.text.trim().length > 0))

/**
 * @param quellen Master-Dokumente (Bibliothek, Sitzungsdokumente): Ein
 * Treffer, dessen Umfeld dort wörtlich steht, ist ein Zitat — kein Rest.
 */
export function befundPruefen(b: FremdBefund, ziel: Ziel, paket: PaketDok[], quellen: PaketDok[] = []): ReErgebnis {
  const anweisung = anweisungAus(b)
  const basis = { ref: b.ref, zeile: b.zeile, anweisung, rest: [] as Fundstelle[], belegt: [] as Fundstelle[], fehlt: [] as string[], behauptungWiderlegt: false, ausgenommen: [] as Ausgenommen[] }
  const fertig = (status: ReStatus, grund: Grund, x: Partial<ReErgebnis> = {}): ReErgebnis => {
    const r = { ...basis, ...x, status, grund }
    const team = teamErledigt(b.teamStatus)
    // Offener Status, aber Team (Spalte oder Kommentar) meldet erledigt → widerlegt.
    r.behauptungWiderlegt = (status === 'open' || status === 'partial') && (team || anweisung.teamBehauptet)
    r.abweichung = b.teamStatus.trim() !== '' && status !== 'unverifiable' && team !== (status === 'resolved')
    return r as ReErgebnis
  }

  if (ziel.art === 'fehlt') return fertig('unverifiable', 'quelleFehlt')
  const ziele = ziel.art === 'paket' ? paket : paket.filter((d) => ziel.ids.includes(d.id))
  if (!ziele.length) return fertig('unverifiable', 'quelleFehlt')
  if (!hatText(ziele)) return fertig('unverifiable', 'keinText')
  if (!anweisung.weg.length && !anweisung.da.length) return fertig('unverifiable', 'keineAnweisung')

  const andere = paket.filter((d) => !ziele.includes(d))
  const rest: Fundstelle[] = []
  const restAnders: Fundstelle[] = []
  const ausgenommen: Ausgenommen[] = []
  const opt: Pruefer = { soll: anweisung.da, quellen: quellen.map((q) => ({ titel: q.titel, n: norm(q.pages.map((p) => p.text).join(' ')) })) }
  let wegErledigt = 0
  for (const w of anweisung.weg) {
    const hier = suchen(ziele, w, 12, opt)
    const dort = suchen(andere, w, 12, opt)
    rest.push(...hier.treffer)
    restAnders.push(...dort.treffer)
    ausgenommen.push(...hier.ausgenommen, ...dort.ausgenommen)
    if (!hier.treffer.length) wegErledigt++
  }
  const belegt: Fundstelle[] = []
  const fehlt: string[] = []
  for (const d of anweisung.da) {
    // Für den Nachweis zählt jeder Treffer — auch in einem Zitat steht der Text da.
    const f = suchen(ziele, d, 1)
    const alle = [...f.treffer, ...f.ausgenommen]
    if (alle.length) belegt.push(alle[0])
    else fehlt.push(d)
  }
  const x = { rest: [...rest, ...restAnders], belegt, fehlt, ausgenommen }
  const soll = anweisung.weg.length + anweisung.da.length
  const umgesetzt = wegErledigt + belegt.length

  if (!rest.length && !fehlt.length) {
    if (restAnders.length) return fertig('partial', 'restAnderesDok', x)
    // Nur ein Zitat ist verschwunden: der Satz lautet anders — ob der Mangel behoben ist, sagt das nicht
    return fertig('resolved', anweisung.ausZitat && !belegt.length ? 'nurAbwesend' : 'wegUndDa', x)
  }
  if (umgesetzt === 0) return anweisung.nurEmpfehlung ? fertig('justify', 'nurEmpfehlung', x) : fertig('open', 'unveraendert', x)
  return umgesetzt < soll ? fertig('partial', 'teilweise', x) : fertig('open', 'unveraendert', x)
}

/* -------------------------------- Remark -------------------------------- */

export type RemarkSprache = 'de' | 'en'

const PRAEFIX: Record<RemarkSprache, Record<ReStatus, string>> = {
  de: { resolved: 'BEHOBEN', partial: 'TEILWEISE BEHOBEN', open: 'NICHT BEHOBEN', unverifiable: 'NICHT PRÜFBAR', justify: 'GESCHLOSSEN – BEGRÜNDUNG ERFORDERLICH' },
  en: { resolved: 'RESOLVED', partial: 'PARTIALLY RESOLVED', open: 'NOT RESOLVED', unverifiable: 'NOT VERIFIABLE', justify: 'CLOSED – JUSTIFICATION REQUIRED' },
}

/** Statusname für Tabelle und Export (N11) — englisch wie die Fremdlisten. */
export const STATUS_NAME: Record<ReStatus, string> = {
  resolved: 'Resolved',
  partial: 'Partially resolved',
  open: 'Not resolved',
  unverifiable: 'Not verifiable',
  justify: 'Closed – justification required',
}

const SATZ: Record<RemarkSprache, Record<Grund, string>> = {
  de: {
    wegUndDa: 'Korrektur im gesamten Paket umgesetzt.',
    nurAbwesend: 'Beanstandeter Text kommt im Paket nicht mehr vor; ob der Mangel inhaltlich behoben ist, ist damit nicht belegt – bitte prüfen.',
    restAnderesDok: 'Im genannten Dokument behoben, im Paket aber noch vorhanden:',
    teilweise: 'Nur teilweise umgesetzt.',
    unveraendert: 'Beanstandeter Text unverändert vorhanden.',
    nurEmpfehlung: 'Als Empfehlung formuliert und nicht umgesetzt – bitte Begründung ergänzen.',
    quelleFehlt: 'Genanntes Dokument ist nicht im Prüfpaket.',
    keinText: 'Dokument enthält keinen durchsuchbaren Text (Scan ohne OCR).',
    keineAnweisung: 'Befund nicht regelbasiert prüfbar (inhaltlich) – fachliche Prüfung erforderlich.',
  },
  en: {
    wegUndDa: 'Correction implemented throughout the package.',
    nurAbwesend: 'The quoted text no longer occurs in the package; this does not show that the issue itself is resolved – please verify.',
    restAnderesDok: 'Fixed in the referenced document, but still present elsewhere in the package:',
    teilweise: 'Only partially implemented.',
    unveraendert: 'Text objected to is still present unchanged.',
    nurEmpfehlung: 'Raised as a recommendation and not implemented – please add a justification.',
    quelleFehlt: 'Referenced document is not part of the review package.',
    keinText: 'Document contains no searchable text (scan without OCR).',
    keineAnweisung: 'Finding cannot be checked by rules (content) – expert review required.',
  },
}

/**
 * Seitenangabe je Remark-Sprache. Englisch wie im Export (`seiteEnglisch`):
 * Vorher wurde nur die bloße Zahl übersetzt („p. 3"), „S. 2 (±1)" und
 * „ca. 1" standen wörtlich im englischen Remark der fremden Liste (Audit
 * 11/2026, EXP-07/TXT-01).
 */
const SEITE: Record<RemarkSprache, (s: string) => string> = {
  de: (s) => (/^\d+$/.test(s) ? `S. ${s}` : s),
  en: seiteEnglisch,
}

const W: Record<RemarkSprache, { rest: string; fehlt: string; widerlegt: string; vorschlag: string; ausgenommen: (n: number) => string }> = {
  de: { rest: 'Noch vorhanden', fehlt: 'Fehlt', widerlegt: 'Team-Kommentar meldet die Korrektur, im Dokument nicht nachweisbar.', vorschlag: 'Korrekturvorschlag', ausgenommen: (n) => `Nicht als Rest gezählt (Zitat bzw. Verbform): ${n} Fundstelle${n === 1 ? '' : 'n'}.` },
  en: { rest: 'Still present', fehlt: 'Missing', widerlegt: 'Team comment reports the correction; not found in the document.', vorschlag: 'Proposed correction', ausgenommen: (n) => `Not counted as remaining (quotation or verb form): ${n} occurrence${n === 1 ? '' : 's'}.` },
}

/**
 * Anführungszeichen je Remark-Sprache: deutsch „…“, englisch “…”. Vorher
 * stand in beiden „…" — unten auf, gerade zu — und so ging es beim
 * Rückschreiben in die fremde Excel-Liste, auch in den englischen Remark
 * (Audit 11/2026, EXP-20/TXT-13).
 */
export const zitat = (text: string, s: RemarkSprache): string => (s === 'de' ? `„${text}“` : `“${text}”`)

const zeile = (f: Fundstelle, s: RemarkSprache) => `• ${[f.dok, f.kapitel, SEITE[s](f.seite), zitat(f.auszug, s)].filter(Boolean).join(' · ')}`

/**
 * Remark nach N3.2: Präfix mit Status und Datum, Restfundstellen je Zeile
 * „Dokument · Kapitel · Seite · Auszug". Der Korrekturvorschlag ist der
 * Manual-Text selbst — er bleibt in der Sprache des Manuals, nur der
 * Rahmen folgt der gewählten Remark-Sprache.
 */
export function remark(r: ReErgebnis, datum: string, s: RemarkSprache = 'de'): string {
  const tag = s === 'de' ? formatDate(datum.slice(0, 10)) : datum.slice(0, 10)
  const kopf = `${PRAEFIX[s][r.status]} (${s === 'de' ? 'Re-Check' : 're-check'} ${tag}): ${SATZ[s][r.grund]}`
  const teile = [kopf]
  if (r.status !== 'resolved' && r.rest.length) {
    if (r.grund !== 'restAnderesDok') teile.push(`${W[s].rest}:`)
    teile.push(...r.rest.map((f) => zeile(f, s)))
  }
  if (r.fehlt.length) teile.push(`${W[s].fehlt}: ${r.fehlt.map((x) => zitat(x, s)).join(', ')}`)
  if (r.behauptungWiderlegt) teile.push(W[s].widerlegt)
  if (r.ausgenommen?.length) teile.push(W[s].ausgenommen(r.ausgenommen.length))
  const { weg, da } = r.anweisung
  if ((r.status === 'open' || r.status === 'partial') && weg.length && da.length) teile.push(`${W[s].vorschlag}: ${zitat(weg[0], s)} → ${zitat(da[0], s)}`)
  return teile.join('\n')
}
