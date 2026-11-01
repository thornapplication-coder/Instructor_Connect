import { ampelAus, type Befund } from './befund'
import { absaetze, befund, fundstelle, type PruefKontext } from './kontext'
import { dokumentSprache, einschuebe, istAdresse, istZitat, spracheVon, type Sprache } from './sprache'

/**
 * Fremdsprachige Reste und erweiterte Platzhalter (Nachtrag N9) — für alle
 * Formate, auch Excel-Formulare und -Checklisten.
 */

export const SPRACH_PUNKTE = ['fremdsprache', 'einschuebe', 'platzhalter'] as const

/** Arbeitskommentare erkennt man an Arbeitsaufträgen — die sind „Hoch" (N9). */
const ARBEIT = /\b(bitte|prüfen|überprüfen|ändern|anpassen|klären|todo|to do|offen|fehlt|noch|check|update|confirm|verify)\b/i

export function sprachCheck(k: PruefKontext): { befunde: Omit<Befund, 'id'>[]; ampel: Record<string, 'ok' | 'wait' | 'bad' | 'na'>; sprache: Sprache | null } {
  const alle = absaetze(k.roh)
  const inhalt = alle.filter((a) => a.wortOrt !== 'kopf' && a.wortOrt !== 'fuss')
  const dok = dokumentSprache(inhalt.map((a) => a.text))
  const out: Omit<Befund, 'id'>[] = []

  if (dok) {
    const fremd = inhalt.filter((a) => {
      const s = spracheVon(a.text)
      return s !== null && s !== dok && !istZitat(a.text) && !istAdresse(a.text, k.regeln.adresse)
    })
    const arbeit = fremd.filter((a) => ARBEIT.test(a.text))
    if (fremd.length) {
      out.push(
        befund(k, {
          quelle: 'sprache',
          pruefpunkt: 'fremdsprache',
          kategorie: 'Editorial',
          prioritaet: arbeit.length ? 'High' : 'Medium',
          text: `Text in another language than the document (${dok}) in ${fremd.length} paragraph(s)${arbeit.length ? `, ${arbeit.length} of them look like working comments` : ''}.`,
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
          text: `Single words in the local language within ${dok} text (${mitEinschub.length} place(s)).`,
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
    out.push(befund(k, { quelle: 'sprache', pruefpunkt: 'platzhalter', kategorie: 'Editorial', prioritaet: 'Medium', text: `${treffer.length} placeholder(s) still in the document (number placeholders, _XX suffixes, fill-in lines).`, fundstellen: treffer, anleitung: 'platzhalter' }))
  }

  return { befunde: out, ampel: ampelAus([...SPRACH_PUNKTE], out as Befund[], dok ? [] : ['fremdsprache', 'einschuebe']), sprache: dok }
}
