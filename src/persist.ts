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
 * liefert dann synchron den vorgeladenen Stand.
 */

const DB_NAME = 'instructor-connect'
const DB_STORE = 'kv'
const STATE_KEY = 'aaa-state'
/** Kanal, über den sich mehrere offene Tabs denselben Stand zurufen. */
const SYNC_CHANNEL = 'aaa-state-sync'

/** Wird gemeldet, wenn ein Speichern fehlschlägt — vorher passierte das stumm. */
export const STORAGE_ERROR_EVENT = 'aaa-storage-error'

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
  try {
    const stored = await idbGet(STATE_KEY)
    if (stored !== null) {
      preloaded = stored
      return
    }
    if (legacy !== null) {
      await idbSet(STATE_KEY, legacy)
      try {
        localStorage.removeItem(STATE_KEY)
      } catch {
        /* verbleibender Alteintrag stört nicht — IndexedDB gewinnt künftig */
      }
    }
    preloaded = legacy
  } catch {
    idbBroken = true
    preloaded = legacy
    // Nur wenn es auch keinen localStorage-Stand gibt, ist der Bestand
    // wirklich unbekannt — dann darf nichts überschrieben werden.
    readFailed = legacy === null
  }
  // Den Browser bitten, die Ablage nicht bei Platzmangel zu räumen —
  // auf einem Nachweissystem darf der Verlauf nicht heimlich verschwinden.
  try {
    await navigator.storage?.persist?.()
  } catch {
    /* rein vorsorglich; ohne Zusage ändert sich am Verhalten nichts */
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
    broadcast(payload)
    return true
  }
  try {
    await idbSet(STATE_KEY, payload)
  } catch {
    window.dispatchEvent(new CustomEvent(STORAGE_ERROR_EVENT))
    return false
  }
  broadcast(payload)
  return true
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
