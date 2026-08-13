import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Ebene 2: die Ablage selbst.
 *
 * Hier liegt der Bestand, auf den sich die Nachweispflicht stützt
 * (ORA.GEN.220) — und hier waren in den Audits die teuersten Fehler:
 * stilles Verwerfen beim Versionssprung, ein Lesefehler, der die App auf
 * Seed-Daten anlaufen und den ersten Klick den echten Bestand überschreiben
 * ließ, und ein Ruf an die anderen Tabs VOR dem Schreiben, der einen nie
 * geschriebenen Stand als gesichert auswies.
 *
 * Das ließ sich mit reiner Logik nicht prüfen: Es braucht eine echte
 * IndexedDB-Semantik (fake-indexeddb) und ein `window`. Deshalb steht es
 * hier statt auf Ebene 1.
 *
 * `persist.ts` hält Modulzustand (vorgeladener Stand, ob IndexedDB kaputt
 * ist, ob das Lesen scheiterte). Jeder Test lädt das Modul deshalb frisch —
 * sonst prüfte der zweite Test die Weltsicht des ersten.
 */

const STATE_KEY = 'aaa-state'

async function frischesModul() {
  vi.resetModules()
  return await import('./persist')
}

/**
 * Alles wegräumen, was zwischen zwei Tests hängen bleiben könnte.
 *
 * Bewusst LEEREN statt die Datenbank zu löschen: Jeder Test lädt `persist.ts`
 * frisch, und jedes geladene Modul hält seine eigene offene Verbindung.
 * `deleteDatabase` wartet auf deren Schließen, die es nie gibt — der Aufruf
 * blockiert dann bis zum Zeitlimit des Hooks (gemessen: 10 s je Test).
 */
async function leereAblage() {
  localStorage.clear()
  // Gibt es die Datenbank noch gar nicht, wird sie hier auch nicht angelegt:
  // Sonst legte der Aufraeumer den Speicher an, und das Modul faende beim
  // ersten Test bereits alles vor — sein eigener Anlege-Pfad
  // (`onupgradeneeded`) liefe nie.
  const vorhanden = await indexedDB.databases?.().then((l) => l.some((d) => d.name === 'instructor-connect'))
  if (!vorhanden) return
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open('instructor-connect', 1)
    req.onupgradeneeded = () => req.result.createObjectStore('kv')
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  await new Promise<void>((resolve) => {
    const tx = db.transaction('kv', 'readwrite')
    tx.objectStore('kv').clear()
    tx.oncomplete = () => resolve()
    tx.onerror = () => resolve()
  })
  db.close()
}

beforeEach(leereAblage)
afterEach(() => {
  vi.restoreAllMocks()
})

describe('Vorladen und Migration', () => {
  it('liefert null, wenn nichts gespeichert ist', async () => {
    const p = await frischesModul()
    await p.preloadPersistedState()
    expect(p.readPreloadedState()).toBeNull()
    expect(p.storageReadFailed()).toBe(false)
  })

  it('liest einen vorhandenen Stand aus IndexedDB', async () => {
    const p = await frischesModul()
    await p.persistState('{"v":1}')
    const p2 = await frischesModul()
    await p2.preloadPersistedState()
    expect(p2.readPreloadedState()).toBe('{"v":1}')
  })

  it('übernimmt einen Altbestand aus localStorage und räumt ihn erst danach weg', async () => {
    // Bestandsgeräte: Der Zustand lag früher in localStorage. Die Reihenfolge
    // ist die Zusage — der Alteintrag verschwindet erst, wenn die Übernahme
    // bestätigt ist.
    localStorage.setItem(STATE_KEY, '{"alt":true}')
    const p = await frischesModul()
    await p.preloadPersistedState()
    expect(p.readPreloadedState()).toBe('{"alt":true}')
    expect(localStorage.getItem(STATE_KEY)).toBeNull()

    // …und beim nächsten Start kommt er aus IndexedDB, nicht aus dem Nichts.
    const p2 = await frischesModul()
    await p2.preloadPersistedState()
    expect(p2.readPreloadedState()).toBe('{"alt":true}')
  })

  it('lässt den Altbestand stehen, wenn IndexedDB gar nicht öffnet', async () => {
    localStorage.setItem(STATE_KEY, '{"alt":true}')
    vi.spyOn(indexedDB, 'open').mockImplementation(() => {
      throw new Error('kein IndexedDB')
    })
    const p = await frischesModul()
    await p.preloadPersistedState()
    expect(p.readPreloadedState()).toBe('{"alt":true}')
    // Nichts übernommen, also nichts weggeräumt.
    expect(localStorage.getItem(STATE_KEY)).toBe('{"alt":true}')
    // Ein Bestand ist bekannt — es darf weiter geschrieben werden.
    expect(p.storageReadFailed()).toBe(false)
  })
})

describe('Lesefehler ohne bekannten Bestand', () => {
  it('sperrt das Schreiben und meldet den Fehler', async () => {
    // Der teuerste Fall: IndexedDB nicht lesbar UND kein Altbestand. Früher
    // lief die App stumm auf Seed-Daten an, und der erste Klick schrieb
    // diesen leeren Stand über den vorhandenen. Ein Lesefehler ist aber kein
    // Beleg dafür, dass nichts da ist.
    vi.spyOn(indexedDB, 'open').mockImplementation(() => {
      throw new Error('kaputt')
    })
    const p = await frischesModul()
    await p.preloadPersistedState()
    expect(p.storageReadFailed()).toBe(true)

    const gemeldet = vi.fn()
    window.addEventListener(p.STORAGE_ERROR_EVENT, gemeldet)
    await expect(p.persistState('{"neu":true}')).resolves.toBe(false)
    expect(gemeldet).toHaveBeenCalledTimes(1)
    // Und zwar wirklich nichts geschrieben — auch nicht ersatzweise.
    expect(localStorage.getItem(STATE_KEY)).toBeNull()
    window.removeEventListener(p.STORAGE_ERROR_EVENT, gemeldet)
  })
})

describe('Speichern', () => {
  it('schreibt und meldet Erfolg', async () => {
    const p = await frischesModul()
    await expect(p.persistState('{"a":1}')).resolves.toBe(true)
    const p2 = await frischesModul()
    await p2.preloadPersistedState()
    expect(p2.readPreloadedState()).toBe('{"a":1}')
  })

  it('weicht auf localStorage aus, wenn IndexedDB nicht nutzbar ist', async () => {
    vi.spyOn(indexedDB, 'open').mockImplementation(() => {
      throw new Error('kaputt')
    })
    localStorage.setItem(STATE_KEY, '{"alt":true}')
    const p = await frischesModul()
    await p.preloadPersistedState()
    await expect(p.persistState('{"neu":true}')).resolves.toBe(true)
    expect(localStorage.getItem(STATE_KEY)).toBe('{"neu":true}')
  })

  it('meldet einen fehlgeschlagenen Schreibvorgang, statt ihn zu verschlucken', async () => {
    const p = await frischesModul()
    await p.preloadPersistedState()
    /* Erst nach dem Vorladen sabotieren, und zwar an der Transaktion statt am
       Öffnen: Die Verbindung ist zu diesem Zeitpunkt längst offen und wird
       vom Modul zwischengespeichert — ein Attrappen-`open` liefe ins Leere
       und der Test bewiese nichts. Eine scheiternde Transaktion ist zudem
       der realistische Fall (Ablage voll), nicht eine fehlende Datenbank. */
    vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementation(() => {
      throw new Error('voll')
    })
    const gemeldet = vi.fn()
    window.addEventListener(p.STORAGE_ERROR_EVENT, gemeldet)
    await expect(p.persistState('{"x":1}')).resolves.toBe(false)
    expect(gemeldet).toHaveBeenCalledTimes(1)
    window.removeEventListener(p.STORAGE_ERROR_EVENT, gemeldet)
  })
})

describe('Sicherungen beim Versionssprung', () => {
  it('legt den alten Stand unter einem eigenen Schlüssel ab', async () => {
    const p = await frischesModul()
    p.backupPersistedState('{"alt":1}', 2)
    // Der Schlüssel trägt Version UND Zeitpunkt: Die Folge v2 → v1 → v2
    // überschrieb sonst die einzige Kopie der echten Daten.
    const info = await p.storageInfo()
    expect(info).not.toBeNull()
    expect(info!.usage).toBeGreaterThan(0)
  })

  it('zählt die Sicherungen zum Füllstand', async () => {
    const p = await frischesModul()
    await p.persistState('{"a":1}')
    const ohne = await p.storageInfo()
    p.backupPersistedState('x'.repeat(5000), 1)
    // kurz warten: backupPersistedState schreibt ohne await
    await new Promise((r) => setTimeout(r, 50))
    const mit = await p.storageInfo()
    // Ohne die Sicherungen schlug die 85-%-Warnung erst an, wenn es längst
    // zu spät war.
    expect(mit!.usage).toBeGreaterThan(ohne!.usage)
    // Der reine Zustand ist davon unberührt.
    expect(mit!.stateBytes).toBe(ohne!.stateBytes)
  })

  it('räumt beim Zurücksetzen auch die Sicherungen weg', async () => {
    // Vorher überlebten fremde Notizen und endgültig gelöschte Formulare das
    // Zurücksetzen unbegrenzt — unsichtbar und unzählbar.
    const p = await frischesModul()
    await p.persistState('{"a":1}')
    p.backupPersistedState('{"alt":1}', 1)
    await new Promise((r) => setTimeout(r, 50))
    p.clearPersistedState()
    await new Promise((r) => setTimeout(r, 100))
    const info = await p.storageInfo()
    expect(info!.stateBytes).toBe(0)
    expect(info!.usage).toBe(0)
  })
})

describe('Mehrere offene Tabs', () => {
  it('ruft den frisch gesicherten Stand aus und meldet ihn den anderen', async () => {
    const p = await frischesModul()
    // Der Kanal des eigenen Moduls schweigt für sich selbst (sonst hörte
    // jeder Tab seinen eigenen Ruf). Ein zweiter Kanal steht für „der andere
    // Tab".
    const anderer = new BroadcastChannel('aaa-state-sync')
    const empfangen: string[] = []
    anderer.addEventListener('message', (e) => empfangen.push(e.data as string))

    await p.persistState('{"neu":true}')
    await new Promise((r) => setTimeout(r, 50))

    expect(empfangen).toEqual(['{"neu":true}'])
    anderer.close()
  })

  it('ignoriert den eigenen Ruf, wenn er zurückkommt', async () => {
    const p = await frischesModul()
    const gehoert = vi.fn()
    const ab = p.subscribeToOtherTabs(gehoert)

    await p.persistState('{"eigen":true}')
    await new Promise((r) => setTimeout(r, 50))
    expect(gehoert).not.toHaveBeenCalled()

    // Ein fremder Stand kommt dagegen an.
    const anderer = new BroadcastChannel('aaa-state-sync')
    anderer.postMessage('{"fremd":true}')
    await new Promise((r) => setTimeout(r, 50))
    expect(gehoert).toHaveBeenCalledWith('{"fremd":true}')

    ab()
    anderer.postMessage('{"danach":true}')
    await new Promise((r) => setTimeout(r, 50))
    expect(gehoert).toHaveBeenCalledTimes(1)
    anderer.close()
  })

  it('verwirft Nachrichten, die keine Zeichenkette sind', async () => {
    const p = await frischesModul()
    const gehoert = vi.fn()
    const ab = p.subscribeToOtherTabs(gehoert)
    const anderer = new BroadcastChannel('aaa-state-sync')
    anderer.postMessage({ kein: 'string' })
    await new Promise((r) => setTimeout(r, 50))
    expect(gehoert).not.toHaveBeenCalled()
    ab()
    anderer.close()
  })
})

describe('Füllstand', () => {
  it('meldet den Zustand in Bytes', async () => {
    const p = await frischesModul()
    await p.persistState('{"a":"' + 'x'.repeat(1000) + '"}')
    const info = await p.storageInfo()
    expect(info!.stateBytes).toBeGreaterThan(1000)
  })

  it('gibt null zurück, wenn gar nichts zu ermitteln ist', async () => {
    vi.spyOn(indexedDB, 'open').mockImplementation(() => {
      throw new Error('kaputt')
    })
    const p = await frischesModul()
    await p.preloadPersistedState()
    const roh = Object.getOwnPropertyDescriptor(Storage.prototype, 'getItem')
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('kein localStorage')
    })
    expect(await p.storageInfo()).toBeNull()
    if (roh) Object.defineProperty(Storage.prototype, 'getItem', roh)
  })
})

describe('Ausweichwege, wenn der Browser nicht mitspielt', () => {
  /** IndexedDB von Anfang an unbrauchbar — die Rückfallebene ist localStorage. */
  async function ohneIndexedDb() {
    vi.spyOn(indexedDB, 'open').mockImplementation(() => {
      throw new Error('kaputt')
    })
    localStorage.setItem(STATE_KEY, '{"alt":true}')
    const p = await frischesModul()
    await p.preloadPersistedState()
    return p
  }

  it('meldet auch einen vollen localStorage, statt ihn zu verschlucken', async () => {
    // Die 5–10-MB-Grenze war der Grund für den Umzug nach IndexedDB. Wer auf
    // der Rückfallebene landet, läuft irgendwann genau dort hinein — und
    // stilles Scheitern hiess frueher: Die App lief weiter und verlor ab da
    // jede Aenderung.
    const p = await ohneIndexedDb()
    const gemeldet = vi.fn()
    window.addEventListener(p.STORAGE_ERROR_EVENT, gemeldet)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceeded')
    })
    await expect(p.persistState('{"x":1}')).resolves.toBe(false)
    expect(gemeldet).toHaveBeenCalledTimes(1)
    window.removeEventListener(p.STORAGE_ERROR_EVENT, gemeldet)
  })

  it('legt die Sicherung auf der Rückfallebene ab', async () => {
    const p = await ohneIndexedDb()
    p.backupPersistedState('{"alt":1}', 2)
    const schluessel = Object.keys(localStorage).filter((k) => k.startsWith(`${STATE_KEY}-backup`))
    expect(schluessel).toHaveLength(1)
    // Version UND Zeitpunkt im Schlüssel — sonst überschreibt die Folge
    // v2 → v1 → v2 die einzige Kopie der echten Daten.
    expect(schluessel[0]).toMatch(/-backup-v2-\d+$/)
  })

  it('meldet eine gescheiterte Sicherung auf der Rückfallebene', async () => {
    const p = await ohneIndexedDb()
    const gemeldet = vi.fn()
    window.addEventListener(p.STORAGE_ERROR_EVENT, gemeldet)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('voll')
    })
    p.backupPersistedState('{"alt":1}', 2)
    expect(gemeldet).toHaveBeenCalledTimes(1)
    window.removeEventListener(p.STORAGE_ERROR_EVENT, gemeldet)
  })

  it('meldet eine gescheiterte Sicherung auch in IndexedDB', async () => {
    const p = await frischesModul()
    await p.preloadPersistedState()
    const gemeldet = vi.fn()
    window.addEventListener(p.STORAGE_ERROR_EVENT, gemeldet)
    vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementation(() => {
      throw new Error('voll')
    })
    p.backupPersistedState('{"alt":1}', 2)
    await new Promise((r) => setTimeout(r, 50))
    expect(gemeldet).toHaveBeenCalledTimes(1)
    window.removeEventListener(p.STORAGE_ERROR_EVENT, gemeldet)
  })

  it('zaehlt den Fuellstand auch auf der Rückfallebene', async () => {
    const p = await ohneIndexedDb()
    await p.persistState('{"a":"' + 'x'.repeat(2000) + '"}')
    p.backupPersistedState('y'.repeat(3000), 1)
    const info = await p.storageInfo()
    expect(info!.stateBytes).toBeGreaterThan(2000)
    expect(info!.usage).toBeGreaterThan(info!.stateBytes)
  })

  it('raeumt beim Zuruecksetzen auch die Rückfallebene', async () => {
    const p = await ohneIndexedDb()
    await p.persistState('{"a":1}')
    p.backupPersistedState('{"alt":1}', 1)
    localStorage.setItem('fremder-schluessel', 'bleibt')
    p.clearPersistedState()
    expect(localStorage.getItem(STATE_KEY)).toBeNull()
    expect(Object.keys(localStorage).filter((k) => k.startsWith(`${STATE_KEY}-backup`))).toEqual([])
    // Fremde Eintraege bleiben unangetastet — die App raeumt nur ihr eigenes.
    expect(localStorage.getItem('fremder-schluessel')).toBe('bleibt')
  })

  it('uebersteht ein Zuruecksetzen ohne localStorage', async () => {
    const p = await frischesModul()
    await p.preloadPersistedState()
    vi.spyOn(Object, 'keys').mockImplementationOnce(() => {
      throw new Error('kein localStorage')
    })
    expect(() => p.clearPersistedState()).not.toThrow()
  })

  it('meldet den Fuellstand auch ohne Angabe des Browsers zum Kontingent', async () => {
    const p = await frischesModul()
    await p.persistState('{"a":1}')
    // navigator.storage.estimate() fehlt (aeltere Browser, private Fenster):
    // Die eigene Groesse ist dann die einzige Auskunft, die es gibt.
    const alt = navigator.storage
    Object.defineProperty(navigator, 'storage', { value: undefined, configurable: true })
    const info = await p.storageInfo()
    expect(info).toEqual({ usage: info!.stateBytes, quota: 0, stateBytes: info!.stateBytes })
    Object.defineProperty(navigator, 'storage', { value: alt, configurable: true })
  })

  it('kommt ohne BroadcastChannel aus', async () => {
    // Aeltere Browser und manche privaten Fenster kennen ihn nicht. Ohne
    // Abgleich zwischen Tabs, aber ohne Absturz.
    const alt = globalThis.BroadcastChannel
    // @ts-expect-error - absichtlich entfernt, um den Ausfall zu pruefen
    delete globalThis.BroadcastChannel
    const p = await frischesModul()
    await expect(p.persistState('{"a":1}')).resolves.toBe(true)
    const ab = p.subscribeToOtherTabs(() => undefined)
    expect(() => ab()).not.toThrow()
    globalThis.BroadcastChannel = alt
  })
})

describe('Wenn selbst das Aufraeumen scheitert', () => {
  it('meldet leere Schluesselliste, statt den Fuellstand zu verweigern', async () => {
    // Ein Lesefehler beim Auflisten der Sicherungen darf nicht dazu fuehren,
    // dass die Fuellstandsanzeige im Admin-Bereich gar nichts mehr sagt.
    const p = await frischesModul()
    await p.persistState('{"a":1}')
    const echt = IDBObjectStore.prototype.getAllKeys
    vi.spyOn(IDBObjectStore.prototype, 'getAllKeys').mockImplementation(() => {
      throw new Error('Lesefehler')
    })
    const info = await p.storageInfo()
    expect(info).not.toBeNull()
    expect(info!.stateBytes).toBeGreaterThan(0)
    IDBObjectStore.prototype.getAllKeys = echt
  })

  it('gibt null zurueck, wenn schon der Zustand nicht lesbar ist', async () => {
    const p = await frischesModul()
    await p.persistState('{"a":1}')
    vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementation(() => {
      throw new Error('Lesefehler')
    })
    // Keine Auskunft ist besser als eine erfundene: Der Warnstreifen bleibt
    // dann aus, statt einen falschen Fuellstand zu behaupten.
    expect(await p.storageInfo()).toBeNull()
  })

  it('laesst sich vom Ausfall des localStorage beim Auflisten nicht stoeren', async () => {
    vi.spyOn(indexedDB, 'open').mockImplementation(() => {
      throw new Error('kaputt')
    })
    localStorage.setItem(STATE_KEY, '{"alt":true}')
    const p = await frischesModul()
    await p.preloadPersistedState()
    vi.spyOn(Object, 'keys').mockImplementationOnce(() => {
      throw new Error('kein localStorage')
    })
    const info = await p.storageInfo()
    expect(info).not.toBeNull()
  })
})

describe('Wenn das Oeffnen erst spaeter scheitert', () => {
  it('behandelt ein asynchron scheiterndes Oeffnen als Lesefehler', async () => {
    /* Der realistische Fall: `indexedDB.open` wirft NICHT, sondern liefert
       eine Anfrage, die danach mit einem Fehler antwortet (privates Fenster,
       verweigerte Zusage, beschaedigte Ablage). Ein synchron geworfener
       Fehler — wie in den Tests oben — nimmt einen anderen Weg durch den
       Code und laesst genau diesen Rueckruf ungeprueft. */
    vi.spyOn(indexedDB, 'open').mockImplementation(() => {
      const req: Record<string, unknown> = { result: null, error: new Error('privates Fenster') }
      setTimeout(() => (req.onerror as (() => void) | undefined)?.(), 0)
      return req as unknown as IDBOpenDBRequest
    })
    const p = await frischesModul()
    await p.preloadPersistedState()
    // Kein Altbestand und nicht lesbar: Es darf nichts geschrieben werden.
    expect(p.storageReadFailed()).toBe(true)
    await expect(p.persistState('{"neu":true}')).resolves.toBe(false)
  })
})

describe('Fehler der Datenbank selbst', () => {
  /**
   * Eine Transaktion, deren Anfrage fehlschlaegt bzw. die abbricht.
   *
   * Das ist der einzige Weg an die Fehlerrueckrufe der IndexedDB-API: Im
   * Normalbetrieb loest fake-indexeddb sie nicht aus. Bewusst so schmal
   * gehalten, dass weiterhin das Modul geprueft wird und nicht die
   * Nachbildung — die Attrappe reicht genau einen Fehler durch.
   */
  function transaktionMit(ausgang: 'error' | 'abort') {
    vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementation((() => {
      const req: Record<string, unknown> = { error: new Error('Plattenfehler') }
      const tx: Record<string, unknown> = {
        error: new Error('Plattenfehler'),
        objectStore: () => ({
          get: () => req,
          put: () => req,
          getAllKeys: () => req,
          delete: () => req,
          clear: () => req,
        }),
      }
      setTimeout(() => {
        ;(req.onerror as (() => void) | undefined)?.()
        ;(tx[`on${ausgang}`] as (() => void) | undefined)?.()
      }, 0)
      return tx as unknown as IDBTransaction
    }) as unknown as typeof IDBDatabase.prototype.transaction)
  }

  it('behandelt einen Lesefehler der Datenbank als unbekannten Bestand', async () => {
    // Nicht dasselbe wie „nichts gespeichert": Was nicht gelesen werden
    // konnte, darf nicht ueberschrieben werden.
    const vorbereiten = await frischesModul()
    await vorbereiten.persistState('{"echt":true}')
    transaktionMit('error')
    const p = await frischesModul()
    await p.preloadPersistedState()
    expect(p.storageReadFailed()).toBe(true)
  })

  it('meldet einen Schreibvorgang, der mittendrin abbricht', async () => {
    const p = await frischesModul()
    await p.preloadPersistedState()
    const gemeldet = vi.fn()
    window.addEventListener(p.STORAGE_ERROR_EVENT, gemeldet)
    transaktionMit('abort')
    await expect(p.persistState('{"x":1}')).resolves.toBe(false)
    expect(gemeldet).toHaveBeenCalledTimes(1)
    window.removeEventListener(p.STORAGE_ERROR_EVENT, gemeldet)
  })
})
