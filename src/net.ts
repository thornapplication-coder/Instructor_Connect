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
  return (await serverProbe()).erreichbar
}

/**
 * Dieselbe Probe mit ihrem Zeitstempel: Der `Date`-Kopf der Antwort ist die
 * Serverzeit, gegen die der Selbsttest die Uhr des Geräts prüft
 * (`uhrAbweichung` in selbsttest.ts). HEAD geht am Service Worker vorbei —
 * eine Antwort aus dem Cache trüge die Zeit ihres Abrufs, nicht die von jetzt.
 */
export async function serverProbe(): Promise<{ erreichbar: boolean; datum: string | null; gesendet: number; empfangen: number }> {
  const gesendet = Date.now()
  if (navigator.onLine === false) return { erreichbar: false, datum: null, gesendet, empfangen: gesendet }
  try {
    const res = await fetch('./manifest.webmanifest', { method: 'HEAD', cache: 'no-store' })
    const empfangen = Date.now()
    const type = res.headers.get('content-type') ?? ''
    const erreichbar = res.ok && !type.includes('text/html')
    // Die Zeit einer Anmeldeseite (Gäste-WLAN) ist nicht die des eigenen Servers.
    return { erreichbar, datum: erreichbar ? res.headers.get('date') : null, gesendet, empfangen }
  } catch {
    return { erreichbar: false, datum: null, gesendet, empfangen: Date.now() }
  }
}
