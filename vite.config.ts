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
function serviceWorker(): Plugin {
  return {
    name: 'ic-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const built = Object.keys(bundle).filter((f) => !f.endsWith('.map') && f !== 'sw.js')
      // public/ wird vollständig eingelesen, damit neue Dateien (Icons u. Ä.)
      // nicht vergessen werden.
      const extras = listPublicFiles()
      const files = [...new Set(['./', './index.html', ...[...built, ...extras].map((f) => './' + f)])]

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
function cacheable(r) {
  return r && r.ok && r.status === 200 && r.type !== 'opaque'
}

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return
  const url = new URL(e.request.url)
  if (url.origin !== location.origin) return
  if (e.request.mode === 'navigate') {
    // Seitenaufrufe: Netz zuerst (frische Version), offline aus dem Cache
    e.respondWith(
      fetch(e.request)
        .then((r) => {
          if (cacheable(r)) {
            const copy = r.clone()
            caches.open(CACHE).then((c) => c.put(e.request, copy))
          }
          return r
        })
        .catch(() => caches.match(e.request).then((hit) => hit || caches.match('./'))),
    )
    return
  }
  // Assets sind inhaltsgehasht: Cache zuerst, Netz als Fallback
  e.respondWith(
    caches.match(e.request).then(
      (hit) =>
        hit ||
        fetch(e.request).then((r) => {
          if (cacheable(r)) {
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
