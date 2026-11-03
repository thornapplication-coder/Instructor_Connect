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

/*
 * Kein Schreibvorgang darf seine Testdatei überleben (Veröffentlichung
 * 1.26.0): Synchrone Tests ließen der IndexedDB-Nachbildung keinen Takt, ein
 * Vorgang lief nach dem Abbau der Umgebung zu Ende und fand kein `window`.
 * `src/test/setup.ts` wartet deshalb vor dem Abbau hierauf.
 */
describe('Laufende Schreibvorgänge abwarten', () => {
  it('ohne laufende Vorgänge: sofort fertig', async () => {
    const p = await frischesModul()
    await expect(p.schreibvorgaengeAbwarten()).resolves.toBeUndefined()
  })

  it('wartet auf begonnene Vorgänge — danach steht der jüngste Stand in der Ablage', async () => {
    const p = await frischesModul()
    await p.preloadPersistedState()
    let fertig = 0
    void p.persistState('{"n":1}').then(() => fertig++)
    void p.persistState('{"n":2}').then(() => fertig++)
    expect(fertig).toBe(0)
    await p.schreibvorgaengeAbwarten()
    expect(fertig).toBe(2)
    const p2 = await frischesModul()
    await p2.preloadPersistedState()
    expect(p2.readPreloadedState()).toBe('{"n":2}')
  })

  it('auch ein gescheiterter Vorgang gilt als abgeschlossen', async () => {
    const p = await frischesModul()
    await p.preloadPersistedState()
    vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementation(() => {
      throw new Error('voll')
    })
    const vorgang = p.persistState('{"x":1}')
    await p.schreibvorgaengeAbwarten()
    await expect(vorgang).resolves.toBe(false)
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

/** Alle Einträge der Ablage direkt aus IndexedDB — unabhängig vom Modul. */
async function ablage(): Promise<Record<string, string>> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open('instructor-connect', 1)
    req.onupgradeneeded = () => req.result.createObjectStore('kv')
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  const out = await new Promise<Record<string, string>>((resolve) => {
    const tx = db.transaction('kv')
    const st = tx.objectStore('kv')
    const out: Record<string, string> = {}
    st.openCursor().onsuccess = (e) => {
      const c = (e.target as IDBRequest<IDBCursorWithValue | null>).result
      if (!c) return resolve(out)
      out[String(c.key)] = c.value as string
      c.continue()
    }
  })
  db.close()
  return out
}

describe('Laden: was nicht geladen wird, wird beiseitegelegt (ladeStand)', () => {
  const gueltig = JSON.stringify({ v: 2, state: { users: [{ id: 'u1' }] } })

  it('übernimmt einen gültigen Stand und legt nichts beiseite', async () => {
    const p = await frischesModul()
    expect(p.ladeStand(gueltig, 2)).toEqual({ users: [{ id: 'u1' }] })
    expect(p.ladeStand(null, 2)).toBeNull()
    expect(p.ladeStand('', 2)).toBeNull()
    await new Promise((r) => setTimeout(r, 50))
    expect(Object.keys(await ablage())).toEqual([])
  })

  it('unlesbarer Rohstand: null UND Sicherung unter „…-backup-vunknown-…" (Audit 11/2026, TEC-06)', async () => {
    // Vorher lieferte der catch stumm null, und 400 ms später schrieb die
    // App den Seed über den einzigen vorhandenen Rohstand.
    const kaputt = gueltig.slice(0, Math.floor(gueltig.length / 2))
    const p = await frischesModul()
    expect(p.ladeStand(kaputt, 2)).toBeNull()
    await new Promise((r) => setTimeout(r, 50))
    const eintraege = Object.entries(await ablage())
    expect(eintraege).toHaveLength(1)
    expect(eintraege[0][0]).toMatch(/^aaa-state-backup-vunknown-\d+$/)
    expect(eintraege[0][1]).toBe(kaputt)
  })

  it('anderer Stand: Versionssprung, leere Nutzerliste, kein Objekt — jeweils gesichert', async () => {
    const p = await frischesModul()
    // Je Fall eine eigene Millisekunde: Der Schlüssel trägt den Zeitpunkt.
    for (const raw of [JSON.stringify({ v: 1, state: { users: [{ id: 'u1' }] } }), JSON.stringify({ v: 2, state: { users: [] } }), 'null', '"text"']) {
      expect(p.ladeStand(raw, 2)).toBeNull()
      await new Promise((r) => setTimeout(r, 5))
    }
    await new Promise((r) => setTimeout(r, 50))
    const schluessel = Object.keys(await ablage()).map((k) => k.replace(/-\d+$/, ''))
    expect(schluessel.sort()).toEqual(['aaa-state-backup-v1', 'aaa-state-backup-v2', 'aaa-state-backup-vunknown', 'aaa-state-backup-vunknown'])
  })
})

describe('Stand beiseitelegen — der Ausweg nach einem Absturz (Audit 11/2026, TEC-07)', () => {
  it('legt den Stand unter einen eigenen Schlüssel, lässt alte Sicherungen stehen und schreibt danach nichts mehr', async () => {
    const p = await frischesModul()
    await p.persistState('{"absturz":1}')
    p.backupPersistedState('{"alt":1}', 1)
    await new Promise((r) => setTimeout(r, 50))
    await expect(p.standBeiseitelegen()).resolves.toBe(true)
    const vorher = await ablage()
    expect(vorher[STATE_KEY]).toBeUndefined()
    const schluessel = Object.keys(vorher)
    // clearPersistedState taugte dafür nicht: Es räumt die Sicherungen mit.
    expect(schluessel.some((k) => k.startsWith('aaa-state-backup-v1-'))).toBe(true)
    const reset = schluessel.find((k) => k.startsWith('aaa-state-backup-reset-'))!
    expect(vorher[reset]).toBe('{"absturz":1}')
    // Bis zum Neuladen schreibt der Tab den Absturzstand nicht zurück.
    await expect(p.persistState('{"absturz":2}')).resolves.toBe(false)
    expect((await ablage())[STATE_KEY]).toBeUndefined()
  })

  it('ohne gespeicherten Stand gibt es nichts zu sichern', async () => {
    const p = await frischesModul()
    await expect(p.standBeiseitelegen()).resolves.toBe(true)
    expect(Object.keys(await ablage())).toEqual([])
  })

  it('auf der Rückfallebene (localStorage) ebenso', async () => {
    vi.spyOn(indexedDB, 'open').mockImplementation(() => {
      throw new Error('kein IndexedDB')
    })
    localStorage.setItem(STATE_KEY, '{"absturz":1}')
    const p = await frischesModul()
    await p.preloadPersistedState()
    await expect(p.standBeiseitelegen()).resolves.toBe(true)
    expect(localStorage.getItem(STATE_KEY)).toBeNull()
    const reset = Object.keys(localStorage).find((k) => k.startsWith('aaa-state-backup-reset-'))!
    expect(localStorage.getItem(reset)).toBe('{"absturz":1}')
  })

  it('scheitert die Sicherung, wird nichts gelöscht — und weiter gespeichert', async () => {
    const p = await frischesModul()
    await p.persistState('{"absturz":1}')
    const sabotage = vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementation(() => {
      throw new Error('voll')
    })
    await expect(p.standBeiseitelegen()).resolves.toBe(false)
    sabotage.mockRestore()
    expect((await ablage())[STATE_KEY]).toBe('{"absturz":1}')
    await expect(p.persistState('{"weiter":1}')).resolves.toBe(true)
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

describe('Start mit Zeitgrenze (Audit 11/2026, TEC-11)', () => {
  /**
   * Ein `indexedDB.open`, das nie antwortet — der Fall, den der Prüfer
   * simulierte: Nach 8 s stand kein einziges Zeichen da. Die Anfrage wird
   * zurückgegeben, damit ein Test sie nachträglich doch noch beantworten kann.
   */
  function haengendesOeffnen() {
    const anfragen: Record<string, unknown>[] = []
    vi.spyOn(indexedDB, 'open').mockImplementation(() => {
      const req: Record<string, unknown> = { result: null, error: null }
      anfragen.push(req)
      return req as unknown as IDBOpenDBRequest
    })
    return anfragen
  }

  beforeEach(() => {
    // Nur die Zeitgeber vortäuschen: fake-indexeddb plant seine Rückrufe
    // über setImmediate — die müssen echt bleiben.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('startet nach der Zeitgrenze, liest nichts und schreibt nichts', async () => {
    haengendesOeffnen()
    const p = await frischesModul()
    let fertig = false
    const laden = p.preloadPersistedState().then(() => (fertig = true))
    await vi.advanceTimersByTimeAsync(p.LESE_ZEITGRENZE_MS - 1)
    expect(fertig).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    await laden
    expect(fertig).toBe(true)
    // Keine Antwort ist kein Beleg für „nichts da": nicht schreiben, warnen.
    expect(p.storageReadFailed()).toBe(true)
    expect(p.readPreloadedState()).toBeNull()
    const gemeldet = vi.fn()
    window.addEventListener(p.STORAGE_ERROR_EVENT, gemeldet)
    await expect(p.persistState('{"seed":true}')).resolves.toBe(false)
    expect(gemeldet).toHaveBeenCalledOnce()
    expect(localStorage.getItem(STATE_KEY)).toBeNull()
    window.removeEventListener(p.STORAGE_ERROR_EVENT, gemeldet)
  })

  it('zeigt einen Altstand aus localStorage, schreibt aber auch dann nicht', async () => {
    // Anders als ein Fehler beim Öffnen sagt das Schweigen nicht, dass die
    // Datenbank leer ist — der Altstand könnte älter sein als ihr Inhalt.
    haengendesOeffnen()
    localStorage.setItem(STATE_KEY, '{"alt":true}')
    const p = await frischesModul()
    const laden = p.preloadPersistedState()
    await vi.advanceTimersByTimeAsync(p.LESE_ZEITGRENZE_MS)
    await laden
    expect(p.readPreloadedState()).toBe('{"alt":true}')
    expect(p.storageReadFailed()).toBe(true)
    await expect(p.persistState('{"neu":true}')).resolves.toBe(false)
    expect(localStorage.getItem(STATE_KEY)).toBe('{"alt":true}')
  })

  it('eine verspätete Antwort ändert am gelaufenen Start nichts — auch kein später Fehler', async () => {
    const anfragen = haengendesOeffnen()
    const p = await frischesModul()
    const laden = p.preloadPersistedState()
    await vi.advanceTimersByTimeAsync(p.LESE_ZEITGRENZE_MS)
    await laden
    // Die Datenbank meldet sich doch noch — mit einem Stand …
    const db = {
      transaction: () => ({
        objectStore: () => ({
          get: () => {
            const r: Record<string, unknown> = { result: '{"spaet":true}' }
            setTimeout(() => (r.onsuccess as () => void)(), 0)
            return r
          },
        }),
      }),
    }
    anfragen[0].result = db
    ;(anfragen[0].onsuccess as () => void)()
    await vi.advanceTimersByTimeAsync(10)
    // … den niemand mehr liest: Der Store hat längst gerendert.
    expect(p.readPreloadedState()).toBeNull()
    expect(p.storageReadFailed()).toBe(true)
  })

  it('ein später Fehler bleibt still (keine unbehandelte Ablehnung)', async () => {
    const anfragen = haengendesOeffnen()
    const unbehandelt = vi.fn()
    process.on('unhandledRejection', unbehandelt)
    const p = await frischesModul()
    const laden = p.preloadPersistedState()
    await vi.advanceTimersByTimeAsync(p.LESE_ZEITGRENZE_MS)
    await laden
    anfragen[0].error = new Error('später kaputt')
    ;(anfragen[0].onerror as () => void)()
    await vi.advanceTimersByTimeAsync(10)
    await new Promise((r) => setImmediate(r))
    process.off('unhandledRejection', unbehandelt)
    expect(unbehandelt).not.toHaveBeenCalled()
    expect(p.storageReadFailed()).toBe(true)
  })

  it('der normale Start räumt seinen Zeitgeber weg', async () => {
    const p = await frischesModul()
    await p.persistState('{"a":1}')
    const p2 = await frischesModul()
    await p2.preloadPersistedState()
    expect(p2.readPreloadedState()).toBe('{"a":1}')
    expect(vi.getTimerCount()).toBe(0)
    expect(p2.storageReadFailed()).toBe(false)
  })
})

describe('Bitte um dauerhafte Ablage — nie abgewartet (Audit 11/2026, TEC-11)', () => {
  const echt = Object.getOwnPropertyDescriptor(navigator, 'storage')
  const setzeStorage = (wert: unknown) => Object.defineProperty(navigator, 'storage', { value: wert, configurable: true })
  afterEach(() => {
    if (echt) Object.defineProperty(navigator, 'storage', echt)
    else delete (navigator as unknown as Record<string, unknown>).storage
  })

  it('der Start fragt gar nicht mehr — eine offene Abfrage hält ihn nicht auf', async () => {
    // Firefox fragt für persist() den Nutzer. Vorher wartete der Start auf
    // die Antwort, und solange blieb die App leer.
    const persist = vi.fn(() => new Promise<boolean>(() => undefined))
    setzeStorage({ persist })
    const p = await frischesModul()
    await p.preloadPersistedState()
    expect(persist).not.toHaveBeenCalled()
  })

  it('bittet, ohne zu warten, und schluckt Ablehnung, Ausnahme und Fehlen', async () => {
    const p = await frischesModul()
    const offen = vi.fn(() => new Promise<boolean>(() => undefined))
    setzeStorage({ persist: offen })
    expect(p.ablageDauerhaftBitten()).toBeUndefined()
    expect(offen).toHaveBeenCalledOnce()

    const unbehandelt = vi.fn()
    process.on('unhandledRejection', unbehandelt)
    setzeStorage({ persist: () => Promise.reject(new Error('verweigert')) })
    p.ablageDauerhaftBitten()
    await new Promise((r) => setTimeout(r, 10))
    process.off('unhandledRejection', unbehandelt)
    expect(unbehandelt).not.toHaveBeenCalled()

    setzeStorage({
      persist: () => {
        throw new Error('privates Fenster')
      },
    })
    expect(() => p.ablageDauerhaftBitten()).not.toThrow()
    setzeStorage({})
    expect(() => p.ablageDauerhaftBitten()).not.toThrow()
    setzeStorage(undefined)
    expect(() => p.ablageDauerhaftBitten()).not.toThrow()
  })
})

describe('Speichern klappt wieder — der Streifen darf gehen (Audit 11/2026, TEC-12)', () => {
  it('ein Fehlschlag meldet den Fehler, das folgende Gelingen meldet „ok"', async () => {
    const p = await frischesModul()
    await p.preloadPersistedState()
    const ereignisse: string[] = []
    const fehler = () => ereignisse.push('fehler')
    const ok = () => ereignisse.push('ok')
    window.addEventListener(p.STORAGE_ERROR_EVENT, fehler)
    window.addEventListener(p.STORAGE_OK_EVENT, ok)
    const sabotage = vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementation(() => {
      throw new Error('voll')
    })
    await expect(p.persistState('{"x":1}')).resolves.toBe(false)
    sabotage.mockRestore()
    await expect(p.persistState('{"x":2}')).resolves.toBe(true)
    expect(ereignisse).toEqual(['fehler', 'ok'])
    window.removeEventListener(p.STORAGE_ERROR_EVENT, fehler)
    window.removeEventListener(p.STORAGE_OK_EVENT, ok)
  })

  it('auch auf der Rückfallebene (localStorage)', async () => {
    vi.spyOn(indexedDB, 'open').mockImplementation(() => {
      throw new Error('kaputt')
    })
    localStorage.setItem(STATE_KEY, '{"alt":true}')
    const p = await frischesModul()
    await p.preloadPersistedState()
    const ok = vi.fn()
    window.addEventListener(p.STORAGE_OK_EVENT, ok)
    await expect(p.persistState('{"neu":true}')).resolves.toBe(true)
    expect(ok).toHaveBeenCalledOnce()
    window.removeEventListener(p.STORAGE_OK_EVENT, ok)
  })

  it('nach einem Lesefehler gibt es kein „ok" — dort wird ja nicht geschrieben', async () => {
    vi.spyOn(indexedDB, 'open').mockImplementation(() => {
      throw new Error('kaputt')
    })
    const p = await frischesModul()
    await p.preloadPersistedState()
    const ok = vi.fn()
    window.addEventListener(p.STORAGE_OK_EVENT, ok)
    await expect(p.persistState('{"neu":true}')).resolves.toBe(false)
    expect(ok).not.toHaveBeenCalled()
    window.removeEventListener(p.STORAGE_OK_EVENT, ok)
  })
})
