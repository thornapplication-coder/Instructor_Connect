import type { Ergebnis } from '../../selbsttest'
import type { LeseAuftrag, Zusammenfassung } from './kern'
import { pdfBauen, textSeite } from './parse/pdfBauen'
import { eigeneVerbindung } from './verbindung'

/**
 * Selbsttest, Teil DocCheck: Läuft die Prüfkette auf DIESEM Gerät?
 *
 * Ein künstliches Prüfdokument mit EINEM eingebauten Fehler („TBD") geht
 * durch den echten Worker — pdf.js laden, Text lesen, Formalprüfung. Kommt
 * der Fehler als Befund zurück, funktioniert die Kette; kommt er nicht,
 * prüft DocCheck auf diesem Gerät nichts, auch wenn es so aussieht. Das ist
 * die Frage, die Nutzer stellen, wenn „keine Befunde" zu gut klingt.
 *
 * Kein echter Inhalt, nichts wird gespeichert, eine eigene Verbindung
 * (`eigeneVerbindung`) — die Probe erscheint in keiner Sitzung.
 */

export const PROBE_ID = 'ic-selbsttest'
/** Lesen und Prüfen einer Seite dauert Millisekunden; 30 s heißt: hängt. */
export const PROBE_ZEITGRENZE_MS = 30_000

/** Das Probedokument: synthetisch wie die Abnahmedateien (SBX-…). */
export function probePdf(): Uint8Array {
  return pdfBauen([{ texte: textSeite(['SBX-SELBSTTEST Training Manual', '1 Introduction', 'The approach briefing procedure is TBD.']) }], { titel: 'SBX-SELBSTTEST' })
}

function mitZeitgrenze<T>(p: Promise<T>, ms: number): Promise<T> {
  let uhr: ReturnType<typeof setTimeout> | undefined
  return Promise.race([
    p.finally(() => clearTimeout(uhr)),
    new Promise<never>((_, nein) => {
      uhr = setTimeout(() => nein(new Error('DC-ZEIT')), ms)
    }),
  ])
}

/**
 * Probe mit einer beliebigen Lesefunktion — im Browser der Worker, im Test
 * der Kern direkt. Zwei Ergebnisse: Lesen (Worker, pdf.js) und Prüfen
 * (Regeln). Scheitert das Lesen, ist das Prüfen nicht prüfbar, nicht rot.
 */
export async function docCheckProben(lesen: (a: LeseAuftrag) => Promise<Zusammenfassung>, uhr: () => number = () => performance.now(), zeitgrenzeMs = PROBE_ZEITGRENZE_MS): Promise<Ergebnis[]> {
  const start = uhr()
  let z: Zusammenfassung
  try {
    z = await mitZeitgrenze(lesen({ id: PROBE_ID, name: 'SBX-SELBSTTEST.pdf', daten: probePdf(), pruefen: { formal: true, word: true } }), zeitgrenzeMs)
  } catch (e) {
    const code = e instanceof Error && /^DC-[A-Z-]+$/.test(e.message) ? e.message : 'DC-UNBEKANNT'
    return [
      { id: 'doccheckLesen', gruppe: 'doccheck', stufe: 'fehler', variante: code === 'DC-ZEIT' ? 'zeit' : 'fehler', werte: { code } },
      { id: 'doccheckPruefen', gruppe: 'doccheck', stufe: 'offen' },
    ]
  }
  const gelesen = z.seiten === 1 && z.zeichen > 0
  if (!gelesen) return [{ id: 'doccheckLesen', gruppe: 'doccheck', stufe: 'fehler', variante: 'leer' }, { id: 'doccheckPruefen', gruppe: 'doccheck', stufe: 'offen' }]
  const gefunden = (z.pruefung?.befunde ?? []).some((b) => b.pruefpunkt === 'reste')
  return [
    { id: 'doccheckLesen', gruppe: 'doccheck', stufe: 'ok', werte: { ms: Math.max(0, Math.round(uhr() - start)) } },
    { id: 'doccheckPruefen', gruppe: 'doccheck', stufe: gefunden ? 'ok' : 'fehler' },
  ]
}

/** Im Browser: eigener Worker, danach beendet — auch wenn die Probe scheitert. */
export async function docCheckSelbsttest(): Promise<Ergebnis[]> {
  const v = eigeneVerbindung()
  try {
    return await docCheckProben((a) => v.lesen(a))
  } finally {
    v.beenden()
  }
}
