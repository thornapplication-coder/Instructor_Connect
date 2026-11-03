/**
 * Wie lange eine Bestätigung stehen bleibt.
 *
 * Fest 3,5 s waren für „Gespeichert" reichlich und für einen Hinweis wie
 * „Nicht gesendet: Der Anhang ist größer als erlaubt … Entferne ihn – dein
 * Text bleibt stehen." zu kurz: Er verschwand mitten im Lesen
 * (Gegenprüfung Audit 11/2026, offener Punkt aus Runde 1). Gerechnet wird
 * mit rund 60 ms je Zeichen (gut 15 Zeichen pro Sekunde, langsames Lesen
 * auf dem Telefon) auf eine Grundzeit — nie kürzer als bisher, nie länger
 * als 10 s, damit ein Stapel von Meldungen nicht den halben Bildschirm
 * belegt.
 */
export const TOAST_MIN_MS = 3500
export const TOAST_MAX_MS = 10_000
const GRUND_MS = 1500
const JE_ZEICHEN_MS = 60

export function toastDauer(text: string): number {
  return Math.min(TOAST_MAX_MS, Math.max(TOAST_MIN_MS, GRUND_MS + [...text.trim()].length * JE_ZEICHEN_MS))
}
