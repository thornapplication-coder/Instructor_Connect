import type { ErkannteMeta } from '../parse/meta'
import type { Rohdokument } from '../parse/model'
import { idsVergeben, sortieren, type Ampel, type Befund } from './befund'
import { formalPruefung } from './formal'
import { REGELN, type Regeln } from './kontext'
import { sprachCheck } from './sprachCheck'
import { wordCheck } from './wordCheck'
import { referenzCheck } from './referenzCheck'
import { rechenPruefung } from './rechnen'
import { verweisPruefung } from './verweise'
import { regelwerkPruefung, type RegelIndex, type RegelwerkStand } from './regelwerk'
import type { ReferenzListe } from '../referenz/liste'

/**
 * Alle regelbasierten Prüfungen eines Prüfdokuments — läuft im Worker
 * sofort nach dem Einlesen (Spez. 8.8), kostet nichts und funktioniert auch
 * im Notbetrieb (Spez. 13.4).
 */

export interface Pruefung {
  befunde: Befund[]
  ampel: { formal: Record<string, Ampel>; word: Record<string, Ampel>; sprache: Record<string, Ampel>; referenz: Record<string, Ampel>; rechnen?: Record<string, Ampel>; verweis?: Record<string, Ampel>; regelwerk?: Record<string, Ampel> }
  /** Regelwerksstand (N8): geladene Quellen und Zählung der Verweise */
  regelwerk?: RegelwerkStand
  dokumentSprache: string | null
}

export function dokumentPruefen(
  d: { dokId: string; dokName: string; dateiname: string; roh: Rohdokument; meta: ErkannteMeta },
  /** rechnen: N6 (Schalter calcCheck); Verweise (N7) laufen mit der Formalprüfung */
  schalter: { formal: boolean; word: boolean; rechnen?: boolean },
  regeln: Regeln = REGELN,
  referenzen: ReferenzListe[] = [],
  /** Index der geladenen Regelwerke (N8) — läuft unabhängig von den Schaltern, sobald einer da ist */
  regelIndex?: RegelIndex,
): Pruefung {
  const k = { ...d, regeln }
  const formal = schalter.formal ? formalPruefung(k) : null
  const word = schalter.word ? wordCheck(k, d.dateiname) : null
  const sprache = schalter.word ? sprachCheck(k) : null
  // Referenzlisten prüfen, sobald welche geladen sind — unabhängig von den Schaltern.
  const referenz = referenzen.length ? referenzCheck(k, referenzen, d.dateiname) : null
  const rechnen = schalter.rechnen ? rechenPruefung(k) : null
  const verweis = schalter.formal ? verweisPruefung(k) : null
  const regelwerk = regelIndex ? regelwerkPruefung(k, regelIndex) : null
  const aus = (x: { ampel: Record<string, Ampel> } | null) => x?.ampel ?? {}
  return {
    befunde: sortieren(idsVergeben([...(formal?.befunde ?? []), ...(word?.befunde ?? []), ...(sprache?.befunde ?? []), ...(referenz?.befunde ?? []), ...(rechnen?.befunde ?? []), ...(verweis?.befunde ?? []), ...(regelwerk?.befunde ?? [])])),
    ampel: { formal: aus(formal), word: aus(word), sprache: aus(sprache), referenz: aus(referenz), rechnen: aus(rechnen), verweis: aus(verweis), regelwerk: aus(regelwerk) },
    ...(regelwerk ? { regelwerk: regelwerk.stand } : {}),
    dokumentSprache: sprache?.sprache ?? null,
  }
}
