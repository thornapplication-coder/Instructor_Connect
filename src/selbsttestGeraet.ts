import { serverProbe } from './net'
import { speicherProbe, storageInfo } from './persist'
import type { AppState } from './types'
import {
  automatischFaellig,
  datenPruefen,
  fingerabdrueckePruefen,
  gesamtStufe,
  letzterLaufLesen,
  type LetzterLauf,
  browserBewerten,
  dauerhaftBewerten,
  fuellstandBewerten,
  netzBewerten,
  offlineBewerten,
  PFLICHT_APIS,
  speicherBewerten,
  uhrAbweichung,
  uhrBewerten,
  versionBewerten,
  WUNSCH_APIS,
  type Ergebnis,
  type OfflineStand,
} from './selbsttest'

/**
 * Selbsttest, Teil Gerät (Ebene 2): die MESSUNGEN. Bewertet wird in
 * `selbsttest.ts` — hier wird nur gefragt, was der Browser hergibt.
 *
 * Jede Messung hat ein Zeitlimit oder kann nicht hängen: Ein Selbsttest,
 * der auf einem kaputten Gerät selbst stehen bleibt, sagt gar nichts.
 */

/** Welche Funktionen fehlen? Namen wie in PFLICHT_APIS/WUNSCH_APIS. */
export function fehlendeApis(w: Window & typeof globalThis = window): string[] {
  const da: Record<(typeof PFLICHT_APIS)[number] | (typeof WUNSCH_APIS)[number], boolean> = {
    indexedDB: typeof w.indexedDB !== 'undefined',
    'crypto.subtle': typeof w.crypto?.subtle?.digest === 'function',
    Worker: typeof w.Worker === 'function',
    Intl: typeof w.Intl?.DateTimeFormat === 'function',
    serviceWorker: !!w.navigator?.serviceWorker,
    caches: typeof w.caches !== 'undefined',
    'storage.estimate': typeof w.navigator?.storage?.estimate === 'function',
  }
  return Object.entries(da)
    .filter(([, ok]) => !ok)
    .map(([k]) => k)
}

/** Darf der Browser die Ablage räumen? `null`: Er sagt es nicht. */
export async function ablageDauerhaft(): Promise<boolean | null> {
  try {
    const f = navigator.storage?.persisted
    return typeof f === 'function' ? await f.call(navigator.storage) : null
  } catch {
    return null
  }
}

export interface SwAuskunft {
  cache: string
  gesamt: number
  fehlend: number
}

/** Antwort des Service Workers auf SELBSTTEST (swQuelle.ts) — geprüft gelesen. */
export function swAuskunftLesen(x: unknown): SwAuskunft | null {
  const a = x as Partial<SwAuskunft> | null
  if (!a || typeof a.cache !== 'string' || !Number.isInteger(a.gesamt) || !Number.isInteger(a.fehlend)) return null
  return { cache: a.cache, gesamt: a.gesamt!, fehlend: a.fehlend! }
}

export const SW_ZEITGRENZE_MS = 3000

/**
 * Den Service Worker selbst fragen, welcher Stand er ist und was in seinem
 * Vorab-Cache fehlt. Ein Worker von vor dieser Funktion antwortet nicht —
 * dann bleibt es nach der Zeitgrenze bei „nicht prüfbar".
 */
export function swFragen(ctrl: ServiceWorker | null | undefined, ms = SW_ZEITGRENZE_MS): Promise<SwAuskunft | null> {
  if (!ctrl) return Promise.resolve(null)
  return new Promise((ok) => {
    const kanal = new MessageChannel()
    const uhr = setTimeout(() => {
      kanal.port1.close()
      ok(null)
    }, ms)
    kanal.port1.onmessage = (e) => {
      clearTimeout(uhr)
      kanal.port1.close()
      ok(swAuskunftLesen(e.data))
    }
    try {
      ctrl.postMessage({ type: 'SELBSTTEST' }, [kanal.port2])
    } catch {
      clearTimeout(uhr)
      ok(null)
    }
  })
}

/**
 * Offline-Bereitschaft und Version in einem Gang — beides fragt die
 * Registrierung. `online`: Nur dann lohnt die Frage nach einem neueren Stand.
 */
export async function swStand(online: boolean): Promise<{ offline: OfflineStand | null; version: { aktiv: string | null; server: string | null; wartet: boolean } | null }> {
  const sw = navigator.serviceWorker
  if (!sw) return { offline: { unterstuetzt: false, aktiv: false, steuert: false, gesamt: 0, fehlend: 0 }, version: null }
  let reg: ServiceWorkerRegistration | undefined
  try {
    reg = await sw.getRegistration()
  } catch {
    reg = undefined
  }
  const auskunft = await swFragen(sw.controller)
  const offline: OfflineStand = {
    unterstuetzt: true,
    aktiv: !!reg?.active,
    steuert: !!sw.controller,
    gesamt: auskunft?.gesamt ?? 0,
    fehlend: auskunft?.fehlend ?? 0,
  }
  let server: string | null = null
  let wartet = !!(reg?.waiting || reg?.installing)
  if (online && reg && auskunft) {
    try {
      // Dieselbe Frage, die die Update-Prüfung minütlich stellt (UpdateBanner):
      // Liegt am Server eine andere sw.js, beginnt jetzt ihre Installation.
      await reg.update()
      wartet = !!(reg.waiting || reg.installing)
      // Geprüft gegen den Server: gleich, wenn nichts Neues wartet.
      server = auskunft.cache
    } catch {
      server = null
    }
  }
  return { offline, version: { aktiv: auskunft?.cache ?? null, server, wartet } }
}

/** Was der Geräteteil braucht — ersetzbar für Tests. */
export interface GeraetZugriff {
  apis: () => string[]
  speicher: () => Promise<{ ok: boolean; ms: number }>
  dauerhaft: () => Promise<boolean | null>
  fuellstand: () => Promise<{ usage: number; quota: number } | null>
  server: () => Promise<{ erreichbar: boolean; datum: string | null; gesendet: number; empfangen: number }>
  sw: (online: boolean) => ReturnType<typeof swStand>
}

export const BROWSER: GeraetZugriff = {
  apis: () => fehlendeApis(),
  speicher: speicherProbe,
  dauerhaft: ablageDauerhaft,
  fuellstand: storageInfo,
  server: serverProbe,
  sw: swStand,
}

/** Alle Geräteprüfungen in der Reihenfolge der Anzeige. */
export async function geraetPruefen(z: GeraetZugriff = BROWSER): Promise<Ergebnis[]> {
  const [speicher, dauerhaft, fuellstand, server] = await Promise.all([z.speicher(), z.dauerhaft(), z.fuellstand(), z.server()])
  const sw = await z.sw(server.erreichbar)
  return [
    browserBewerten(z.apis()),
    speicherBewerten(speicher),
    dauerhaftBewerten(dauerhaft),
    fuellstandBewerten(fuellstand),
    netzBewerten(server.erreichbar),
    uhrBewerten(uhrAbweichung(server.datum, server.gesendet, server.empfangen)),
    offlineBewerten(sw.offline),
    versionBewerten(sw.version),
  ]
}

/* --------------------------------- Ablauf --------------------------------- */

/** Lädt die DocCheck-Probe erst bei Bedarf — sie zieht pdf.js nach. */
export type DocCheckLader = () => Promise<() => Promise<Ergebnis[]>>

const docCheckLaden: DocCheckLader = () => import('./modules/doccheck/selbsttest').then((m) => m.docCheckSelbsttest)

/**
 * Der ganze Selbsttest: Gerät immer, Datenbestand nur für den Superadmin
 * (er sieht alle Konten und Formulare), DocCheck nur mit DocCheck-Rolle.
 * Die DocCheck-Probe kommt per `import()` — offline und noch nie geöffnet
 * liegt sie nicht im Cache (nurNachgeladen, swQuelle.ts); dann ist sie
 * nicht prüfbar, nicht rot.
 */
export async function selbsttestAusfuehren(o: {
  state: AppState
  jetzt: number
  daten: boolean
  docCheck: boolean
  geraet?: GeraetZugriff
  docCheckLader?: DocCheckLader
}): Promise<Ergebnis[]> {
  const geraet = await geraetPruefen(o.geraet ?? BROWSER)
  // Zeiten im Bestand entstehen mit der Zeit der APP — in der Sandbox
  // samt Zeitraffer (timeOffsetMs). „In der Zukunft" heißt: nach dieser,
  // nicht nach der Uhr des Geräts; sonst meldete jeder Zeitraffer Formulare
  // aus der Zukunft. Die Geräteuhr prüft `uhr` für sich.
  const appJetzt = o.jetzt + (Number.isFinite(o.state.timeOffsetMs) ? o.state.timeOffsetMs : 0)
  const daten = o.daten ? [...datenPruefen(o.state, appJetzt), ...(await fingerabdrueckePruefen(o.state.gradingRecords ?? []))] : []
  let docCheck: Ergebnis[] = []
  if (o.docCheck) {
    let probe: (() => Promise<Ergebnis[]>) | null = null
    try {
      probe = await (o.docCheckLader ?? docCheckLaden)()
    } catch {
      docCheck = [{ id: 'doccheckLesen', gruppe: 'doccheck', stufe: 'offen', variante: 'nichtGeladen' }]
    }
    if (probe) docCheck = await probe()
  }
  return [...geraet, ...daten, ...docCheck]
}

/** Stand des letzten Laufs je Gerät — Bequemlichkeit, kein Nachweis (localStorage). */
export const LETZTER_LAUF_KEY = 'aaa-selbsttest-letzter'

export function letzterLauf(): LetzterLauf | null {
  try {
    return letzterLaufLesen(localStorage.getItem(LETZTER_LAUF_KEY))
  } catch {
    return null
  }
}

export function laufMerken(ergebnisse: readonly Ergebnis[], zeit: number): void {
  try {
    localStorage.setItem(LETZTER_LAUF_KEY, JSON.stringify({ zeit, stufe: gesamtStufe(ergebnisse) }))
  } catch {
    // Privater Modus, voller Speicher: Dann läuft der Kurz-Check eben öfter.
  }
}

/** Ist der Kurz-Check beim Start heute schon gelaufen? */
export function startPruefungFaellig(jetzt: number): boolean {
  return automatischFaellig(letzterLauf()?.zeit ?? null, jetzt)
}
