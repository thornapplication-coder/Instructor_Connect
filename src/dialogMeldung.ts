/**
 * Wohin eine Ablehnung gehört, solange der Dialog offen ist.
 *
 * Audit 11/2026, R3-DIALOGMELDUNG: Abgewiesenes kam als Toast — und der liegt
 * UNTER dem Dialog, am iPhone vom Bottom-Sheet ganz verdeckt. Entscheidung
 * des Nutzers: Die Meldung steht im Dialog. Am Feld, wenn sie zu einem Feld
 * gehört; sonst in der gemeinsamen Meldezeile über den Dialogknöpfen
 * (`DialogMeldung` in ui.tsx).
 *
 * Zu einem Feld gehört sie, wenn dort ein Grund steht: Die Dialoge prüfen
 * beim Tippen nach denselben Regeln wie der Store (E-Mail vergeben, Domain,
 * Gruppenname …) und sperren „Speichern", solange ein Feld einen Grund
 * zeigt. Zeigt bei einer Ablehnung doch ein Feld ihren Grund, wiederholte
 * eine zweite Zeile über den Knöpfen ihn nur — dann bekommt das Feld den
 * Fokus (Sprachausgabe liest seine Beschreibung, das Sheet rollt hin). Im
 * Regelfall liegt der Grund dann aber außerhalb der Felder — Recht entzogen,
 * Gruppe inzwischen gelöscht, Eintrag in einem anderen Tab entfernt — und
 * steht in der Meldezeile. Gefragt wird mit dem Stand, den der Dialog gerade
 * zeigt: Was er nicht anzeigt, kann er nicht am Feld erklären.
 */
export type Ablehnung<F extends string> = { feld: F } | { meldung: string }

/**
 * @param felder die Felder des Dialogs in Anzeigereihenfolge, je mit der
 *   Angabe, ob dort gerade ein Fehler steht
 * @param meldung der Text für die Meldezeile, wenn kein Feld den Grund zeigt
 * @returns das erste Feld mit Fehler, sonst die Meldung
 */
export function ablehnungZeigen<F extends string>(felder: readonly (readonly [F, boolean])[], meldung: string): Ablehnung<F> {
  const feld = felder.find(([, fehler]) => fehler)?.[0]
  return feld !== undefined ? { feld } : { meldung }
}
