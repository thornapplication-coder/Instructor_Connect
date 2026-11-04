import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'
import { cacheName, dateiListe, nurNachgeladen, schriftNurBeiBedarf, swAngaben, swQuelle, type BundleTeil } from './swQuelle'

/**
 * Ebene 1: der erzeugte Service Worker, ausgeführt in einer eigenen
 * Umgebung mit Attrappen für `self`, `caches` und `fetch`.
 *
 * Ebene 3 konnte den teuersten Fehler hier nicht sehen (Audit 11/2026,
 * TEC-01): `vite preview` sendet „Cache-Control: no-cache", GitHub Pages
 * „max-age=600". Nur unter Letzterem holte die Installation die alte
 * index.html aus dem HTTP-Cache. Was der Worker vom Netz verlangt, lässt sich
 * aber hier ablesen — an jeder Anfrage, die er stellt.
 */

const BASIS = 'https://app.test/ic/'

interface Antwort {
  ok: boolean
  status: number
  type: string
  redirected: boolean
  headers: { get: (k: string) => string | null }
  clone: () => Antwort
  text: string
}

const antwort = (text: string, typ = 'text/javascript', status = 200, extra: Partial<Antwort> = {}): Antwort => {
  const a: Antwort = {
    ok: status >= 200 && status < 300,
    status,
    type: 'basic',
    redirected: false,
    headers: { get: (k) => (k.toLowerCase() === 'content-type' ? typ : null) },
    clone: () => a,
    text,
    ...extra,
  }
  return a
}

/** Ein Cache, der Anfragen nach Adresse ablegt (wie der Browser bei ignoreVary). */
class AttrappenCache {
  eintraege = new Map<string, Antwort>()
  hinzugefuegt: Request[] = []
  async addAll(anfragen: (Request | string)[]) {
    for (const a of anfragen) {
      // Der echte Cache nimmt auch Zeichenketten — die Attrappe muss das
      // ebenfalls, sonst prüfte die Gegenprobe einen Absturz statt der Regel.
      const r = typeof a === 'string' ? new Request(new URL(a, BASIS)) : a
      this.hinzugefuegt.push(r)
      this.eintraege.set(r.url, await umgebung.fetch(r))
    }
  }
  async put(r: Request, a: Antwort) {
    this.eintraege.set(r.url, a)
  }
  async match(r: Request | string) {
    const url = typeof r === 'string' ? new URL(r, BASIS).href : r.url
    return this.eintraege.get(url)
  }
}

let umgebung: ReturnType<typeof erzeugen>

function erzeugen(cacheName = 'ic-neu', dateien = ['./', './index.html', './assets/index-abc.js']) {
  const hoerer = new Map<string, (e: unknown) => void>()
  const speicher = new Map<string, AttrappenCache>()
  const env = {
    hoerer,
    speicher,
    fetch: vi.fn(async (r: Request) => antwort(`netz:${r.url}`, r.url.endsWith('.js') ? 'text/javascript' : 'text/html')),
    self: {
      addEventListener: (typ: string, h: (e: unknown) => void) => hoerer.set(typ, h),
      skipWaiting: vi.fn(),
      clients: { claim: vi.fn(async () => undefined) },
    },
    caches: {
      open: async (name: string) => {
        if (!speicher.has(name)) speicher.set(name, new AttrappenCache())
        return speicher.get(name)!
      },
      keys: async () => [...speicher.keys()],
      delete: async (name: string) => speicher.delete(name),
      match: async (r: Request | string) => {
        for (const c of speicher.values()) {
          const hit = await c.match(r)
          if (hit) return hit
        }
        return undefined
      },
    },
  }
  runInNewContext(swQuelle(cacheName, dateien), {
    self: env.self,
    caches: env.caches,
    fetch: (r: Request) => env.fetch(r),
    // Relative Adressen löst der Browser gegen den Ort des Workers auf.
    Request: class extends Request {
      constructor(u: string | URL, init?: RequestInit) {
        super(new URL(u, BASIS), init)
      }
    },
    URL,
    location: { origin: new URL(BASIS).origin },
    setTimeout,
    Promise,
  })
  umgebung = env
  return env
}

/** Abwarten, bis angestoßene Ablagen (`caches.open(…).then(put)`) durch sind. */
const ruhe = () => new Promise((r) => setImmediate(r))

/** Ein Ereignis auslösen und warten, bis alles erledigt ist, was es anstößt. */
async function ausloesen(env: ReturnType<typeof erzeugen>, typ: string) {
  const offen: Promise<unknown>[] = []
  env.hoerer.get(typ)!({ waitUntil: (p: Promise<unknown>) => offen.push(p) })
  await Promise.all(offen)
}

/**
 * Einen Abruf auslösen. Bewusst NICHT async: Eine async-Funktion, die ein
 * Promise zurückgibt, wartet selbst darauf — beim hängenden Netz (Zeitgrenze
 * unter vorgespulter Uhr) stünde der Test dann still, bevor er spulen kann.
 */
function abrufen(env: ReturnType<typeof erzeugen>, request: Record<string, unknown>): Promise<Antwort> | undefined {
  let antwortPromise: Promise<Antwort> | undefined
  env.hoerer.get('fetch')!({ request, respondWith: (p: Promise<Antwort>) => (antwortPromise = p) })
  return antwortPromise
}

describe('Installation', () => {
  it('holt jede Datei am HTTP-Cache vorbei (Audit 11/2026, TEC-01)', async () => {
    const env = erzeugen()
    await ausloesen(env, 'install')
    const c = env.speicher.get('ic-neu')!
    expect(c.hinzugefuegt.map((r) => r.url)).toEqual([BASIS, `${BASIS}index.html`, `${BASIS}assets/index-abc.js`])
    // Der Kern des Befunds: Ohne 'reload' lieferte der Browser innerhalb der
    // Cache-Lebensdauer die alte index.html — zu Bundles, die es nicht mehr gab.
    for (const r of c.hinzugefuegt) expect(r.cache).toBe('reload')
  })

  it('übernimmt Cache-Name und Dateiliste unverändert in den Quelltext', () => {
    const q = swQuelle("ic-a'b", ['./x.js'])
    // Als JSON eingesetzt: Ein Anführungszeichen im Namen bricht den Worker nicht.
    expect(q).toContain(`const CACHE = "ic-a'b"`)
    expect(q).toContain('const ASSETS = ["./x.js"]')
  })
})

describe('Aktivierung', () => {
  it('räumt nur eigene alte Caches weg und übernimmt die offenen Seiten', async () => {
    const env = erzeugen()
    await env.caches.open('ic-alt')
    await env.caches.open('fremde-app')
    await env.caches.open('ic-neu')
    await ausloesen(env, 'activate')
    // Unter *.github.io teilen sich mehrere Apps denselben Origin.
    expect([...env.speicher.keys()].sort()).toEqual(['fremde-app', 'ic-neu'])
    expect(env.self.clients.claim).toHaveBeenCalledOnce()
  })
})

describe('Nachrichten', () => {
  it('übernimmt erst auf SKIP_WAITING, sonst nie', async () => {
    const env = erzeugen()
    env.hoerer.get('message')!({ data: { type: 'ANDERES' } })
    env.hoerer.get('message')!({ data: null })
    expect(env.self.skipWaiting).not.toHaveBeenCalled()
    env.hoerer.get('message')!({ data: { type: 'SKIP_WAITING' } })
    expect(env.self.skipWaiting).toHaveBeenCalledOnce()
  })

  /**
   * Selbsttest (src/selbsttestGeraet.ts): Der Worker nennt seinen Stand und
   * zählt, was in seinem Vorab-Cache fehlt — die Seite kennt die Liste nicht.
   */
  it('SELBSTTEST: nennt Stand und Zahl der Vorab-Dateien; zählt, was im Cache fehlt', async () => {
    const env = erzeugen('ic-stand', ['./', './index.html', './assets/index-abc.js'])
    await ausloesen(env, 'install')
    const fragen = () =>
      new Promise((ok) => {
        env.hoerer.get('message')!({ data: { type: 'SELBSTTEST' }, ports: [{ postMessage: ok }] })
      })
    expect(await fragen()).toEqual({ cache: 'ic-stand', gesamt: 3, fehlend: 0 })
    // Eine Datei aus dem Cache verloren (Speicherdruck, halbes Update)
    const cache = env.speicher.get('ic-stand')!
    cache.eintraege.delete(new URL('./assets/index-abc.js', BASIS).href)
    expect(await fragen()).toEqual({ cache: 'ic-stand', gesamt: 3, fehlend: 1 })
    // Ohne Antwortkanal: nichts tun, nicht abstürzen
    expect(() => env.hoerer.get('message')!({ data: { type: 'SELBSTTEST' } })).not.toThrow()
    expect(env.self.skipWaiting).not.toHaveBeenCalled()
  })

  it('SELBSTTEST: Cache nicht zu öffnen heißt alles fehlt', async () => {
    const env = erzeugen('ic-stand', ['./', './index.html'])
    env.caches.open = async () => {
      throw new Error('kaputt')
    }
    const antwort = await new Promise((ok) => env.hoerer.get('message')!({ data: { type: 'SELBSTTEST' }, ports: [{ postMessage: ok }] }))
    expect(antwort).toEqual({ cache: 'ic-stand', gesamt: 2, fehlend: 2 })
  })
})

describe('Abruf', () => {
  const anfrage = (pfad: string, mode = 'cors', method = 'GET') => ({ url: new URL(pfad, BASIS).href, mode, method })

  it('liefert Dateien aus dem Cache, ohne das Netz zu fragen', async () => {
    const env = erzeugen()
    await ausloesen(env, 'install')
    env.fetch.mockClear()
    const a = await abrufen(env, anfrage('assets/index-abc.js'))
    expect((await a)!.text).toBe(`netz:${BASIS}assets/index-abc.js`)
    expect(env.fetch).not.toHaveBeenCalled()
  })

  it('legt nachgeladene Dateien ab — aber keine Anmeldeseite eines Gäste-WLANs', async () => {
    const env = erzeugen()
    env.fetch.mockImplementation(async (r: Request) => antwort('<html>Portal</html>', 'text/html; charset=utf-8', 200, { text: r.url }))
    await abrufen(env, anfrage('assets/doccheck-1.js'))
    await ruhe()
    // Eine .js-Adresse, die HTML liefert, ist kein Modul — sie bliebe sonst
    // bis zum nächsten Deployment im Cache, und DocCheck wäre kaputt.
    expect(await env.caches.match(`${BASIS}assets/doccheck-1.js`)).toBeUndefined()
    // Beim Umzug aus der Konfiguration gefunden: Dort stand `\.` in einer
    // Vorlagenzeichenkette, im Worker kam `/.html?$/` an — jede Adresse, die
    // nur auf „html" ENDET, galt als HTML-Datei.
    await abrufen(env, anfrage('assets/xhtml'))
    await ruhe()
    expect(await env.caches.match(`${BASIS}assets/xhtml`)).toBeUndefined()
    await abrufen(env, anfrage('hilfe.html'))
    await ruhe()
    expect(await env.caches.match(`${BASIS}hilfe.html`)).toBeDefined()
  })

  it('legt Fehler, Umleitungen und fremde Antworten nicht ab', async () => {
    const env = erzeugen()
    const faelle: [string, Antwort][] = [
      ['a.js', antwort('x', 'text/javascript', 404)],
      ['b.js', antwort('x', 'text/javascript', 200, { redirected: true })],
      ['c.js', antwort('x', 'text/javascript', 200, { type: 'opaque' })],
      ['d.js', antwort('x', 'text/javascript', 204)],
    ]
    for (const [pfad, a] of faelle) {
      env.fetch.mockResolvedValueOnce(a)
      await abrufen(env, anfrage(pfad))
      await ruhe()
      expect(await env.caches.match(`${BASIS}${pfad}`)).toBeUndefined()
    }
    env.fetch.mockResolvedValueOnce(antwort('x', ''))
    await abrufen(env, anfrage('ohne-typ.js'))
    await ruhe()
    expect(await env.caches.match(`${BASIS}ohne-typ.js`)).toBeDefined()
  })

  it('lässt fremde Adressen und andere Methoden in Ruhe', async () => {
    const env = erzeugen()
    expect(await abrufen(env, { url: 'https://cdn.example/x.js', mode: 'cors', method: 'GET' })).toBeUndefined()
    expect(await abrufen(env, anfrage('a.js', 'cors', 'POST'))).toBeUndefined()
    // Darauf baut die Erreichbarkeitsprobe in net.ts: Ihr HEAD auf das
    // Manifest muss ins Netz gehen — ein Treffer aus dem Cache meldete
    // „erreichbar" ohne Netz (Audit 11/2026, TEC-18).
    expect(await abrufen(env, anfrage('manifest.webmanifest', 'cors', 'HEAD'))).toBeUndefined()
  })

  it('Seitenaufruf: Netz zuerst; ohne Netz die index.html der Installation', async () => {
    const env = erzeugen()
    await ausloesen(env, 'install')
    env.fetch.mockClear()
    const online = await abrufen(env, anfrage('./', 'navigate'))
    expect((await online)!.text).toBe(`netz:${BASIS}`)
    // Die frische Seite gehört zu einem Deployment, dessen Bundles noch nicht
    // da sind — sie darf den Vorab-Cache nicht überschreiben.
    expect(env.fetch).toHaveBeenCalledOnce()
    env.fetch.mockRejectedValue(new TypeError('offline'))
    const offline = await abrufen(env, anfrage('?x=1#/grading', 'navigate'))
    expect((await offline)!.text).toBe(`netz:${BASIS}`)
  })

  it('Seitenaufruf mit einem Balken Empfang: nach 2,5 s gewinnt der Cache', async () => {
    vi.useFakeTimers()
    try {
      const env = erzeugen()
      await ausloesen(env, 'install')
      env.fetch.mockImplementation(() => new Promise(() => undefined))
      const p = abrufen(env, anfrage('./', 'navigate'))
      await vi.advanceTimersByTimeAsync(2500)
      expect((await p)!.text).toBe(`netz:${BASIS}`)
    } finally {
      vi.useRealTimers()
    }
  })

  it('Seitenaufruf ohne Cache-Eintrag wartet nach der Zeitgrenze weiter aufs Netz', async () => {
    vi.useFakeTimers()
    try {
      const env = erzeugen()
      let erster = true
      env.fetch.mockImplementation((r: Request) => {
        if (erster) {
          erster = false
          return new Promise(() => undefined)
        }
        return Promise.resolve(antwort(`spät:${r.url}`, 'text/html'))
      })
      const p = abrufen(env, anfrage('./', 'navigate'))
      await vi.advanceTimersByTimeAsync(2500)
      expect((await p)!.text).toBe(`spät:${BASIS}`)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('Vorab-Cache: was jedes Gerät lädt (Audit 11/2026, TEC-16)', () => {
  // Vorher kamen alle 56 Schriftdateien in den Vorab-Cache — 0,65 MB davon
  // benutzt kein Gerät: das Altformat .woff und die nicht-lateinischen
  // Teilmengen. Jede Installation und jedes Update lud sie trotzdem.
  const gebaut = [
    'index.html',
    'assets/index-abc.js',
    'assets/inter-latin-400-normal-C38fXH4l.woff2',
    'assets/inter-latin-400-normal-CyCys3Eg.woff',
    'assets/inter-latin-ext-700-normal-Ca8adRJv.woff2',
    'assets/inter-latin-ext-700-normal-TidjK2hL.woff',
    'assets/inter-cyrillic-ext-400-normal-BQZuk6qB.woff2',
    'assets/inter-cyrillic-400-normal-obahsSVq.woff2',
    'assets/inter-greek-ext-500-normal-C4iEst2y.woff2',
    'assets/inter-vietnamese-600-normal-Cc8MFFhd.woff2',
    'assets/DocCheckApp-1.js',
    'doccheck/ocr/worker.min.js',
  ]

  it('nimmt kein .woff und nur die lateinischen woff2 auf', () => {
    const liste = dateiListe(gebaut, new Set(['assets/DocCheckApp-1.js']), ['icon.png', 'manifest.webmanifest'])
    expect(liste).toEqual([
      './',
      './index.html',
      './assets/index-abc.js',
      './assets/inter-latin-400-normal-C38fXH4l.woff2',
      './assets/inter-latin-ext-700-normal-Ca8adRJv.woff2',
      './icon.png',
      './manifest.webmanifest',
    ])
    expect(liste.some((f) => f.endsWith('.woff'))).toBe(false)
  })

  it('bleibt sortiert und ohne Doppel — gleiche Quellen, byte-gleiche sw.js', () => {
    const a = dateiListe(gebaut, new Set(), [])
    const b = dateiListe([...gebaut].reverse(), new Set(), [])
    expect(a).toEqual(b)
    expect(new Set(a).size).toBe(a.length)
  })

  it('erkennt Schriften nur am Namensschema — andere Dateien bleiben vorab', () => {
    expect(schriftNurBeiBedarf('assets/Inter-LATIN-400-normal-x.woff2')).toBe(false)
    expect(schriftNurBeiBedarf('assets/inter-greek-700-italic-x.woff2')).toBe(true)
    expect(schriftNurBeiBedarf('assets/ALT.WOFF')).toBe(true)
    // Eine Schrift außerhalb des Schemas (etwa ein eigenes Symbol-Set) wird
    // nicht geraten, sondern bleibt im Vorab-Cache.
    expect(schriftNurBeiBedarf('assets/symbole-abc.woff2')).toBe(false)
    expect(schriftNurBeiBedarf('assets/cyrillic-notes.js')).toBe(false)
  })

  it('die eingebundenen @font-face nennen woff2 vor woff — sonst wäre .woff doch nötig', () => {
    // Die Regel oben stützt sich darauf, dass jeder Browser woff2 nimmt,
    // weil es zuerst steht. Ändert @fontsource das, muss sie mit.
    const css = readFileSync('src/index.css', 'utf8')
    const dateien = [...css.matchAll(/@import '(@fontsource\/[^']+\.css)'/g)].map((m) => m[1])
    expect(dateien.length).toBeGreaterThan(0)
    for (const d of dateien) {
      const quellen = [...readFileSync(`node_modules/${d}`, 'utf8').matchAll(/src:([^;]+);/g)].map((m) => m[1])
      expect(quellen.length).toBeGreaterThan(0)
      for (const q of quellen) {
        const woff2 = q.indexOf(".woff2)")
        const woff = q.indexOf(".woff)")
        expect(woff2).toBeGreaterThan(-1)
        if (woff > -1) expect(woff2).toBeLessThan(woff)
      }
    }
  })
})

/*
 * Gegenprüfung L-CI (Audit 11/2026): Was vorab auf jedes Gerät kommt und wie
 * der Cache heißt, stand in vite.config.ts — außerhalb von src/, ohne
 * Testwache und ohne Typprüfung. Abgesichert war es nur indirekt über den
 * Offline-Test der Ebene 3.
 */
describe('nurNachgeladen: was nur DocCheck braucht, bleibt aus dem Vorab-Cache', () => {
  /*
   * Ein Bundle im Kleinen, wie der Build es liefert: Startseite, ein von
   * Startseite und DocCheck gemeinsam genutzter Chunk, das DocCheck-Modul
   * mit Kern, pdf.js (dynamisch) samt Worker (per Adresse) und dem
   * DocCheck-Worker, der eine eigene Teildatei nachlädt.
   */
  const chunk = (t: Partial<BundleTeil> = {}): BundleTeil => ({ type: 'chunk', imports: [], dynamicImports: [], facadeModuleId: null, code: '', ...t })
  const asset = (source: string | Uint8Array = ''): BundleTeil => ({ type: 'asset', source })
  const bundle = (): Record<string, BundleTeil> => ({
    'assets/index-A.js': chunk({
      isEntry: true,
      imports: ['assets/geteilt-B.js'],
      dynamicImports: ['assets/DocCheckApp-C.js'],
      facadeModuleId: '/repo/index.html',
      // Der lazy-Import nennt den Modulnamen; dazu Vites Vorladeliste.
      code: 'import("./DocCheckApp-C.js");const d=["assets/DocCheckApp-C.js","assets/DocCheckApp-K.css"]',
    }),
    'assets/geteilt-B.js': chunk(),
    'assets/DocCheckApp-C.js': chunk({
      imports: ['assets/geteilt-B.js', 'assets/kern-D.js'],
      dynamicImports: ['assets/pdf-E.js'],
      facadeModuleId: '/repo/src/modules/doccheck/DocCheckApp.tsx',
      code: 'new Worker(new URL("doccheck.worker-F.js", import.meta.url))',
    }),
    'assets/kern-D.js': chunk(),
    'assets/pdf-E.js': chunk({ facadeModuleId: '/repo/node_modules/pdfjs-dist/build/pdf.mjs', code: 'workerSrc=new URL("pdf.worker-G.mjs",import.meta.url)' }),
    'assets/pdf.worker-G.mjs': asset(),
    'assets/doccheck.worker-F.js': asset('import("./teil-H.js")'),
    'assets/teil-H.js': asset(),
    'assets/DocCheckApp-K.css': asset('.x{}'),
    'assets/index-I.css': asset('body{}'),
    'icon-192.png': asset(new Uint8Array([1, 2, 3])),
  })

  it('nimmt das Modul, seine Importe, pdf.js und die per Adresse geladenen Worker heraus', () => {
    expect([...nurNachgeladen(bundle())].sort()).toEqual([
      'assets/DocCheckApp-C.js',
      'assets/doccheck.worker-F.js',
      'assets/kern-D.js',
      'assets/pdf-E.js',
      // Die erste Fassung übersah genau diese beiden: pdf.js kommt per
      // dynamischem Import, sein Worker per Adresse.
      'assets/pdf.worker-G.mjs',
      'assets/teil-H.js',
    ])
  })

  it('lässt im Vorab-Cache, was die Startseite statisch braucht — auch wenn DocCheck es teilt', () => {
    const n = nurNachgeladen(bundle())
    // Ein Dateinamens-Muster hätte den gemeinsamen Chunk mit ausgeschlossen —
    // offline bräche dann die Startseite, nicht DocCheck.
    expect(n.has('assets/geteilt-B.js')).toBe(false)
    expect(n.has('assets/index-A.js')).toBe(false)
    expect(n.has('assets/index-I.css')).toBe(false)
    expect(n.has('icon-192.png')).toBe(false)
  })

  it('folgt im Code der Startseite keinen Namen — sonst käme DocCheck über den lazy-Import doch auf jedes Gerät', () => {
    const b = bundle()
    // Gegenprobe: Hinge DocCheck STATISCH an der Startseite, gehörte es zum Start.
    b['assets/index-A.js'] = { ...b['assets/index-A.js'], imports: ['assets/geteilt-B.js', 'assets/DocCheckApp-C.js'] }
    expect(nurNachgeladen(b).has('assets/DocCheckApp-C.js')).toBe(false)
    // Ohne diesen Import bleibt es draußen, obwohl der Name im Startcode steht.
    expect(nurNachgeladen(bundle()).has('assets/DocCheckApp-C.js')).toBe(true)
  })

  it('zusammen mit dateiListe: die Startseite lädt vorab, DocCheck erst beim Öffnen', () => {
    const b = bundle()
    const liste = dateiListe(Object.keys(b), nurNachgeladen(b), [])
    expect(liste).toContain('./assets/index-A.js')
    expect(liste).toContain('./assets/geteilt-B.js')
    expect(liste.some((f) => /DocCheckApp-C|kern-D|pdf-E|worker/.test(f))).toBe(false)
  })

  it('ohne Modul unter src/modules/ bleibt alles im Vorab-Cache', () => {
    expect(nurNachgeladen({ 'assets/index-A.js': chunk({ isEntry: true, dynamicImports: ['assets/x.js'] }), 'assets/x.js': chunk() }).size).toBe(0)
  })
})

describe('cacheName: jede Änderung ein neuer Worker, gleiche Quellen derselbe', () => {
  const sha = () => createHash('sha256')
  const teile: [string, string | Uint8Array][] = [
    ['quelle/index.html', '<html>'],
    ['public/icon-192.png', new Uint8Array([1, 2, 3])],
    ['assets/index-A.js', 'console.log(1)'],
  ]

  it('hängt nicht an der Reihenfolge — die von public/ legt das Dateisystem fest', () => {
    const a = cacheName(teile, sha())
    expect(a).toMatch(/^ic-[0-9a-f]{12}$/)
    expect(cacheName([...teile].reverse(), sha())).toBe(a)
  })

  it('ändert sich, wenn sich nur der Inhalt ändert — etwa allein index.html oder ein Icon', () => {
    const a = cacheName(teile, sha())
    expect(cacheName([['quelle/index.html', '<html lang="de">'], teile[1], teile[2]], sha())).not.toBe(a)
    expect(cacheName([teile[0], ['public/icon-192.png', new Uint8Array([1, 2, 4])], teile[2]], sha())).not.toBe(a)
    // Gleicher Inhalt als Text oder Bytes zählt gleich (Assets kommen in beiden Formen).
    expect(cacheName([teile[0], teile[1], ['assets/index-A.js', new TextEncoder().encode('console.log(1)')]], sha())).toBe(a)
  })

  it('hält Name und Inhalt auseinander', () => {
    expect(cacheName([['ab', 'c']], sha())).not.toBe(cacheName([['a', 'bc']], sha()))
    expect(cacheName([['a', 'x'], ['b', '']], sha())).not.toBe(cacheName([['a', ''], ['b', 'x']], sha()))
  })
})

describe('swAngaben: die Umkehrung für Größenbudget und Nachkontrolle', () => {
  it('liest Cache-Name und Dateiliste aus dem erzeugten Worker zurück', () => {
    const dateien = ['./', './index.html', './assets/index-"x".js']
    expect(swAngaben(swQuelle('ic-abc123', dateien))).toEqual({ cache: 'ic-abc123', dateien })
  })

  it('eine fremde oder kaputte Datei ergibt nichts', () => {
    expect(swAngaben('self.addEventListener("fetch", () => {})')).toBeNull()
    expect(swAngaben('const CACHE = "ic"\nconst ASSETS = [kaputt]')).toBeNull()
    expect(swAngaben('const CACHE = 5\nconst ASSETS = []')).toBeNull()
    expect(swAngaben('const CACHE = "ic"\nconst ASSETS = [1]')).toBeNull()
  })
})
