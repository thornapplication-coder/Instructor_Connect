import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import { geheimeVariablen } from './src/backend/konfig'
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
function nurNachgeladen(bundle: Record<string, { type: string; isEntry?: boolean; imports?: string[]; dynamicImports?: string[]; facadeModuleId?: string | null; code?: string; source?: string | Uint8Array }>): Set<string> {
  const namen = Object.keys(bundle)
  const inhalt = (f: string) => {
    const b = bundle[f]
    return b.type === 'chunk' ? (b.code ?? '') : typeof b.source === 'string' ? b.source : ''
  }
  // Huelle: statische Importe, auf Wunsch auch dynamische — und jede Datei,
  // deren Name im Code steht (Worker per `new URL(...)`, `?url`-Importe,
  // die eigenen Teildateien eines Workers). Das waren genau die Faelle, die
  // die erste Fassung uebersah: pdf.js (dynamisch) und sein Worker
  // (per Adresse) lagen weiter im Vorab-Cache jedes Geraets.
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
  // nachgeladenen Moduls (im lazy-Import) — dem zu folgen, hiesse DocCheck
  // doch wieder auf jedes Geraet zu laden.
  const statisch = huelle(eintritt, false)
  const modul = namen.filter((f) => bundle[f].type === 'chunk' && (bundle[f].facadeModuleId ?? '').includes('/src/modules/'))
  return new Set([...huelle(modul, true)].filter((f) => !statisch.has(f)))
}

/**
 * Feste Dateien für DocCheck, die pdf.js und tesseract.js zur LAUFZEIT per
 * Adresse laden: Standardschriften, OCR-Worker, OCR-Kern, englische
 * Sprachdaten. Sie stehen unter festen Namen in `doccheck/` (tesseract.js
 * setzt die Dateinamen selbst zusammen, Hash-Namen fände es nicht).
 *
 * Ohne diese Ablage holen beide Bibliotheken die Dateien von einem CDN —
 * Spez. 4.1 schließt das aus. Nicht in public/: Das läge im Repo und im
 * Vorab-Cache jedes Geräts.
 */
const DOCCHECK_DATEIEN: [string, string][] = [
  ['doccheck/ocr/worker.min.js', 'node_modules/tesseract.js/dist/worker.min.js'],
  ...['', 'simd-', 'relaxedsimd-'].map((v): [string, string] => [`doccheck/ocr/tesseract-core-${v}lstm.wasm.js`, `node_modules/tesseract.js-core/tesseract-core-${v}lstm.wasm.js`]),
  ['doccheck/ocr/eng.traineddata.gz', 'node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz'],
  ...readdirSync('node_modules/pdfjs-dist/standard_fonts').map((f): [string, string] => [`doccheck/pdf-fonts/${f}`, `node_modules/pdfjs-dist/standard_fonts/${f}`]),
]

function docCheckDateien(): Plugin {
  const quelle = new Map(DOCCHECK_DATEIEN)
  return {
    name: 'doccheck-dateien',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pfad = decodeURIComponent((req.url ?? '').split('?')[0]).replace(/^\/+/, '')
        const datei = quelle.get(pfad.slice(pfad.indexOf('doccheck/')))
        if (!pfad.includes('doccheck/') || !datei) return next()
        res.setHeader('Content-Type', datei.endsWith('.js') ? 'text/javascript' : 'application/octet-stream')
        res.end(readFileSync(datei))
      })
    },
    generateBundle() {
      for (const [ziel, datei] of DOCCHECK_DATEIEN) this.emitFile({ type: 'asset', fileName: ziel, source: readFileSync(datei) })
    },
  }
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
      // doccheck/: OCR- und Schriftdateien (siehe docCheckDateien) — nur bei
      // Bedarf, nie vorab auf jedes Gerät.
      const files = [...new Set(['./', './index.html', ...[...built.filter((f) => !nachgeladen.has(f) && !f.startsWith('doccheck/')), ...extras].sort().map((f) => './' + f)])]

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
    // Mit ZEITGRENZE: Ohne sie haengt der Seitenaufruf im Hangar mit einem
    // Balken Empfang am Netz-Timeout des Systems (zig Sekunden), bevor
    // ueberhaupt in den Cache geschaut wird — die App wirkt tot, obwohl
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
      this.emitFile({ type: 'asset', fileName: 'sw.js', source })
    },
  }
}

// Relativer Basispfad: dank Hash-Routing funktioniert die App unter jedem
// Unterpfad (GitHub Pages, Repo-Umbenennungen) ohne Anpassung.
// AC_BASE kann das bei Bedarf weiterhin überschreiben.
export default defineConfig(({ mode }) => {
  // Alle VITE_*-Werte landen fest im öffentlichen Bundle. Steht dort ein
  // Geheimnis (sb_secret_…, service_role, sk-ant-…), bricht der Build ab —
  // bevor es auf GitHub Pages liegt.
  const geheim = geheimeVariablen(loadEnv(mode, process.cwd(), 'VITE_'))
  if (geheim.length) throw new Error(`Build abgebrochen: ${geheim.join(', ')} enthält einen geheimen Schlüssel. In die App gehört nur der öffentliche (publishable/anon) Schlüssel.`)
  return {
  base: process.env.AC_BASE || './',
  // Der DocCheck-Worker ist ein ES-Modul (er lädt pdf.js dynamisch nach).
  worker: { format: 'es' },
  plugins: [react(), docCheckDateien(), serviceWorker()],
  }
})
