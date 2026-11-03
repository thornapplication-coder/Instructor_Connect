/**
 * Ablage des Anwendungszustands.
 *
 * Bisher lag der gesamte Zustand in localStorage. Dessen Grenze liegt je
 * nach Gerät bei 5–10 MB — mit den Unterschriften-Bildern ist das bei
 * echtem Betrieb (150 Instruktoren, 2 Blätter am Tag) nach 40 bis 80
 * Formularen erreicht, und jedes weitere Speichern schlug stillschweigend
 * fehl: Die App lief weiter, verlor aber ab da jede Änderung beim nächsten
 * Neuladen.
 *
 * Deshalb liegt der Zustand jetzt in IndexedDB (Größenordnung Gigabyte,
 * vom Browser je nach freiem Plattenplatz zugeteilt). localStorage bleibt
 * nur noch als Migrationsquelle für Bestandsgeräte und als Rückfallebene,
 * falls IndexedDB nicht verfügbar ist (z. B. ältere private Fenster).
 *
 * IndexedDB ist asynchron, der Store liest aber synchron beim ersten
 * Render. Gelöst über eine Vorlade-Stufe: main.tsx wartet auf
 * preloadPersistedState(), erst danach startet React. readPreloadedState()
 * liefert dann synchron den vorgeladenen Stand. Das Warten hat eine
 * Zeitgrenze (LESE_ZEITGRENZE_MS) — ohne sie blieb die Seite weiß, solange
 * IndexedDB nicht antwortete.
 */

import type { AppState } from './types'

const DB_NAME = 'instructor-connect'
const DB_STORE = 'kv'
const STATE_KEY = 'aaa-state'
/** Kanal, über den sich mehrere offene Tabs denselben Stand zurufen. */
const SYNC_CHANNEL = 'aaa-state-sync'

/** Wird gemeldet, wenn ein Speichern fehlschlägt — vorher passierte das stumm. */
export const STORAGE_ERROR_EVENT = 'aaa-storage-error'
/**
 * Wird gemeldet, wenn ein Speichern WIEDER klappt.
 *
 * Der rote Streifen kannte nur „fehlgeschlagen": Nach einem einzigen
 * Fehlschlag blieb er stehen, auch wenn jede weitere Änderung längst sicher
 * lag — ein Dauer-Fehlalarm, der behauptete, Änderungen gingen verloren
 * (Audit 11/2026, TEC-12).
 */
export const STORAGE_OK_EVENT = 'aaa-storage-ok'

/**
 * Wie lange der Start höchstens auf IndexedDB wartet.
 *
 * Bisher ohne Grenze: Antwortete `indexedDB.open` nicht (WebKit-Fehler beim
 * Öffnen, eine Abfrage im Hintergrund), blieb die Seite weiß — ohne jede
 * Meldung (Audit 11/2026, TEC-11; nachgestellt: nach 8 s 0 Zeichen). Ein
 * Lesevorgang dauert sonst Millisekunden; drei Sekunden sind ein Ausfall.
 */
export const LESE_ZEITGRENZE_MS = 3000

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
      req.onblocked = () => reject(new Error('blocked'))
    })
  }
  return dbPromise
}

function idbGet(key: string): Promise<string | null> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const req = db.transaction(DB_STORE, 'readonly').objectStore(DB_STORE).get(key)
        req.onsuccess = () => resolve(typeof req.result === 'string' ? req.result : null)
        req.onerror = () => reject(req.error)
      }),
  )
}

function idbSet(key: string, value: string): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE, 'readwrite')
        tx.objectStore(DB_STORE).put(value, key)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
        tx.onabort = () => reject(tx.error ?? new Error('abort'))
      }),
  )
}

/** Alle Schluessel des Speichers — fuer Aufraeumen und Fuellstand. */
function idbKeys(): Promise<string[]> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const rq = db.transaction(DB_STORE).objectStore(DB_STORE).getAllKeys()
        rq.onsuccess = () => resolve((rq.result as IDBValidKey[]).map(String))
        rq.onerror = () => reject(rq.error)
      }),
  )
}

function idbDel(key: string): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE, 'readwrite')
        tx.objectStore(DB_STORE).delete(key)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      }),
  )
}

/** Vorgeladener Stand; von preloadPersistedState() gefüllt. */
let preloaded: string | null = null
/** IndexedDB nicht nutzbar → localStorage bleibt die Ablage (wie bisher). */
let idbBroken = false
/**
 * Der Lesevorgang ist gescheitert, OBWOHL dort etwas liegen könnte.
 *
 * Bisher lief die App in diesem Fall stumm auf den Seed-Daten an: Der
 * Instruktor sah eine leere Ablage — und der erste Klick schrieb diesen
 * leeren Stand über den vorhandenen. Ein Lesefehler ist aber kein Beleg
 * dafür, dass nichts da ist. Solange er gilt, wird deshalb NICHT
 * gespeichert; stattdessen meldet der Warnstreifen, dass die App neu
 * geladen werden muss.
 */
let readFailed = false
/** Der Stand wurde beiseitegelegt, die App lädt gleich neu — bis dahin nichts
 *  mehr schreiben (siehe standBeiseitelegen). */
let beiseitegelegt = false

/** Konnte der gespeicherte Bestand nicht gelesen werden? */
export function storageReadFailed(): boolean {
  return readFailed
}

/**
 * Vor dem ersten Render aufrufen. Liest den Stand aus IndexedDB; findet
 * sich dort nichts, wird ein etwaiger localStorage-Stand übernommen
 * (Migration von Bestandsgeräten). Der localStorage-Eintrag wird erst
 * gelöscht, NACHDEM die Übernahme in IndexedDB bestätigt ist — schlägt
 * irgendetwas fehl, bleibt der alte Stand unangetastet.
 */
export async function preloadPersistedState(): Promise<void> {
  let legacy: string | null = null
  try {
    legacy = localStorage.getItem(STATE_KEY)
  } catch {
    /* ohne localStorage gibt es nichts zu migrieren */
  }
  const ausIndexedDb = async (): Promise<string | null> => {
    const stored = await idbGet(STATE_KEY)
    if (stored !== null) return stored
    if (legacy !== null) {
      await idbSet(STATE_KEY, legacy)
      try {
        localStorage.removeItem(STATE_KEY)
      } catch {
        /* verbleibender Alteintrag stört nicht — IndexedDB gewinnt künftig */
      }
    }
    return legacy
  }
  let zeitgeber: ReturnType<typeof setTimeout> | undefined
  const zeitUm = new Promise<'zeit'>((resolve) => {
    zeitgeber = setTimeout(() => resolve('zeit'), LESE_ZEITGRENZE_MS)
  })
  try {
    const gelesen = ausIndexedDb()
    const ergebnis = await Promise.race([gelesen.then((stand) => ({ stand })), zeitUm])
    if (ergebnis === 'zeit') {
      /*
       * IndexedDB antwortet nicht. Das ist KEIN Beleg, dass dort nichts
       * liegt — anders als ein Fehler beim Öffnen sagt es nicht einmal, dass
       * die Datenbank unbrauchbar ist. Deshalb gilt hier immer readFailed,
       * auch wenn ein localStorage-Altstand da ist: Der könnte älter sein
       * als das, was in der stummen Datenbank liegt. Angezeigt wird, was da
       * ist; geschrieben wird nichts, und der Warnstreifen sagt es.
       */
      idbBroken = true
      readFailed = true
      preloaded = legacy
      // Kommt die Antwort doch noch, ist der Start längst gelaufen — sie
      // wird verworfen, ein später Fehler ebenso.
      gelesen.catch(() => undefined)
      return
    }
    preloaded = ergebnis.stand
  } catch {
    idbBroken = true
    preloaded = legacy
    // Nur wenn es auch keinen localStorage-Stand gibt, ist der Bestand
    // wirklich unbekannt — dann darf nichts überschrieben werden.
    readFailed = legacy === null
  } finally {
    clearTimeout(zeitgeber)
  }
}

/**
 * Den Browser bitten, die Ablage nicht bei Platzmangel zu räumen — auf
 * einem Nachweissystem darf der Verlauf nicht heimlich verschwinden.
 *
 * Wurde früher VOR dem ersten Render abgewartet. Firefox fragt dafür den
 * Nutzer; solange die Abfrage offen war, blieb die App leer (Audit 11/2026,
 * TEC-11). Jetzt stößt StorageBanner die Bitte nach dem ersten Render an,
 * und niemand wartet auf die Antwort: Ohne Zusage ändert sich am Verhalten
 * nichts.
 */
export function ablageDauerhaftBitten(): void {
  try {
    // Auch eine abgelehnte Bitte bleibt still — sie ist rein vorsorglich.
    navigator.storage?.persist?.()?.catch(() => undefined)
  } catch {
    /* ältere Browser, private Fenster: keine Zusage, kein Unterschied */
  }
}

/** Synchoner Zugriff auf den vorgeladenen Stand (nach preloadPersistedState). */
export function readPreloadedState(): string | null {
  return preloaded
}

/**
 * Zustand sichern. Fehler werden gemeldet statt verschluckt.
 *
 * Reihenfolge: erst SCHREIBEN, dann den anderen Tabs Bescheid geben. Vorher
 * ging der Ruf voraus — lief die Ablage voll, galt der Stand in allen Tabs
 * als gesichert (der empfangende Tab merkt sich den Stand als „schon
 * geschrieben" und schreibt nicht selbst), lag aber nirgends.
 *
 * Rueckgabe: ob es geklappt hat. Der Aufrufer setzt bei `false` seinen
 * Merker zurueck und versucht es erneut.
 */
export async function persistState(payload: string): Promise<boolean> {
  // Zwischen „beiseitegelegt" und dem Neuladen: Der Stand im Speicher ist
  // genau der, an dem die App abstürzte — ihn jetzt zu schreiben, machte
  // den Ausweg zunichte.
  if (beiseitegelegt) return false
  // Nach einem Lesefehler wird nichts geschrieben: Was nicht gelesen werden
  // konnte, darf nicht überschrieben werden.
  if (readFailed) {
    window.dispatchEvent(new CustomEvent(STORAGE_ERROR_EVENT))
    return false
  }
  if (idbBroken) {
    try {
      localStorage.setItem(STATE_KEY, payload)
    } catch {
      window.dispatchEvent(new CustomEvent(STORAGE_ERROR_EVENT))
      return false
    }
    gesichert(payload)
    return true
  }
  try {
    await idbSet(STATE_KEY, payload)
  } catch {
    window.dispatchEvent(new CustomEvent(STORAGE_ERROR_EVENT))
    return false
  }
  gesichert(payload)
  return true
}

/** Nach einem gelungenen Schreiben: Streifen zurücknehmen (TEC-12), dann die anderen Tabs rufen. */
function gesichert(payload: string) {
  window.dispatchEvent(new CustomEvent(STORAGE_OK_EVENT))
  broadcast(payload)
}

/**
 * Einen Stand beiseitelegen, statt ihn wegzuwerfen.
 *
 * Ein Sprung der STATE_VERSION verwarf den gesamten gespeicherten Bestand —
 * unterschriebene Formulare eingeschlossen — und zwar wortlos. Das ist bei
 * einer Ablage mit Nachweispflicht nicht vertretbar. Der alte Stand wandert
 * jetzt unter einen eigenen Schlüssel; von dort ist er auslesbar, solange
 * niemand die Ablage von Hand räumt.
 */
export function backupPersistedState(raw: string, version: number | undefined): void {
  /*
   * Der Schluessel traegt auch den Zeitpunkt. Vorher enthielt er nur die
   * Version — und die Folge v2 → v1 → v2 → v1 schrieb beim letzten Schritt
   * die inzwischen neu aufgebaute v2-Ablage ueber `…-backup-v2` und loeschte
   * damit die einzige Kopie der echten Daten.
   */
  const key = `${STATE_KEY}-backup-v${version ?? 'unknown'}-${Date.now()}`
  if (idbBroken) {
    try {
      localStorage.setItem(key, raw)
    } catch {
      window.dispatchEvent(new CustomEvent(STORAGE_ERROR_EVENT))
    }
    return
  }
  idbSet(key, raw).catch(() => {
    window.dispatchEvent(new CustomEvent(STORAGE_ERROR_EVENT))
  })
}

/**
 * Den vorgeladenen Rohstand in einen Zustand übersetzen — oder beiseitelegen.
 *
 * Die Entscheidung stand in store.tsx, und dort fehlte ein Fall: War der
 * Rohstand gar kein lesbares JSON, lieferte der `catch` stumm `null`, die
 * App startete auf dem Seed und schrieb ihn 400 ms später über den einzigen
 * vorhandenen Rohstand — mögliche Reste unterschriebener Formulare waren
 * unwiederbringlich weg (Audit 11/2026, TEC-06). Jetzt gilt für JEDEN Stand,
 * der nicht geladen wird, dieselbe Regel wie beim Versionssprung: erst
 * beiseitelegen, dann auf dem Seed starten.
 *
 * @param version erwartete STATE_VERSION (steht im Store, der die Form kennt)
 */
export function ladeStand(raw: string | null, version: number): AppState | null {
  if (!raw) return null
  let parsed: { v?: unknown; state?: AppState } | null
  try {
    parsed = JSON.parse(raw)
  } catch {
    // Unlesbar: Version unbekannt — der Schlüssel heißt dann `…-vunknown-…`.
    backupPersistedState(raw, undefined)
    return null
  }
  if (!parsed || typeof parsed !== 'object' || parsed.v !== version || !Array.isArray(parsed.state?.users) || !parsed.state.users.length) {
    // NICHT löschen: Ein Sprung der STATE_VERSION verwarf früher den gesamten
    // Bestand — unterschriebene Formulare eingeschlossen — und zwar wortlos.
    backupPersistedState(raw, typeof parsed?.v === 'number' ? parsed.v : undefined)
    return null
  }
  return parsed.state
}

/**
 * Den gespeicherten Stand beiseitelegen, damit die App frisch startet — OHNE
 * die vorhandenen Sicherungen anzutasten.
 *
 * Der Ausweg aus einer App, die an ihrem eigenen Stand abstürzt (Audit
 * 11/2026, TEC-07): Vorher blieb nur, die Websitedaten von Hand zu löschen,
 * samt aller Nachweise. `clearPersistedState` taugt dafür nicht — es räumt
 * die Sicherungen mit. Gelöscht wird erst, wenn die Sicherung geschrieben
 * ist; danach schreibt dieser Tab nichts mehr, bis er neu geladen ist.
 *
 * Liefert, ob es geklappt hat. Bei `false` ist nichts gelöscht.
 */
export async function standBeiseitelegen(): Promise<boolean> {
  const key = `${STATE_KEY}-backup-reset-${Date.now()}`
  // Schon VOR dem Lesen sperren: Ein Schreibvorgang zwischen Sichern und
  // Löschen legte den Absturzstand sonst gleich wieder ab.
  beiseitegelegt = true
  try {
    if (idbBroken) {
      const raw = localStorage.getItem(STATE_KEY)
      if (raw !== null) {
        localStorage.setItem(key, raw)
        localStorage.removeItem(STATE_KEY)
      }
    } else {
      const raw = await idbGet(STATE_KEY)
      if (raw !== null) {
        await idbSet(key, raw)
        await idbDel(STATE_KEY)
      }
    }
  } catch {
    beiseitegelegt = false
    return false
  }
  return true
}

/* ===================== Mehrere Tabs ===================== */

/**
 * Zwei offene Tabs hielten je eine vollständige Kopie des Zustands. Wer im
 * zweiten Tab etwas tat, schrieb dessen — älteren — Stand über den ersten:
 * ein im ersten Tab gerade unterschriebenes Formular war damit weg, ohne
 * jede Meldung. Gemessen wurde genau das.
 *
 * Deshalb ruft jeder Tab seinen frisch gesicherten Stand über einen
 * BroadcastChannel aus, und die übrigen übernehmen ihn. Damit arbeiten alle
 * Tabs auf demselben Stand, statt sich gegenseitig zu überschreiben.
 */
let channel: BroadcastChannel | null = null
/** Was dieser Tab selbst zuletzt ausgerufen hat — kommt es zurück, ignorieren. */
let lastBroadcast = ''

function getChannel(): BroadcastChannel | null {
  if (channel === null && typeof BroadcastChannel !== 'undefined') channel = new BroadcastChannel(SYNC_CHANNEL)
  return channel
}

function broadcast(payload: string) {
  lastBroadcast = payload
  try {
    getChannel()?.postMessage(payload)
  } catch {
    /* ohne BroadcastChannel bleibt es beim bisherigen Verhalten */
  }
}

/** Auf Stände anderer Tabs hören. Liefert die Abmeldefunktion. */
export function subscribeToOtherTabs(onState: (raw: string) => void): () => void {
  const ch = getChannel()
  if (!ch) return () => undefined
  const handler = (ev: MessageEvent) => {
    if (typeof ev.data !== 'string' || ev.data === lastBroadcast) return
    onState(ev.data)
  }
  ch.addEventListener('message', handler)
  return () => ch.removeEventListener('message', handler)
}

/** Alle Schluessel der Ablage — fuer Aufraeumen und Fuellstand. */
async function alleSchluessel(): Promise<string[]> {
  if (idbBroken) {
    try {
      return Object.keys(localStorage).filter((k) => k.startsWith(STATE_KEY))
    } catch {
      return []
    }
  }
  try {
    return await idbKeys()
  } catch {
    return []
  }
}

/**
 * Zuruecksetzen raeumt AUCH die Sicherungen.
 *
 * Vorher blieb jede Versions-Sicherung liegen: fremde Notizen und endgueltig
 * geloeschte Formulare ueberlebten das Zuruecksetzen unbegrenzt — unsichtbar,
 * unzaehlbar, und niemand kam mehr heran.
 */
export function clearPersistedState() {
  try {
    Object.keys(localStorage)
      .filter((k) => k === STATE_KEY || k.startsWith(`${STATE_KEY}-backup`))
      .forEach((k) => localStorage.removeItem(k))
  } catch {
    /* ohne localStorage gibt es dort nichts zu verwerfen */
  }
  if (!idbBroken) {
    void alleSchluessel().then((keys) =>
      keys.filter((k) => k === STATE_KEY || k.startsWith(`${STATE_KEY}-backup`)).forEach((k) => idbDel(k).catch(() => undefined)),
    )
  }
}

export interface StorageInfo {
  /** Belegte Bytes laut Browser (Schätzung) */
  usage: number
  /** Zugeteilte Bytes laut Browser (Schätzung) */
  quota: number
  /** Größe des gespeicherten Zustands selbst in Bytes */
  stateBytes: number
}

/** Füllstand für die Anzeige im Admin-Bereich. */
export async function storageInfo(): Promise<StorageInfo | null> {
  try {
    const est = await navigator.storage?.estimate?.()
    const raw = idbBroken ? localStorage.getItem(STATE_KEY) : await idbGet(STATE_KEY)
    const stateBytes = raw ? new Blob([raw]).size : 0
    // Die Versions-Sicherungen zaehlen mit: Sie verdoppeln den Bedarf, und
    // ohne sie schlug die 85-%-Warnung erst an, wenn es laengst zu spaet war.
    const backupKeys = (await alleSchluessel()).filter((k) => k.startsWith(`${STATE_KEY}-backup`))
    let backupBytes = 0
    for (const k of backupKeys) {
      const b = idbBroken ? localStorage.getItem(k) : await idbGet(k)
      if (b) backupBytes += new Blob([b]).size
    }
    const eigen = stateBytes + backupBytes
    if (!est?.quota) return { usage: eigen, quota: 0, stateBytes }
    // Die Browser-Schätzung hinkt frischen Schreibvorgängen hinterher —
    // gemessen: 3,9 MB gemeldet bei 14 MB tatsächlichem Bestand. Der eigene
    // Bestand ist die Untergrenze.
    return { usage: Math.max(est.usage ?? 0, eigen), quota: est.quota, stateBytes }
  } catch {
    return null
  }
}
