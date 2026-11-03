/**
 * Regeln fuer Werte der App-Einstellungen, die das Admin-Panel bearbeitet.
 *
 * Liegt hier und nicht in der Ansicht, damit die Testwache sie sieht: Die
 * Regeln standen in Admin.tsx als Einzeiler im onChange, und beide Fehler
 * dahinter fielen erst im Audit auf.
 */

/**
 * Pflichtkategorie in Feedback und Instructor Info. `migrateState` stellt sie
 * bei jedem Start wieder her (Eintraege ohne eigene Kategorie fallen darauf
 * zurueck) — deshalb darf die Oberflaeche sie gar nicht erst loeschen.
 */
export const PFLICHT_KATEGORIE = 'General'

export type KategorieListe = 'feedbackCategories' | 'infoCategories' | 'lessonCategories'

/**
 * Eintraege einer Kategorienliste, die keinen Loeschknopf bekommen.
 *
 * Das Admin-Panel bot das Loeschen an, speicherte es und meldete Erfolg —
 * beim naechsten Start stand alles wieder da, weil `migrateState` „General"
 * nachtraegt und eine leere Schulungsarten-Liste durch die Vorgabe ersetzt
 * (Audit 11/2026, TEC-09). Ein Loeschen, das sich selbst rueckgaengig macht,
 * ist schlimmer als keines. Die Nachtraege bleiben (sie sichern Bestands-
 * geraete); stattdessen sagt diese Regel, was liegen bleibt:
 *  - Feedback/Info: „General".
 *  - Schulungsarten: die letzte verbliebene — leer hiesse „Vorgabe zurueck".
 */
export function festeEintraege(liste: KategorieListe, werte: string[]): string[] {
  if (liste === 'lessonCategories') return werte.length === 1 ? [...werte] : []
  return werte.filter((w) => w === PFLICHT_KATEGORIE)
}

/**
 * Steht dieser Wert schon in der Liste, wenn auch anders geschrieben?
 *
 * Die Chip-Listen der Einstellungen verglichen exakt: „CL30" und „cl30"
 * oder „Safety" und „safety" standen nebeneinander (Audit 11/2026,
 * Nachtrag VERW#3). Beim Muster ist das mehr als Kosmetik — die Musterregel
 * (`imMusterbereich` in aircraftScope.ts) vergleicht exakt, ein Inhalt mit
 * „cl30" bliebe also allen verborgen, die „CL30" fliegen. Gleich ist, was
 * sich nur in Gross-/Kleinschreibung und Leerraum unterscheidet.
 *
 * Zurueck kommt der vorhandene Eintrag in SEINER Schreibweise: Die Meldung
 * nennt ihn so, wie er in der Liste steht — sonst sucht man „cl30" und
 * findet es nicht.
 */
export function vorhandenerEintrag(werte: string[], neu: string): string | undefined {
  // toLowerCase statt toLocaleLowerCase: Die Gleichheit darf nicht von der
  // Spracheinstellung des Geraets abhaengen.
  const form = (s: string) => s.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase()
  const gesucht = form(neu)
  return werte.find((w) => form(w) === gesucht)
}

/**
 * Obergrenze fuer „Maximale Upload-Groesse" in MB.
 *
 * Anhaenge sollen mit Phase 1b in Supabase Storage liegen; dessen
 * Standardgrenze je Datei betraegt 50 MB. Ein hoeherer Wert verspraeche
 * Uploads, die das Backend abweist — wer mehr braucht, hebt beide Grenzen
 * gemeinsam an.
 */
export const MAX_UPLOAD_MB = 50

/**
 * Eingabe des Felds „Maximale Upload-Groesse" in den gespeicherten Wert.
 *
 * Das Feld rechnete bei jedem Tastendruck `Math.max(1, Number(v) || 1)`:
 * Leeren ergab sofort „1", und wer danach „25" tippte, speicherte 125
 * (Audit 11/2026, VERW-20). Jetzt ist ein leeres Feld ein erlaubter
 * Zwischenstand; geprueft wird erst beim Verlassen. Leer oder keine Zahl
 * heisst: der alte Wert bleibt. Sonst ganzzahlig in [1, MAX_UPLOAD_MB].
 */
export function uploadGrenze(roh: string, alt: number): number {
  const text = roh.trim().replace(',', '.')
  if (!text) return alt
  const zahl = Number(text)
  if (!Number.isFinite(zahl)) return alt
  return Math.min(MAX_UPLOAD_MB, Math.max(1, Math.round(zahl)))
}
