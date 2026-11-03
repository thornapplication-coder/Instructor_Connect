/**
 * Ist dieser Fehler ein LADEFEHLER — ein Teil der App kam nicht übers Netz —
 * oder ein Fehler im Code?
 *
 * Die Unterscheidung entscheidet, was „Erneut versuchen" tun muss (Audit
 * 11/2026, TEC-08). Bisher setzte der Knopf nur die Fehlergrenze zurück; nach
 * einem gescheiterten Nachladen konnte das nie gelingen: Chromium merkt sich
 * den gescheiterten Modulabruf, auch ein frischer `import()` derselben
 * Adresse scheitert weiter, obwohl `fetch()` längst 200 liefert (nachgestellt
 * in der Gegenprüfung). Erst ein Neuladen der Seite hilft. Ein Renderfehler
 * dagegen braucht kein Netz — dort genügt das Zurücksetzen, und ein Neuladen
 * verwürfe die Sitzungsdokumente.
 *
 * Dieselbe Frage stellt sich beim Export (TEC-19): Excel, Word und PowerPoint
 * laden ihre Bibliothek erst beim ersten Export. Offline heißt das „einmal
 * Netz nötig", nicht „der Export ist kaputt".
 *
 * Erkannt wird an den Meldungen der Browser, nicht am Fehlertyp allein: Ein
 * `TypeError` ist auch „x is undefined". Ein Fehler, der nur zufällig im
 * Funkloch auftritt, gilt deshalb nicht pauschal als Ladefehler — erst, wenn
 * er auch nach einem Netzfehler aussieht.
 */

/** Der Browser konnte ein nachzuladendes Modul nicht holen. */
const MODUL_NICHT_GELADEN = [
  /Failed to fetch dynamically imported module/i, // Chromium
  /error loading dynamically imported module/i, // Firefox
  /Importing a module script failed/i, // WebKit
  /Unable to preload CSS/i, // Vites Vorladen der Abhängigkeiten
]

/** Meldungen eines gescheiterten Netzabrufs (fetch) — nur offline aussagekräftig. */
const NETZFEHLER = [/Failed to fetch/i, /NetworkError/i, /Load failed/i, /net::ERR_/i]

/** Ohne `navigator` (Worker, Node) gilt das Gerät als online — dann zählen nur die eindeutigen Meldungen. */
export function geraetOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false
}

export function istLadefehler(fehler: unknown, online: boolean = geraetOnline()): boolean {
  if (fehler === null || fehler === undefined) return false
  // Auch ein Fehler ohne Error-Prototyp zählt (etwa nach dem Weg über
  // postMessage) — entscheidend ist die Meldung.
  const meldung = typeof fehler === 'string' ? fehler : (fehler as { message?: unknown }).message
  const text = typeof meldung === 'string' ? meldung : ''
  if (/^DC-LOAD\b/.test(text)) return true
  if (MODUL_NICHT_GELADEN.some((re) => re.test(text))) return true
  return !online && NETZFEHLER.some((re) => re.test(text))
}
