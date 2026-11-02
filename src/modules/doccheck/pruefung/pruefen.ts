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
  /** Kein auswertbarer Text (Scan ohne Textebene, leere Seiten) — nur gesetzt, wenn wahr (DC-03) */
  ohneText?: true
}

/**
 * Hat das Dokument Text, den die Prüfungen auswerten können? Seiten, die
 * auf die Texterkennung warten, zählen nicht — ihr Rest an Zeichen (eine
 * Seitenzahl, ein Stempel) ist kein Inhalt (Audit 11/2026, DC-03).
 */
export function textAuswertbar(roh: Pick<Rohdokument, 'pages' | 'ocrKandidaten'>): boolean {
  const scan = new Set(roh.ocrKandidaten)
  return roh.pages.some((p) => !scan.has(p.index) && p.text.trim() !== '')
}

/**
 * Ohne Text gibt es nichts Prüfbares: Ein Prüfpunkt ohne Befund heißt dann
 * „nicht anwendbar", nicht „in Ordnung" (CLAUDE.md). Vorher standen bei
 * einem Scan Reste, Platzhalter, Einheiten und doppelte Wörter auf grün
 * (DC-03). Befunde bleiben, wo es welche gibt. Ausgenommen ist, was nicht
 * am Seitentext hängt: der Word-Check (Word-Extrakt: Eigenschaften,
 * Kompatibilität, Kopf-/Fußteile) und der Registerabgleich (Metadaten,
 * Dateiname).
 */
function ohneTextNichtAnwendbar(gruppe: string, ampel: Record<string, Ampel>): Record<string, Ampel> {
  if (gruppe === 'word') return ampel
  return Object.fromEntries(Object.entries(ampel).map(([p, a]) => [p, a === 'ok' && !(gruppe === 'referenz' && p === 'register') ? 'na' : a]))
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
  const ohneText = !textAuswertbar(d.roh)
  const aus = (gruppe: string, x: { ampel: Record<string, Ampel> } | null) => (ohneText ? ohneTextNichtAnwendbar(gruppe, x?.ampel ?? {}) : (x?.ampel ?? {}))
  return {
    befunde: sortieren(idsVergeben([...(formal?.befunde ?? []), ...(word?.befunde ?? []), ...(sprache?.befunde ?? []), ...(referenz?.befunde ?? []), ...(rechnen?.befunde ?? []), ...(verweis?.befunde ?? []), ...(regelwerk?.befunde ?? [])])),
    ampel: { formal: aus('formal', formal), word: aus('word', word), sprache: aus('sprache', sprache), referenz: aus('referenz', referenz), rechnen: aus('rechnen', rechnen), verweis: aus('verweis', verweis), regelwerk: aus('regelwerk', regelwerk) },
    ...(regelwerk ? { regelwerk: regelwerk.stand } : {}),
    dokumentSprache: sprache?.sprache ?? null,
    ...(ohneText ? { ohneText: true as const } : {}),
  }
}
