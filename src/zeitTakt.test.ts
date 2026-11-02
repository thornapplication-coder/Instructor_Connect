import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { jetztAbonnieren, jetztStand, naechsteMitternacht, naechsteZeitgrenze, type ZeitBestand } from './zeitTakt'

/**
 * Ebene 1: Wann ändert die Zeit etwas am Bestand? (Audit 11/2026, TEC-10)
 *
 * Bisher beantwortete das niemand — der Store zeichnete einfach alle fünf
 * Sekunden die ganze App neu. Jetzt rechnet er genau an den Grenzen, die
 * diese Funktion nennt, und sonst nie. Liegt sie zu spät, bleibt eine
 * abgelaufene Nachricht stehen; liegt sie zu früh, ist nur Arbeit verschenkt.
 */

const T = new Date(2026, 10, 2, 12, 0, 0).getTime()
const H = 3600_000
const MITTERNACHT = new Date(2026, 10, 3, 0, 0, 0).getTime()

const bestand = (teil: Partial<ZeitBestand> = {}): ZeitBestand => ({
  messages: [],
  polls: [],
  groups: [
    { id: 'g24', retention: '24h' },
    { id: 'gStd', retention: null },
    { id: 'gNie', retention: 'never' },
  ],
  defaultRetention: '7d',
  ...teil,
})

describe('naechsteMitternacht', () => {
  it('liefert den Beginn des nächsten lokalen Tages — auch genau um Mitternacht', () => {
    expect(naechsteMitternacht(T)).toBe(MITTERNACHT)
    expect(naechsteMitternacht(MITTERNACHT)).toBe(new Date(2026, 10, 4).getTime())
    expect(naechsteMitternacht(MITTERNACHT - 1)).toBe(MITTERNACHT)
  })
})

describe('naechsteZeitgrenze', () => {
  it('ohne Nachrichten und Umfragen: der Tageswechsel', () => {
    // Daran hängen Info-Gültigkeit, die Wochenfrist der Formularliste und
    // jede Datumsanzeige.
    expect(naechsteZeitgrenze(bestand(), T)).toBe(MITTERNACHT)
  })

  it('eine Nachricht läuft nach der Frist IHRER Gruppe ab', () => {
    const b = bestand({ messages: [{ groupId: 'g24', createdAt: T - 23 * H }] })
    expect(naechsteZeitgrenze(b, T)).toBe(T + H)
    // Gruppe ohne eigene Frist: die Vorgabe der Einstellungen (7 Tage).
    const std = bestand({ messages: [{ groupId: 'gStd', createdAt: T - 7 * 24 * H + 5 * 60_000 }] })
    expect(naechsteZeitgrenze(std, T)).toBe(T + 5 * 60_000)
  })

  it('nimmt die früheste Grenze, aber nie eine vergangene oder die Gegenwart', () => {
    const b = bestand({
      messages: [
        { groupId: 'g24', createdAt: T - 22 * H },
        { groupId: 'g24', createdAt: T - 23 * H },
        // schon abgelaufen — liegt hinter uns
        { groupId: 'g24', createdAt: T - 30 * H },
        // läuft genau jetzt ab — ebenfalls keine Grenze mehr
        { groupId: 'g24', createdAt: T - 24 * H },
      ],
    })
    expect(naechsteZeitgrenze(b, T)).toBe(T + H)
  })

  it('„nie löschen" und Nachrichten ohne Gruppe setzen keine Grenze', () => {
    const b = bestand({ messages: [{ groupId: 'gNie', createdAt: T - 1 }, { groupId: 'weg', createdAt: T - 23 * H }] })
    expect(naechsteZeitgrenze(b, T)).toBe(MITTERNACHT)
  })

  it('Umfragen: Ablauf der Frist UND Schluss über validUntil', () => {
    expect(naechsteZeitgrenze(bestand({ polls: [{ groupId: 'g24', createdAt: T - 23.5 * H }] }), T)).toBe(T + 0.5 * H)
    // Die Umfrage schließt um 12:10 — lange vor ihrem Ablauf.
    expect(naechsteZeitgrenze(bestand({ polls: [{ groupId: 'gStd', createdAt: T, validUntil: T + 10 * 60_000 }] }), T)).toBe(T + 10 * 60_000)
    // Ein vergangenes validUntil zählt nicht, auch nicht in fremder Gruppe.
    expect(naechsteZeitgrenze(bestand({ polls: [{ groupId: 'weg', createdAt: T, validUntil: T - 1 }] }), T)).toBe(MITTERNACHT)
  })

  it('eine Grenze nach Mitternacht verdrängt den Tageswechsel nicht', () => {
    const b = bestand({ messages: [{ groupId: 'gStd', createdAt: T }] })
    expect(naechsteZeitgrenze(b, T)).toBe(MITTERNACHT)
  })
})

describe('Takt für einzelne Ansichten', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
    vi.setSystemTime(T)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('meldet jeden Schlag allen Abonnenten — mit EINEM Zeitgeber je Intervall', () => {
    const a = vi.fn()
    const b = vi.fn()
    const abA = jetztAbonnieren(60_000, a)
    const abB = jetztAbonnieren(60_000, b)
    expect(vi.getTimerCount()).toBe(1)
    expect(jetztStand(60_000)).toBe(T)
    vi.advanceTimersByTime(60_000)
    expect(a).toHaveBeenCalledOnce()
    expect(b).toHaveBeenCalledOnce()
    expect(jetztStand(60_000)).toBe(T + 60_000)
    abA()
    vi.advanceTimersByTime(60_000)
    expect(a).toHaveBeenCalledOnce()
    expect(b).toHaveBeenCalledTimes(2)
    abB()
    // Der letzte Abmelder hält den Zeitgeber an — kein Takt ins Leere.
    expect(vi.getTimerCount()).toBe(0)
  })

  it('der Stand bleibt zwischen zwei Schlägen gleich', () => {
    const ab = jetztAbonnieren(5000, () => undefined)
    const vorher = jetztStand(5000)
    vi.advanceTimersByTime(4999)
    expect(jetztStand(5000)).toBe(vorher)
    vi.advanceTimersByTime(1)
    expect(jetztStand(5000)).toBe(vorher + 5000)
    ab()
  })

  it('ein ruhender Takt liefert dem ersten neuen Abonnenten frische Zeit', () => {
    // Stand abgefragt (Render), aber nie abonniert — dann eine Stunde Ruhe.
    expect(jetztStand(60_000)).toBe(T)
    vi.setSystemTime(T + H)
    const ab = jetztAbonnieren(60_000, () => undefined)
    expect(jetztStand(60_000)).toBe(T + H)
    ab()
    // Kurz danach wieder abonniert: kein Sprung, solange der Stand frisch ist.
    vi.setSystemTime(T + H + 10)
    expect(jetztStand(60_000)).toBe(T + H + 10)
    vi.setSystemTime(T + H + 20)
    const ab2 = jetztAbonnieren(60_000, () => undefined)
    expect(jetztStand(60_000)).toBe(T + H + 10)
    ab2()
  })
})
