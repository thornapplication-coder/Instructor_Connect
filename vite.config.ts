import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/** Alle Dateien aus public/ (rekursiv) — sie landen unverändert in dist/. */
function listPublicFiles(dir = 'public', prefix = ''): string[] {
  let out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out = out.concat(listPublicFiles(full, prefix + entry + '/'))
    else out.push(prefix + entry)
  }
  return out
}

/**
 * Erzeugt beim Build einen Service Worker (dist/sw.js), der alle gebauten
 * Dateien vorab cached. Damit startet die App offline (z. B. im
 * Simulator-Gebäude ohne Empfang) und meldet neue Versionen an die
 * UpdateBanner-Komponente. Der Cache-Name hängt an der Dateiliste — jede
 * neue Version (gehashte Asset-Namen) ergibt einen neuen Worker.
 */
/**
 * Dateien, die NUR ueber ein nachgeladenes Modul erreichbar sind (DocCheck).
 *
 * Der Service Worker lud bisher JEDE gebaute Datei bei der Installation vorab.
 * Mit DocCheck kommen Parser, OCR und Exportbibliotheken dazu — Megabytes,
 * die sonst jedes Geraet laedt, auch das iPhone eines Instruktors, der die
 * Kachel nie sieht. Diese Dateien fehlen deshalb im Vorab-Cache; der Abruf-
 * Zweig unten legt sie beim ersten Oeffnen trotzdem in den Cache, offline
 * geht DocCheck danach also auch.
 *
 * Ermittelt ueber den Importgraphen, nicht ueber Dateinamen: Was das
 * Startbundle statisch braucht, bleibt drin — auch wenn DocCheck es ebenfalls
 * nutzt. Ein Dateinamens-Muster haette eine gemeinsam genutzte Datei
 * still mit ausgeschlossen.
 */
function nurNachgeladen(bundle: Record<string, { type: string; isEntry?: boolean; imports?: string[]; dynamicImports?: string[]; facadeModuleId?: string | null }>): Set<string> {
  const huelle = (start: string[]) => {
    const gesehen = new Set<string>()
    const offen = [...start]
    while (offen.length) {
      const f = offen.pop()!
      if (gesehen.has(f)) continue
      gesehen.add(f)
      const c = bundle[f]
      if (c?.type === 'chunk') offen.push(...(c.imports ?? []))
    }
    return gesehen
  }
  const eintritt = Object.keys(bundle).filter((f) => bundle[f].type === 'chunk' && bundle[f].isEntry)
  const statisch = huelle(eintritt)
  const modul = Object.keys(bundle).filter((f) => bundle[f].type === 'chunk' && (bundle[f].facadeModuleId ?? '').includes('/src/modules/'))
  return new Set([...huelle(modul)].filter((f) => !statisch.has(f)))
}

function serviceWorker(): Plugin {
  return {
    name: 'ic-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const built = Object.keys(bundle).filter((f) => !f.endsWith('.map') && f !== 'sw.js')
      const nachgeladen = nurNachgeladen(bundle)
      // public/ wird vollständig eingelesen, damit neue Dateien (Icons u. Ä.)
      // nicht vergessen werden.
      const extras = listPublicFiles()
      // Sortiert, damit zwei Builds derselben Quellen byte-gleiche sw.js
      // ergeben. Ohne die Sortierung wechselte allein die Reihenfolge der
      // Schrift-Assets bei jedem Lauf; der Browser vergleicht den Worker
      // byteweise, hielt ihn deshalb für neu und lud die Seite neu — ohne
      // dass sich etwas geändert hätte, denn der Cache-Name (unten, über
      // die sortierte Liste gebildet) blieb gleich.
      const files = [...new Set(['./', './index.html', ...[...built.filter((f) => !nachgeladen.has(f)), ...extras].sort().map((f) => './' + f)])]

      // Cache-Name über den INHALT aller ausgelieferten Dateien: eine
      // Version, die nur index.html oder ein Icon ändert, ergibt damit
      // trotzdem einen neuen Worker — sonst bliebe das Update unbemerkt.
      const hash = createHash('sha256')
      hash.update(readFileSync('index.html'))
      for (const f of extras) hash.update(readFileSync(join('public', f)))
      for (const name of built.sort()) {
        const chunk = bundle[name]
        hash.update(name)
        hash.update(chunk.type === 'chunk' ? chunk.code : Buffer.from(chunk.source as string | Uint8Array))
      }
      const cacheName = 'ic-' + hash.digest('hex').slice(0, 12)

      const source = `/* Beim Build generiert (vite.config.ts) — nicht von Hand editieren. */
const CACHE = '${cacheName}'
const ASSETS = ${JSON.stringify(files)}

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)))
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

// Nur vollständige, fehlerfreie Antworten cachen — ein einzelner 404/503
// würde sonst dauerhaft ausgeliefert und die App blockieren.
// Nur vollstaendige, fehlerfreie Antworten VOM EIGENEN Server cachen.
// Umleitung und Inhaltstyp gehoeren dazu: Eine Anmeldeseite im Gaeste-WLAN
// (genau die Umgebung, fuer die net.ts eigens einen Inhaltstyp-Test hat)
// beantwortet auch den Aufruf einer .js-Datei mit 200/HTML. Weil Dateien
// cache-first ausgeliefert werden, bliebe diese Seite bis zum naechsten
// Deployment im Cache — die App waere kaputt.
function cacheable(r, url) {
  if (!r || !r.ok || r.status !== 200 || r.type === 'opaque' || r.redirected) return false
  const typ = (r.headers.get('content-type') || '').toLowerCase()
  if (typ.includes('text/html') && !/\.html?$/.test(url.pathname)) return false
  return true
}

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
    // Mit ZEITGRENZE: Ohne sie haengt der Seitenaufruf im Hangar mit einem
    // Balken Empfang am Netz-Timeout des Systems (zig Sekunden), bevor
    // ueberhaupt in den Cache geschaut wird — die App wirkt tot, obwohl
    // alles lokal vorliegt. Nach 2,5 s gewinnt der Cache.
    const ausCache = () => caches.match(e.request).then((hit) => hit || caches.match('./'))
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
    caches.match(e.request).then(
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
      this.emitFile({ type: 'asset', fileName: 'sw.js', source })
    },
  }
}

// Relativer Basispfad: dank Hash-Routing funktioniert die App unter jedem
// Unterpfad (GitHub Pages, Repo-Umbenennungen) ohne Anpassung.
// AC_BASE kann das bei Bedarf weiterhin überschreiben.
export default defineConfig({
  base: process.env.AC_BASE || './',
  plugins: [react(), serviceWorker()],
})
