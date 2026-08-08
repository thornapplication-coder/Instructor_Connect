import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

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
      const extras = ['manifest.webmanifest', 'favicon.svg', 'icon-192.png', 'icon-512.png', 'sample.pdf']
      const files = ['./', ...[...built, ...extras].map((f) => './' + f)]
      let h = 0
      for (const f of files) for (let i = 0; i < f.length; i++) h = (h * 31 + f.charCodeAt(i)) | 0
      const source = `/* Beim Build generiert (vite.config.ts) — nicht von Hand editieren. */
const CACHE = 'ic-${(h >>> 0).toString(36)}'
const ASSETS = ${JSON.stringify(files)}

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

// Die UpdateBanner-Komponente schickt SKIP_WAITING, wenn der Nutzer
// "Aktualisieren" antippt — erst dann übernimmt die neue Version.
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting()
})

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return
  const url = new URL(e.request.url)
  if (url.origin !== location.origin) return
  if (e.request.mode === 'navigate') {
    // Seitenaufrufe: Netz zuerst (frische Version), offline aus dem Cache
    e.respondWith(
      fetch(e.request)
        .then((r) => {
          const copy = r.clone()
          caches.open(CACHE).then((c) => c.put(e.request, copy))
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
          const copy = r.clone()
          caches.open(CACHE).then((c) => c.put(e.request, copy))
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
