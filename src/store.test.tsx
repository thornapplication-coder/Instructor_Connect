import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { registriereOffeneArbeit } from './editGuard'
import { NACHFRIST_MS } from './sitzungsablauf'
import { StoreProvider, useStore } from './store'

/**
 * Ebene 2: der 5-Sekunden-Takt des Stores und das Abmelden.
 *
 * - Audit 11/2026, TEC-04: Um Mitternacht warf der Takt ohne Rückfrage aus
 *   einem offenen Formular; die geleisteten Unterschriften waren weg.
 * - Audit 11/2026, TEC-14: Nur der Abmelde-Knopf sendete „ic-abmelden".
 *   Sitzungsablauf, Deaktivierung und das Abmelden in einem anderen Tab
 *   ließen die DocCheck-Dokumente im Speicher.
 *
 * Die Uhr ist vorgestellt (Fake-Timer samt Date), der Store echt.
 */

const KURZ_VOR_MITTERNACHT = new Date(2026, 10, 2, 23, 59, 30)

function Sonde() {
  const { currentUser, sessionExpired, logout } = useStore()
  return (
    <div>
      <p data-testid="nutzer">{currentUser?.id ?? 'abgemeldet'}</p>
      <p data-testid="warnung">{String(sessionExpired)}</p>
      <button onClick={logout}>abmelden</button>
    </div>
  )
}

const nutzer = () => screen.getByTestId('nutzer').textContent
const warnung = () => screen.getByTestId('warnung').textContent
const vorspulen = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })

let abmeldungen: ReturnType<typeof vi.fn<(e: Event) => void>>
let arbeitAbmelden: (() => void) | undefined

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date'] })
  vi.setSystemTime(KURZ_VOR_MITTERNACHT)
  const ende = new Date(KURZ_VOR_MITTERNACHT)
  ende.setHours(23, 59, 59, 999)
  localStorage.setItem('aaa-user', 'u-patrick')
  localStorage.setItem('aaa-session-exp', String(ende.getTime()))
  abmeldungen = vi.fn<(e: Event) => void>()
  window.addEventListener('ic-abmelden', abmeldungen)
})

afterEach(() => {
  arbeitAbmelden?.()
  arbeitAbmelden = undefined
  window.removeEventListener('ic-abmelden', abmeldungen)
  localStorage.clear()
  vi.useRealTimers()
})

describe('Sitzungsablauf im Takt (TEC-04)', () => {
  it('ohne offene Arbeit: nach Mitternacht abgemeldet — „ic-abmelden" genau einmal', async () => {
    render(<StoreProvider><Sonde /></StoreProvider>)
    expect(nutzer()).toBe('u-patrick')
    await vorspulen(35_000)
    expect(nutzer()).toBe('abgemeldet')
    expect(warnung()).toBe('false')
    await vorspulen(30_000)
    expect(abmeldungen).toHaveBeenCalledOnce()
    // Der abgelaufene Eintrag bleibt stehen: Gelöscht hieße er für einen
    // zweiten Tab „ausdrücklich abgemeldet" — und der schlösse dort ein
    // offenes Formular trotz Nachfrist.
    expect(localStorage.getItem('aaa-session-exp')).not.toBeNull()
  })

  it('mit offener Arbeit: Warnung statt Abmeldung, abgemeldet erst nach dem Abschließen', async () => {
    let offen = true
    arbeitAbmelden = registriereOffeneArbeit(() => offen)
    render(<StoreProvider><Sonde /></StoreProvider>)
    await vorspulen(35_000)
    // Der Fall aus dem Audit: Formular offen, Mitternacht vorbei.
    expect(nutzer()).toBe('u-patrick')
    expect(warnung()).toBe('true')
    expect(abmeldungen).not.toHaveBeenCalled()
    await vorspulen(10 * 60_000)
    expect(nutzer()).toBe('u-patrick')
    offen = false
    await vorspulen(5000)
    expect(nutzer()).toBe('abgemeldet')
    expect(warnung()).toBe('false')
    expect(abmeldungen).toHaveBeenCalledOnce()
  })

  it('mit offener Arbeit höchstens bis zum Ende der Nachfrist', async () => {
    arbeitAbmelden = registriereOffeneArbeit(() => true)
    render(<StoreProvider><Sonde /></StoreProvider>)
    await vorspulen(35_000)
    expect(nutzer()).toBe('u-patrick')
    await vorspulen(NACHFRIST_MS)
    expect(nutzer()).toBe('abgemeldet')
    expect(abmeldungen).toHaveBeenCalledOnce()
  })
})

describe('Jedes Abmelden verwirft die DocCheck-Sitzung (TEC-14)', () => {
  it('der Abmelde-Knopf: „ic-abmelden" genau einmal', async () => {
    render(<StoreProvider><Sonde /></StoreProvider>)
    fireEvent.click(screen.getByRole('button', { name: 'abmelden' }))
    expect(nutzer()).toBe('abgemeldet')
    await vorspulen(20_000)
    expect(abmeldungen).toHaveBeenCalledOnce()
  })

  it('Abmelden in einem anderen Tab: hier ebenfalls abgemeldet, auch mit offener Arbeit', async () => {
    arbeitAbmelden = registriereOffeneArbeit(() => true)
    render(<StoreProvider><Sonde /></StoreProvider>)
    // Der andere Tab räumt die gemeinsame Anmeldung weg (persistUser(null)).
    localStorage.removeItem('aaa-user')
    localStorage.removeItem('aaa-session-exp')
    await vorspulen(5000)
    expect(nutzer()).toBe('abgemeldet')
    expect(abmeldungen).toHaveBeenCalledOnce()
  })

  it('wer gar nicht angemeldet war, löst nichts aus', async () => {
    localStorage.clear()
    render(<StoreProvider><Sonde /></StoreProvider>)
    expect(nutzer()).toBe('abgemeldet')
    await vorspulen(20_000)
    expect(abmeldungen).not.toHaveBeenCalled()
  })
})

describe('Takt ohne Neuzeichnen (Audit 11/2026, TEC-10)', () => {
  /*
   * Der Takt gab bei JEDEM Schlag `{ ...s }` zurück: neue Referenz, die
   * ganze App zeichnete neu — im Chat mit einem Jahr Nachrichten ein Long
   * Task von bis zu 270 ms alle fünf Sekunden. Jetzt ändert er den Zustand
   * nur, wenn er abmeldet; was die Zeit am Bestand ändert, rechnet der Store
   * genau an der Grenze neu (naechsteZeitgrenze).
   */
  const MITTAG = new Date(2026, 10, 2, 12, 0, 0)

  let renders = 0
  const zustaende: unknown[] = []
  let laden: ReturnType<typeof useStore> | null = null

  function Zaehler() {
    const store = useStore()
    renders++
    zustaende.push(store.state)
    laden = store
    return null
  }

  beforeEach(() => {
    vi.setSystemTime(MITTAG)
    const ende = new Date(MITTAG)
    ende.setHours(23, 59, 59, 999)
    localStorage.setItem('aaa-session-exp', String(ende.getTime()))
    renders = 0
    zustaende.length = 0
    laden = null
  })

  it('ohne Änderung: keine neue Zustandsreferenz, kein Neuzeichnen — die Sitzungsprüfung läuft weiter', async () => {
    render(<StoreProvider><Sonde /><Zaehler /></StoreProvider>)
    await vorspulen(1000)
    const nachStart = renders
    const zustand = zustaende[zustaende.length - 1]
    await vorspulen(60_000)
    expect(renders).toBe(nachStart)
    expect(zustaende[zustaende.length - 1]).toBe(zustand)
    expect(nutzer()).toBe('u-patrick')
    // Die Prüfung selbst ist noch da: Wer im anderen Tab abgemeldet wird,
    // ist es hier spätestens nach dem nächsten Schlag auch.
    localStorage.removeItem('aaa-user')
    localStorage.removeItem('aaa-session-exp')
    await vorspulen(5000)
    expect(nutzer()).toBe('abgemeldet')
  })

  it('eine Nachricht verschwindet genau an ihrer Frist — ein Neuzeichnen, nicht zwölf je Minute', async () => {
    render(<StoreProvider><Zaehler /></StoreProvider>)
    const gruppe = laden!.myGroups.find((g) => g.retention === '7d')!
    expect(gruppe).toBeDefined()
    const frist = 7 * 24 * 3600_000
    act(() => laden!.sendMessage(gruppe.id, 'läuft ab'))
    const meine = () => laden!.visibleMessages(gruppe.id).filter((m) => m.text === 'läuft ab')
    expect(meine()).toHaveLength(1)
    // Per Sandbox-Zeitreise bis 10 s vor die Frist.
    act(() => laden!.advanceTime(frist - 10_000))
    await vorspulen(100)
    expect(meine()).toHaveLength(1)
    const vorher = renders
    await vorspulen(9_000)
    expect(renders).toBe(vorher)
    expect(meine()).toHaveLength(1)
    await vorspulen(1_000)
    // Genau an der Grenze: neu gerechnet, die Nachricht ist weg.
    expect(meine()).toHaveLength(0)
    expect(renders).toBe(vorher + 1)
  })
})

describe('Zwei Tabs: beide Änderungen bleiben (Audit 11/2026, TEC-13)', () => {
  /*
   * Der Fall aus dem Audit: Dieser Tab ändert etwas, die Sicherung wartet
   * noch 400 ms — da ruft der andere Tab seinen Stand mit einer EIGENEN
   * Änderung aus. Vorher galt „der Jüngere gewinnt" für den ganzen Stand:
   * Eine der beiden Änderungen war weg, auch nach dem Neuladen.
   */
  let laden: ReturnType<typeof useStore> | null = null
  function Griff() {
    laden = useStore()
    return null
  }

  it('eigene Notiz in der Warteschleife + fremde Notiz → beide da, und der gemeinsame Stand wird gerufen', async () => {
    render(<StoreProvider><Griff /></StoreProvider>)
    const start = laden!.state
    const andererTab = new BroadcastChannel('aaa-state-sync')
    const gehoert: string[] = []
    andererTab.addEventListener('message', (e) => gehoert.push(e.data as string))

    // Dieser Tab: eigene Notiz, Sicherung steht noch im Zeitgeber.
    act(() => laden!.saveNote({ title: 'Tab B', body: 'hier' }))
    // Der andere Tab: sein Stand mit SEINER Notiz — er kennt unsere nicht.
    const fremd = { ...start, notes: [...(start.notes ?? []), { id: 'n-tab-a', authorId: 'u-patrick', title: 'Tab A', body: 'dort', createdAt: 1, updatedAt: 1 }] }
    andererTab.postMessage(JSON.stringify({ v: 2, state: fremd, at: 0 }))
    await act(async () => {
      // BroadcastChannel liefert über die Ereignisschleife, nicht über Zeitgeber.
      for (let i = 0; i < 20 && !laden!.state.notes?.some((n) => n.id === 'n-tab-a'); i++) await new Promise((r) => setImmediate(r))
    })
    const titel = () => (laden!.state.notes ?? []).map((n) => n.title).sort()
    expect(titel()).toEqual(expect.arrayContaining(['Tab A', 'Tab B']))

    // Gesichert und ausgerufen wird der GEMEINSAME Stand — sonst übernähme
    // der andere Tab einen Stand ohne seine eigene Notiz.
    await vorspulen(400)
    await act(async () => {
      for (let i = 0; i < 50 && gehoert.length === 0; i++) await new Promise((r) => setImmediate(r))
    })
    expect(gehoert.length).toBeGreaterThan(0)
    const gerufen = JSON.parse(gehoert[gehoert.length - 1]) as { state: { notes: { title: string }[] } }
    expect(gerufen.state.notes.map((n) => n.title)).toEqual(expect.arrayContaining(['Tab A', 'Tab B']))
    andererTab.close()
  })

  it('hier bearbeitet, im anderen Tab weiterbearbeitet → die NEUERE Fassung gilt, und hier wird nichts zurückgeschrieben', async () => {
    // Der Alltag: Notiz in Tab A anlegen, in Tab B weiterschreiben. Mit dem
    // Startstand als Basis sähe B's Fassung wie ein Konflikt aus — und A's
    // ältere gewänne (Gegenprobe: basisWaehlen umgehen macht diesen Test rot).
    render(<StoreProvider><Griff /></StoreProvider>)
    const andererTab = new BroadcastChannel('aaa-state-sync')
    const gehoert: string[] = []
    andererTab.addEventListener('message', (e) => gehoert.push(e.data as string))
    const warteAufRuf = async (anzahl: number) =>
      act(async () => {
        for (let i = 0; i < 50 && gehoert.length < anzahl; i++) await new Promise((r) => setImmediate(r))
      })

    act(() => laden!.saveNote({ title: 'Notiz', body: 'Fassung A' }))
    await vorspulen(400)
    await warteAufRuf(1)
    const unserer = JSON.parse(gehoert[0]) as { von: string; id: string; state: { notes: { title: string; body: string }[] } }
    expect(unserer.von).toMatch(/^tab-/)

    // Der andere Tab hat unseren Stand übernommen und weitergeschrieben.
    const fremd = { ...unserer.state, notes: unserer.state.notes.map((n) => (n.title === 'Notiz' ? { ...n, body: 'Fassung B' } : n)) }
    andererTab.postMessage(JSON.stringify({ v: 2, at: 0, von: 'tab-b', id: 'stand-b1', basen: { [unserer.von]: unserer.id }, state: fremd }))
    await act(async () => {
      for (let i = 0; i < 50 && !laden!.state.notes?.some((n) => n.body === 'Fassung B'); i++) await new Promise((r) => setImmediate(r))
    })
    expect(laden!.state.notes?.find((n) => n.title === 'Notiz')?.body).toBe('Fassung B')
    // Nichts Eigenes beizutragen: kein Zurückschreiben, kein Hin und Her.
    await vorspulen(1000)
    await act(async () => {
      for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r))
    })
    expect(gehoert).toHaveLength(1)
    andererTab.close()
  })
})
