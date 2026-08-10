/**
 * Echte Erreichbarkeitsprüfung statt navigator.onLine.
 *
 * navigator.onLine meldet true, sobald irgendein Netz da ist — auch in
 * einem WLAN ohne Internet oder hinter einer Anmeldeseite, also genau in
 * der Umgebung (Simulatorgebäude, Gäste-AP), für die der Ausgangskorb
 * gebaut wurde. Gemessen: Ein auf „queued" gesetzter Datensatz stand nach
 * dem Seitenladen sofort auf „sent", ohne dass eine einzige Netzanfrage
 * stattgefunden hätte.
 *
 * Belastbar ist nur eine beantwortete Anfrage an den eigenen Origin:
 *  - HEAD statt GET: der Service Worker fasst nur GET an — die Probe geht
 *    garantiert ins Netz, nie in den Cache, und verschmutzt ihn nicht.
 *  - cache: no-store gegen den HTTP-Cache.
 *  - Anmeldeseiten (Captive Portals) beantworten alles mit einer
 *    HTML-Seite — eine text/html-Antwort auf das Manifest ist deshalb
 *    KEIN Beleg für Erreichbarkeit.
 *
 * `navigator.onLine === false` bleibt als schnelle Vorprüfung: falsch-
 * negativ ist sie praktisch nie.
 */
export async function networkReachable(): Promise<boolean> {
  if (navigator.onLine === false) return false
  try {
    const res = await fetch('./manifest.webmanifest', { method: 'HEAD', cache: 'no-store' })
    const type = res.headers.get('content-type') ?? ''
    return res.ok && !type.includes('text/html')
  } catch {
    return false
  }
}
