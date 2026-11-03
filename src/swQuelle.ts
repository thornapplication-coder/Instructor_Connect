/**
 * Service Worker (dist/sw.js): sein Quelltext und alles, was beim Build über
 * ihn entschieden wird — was vorab auf jedes Gerät kommt und wie sein Cache
 * heißt. vite.config.ts liest nur noch Dateien ein und ruft diese
 * Funktionen.
 *
 * Das stand bisher alles in vite.config.ts — außerhalb von src/, also ohne
 * Testwache, und nicht einmal in der Typprüfung (`include: ["src"]`). Genau
 * dort lag ein Fehler, den Ebene 3 nicht sehen konnte (Audit 11/2026,
 * TEC-01), und der Vollauf der CI fand die übrige Logik ebenso ungeprüft
 * (Gegenprüfung L-CI): `nurNachgeladen` und den Cache-Namen sicherte nur
 * der Offline-Test indirekt ab.
 */

/**
 * Schriftdateien, die ein Gerät nur im Ausnahmefall braucht — sie kommen
 * nicht in den Vorab-Cache, sondern erst beim ersten Bedarf (der Abruf-Zweig
 * des Workers legt sie dann ab).
 *
 * Vorher lud jede Installation und jedes Update alle 56 Schriftdateien von
 * Inter vorab: 0,89 MB, 39 % des ganzen Caches — davon 0,65 MB, die kein
 * Gerät je benutzt (Audit 11/2026, TEC-16). Mobilfunk im Hangar zahlt das
 * bei jeder neuen Version.
 *
 *  - `.woff` (Altformat): Jede @font-face von @fontsource nennt woff2
 *    ZUERST; jeder Browser, auf dem die App läuft, nimmt es und fragt die
 *    woff-Datei nie an. `swQuelle.test.ts` prüft die Reihenfolge an den
 *    eingebundenen CSS-Dateien.
 *  - woff2 anderer Teilmengen als latin/latin-ext (kyrillisch, griechisch,
 *    vietnamesisch): Der Browser lädt sie nur, wenn ein Zeichen aus ihrem
 *    `unicode-range` auf der Seite steht. Online ändert sich nichts; offline
 *    fällt so ein Name vor dem ersten Abruf auf die Systemschrift zurück.
 *    Die Einbindung in index.css bleibt deshalb vollständig.
 */
export function schriftNurBeiBedarf(datei: string): boolean {
  if (/\.woff$/i.test(datei)) return true
  // Namensschema von @fontsource: <familie>-<teilmenge>-<gewicht>-<stil>-<hash>.woff2
  const teilmenge = /-([a-z]+(?:-ext)?)-\d{3}-(?:normal|italic)\b[^/]*\.woff2$/i.exec(datei)?.[1]?.toLowerCase()
  return teilmenge !== undefined && teilmenge !== 'latin' && teilmenge !== 'latin-ext'
}

/** Was der Build je Datei liefert (`generateBundle`) — nur die Felder, die hier zählen. */
export interface BundleTeil {
  type: string
  isEntry?: boolean
  imports?: readonly string[]
  dynamicImports?: readonly string[]
  facadeModuleId?: string | null
  code?: string
  source?: string | Uint8Array
}

/**
 * Dateien, die NUR über ein nachgeladenes Modul erreichbar sind (DocCheck).
 *
 * Der Service Worker lud bisher JEDE gebaute Datei bei der Installation vorab.
 * Mit DocCheck kommen Parser, OCR und Exportbibliotheken dazu — Megabytes,
 * die sonst jedes Gerät lädt, auch das iPhone eines Instruktors, der die
 * Kachel nie sieht. Diese Dateien fehlen deshalb im Vorab-Cache; der Abruf-
 * Zweig des Workers legt jede beim ersten ABRUF in den Cache. Offline geht
 * danach, was schon einmal geladen war — nicht mehr: Excel-, Word- und
 * PowerPoint-Export laden ihre Bibliothek erst beim ersten Export (Audit
 * 11/2026, TEC-19). Ein solcher Ladefehler heißt deshalb nicht „kaputt",
 * sondern „einmal Netz nötig" (`istLadefehler`, doccheck/ladefehler.ts).
 *
 * Ermittelt über den Importgraphen, nicht über Dateinamen: Was das
 * Startbundle statisch braucht, bleibt drin — auch wenn DocCheck es ebenfalls
 * nutzt. Ein Dateinamens-Muster hätte eine gemeinsam genutzte Datei
 * still mit ausgeschlossen, und der Verwaltungsbereich bräche offline.
 */
export function nurNachgeladen(bundle: Readonly<Record<string, BundleTeil>>): Set<string> {
  const namen = Object.keys(bundle)
  const inhalt = (f: string) => {
    const b = bundle[f]
    return b.type === 'chunk' ? (b.code ?? '') : typeof b.source === 'string' ? b.source : ''
  }
  // Hülle: statische Importe, auf Wunsch auch dynamische — und jede Datei,
  // deren Name im Code steht (Worker per `new URL(...)`, `?url`-Importe,
  // die eigenen Teildateien eines Workers). Das waren genau die Fälle, die
  // die erste Fassung übersah: pdf.js (dynamisch) und sein Worker
  // (per Adresse) lagen weiter im Vorab-Cache jedes Geräts.
  const huelle = (start: string[], dynamisch: boolean, namenFolgen = dynamisch) => {
    const gesehen = new Set<string>()
    const offen = [...start]
    while (offen.length) {
      const f = offen.pop()!
      if (gesehen.has(f) || !bundle[f]) continue
      gesehen.add(f)
      const c = bundle[f]
      if (c.type === 'chunk') offen.push(...(c.imports ?? []), ...(dynamisch ? (c.dynamicImports ?? []) : []))
      if (!namenFolgen) continue
      const code = inhalt(f)
      for (const n of namen) if (!gesehen.has(n) && n !== f && code.includes(n.split('/').pop()!)) offen.push(n)
    }
    return gesehen
  }
  const eintritt = namen.filter((f) => bundle[f].type === 'chunk' && bundle[f].isEntry)
  // Die Startseite nur über STATISCHE Importe: Ihr Code nennt den Namen des
  // nachgeladenen Moduls (im lazy-Import) — dem zu folgen, hieße DocCheck
  // doch wieder auf jedes Gerät zu laden.
  const statisch = huelle(eintritt, false)
  const modul = namen.filter((f) => bundle[f].type === 'chunk' && (bundle[f].facadeModuleId ?? '').includes('/src/modules/'))
  return new Set([...huelle(modul, true)].filter((f) => !statisch.has(f)))
}

/** Die Teile einer Prüfsumme, die hier gebraucht werden (node:crypto `createHash`). */
export interface Pruefsumme {
  update(daten: string | Uint8Array): unknown
  digest(format: 'hex'): string
}

/**
 * Name des Vorab-Caches — über Namen und INHALT aller ausgelieferten
 * Dateien.
 *
 * Der Browser hält einen Service Worker nur für neu, wenn sich sw.js ändert.
 * Hinge der Name nur an der Dateiliste, bliebe eine Version unbemerkt, die
 * allein index.html oder ein Icon ändert (gleiche Namen, anderer Inhalt).
 *
 * Sortiert wird HIER, nicht beim Aufrufer: Die Dateien aus public/ kommen in
 * der Reihenfolge des Dateisystems, und die ist nicht festgelegt — zwei
 * Checkouts derselben Quellen ergäben sonst verschiedene Namen, also einen
 * scheinbar neuen Worker und grundloses Neuladen bei jedem Nutzer. Die
 * Trennzeichen halten Name und Inhalt auseinander („ab"+„c" ist nicht
 * „a"+„bc").
 *
 * @param teile      [Name, Inhalt] je Datei; Namen eindeutig
 * @param pruefsumme frische Prüfsumme, etwa `createHash('sha256')`
 */
export function cacheName(teile: Iterable<readonly [string, string | Uint8Array]>, pruefsumme: Pruefsumme): string {
  const sortiert = [...teile].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  for (const [name, inhalt] of sortiert) {
    pruefsumme.update(name)
    pruefsumme.update('\0')
    pruefsumme.update(inhalt)
    pruefsumme.update('\0')
  }
  return 'ic-' + pruefsumme.digest('hex').slice(0, 12)
}

/**
 * Die Adressen für den Vorab-Cache — was jedes Gerät bei Installation und
 * Update lädt.
 *
 * Sortiert, damit zwei Builds derselben Quellen byte-gleiche sw.js ergeben.
 * Ohne die Sortierung wechselte allein die Reihenfolge der Schrift-Assets
 * bei jedem Lauf; der Browser vergleicht den Worker byteweise, hielt ihn
 * deshalb für neu und lud die Seite neu — ohne dass sich etwas geändert
 * hätte.
 *
 * @param gebaut      alle gebauten Dateien (ohne .map und sw.js)
 * @param nachgeladen Dateien, die nur über ein nachgeladenes Modul erreichbar
 *                    sind (DocCheck, `nurNachgeladen`)
 * @param extras      Dateien aus public/
 */
export function dateiListe(gebaut: readonly string[], nachgeladen: ReadonlySet<string>, extras: readonly string[]): string[] {
  // doccheck/: OCR- und Schriftdateien (docCheckDateien) — nur bei Bedarf,
  // nie vorab auf jedes Gerät.
  const vorab = (f: string) => !nachgeladen.has(f) && !f.startsWith('doccheck/') && !schriftNurBeiBedarf(f)
  return [...new Set(['./', './index.html', ...[...gebaut, ...extras].filter(vorab).sort().map((f) => './' + f)])]
}

/**
 * Der Text des Workers. vite.config.ts schreibt ihn beim Build nach
 * dist/sw.js, und `swQuelle.test.ts` führt ihn mit Attrappen für `self`,
 * `caches` und `fetch` aus — was er vom Netz verlangt, lässt sich dort an
 * jeder Anfrage ablesen. Ebene 3 sah den Fehler aus TEC-01 nicht: Die
 * Installation holte die Dateien über den HTTP-Cache, unter GitHub Pages
 * („max-age=600") landete so nach einem Update die ALTE index.html im NEUEN
 * Vorab-Cache, und der nächste Offline-Start blieb weiß. `vite preview`
 * sendet „no-cache".
 *
 * @param cacheName Name des Vorab-Caches (`cacheName`)
 * @param files     Adressen, die bei der Installation vorab geladen werden
 *                  (`dateiListe`)
 */
export function swQuelle(cacheName: string, files: string[]): string {
  return `/* Beim Build generiert (src/swQuelle.ts) — nicht von Hand editieren. */
const CACHE = ${JSON.stringify(cacheName)}
const ASSETS = ${JSON.stringify(files)}

// Vorab-Cache AM HTTP-Cache VORBEI füllen (cache: 'reload'). Ohne das
// lieferte der Browser beim Update innerhalb der Cache-Lebensdauer (GitHub
// Pages: 10 Minuten) die ALTE index.html aus seinem HTTP-Cache — sie landete
// im neuen Cache neben den neuen Bundles, activate löschte den alten Cache
// mit dem passenden Bundle, und der nächste Offline-Start blieb weiß
// (Audit 11/2026, TEC-01). Der Vorab-Cache muss als PAAR stimmen: diese
// index.html zu genau diesen Bundles.
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' })))))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      // Nur eigene Caches aufräumen: unter *.github.io teilen sich mehrere
      // Apps denselben Origin, fremde Caches bleiben unangetastet.
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('ic-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

// Die UpdateBanner-Komponente schickt SKIP_WAITING, wenn der Nutzer
// "Aktualisieren" antippt — erst dann übernimmt die neue Version.
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting()
})

// Nur vollständige, fehlerfreie Antworten VOM EIGENEN Server cachen — ein
// einzelner 404/503 würde sonst dauerhaft ausgeliefert und die App blockieren.
// Umleitung und Inhaltstyp gehören dazu: Eine Anmeldeseite im Gäste-WLAN
// (genau die Umgebung, für die net.ts eigens einen Inhaltstyp-Test hat)
// beantwortet auch den Aufruf einer .js-Datei mit 200/HTML. Weil Dateien
// cache-first ausgeliefert werden, bliebe diese Seite bis zum nächsten
// Deployment im Cache — die App wäre kaputt.
function cacheable(r, url) {
  if (!r || !r.ok || r.status !== 200 || r.type === 'opaque' || r.redirected) return false
  const typ = (r.headers.get('content-type') || '').toLowerCase()
  if (typ.includes('text/html') && !/\\.html?$/.test(url.pathname)) return false
  return true
}

// Vary beim Nachschlagen ignorieren: Module lädt der Browser im CORS-Modus
// MIT Origin-Kopf, der Vorab-Cache (addAll) holte sie OHNE. Antwortet der
// Server mit „Vary: Origin" (vite preview; manches Hosting), passte kein
// Eintrag — die App startete offline weiß, obwohl alles im Cache lag
// (gefunden mit dem Offline-Test der Ebene 3, 01.11.2026). Gefahrlos, weil
// jede Datei inhaltsgehasht ist: gleiche Adresse, gleicher Inhalt.
const OHNE_VARY = { ignoreVary: true }

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return
  const url = new URL(e.request.url)
  if (url.origin !== location.origin) return
  if (e.request.mode === 'navigate') {
    // Seitenaufrufe: Netz zuerst (frische Version), offline aus dem Cache.
    //
    // Die frische index.html wird bewusst NICHT in den Cache geschrieben:
    // Sie gehört zu einem neuen Deployment, dessen Bundles erst der neue
    // Service Worker vorlädt. Landete sie im Precache und schlug danach
    // der Bundle-Download fehl (Funkloch beim Betreten des Gebäudes),
    // blieb ein vergifteter Cache zurück — eine index.html, deren Bundle
    // dort nicht existiert, und die App startete offline nie wieder.
    // Der Precache aus der Installation ist als PAAR konsistent; er ist
    // der einzige richtige Offline-Rückfall.
    // Mit ZEITGRENZE: Ohne sie hängt der Seitenaufruf im Hangar mit einem
    // Balken Empfang am Netz-Timeout des Systems (zig Sekunden), bevor
    // überhaupt in den Cache geschaut wird — die App wirkt tot, obwohl
    // alles lokal vorliegt. Nach 2,5 s gewinnt der Cache.
    const ausCache = () => caches.match(e.request, OHNE_VARY).then((hit) => hit || caches.match('./', OHNE_VARY))
    e.respondWith(
      Promise.race([
        fetch(e.request).catch(() => ausCache()),
        new Promise((res) => setTimeout(() => res(ausCache().then((hit) => hit || fetch(e.request))), 2500)),
      ]),
    )
    return
  }
  // Assets sind inhaltsgehasht: Cache zuerst, Netz als Fallback
  e.respondWith(
    caches.match(e.request, OHNE_VARY).then(
      (hit) =>
        hit ||
        fetch(e.request).then((r) => {
          if (cacheable(r, url)) {
            const copy = r.clone()
            caches.open(CACHE).then((c) => c.put(e.request, copy))
          }
          return r
        }),
    ),
  )
})
`
}
