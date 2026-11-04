import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSeedState } from './sandbox/seed'
import {
  ablageDauerhaft,
  fehlendeApis,
  geraetPruefen,
  laufMerken,
  letzterLauf,
  LETZTER_LAUF_KEY,
  selbsttestAusfuehren,
  startPruefungFaellig,
  swAuskunftLesen,
  swFragen,
  swStand,
  SW_ZEITGRENZE_MS,
  type GeraetZugriff,
} from './selbsttestGeraet'

/**
 * Selbsttest, Teil Gerät (Ebene 2): was der Browser hergibt, und dass keine
 * Messung hängen bleibt. Bewertet wird in selbsttest.ts (Ebene 1).
 */

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('fehlende Browser-Funktionen', () => {
  it('nennt genau, was fehlt', () => {
    const w = { indexedDB: {}, crypto: { subtle: { digest: () => 0 } }, Worker: function () {}, Intl, navigator: {}, caches: undefined } as unknown as Window & typeof globalThis
    expect(fehlendeApis(w)).toEqual(['serviceWorker', 'caches', 'storage.estimate'])
    const leer = { navigator: {} } as unknown as Window & typeof globalThis
    expect(fehlendeApis(leer)).toEqual(['indexedDB', 'crypto.subtle', 'Worker', 'Intl', 'serviceWorker', 'caches', 'storage.estimate'])
  })
})

describe('dauerhafte Ablage', () => {
  it('fragt navigator.storage.persisted — sagt der Browser nichts, ist es offen', async () => {
    vi.stubGlobal('navigator', { storage: { persisted: async () => true } })
    expect(await ablageDauerhaft()).toBe(true)
    vi.stubGlobal('navigator', { storage: { persisted: async () => false } })
    expect(await ablageDauerhaft()).toBe(false)
    vi.stubGlobal('navigator', { storage: {} })
    expect(await ablageDauerhaft()).toBeNull()
    vi.stubGlobal('navigator', {
      storage: {
        persisted: async () => {
          throw new Error('nein')
        },
      },
    })
    expect(await ablageDauerhaft()).toBeNull()
  })
})

describe('Auskunft des Service Workers', () => {
  it('liest nur eine vollständige Antwort', () => {
    expect(swAuskunftLesen({ cache: 'ic-a', gesamt: 3, fehlend: 0 })).toEqual({ cache: 'ic-a', gesamt: 3, fehlend: 0 })
    expect(swAuskunftLesen({ cache: 'ic-a', gesamt: 3 })).toBeNull()
    expect(swAuskunftLesen({ cache: 1, gesamt: 3, fehlend: 0 })).toBeNull()
    expect(swAuskunftLesen(null)).toBeNull()
  })

  /** Ein Worker, der über den mitgeschickten Port antwortet — wie sw.js. */
  const antwortet = (antwort: unknown) =>
    ({
      postMessage: (nachricht: { type: string }, [port]: MessagePort[]) => {
        expect(nachricht).toEqual({ type: 'SELBSTTEST' })
        port.postMessage(antwort)
      },
    }) as unknown as ServiceWorker

  it('fragt über einen eigenen Kanal und liest die Antwort', async () => {
    expect(await swFragen(antwortet({ cache: 'ic-a', gesamt: 40, fehlend: 2 }))).toEqual({ cache: 'ic-a', gesamt: 40, fehlend: 2 })
    expect(await swFragen(antwortet({ unsinn: true }))).toBeNull()
  })

  it('ohne steuernden Worker: nichts; ein alter Worker ohne SELBSTTEST: nach der Zeitgrenze nichts', async () => {
    expect(await swFragen(null)).toBeNull()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const stumm = { postMessage: () => undefined } as unknown as ServiceWorker
    const frage = swFragen(stumm)
    await vi.advanceTimersByTimeAsync(SW_ZEITGRENZE_MS + 1)
    expect(await frage).toBeNull()
  })

  it('wirft postMessage, ist das Ergebnis nichts — kein Absturz', async () => {
    const kaputt = {
      postMessage: () => {
        throw new Error('weg')
      },
    } as unknown as ServiceWorker
    expect(await swFragen(kaputt)).toBeNull()
  })
})

describe('Stand von Offline-Cache und Version', () => {
  const steuernd = (antwort: unknown) =>
    ({
      postMessage: (_n: unknown, [port]: MessagePort[]) => port.postMessage(antwort),
    }) as unknown as ServiceWorker

  it('ohne Service-Worker-Unterstützung: kein Offline-Start', async () => {
    vi.stubGlobal('navigator', {})
    expect(await swStand(true)).toEqual({ offline: { unterstuetzt: false, aktiv: false, steuert: false, gesamt: 0, fehlend: 0 }, version: null })
  })

  it('online: fragt nach einer neueren Version — wartet eine, ist das ein Hinweis', async () => {
    const reg = { active: {}, waiting: null as unknown, installing: null as unknown, update: vi.fn(async () => (reg.installing = {})) }
    vi.stubGlobal('navigator', { serviceWorker: { controller: steuernd({ cache: 'ic-a', gesamt: 5, fehlend: 0 }), getRegistration: async () => reg } })
    const s = await swStand(true)
    expect(reg.update).toHaveBeenCalledOnce()
    expect(s).toEqual({ offline: { unterstuetzt: true, aktiv: true, steuert: true, gesamt: 5, fehlend: 0 }, version: { aktiv: 'ic-a', server: 'ic-a', wartet: true } })
  })

  it('offline: keine Update-Frage; scheitert sie online, bleibt der Serverstand offen', async () => {
    const reg = { active: {}, waiting: null, installing: null, update: vi.fn(async () => Promise.reject(new Error('netz'))) }
    vi.stubGlobal('navigator', { serviceWorker: { controller: steuernd({ cache: 'ic-a', gesamt: 5, fehlend: 1 }), getRegistration: async () => reg } })
    expect((await swStand(false)).version).toEqual({ aktiv: 'ic-a', server: null, wartet: false })
    expect(reg.update).not.toHaveBeenCalled()
    expect((await swStand(true)).version).toEqual({ aktiv: 'ic-a', server: null, wartet: false })
  })

  it('erster Besuch: registriert, aber steuert die Seite noch nicht', async () => {
    vi.stubGlobal('navigator', {
      serviceWorker: {
        controller: null,
        getRegistration: async () => {
          throw new Error('noch nicht')
        },
      },
    })
    expect(await swStand(true)).toEqual({ offline: { unterstuetzt: true, aktiv: false, steuert: false, gesamt: 0, fehlend: 0 }, version: { aktiv: null, server: null, wartet: false } })
  })
})

describe('alle Geräteprüfungen', () => {
  const gesund: GeraetZugriff = {
    apis: () => [],
    speicher: async () => ({ ok: true, ms: 4 }),
    dauerhaft: async () => true,
    fuellstand: async () => ({ usage: 1e6, quota: 1e9 }),
    server: async () => ({ erreichbar: true, datum: new Date(1_000_000).toUTCString(), gesendet: 1_000_000, empfangen: 1_000_000 }),
    sw: async () => ({ offline: { unterstuetzt: true, aktiv: true, steuert: true, gesamt: 40, fehlend: 0 }, version: { aktiv: 'ic-abc', server: 'ic-abc', wartet: false } }),
  }

  it('gesundes Gerät: alles ok, in fester Reihenfolge', async () => {
    const es = await geraetPruefen(gesund)
    expect(es.map((e) => [e.id, e.stufe])).toEqual([
      ['browser', 'ok'],
      ['speicher', 'ok'],
      ['dauerhaft', 'ok'],
      ['fuellstand', 'ok'],
      ['netz', 'ok'],
      ['uhr', 'ok'],
      ['offline', 'ok'],
      ['version', 'ok'],
    ])
  })

  it('ohne Netz: Uhr und Version offen, das Gerät fragt den Worker trotzdem', async () => {
    const sw = vi.fn(gesund.sw)
    const es = await geraetPruefen({ ...gesund, server: async () => ({ erreichbar: false, datum: null, gesendet: 0, empfangen: 0 }), sw })
    expect(sw).toHaveBeenCalledWith(false)
    expect(es.find((e) => e.id === 'netz')!.stufe).toBe('hinweis')
    expect(es.find((e) => e.id === 'uhr')!.stufe).toBe('offen')
  })

  it('Uhr 20 Minuten vor: Fehler', async () => {
    const es = await geraetPruefen({ ...gesund, server: async () => ({ erreichbar: true, datum: new Date(0).toUTCString(), gesendet: 20 * 60_000, empfangen: 20 * 60_000 }) })
    expect(es.find((e) => e.id === 'uhr')).toMatchObject({ stufe: 'fehler', variante: 'vorMinuten', zahl: 20 })
  })
})

describe('der ganze Lauf', () => {
  const geraet: GeraetZugriff = {
    apis: () => [],
    speicher: async () => ({ ok: true, ms: 1 }),
    dauerhaft: async () => true,
    fuellstand: async () => ({ usage: 1, quota: 100 }),
    server: async () => ({ erreichbar: false, datum: null, gesendet: 0, empfangen: 0 }),
    sw: async () => ({ offline: null, version: null }),
  }
  // Wie der Seed: relativ zur Uhr, nicht zu einem festen Datum (Zeitsprung-Lauf)
  const JETZT = Date.now()

  it('nur das Gerät, wenn weder Datenbestand noch DocCheck freigegeben sind', async () => {
    const es = await selbsttestAusfuehren({ state: createSeedState(), jetzt: JETZT, daten: false, docCheck: false, geraet })
    expect(new Set(es.map((e) => e.gruppe))).toEqual(new Set(['geraet']))
  })

  it('mit Datenbestand: Regeln und Fingerabdrücke; mit DocCheck: die Probe', async () => {
    const probe = vi.fn(async () => [{ id: 'doccheckPruefen', gruppe: 'doccheck' as const, stufe: 'ok' as const }])
    const es = await selbsttestAusfuehren({ state: createSeedState(), jetzt: JETZT, daten: true, docCheck: true, geraet, docCheckLader: async () => probe })
    expect(es.filter((e) => e.gruppe === 'daten').map((e) => e.id)).toEqual(['superadmin', 'adressen', 'muster', 'gruppenVerweise', 'ohneGruppe', 'doccheckRegel', 'struktur', 'zeiten', 'fingerabdruck', 'altbestand'])
    expect(probe).toHaveBeenCalledOnce()
    expect(es.at(-1)).toEqual({ id: 'doccheckPruefen', gruppe: 'doccheck', stufe: 'ok' })
  })

  it('Zeiten im Bestand gegen die Zeit der App — der Sandbox-Zeitraffer erzeugt keine „Zukunft"', async () => {
    const st = createSeedState()
    const vorgespult = { ...st, timeOffsetMs: 31 * 86_400_000 }
    vorgespult.gradingRecords = [{ ...st.gradingRecords[0], signedAt: JETZT + 30 * 86_400_000 }, ...st.gradingRecords.slice(1)]
    const zeiten = async (s: typeof st) => (await selbsttestAusfuehren({ state: s, jetzt: JETZT, daten: true, docCheck: false, geraet })).find((e) => e.id === 'zeiten')!.stufe
    expect(await zeiten(vorgespult)).toBe('ok')
    expect(await zeiten({ ...vorgespult, timeOffsetMs: 0 })).toBe('hinweis')
  })

  it('lässt sich DocCheck nicht laden (offline, nie geöffnet): nicht prüfbar, nicht rot', async () => {
    const es = await selbsttestAusfuehren({ state: createSeedState(), jetzt: JETZT, daten: false, docCheck: true, geraet, docCheckLader: async () => Promise.reject(new Error('offline')) })
    expect(es.at(-1)).toEqual({ id: 'doccheckLesen', gruppe: 'doccheck', stufe: 'offen', variante: 'nichtGeladen' })
  })

  it('ohne Worker im Browser (hier: jsdom) scheitert die echte Probe sauber — kein Wurf', async () => {
    const es = await selbsttestAusfuehren({ state: createSeedState(), jetzt: JETZT, daten: false, docCheck: true, geraet })
    expect(es.filter((e) => e.gruppe === 'doccheck').map((e) => [e.id, e.stufe])).toEqual([
      ['doccheckLesen', 'fehler'],
      ['doccheckPruefen', 'offen'],
    ])
  })
})

describe('letzter Lauf je Gerät', () => {
  afterEach(() => localStorage.clear())
  const JETZT = new Date(2026, 10, 4, 12).getTime()

  it('merkt Zeit und Gesamtstufe und ist danach für heute erledigt', () => {
    expect(startPruefungFaellig(JETZT)).toBe(true)
    laufMerken([{ id: 'uhr', gruppe: 'geraet', stufe: 'hinweis' }], JETZT)
    expect(letzterLauf()).toEqual({ zeit: JETZT, stufe: 'hinweis' })
    expect(startPruefungFaellig(JETZT + 3600_000)).toBe(false)
    expect(startPruefungFaellig(JETZT + 24 * 3600_000)).toBe(true)
  })

  it('privater Modus (localStorage wirft): kein Absturz, der Check gilt als fällig', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceeded')
    })
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    expect(() => laufMerken([], JETZT)).not.toThrow()
    expect(letzterLauf()).toBeNull()
    expect(startPruefungFaellig(JETZT)).toBe(true)
    vi.restoreAllMocks()
    expect(localStorage.getItem(LETZTER_LAUF_KEY)).toBeNull()
  })
})
