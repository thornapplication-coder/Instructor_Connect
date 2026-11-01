import type { DocPage } from '../parse/model'
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
}

const norm = (s: string) => s.replace(/­/g, '').replace(/\s+/g, ' ').toLowerCase()

/** Team-Status, der „erledigt" meint (Spaltenwerte der Fremdliste). */
const ERLEDIGT = /\b(closed|resolved|completed?|done|fixed|erledigt|geschlossen|behoben|abgeschlossen|umgesetzt|ok)\b/i

export function teamErledigt(s: string): boolean {
  return ERLEDIGT.test(s) && !/\b(not|nicht|un|partial|teilweise)\b/i.test(s)
}

/**
 * Fundstellen von `text`. Treffer, die in einer Fundstelle des Soll-Texts
 * liegen, zählen nicht: Bei „ATO.106" → „AT.ATO.106" ist die Korrektur
 * selbst kein Rest.
 */
function suchen(docs: PaketDok[], text: string, max = 12, soll: string[] = []): Fundstelle[] {
  const q = norm(text)
  if (!q) return []
  const huellen = soll.map(norm).filter((x) => x !== q && x.includes(q))
  const umhuellt = (n: string, i: number) =>
    huellen.some((h) => {
      for (let k = n.indexOf(h); k >= 0; k = n.indexOf(h, k + 1)) if (k <= i && i + q.length <= k + h.length) return true
      return false
    })
  const out: Fundstelle[] = []
  for (const d of docs)
    for (const p of d.pages) {
      const t = p.text.replace(/­/g, '').replace(/\s+/g, ' ')
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
            out.push({
              dokId: d.id,
              dok: d.titel,
              kapitel: kapitelBei(d, p, n, i),
              seite: p.label ?? String(p.index),
              index: p.index,
              auszug: `${a > 0 ? '…' : ''}${t.slice(a, e).trim()}${e < t.length ? '…' : ''}`,
              text,
            })
          }
        }
        i = n.indexOf(q, i + q.length)
      }
    }
  return out
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

export function befundPruefen(b: FremdBefund, ziel: Ziel, paket: PaketDok[]): ReErgebnis {
  const anweisung = anweisungAus(b)
  const basis = { ref: b.ref, zeile: b.zeile, anweisung, rest: [] as Fundstelle[], belegt: [] as Fundstelle[], fehlt: [] as string[], behauptungWiderlegt: false }
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
  let wegErledigt = 0
  for (const w of anweisung.weg) {
    const hier = suchen(ziele, w, 12, anweisung.da)
    const dort = suchen(andere, w, 12, anweisung.da)
    rest.push(...hier)
    restAnders.push(...dort)
    if (!hier.length) wegErledigt++
  }
  const belegt: Fundstelle[] = []
  const fehlt: string[] = []
  for (const d of anweisung.da) {
    const f = suchen(ziele, d, 1)
    if (f.length) belegt.push(...f)
    else fehlt.push(d)
  }
  const x = { rest: [...rest, ...restAnders], belegt, fehlt }
  const soll = anweisung.weg.length + anweisung.da.length
  const umgesetzt = wegErledigt + belegt.length

  if (!rest.length && !fehlt.length) return restAnders.length ? fertig('partial', 'restAnderesDok', x) : fertig('resolved', 'wegUndDa', x)
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
    restAnderesDok: 'Fixed in the referenced document, but still present elsewhere in the package:',
    teilweise: 'Only partially implemented.',
    unveraendert: 'Text objected to is still present unchanged.',
    nurEmpfehlung: 'Raised as a recommendation and not implemented – please add a justification.',
    quelleFehlt: 'Referenced document is not part of the review package.',
    keinText: 'Document contains no searchable text (scan without OCR).',
    keineAnweisung: 'Finding cannot be checked by rules (content) – expert review required.',
  },
}

const W: Record<RemarkSprache, { rest: string; fehlt: string; widerlegt: string; vorschlag: string; seite: string }> = {
  de: { rest: 'Noch vorhanden', fehlt: 'Fehlt', widerlegt: 'Team-Kommentar meldet die Korrektur, im Dokument nicht nachweisbar.', vorschlag: 'Korrekturvorschlag', seite: 'S.' },
  en: { rest: 'Still present', fehlt: 'Missing', widerlegt: 'Team comment reports the correction; not found in the document.', vorschlag: 'Proposed correction', seite: 'p.' },
}

const zeile = (f: Fundstelle, s: RemarkSprache) => `• ${[f.dok, f.kapitel, /^\d+$/.test(f.seite) ? `${W[s].seite} ${f.seite}` : f.seite, `„${f.auszug}"`].filter(Boolean).join(' · ')}`

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
  if (r.fehlt.length) teile.push(`${W[s].fehlt}: ${r.fehlt.map((x) => `„${x}"`).join(', ')}`)
  if (r.behauptungWiderlegt) teile.push(W[s].widerlegt)
  const { weg, da } = r.anweisung
  if ((r.status === 'open' || r.status === 'partial') && weg.length && da.length) teile.push(`${W[s].vorschlag}: „${weg[0]}" → „${da[0]}"`)
  return teile.join('\n')
}
