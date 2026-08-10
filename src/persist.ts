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

/** Zustand sichern. Fehler werden gemeldet statt verschluckt. */
export function persistState(payload: string) {
  if (idbBroken) {
    try {
      localStorage.setItem(STATE_KEY, payload)
    } catch {
      window.dispatchEvent(new CustomEvent(STORAGE_ERROR_EVENT))
    }
    return
  }
  idbSet(STATE_KEY, payload).catch(() => {
    window.dispatchEvent(new CustomEvent(STORAGE_ERROR_EVENT))
  })
}

export function clearPersistedState() {
  try {
    localStorage.removeItem(STATE_KEY)
  } catch {
    /* ohne localStorage gibt es dort nichts zu verwerfen */
  }
  if (!idbBroken) idbDel(STATE_KEY).catch(() => undefined)
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
    if (!est?.quota) return { usage: stateBytes, quota: 0, stateBytes }
    // Die Browser-Schätzung hinkt frischen Schreibvorgängen hinterher —
    // gemessen: 3,9 MB gemeldet bei 14 MB tatsächlichem Bestand. Der eigene
    // Bestand ist die Untergrenze.
    return { usage: Math.max(est.usage ?? 0, stateBytes), quota: est.quota, stateBytes }
  } catch {
    return null
  }
}
