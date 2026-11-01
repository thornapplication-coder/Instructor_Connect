import type { ErkannteMeta } from '../parse/meta'
import type { Rohdokument } from '../parse/model'
import { idsVergeben, sortieren, type Ampel, type Befund } from './befund'
import { formalPruefung } from './formal'
import { REGELN, type Regeln } from './kontext'
import { sprachCheck } from './sprachCheck'
import { wordCheck } from './wordCheck'
import { referenzCheck } from './referenzCheck'
import type { ReferenzListe } from '../referenz/liste'

/**
 * Alle regelbasierten Prüfungen eines Prüfdokuments — läuft im Worker
 * sofort nach dem Einlesen (Spez. 8.8), kostet nichts und funktioniert auch
 * im Notbetrieb (Spez. 13.4).
 */

export interface Pruefung {
  befunde: Befund[]
  ampel: { formal: Record<string, Ampel>; word: Record<string, Ampel>; sprache: Record<string, Ampel>; referenz: Record<string, Ampel> }
  dokumentSprache: string | null
}

export function dokumentPruefen(
  d: { dokId: string; dokName: string; dateiname: string; roh: Rohdokument; meta: ErkannteMeta },
  schalter: { formal: boolean; word: boolean },
  regeln: Regeln = REGELN,
  referenzen: ReferenzListe[] = [],
): Pruefung {
  const k = { ...d, regeln }
  const formal = schalter.formal ? formalPruefung(k) : null
  const word = schalter.word ? wordCheck(k, d.dateiname) : null
  const sprache = schalter.word ? sprachCheck(k) : null
  // Referenzlisten prüfen, sobald welche geladen sind — unabhängig von den Schaltern.
  const referenz = referenzen.length ? referenzCheck(k, referenzen, d.dateiname) : null
  const aus = (x: { ampel: Record<string, Ampel> } | null) => x?.ampel ?? {}
  return {
    befunde: sortieren(idsVergeben([...(formal?.befunde ?? []), ...(word?.befunde ?? []), ...(sprache?.befunde ?? []), ...(referenz?.befunde ?? [])])),
    ampel: { formal: aus(formal), word: aus(word), sprache: aus(sprache), referenz: aus(referenz) },
    dokumentSprache: sprache?.sprache ?? null,
  }
}
