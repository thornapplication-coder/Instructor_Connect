import { ampelAus, anzahl, type Befund } from './befund'
import { absaetze, befund, fundstelle, type PruefAbsatz, type PruefKontext } from './kontext'
import { dokumentSprache, einschuebe, istAdresse, istEigenname, istZitat, loestAuf, spracheVon, type Sprache } from './sprache'

/**
 * Fremdsprachige Reste und erweiterte Platzhalter (Nachtrag N9) — für alle
 * Formate, auch Excel-Formulare und -Checklisten.
 */

export const SPRACH_PUNKTE = ['fremdsprache', 'einschuebe', 'platzhalter'] as const

/** Arbeitskommentare erkennt man an Arbeitsaufträgen — die sind „Hoch" (N9). */
const ARBEIT = /\b(bitte|prüfen|überprüfen|ändern|anpassen|klären|todo|to do|offen|fehlt|noch|check|update|confirm|verify)\b/i

/**
 * Eigenname statt fremdsprachigem Rest (N9): die Auflösung neben ihrem
 * Kürzel („SERA | Standardised European Rules of the Air") oder eine
 * Wortfolge wie ein Name. Der amtliche englische Name in der
 * Abkürzungstabelle eines deutschen Handbuchs war ein Mittel-Befund
 * (Audit 11/2026, FRD-17). Ein Arbeitsauftrag ist nie ein Name.
 */
function eigenname(a: PruefAbsatz): boolean {
  if (ARBEIT.test(a.text)) return false
  const zellen = a.text.split(' | ')
  const [kuerzel, rest] = a.ersteZelle !== undefined ? [a.ersteZelle, a.text] : zellen.length > 1 ? [zellen[0].trim(), zellen.slice(1).join(' ')] : [undefined, a.text]
  return (kuerzel !== undefined && /^[A-Z][A-Z0-9/&-]{1,9}$/.test(kuerzel) && loestAuf(kuerzel, rest)) || istEigenname(rest)
}

export function sprachCheck(k: PruefKontext): { befunde: Omit<Befund, 'id'>[]; ampel: Record<string, 'ok' | 'wait' | 'bad' | 'na'>; sprache: Sprache | null } {
  const alle = absaetze(k.roh)
  const inhalt = alle.filter((a) => a.wortOrt !== 'kopf' && a.wortOrt !== 'fuss')
  const dok = dokumentSprache(inhalt.map((a) => a.text))
  const out: Omit<Befund, 'id'>[] = []

  if (dok) {
    const fremd = inhalt.filter((a) => {
      const s = spracheVon(a.text)
      return s !== null && s !== dok && !istZitat(a.text) && !istAdresse(a.text, k.regeln.adresse) && !eigenname(a)
    })
    const arbeit = fremd.filter((a) => ARBEIT.test(a.text))
    if (fremd.length) {
      out.push(
        befund(k, {
          quelle: 'sprache',
          pruefpunkt: 'fremdsprache',
          kategorie: 'Editorial',
          prioritaet: arbeit.length ? 'High' : 'Medium',
          text: `Text in a language other than the document language (${dok}) in ${anzahl(fremd.length, 'paragraph')}${!arbeit.length ? '' : fremd.length === 1 ? ', which looks like a working comment' : `; ${arbeit.length} of them ${arbeit.length === 1 ? 'looks like a working comment' : 'look like working comments'}`}.`,
          fundstellen: fremd.map((a) => fundstelle(a, `${a.text} [${spracheVon(a.text)}]`)),
          anleitung: 'fremdsprache',
        }),
      )
    }
    // Einzelne Wörter der Landessprache in englischem Text.
    const liste = dok === 'en' ? (k.regeln.einschuebe.de ?? []) : []
    const mitEinschub = inhalt
      .filter((a) => spracheVon(a.text) !== 'de' && !istAdresse(a.text, k.regeln.adresse) && !istZitat(a.text))
      .map((a) => ({ a, w: einschuebe(a.text, liste) }))
      .filter((x) => x.w.length)
    if (mitEinschub.length) {
      out.push(
        befund(k, {
          quelle: 'sprache',
          pruefpunkt: 'einschuebe',
          kategorie: 'Editorial',
          prioritaet: 'Low',
          text: `Single words in the local language within ${dok} text (${anzahl(mitEinschub.length, 'place')}).`,
          fundstellen: mitEinschub.map(({ a, w }) => fundstelle(a, `${a.text} → ${w.join(', ')}`)),
          anleitung: 'einschuebe',
        }),
      )
    }
  }

  // Platzhalter (N9) — Ausfüllfelder nur außerhalb von Unterschriftsblöcken.
  const muster = k.regeln.platzhalter.map((p) => ({ name: p.name, re: new RegExp(p.muster, 'g') }))
  const unterschrift = new RegExp(`(${k.regeln.unterschrift.map((u) => u.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'i')
  const treffer = alle.flatMap((a) =>
    muster.flatMap((m) => {
      if (m.name === 'ausfuellfeld' && unterschrift.test(a.text)) return []
      return [...a.text.matchAll(m.re)].map((t) => fundstelle(a, `${t[0]} — ${a.text}`))
    }),
  )
  if (treffer.length) {
    out.push(befund(k, { quelle: 'sprache', pruefpunkt: 'platzhalter', kategorie: 'Editorial', prioritaet: 'Medium', text: `${anzahl(treffer.length, 'placeholder')} still in the document (number placeholders, _XX suffixes, fill-in lines).`, fundstellen: treffer, anleitung: 'platzhalter' }))
  }

  return { befunde: out, ampel: ampelAus([...SPRACH_PUNKTE], out as Befund[], dok ? [] : ['fremdsprache', 'einschuebe']), sprache: dok }
}
