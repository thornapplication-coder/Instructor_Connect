import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import { backendKonfig, geheimeVariablen, geheimnisseImText, type BackendKonfig } from './src/backend/konfig'
import { cspFuer } from './src/csp'
import { cacheName, dateiListe, nurNachgeladen, swQuelle } from './src/swQuelle'
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
 * Feste Dateien für DocCheck, die pdf.js und tesseract.js zur LAUFZEIT per
 * Adresse laden: Standardschriften, Bilddecoder und Farbprofil von pdf.js
 * (`pdfAblage` in pdfjsLaden.ts), OCR-Worker, OCR-Kern, englische
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
  // quickjs-eval gehört zur Skript-Sandbox von pdf.js — DocCheck führt
  // keine PDF-Skripte aus (isEvalSupported: false).
  ...readdirSync('node_modules/pdfjs-dist/wasm')
    .filter((f) => !f.startsWith('quickjs'))
    .map((f): [string, string] => [`doccheck/pdf-wasm/${f}`, `node_modules/pdfjs-dist/wasm/${f}`]),
  ...readdirSync('node_modules/pdfjs-dist/iccs').map((f): [string, string] => [`doccheck/pdf-iccs/${f}`, `node_modules/pdfjs-dist/iccs/${f}`]),
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

/**
 * Erzeugt beim Build einen Service Worker (dist/sw.js), der die gebauten
 * Dateien vorab cached. Damit startet die App offline (z. B. im
 * Simulator-Gebäude ohne Empfang) und meldet neue Versionen an die
 * UpdateBanner-Komponente.
 *
 * Hier wird nur eingelesen. Was vorab auf jedes Gerät kommt
 * (`nurNachgeladen`, `dateiListe`), wie der Cache heißt (`cacheName`) und
 * der Text des Workers (`swQuelle`) stehen in src/swQuelle.ts — dort greifen
 * Testwache und Typprüfung (Audit 11/2026, TEC-01, TEC-16; Gegenprüfung
 * L-CI: diese Logik lag hier ohne jeden Test).
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
      const files = dateiListe(built, nurNachgeladen(bundle), extras)
      // Die Quell-index.html und public/ mit eigener Vorsilbe: Namen aus dem
      // Bundle dürfen mit ihnen nicht zusammenfallen.
      const name = cacheName(
        [
          ['quelle/index.html', readFileSync('index.html')],
          ...extras.map((f): [string, Uint8Array] => ['public/' + f, readFileSync(join('public', f))]),
          ...built.map((f): [string, string | Uint8Array] => {
            const b = bundle[f]
            return [f, b.type === 'chunk' ? b.code : b.source]
          }),
        ],
        createHash('sha256'),
      )
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: swQuelle(name, files) })
    },
  }
}

/**
 * Content-Security-Policy als `<meta>` in der gebauten index.html — NUR im
 * Build: `vite dev` mit dem React-Plugin braucht ein Inline-Skript, das die
 * Richtlinie abwiese. Inhalt und Begründung je Quelle in src/csp.ts
 * (Audit 11/2026, SEC-07). Ganz vorn im Kopf, weil eine Meta-CSP nur für
 * das gilt, was NACH ihr geladen wird.
 */
function inhaltsRichtlinie(konfig: BackendKonfig | null): Plugin {
  return {
    name: 'ic-csp',
    apply: 'build',
    transformIndexHtml: () => [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: cspFuer(konfig) }, injectTo: 'head-prepend' }],
  }
}

/**
 * Kein Geheimnis im fertigen Bundle (Audit 11/2026, CIG-04). Die Prüfung
 * der VITE_*-Werte unten sieht einen Schlüssel nicht, der fest im
 * Quelltext steht — diese hier liest, was tatsächlich ausgeliefert würde:
 * jeden Chunk und jede Text-Datei. Bewertet wird wie bei der Anmeldung
 * (`geheimnisseImText` → `schluesselArt`), ein anon-JWT bleibt also erlaubt.
 * `enforce: 'post'`, damit auch die index.html schon im Bundle liegt.
 */
function keinGeheimnisImBundle(): Plugin {
  const text = /\.(m?js|css|html|json|webmanifest|svg|txt)$/
  return {
    name: 'ic-kein-geheimnis',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const funde: string[] = []
      for (const [name, b] of Object.entries(bundle)) {
        const inhalt = b.type === 'chunk' ? b.code : text.test(name) ? (typeof b.source === 'string' ? b.source : Buffer.from(b.source).toString('utf8')) : ''
        for (const f of geheimnisseImText(inhalt)) funde.push(`${name}: ${f}`)
      }
      if (funde.length) this.error(`Build abgebrochen: geheimer Schlüssel im Bundle (${funde.join('; ')}). In die App gehört nur der öffentliche (publishable/anon) Schlüssel.`)
    },
  }
}

// Relativer Basispfad: dank Hash-Routing funktioniert die App unter jedem
// Unterpfad (GitHub Pages, Repo-Umbenennungen) ohne Anpassung.
// AC_BASE kann das bei Bedarf weiterhin überschreiben.
export default defineConfig(({ mode }) => {
  // Alle VITE_*-Werte landen fest im öffentlichen Bundle. Steht dort ein
  // Geheimnis (sb_secret_…, service_role, sk-ant-…), bricht der Build ab —
  // bevor es auf GitHub Pages liegt. Was fest im Quelltext steht, findet
  // `keinGeheimnisImBundle` (oben) im fertigen Bundle.
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const geheim = geheimeVariablen(env)
  if (geheim.length) throw new Error(`Build abgebrochen: ${geheim.join(', ')} enthält einen geheimen Schlüssel. In die App gehört nur der öffentliche (publishable/anon) Schlüssel.`)
  return {
  base: process.env.AC_BASE || './',
  // Der DocCheck-Worker ist ein ES-Modul (er lädt pdf.js dynamisch nach).
  worker: { format: 'es' },
  // Warnschwelle für einzelne Chunks (Audit 11/2026, CIG-07). Das
  // Startbundle liegt bei rund 700 kB (gzip gut 200 kB) und riss die
  // Vorgabe von 500 kB bei JEDEM Build — Dauerrauschen in CI und e2e, in
  // dem eine echte Warnung unterginge. Begründet statt aufgeteilt:
  //  - Die PWA lädt das Startbundle ohnehin bei der Installation vorab;
  //    jeder weitere Start kommt aus dem Cache.
  //  - Im Audit gemessen (lokaler Server, iPhone-13-Profil, ohne Service
  //    Worker): Inhalt nach 0,16 s, bei 4- bzw. 6-facher CPU-Drosselung
  //    nach 0,49 bzw. 0,74 s.
  //  - Was wirklich schwer ist, lädt schon nach: DocCheck mit Parsern und
  //    Exportbibliotheken (`src/startbundle.test.ts` hält es draußen).
  // Bewusst KEIN lazy() für den Verwaltungsbereich: `nurNachgeladen`
  // (src/swQuelle.ts) nimmt alles aus dem Vorab-Cache, was ein Chunk unter src/modules/
  // erreicht und die Startseite nicht statisch braucht. Teilten sich ein
  // nachgeladener Admin-Chunk und DocCheck einen Chunk, fehlte er dort —
  // die Verwaltung bräche offline. Die Schwelle lässt rund 100 kB Luft:
  // Wächst das Startbundle darüber, meldet der Build es wieder.
  build: { chunkSizeWarningLimit: 800 },
  plugins: [react(), docCheckDateien(), serviceWorker(), inhaltsRichtlinie(backendKonfig(env).konfig), keinGeheimnisImBundle()],
  }
})
