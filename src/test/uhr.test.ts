import { afterEach, describe, expect, it, vi } from 'vitest'
import { testUhr, uhrVersetzen } from './uhr'

/**
 * Die versetzte Uhr des Zeitsprung-Laufs (Nachtlauf). Sie muss genau zwei
 * Dinge: „jetzt" versetzen und alles andere lassen, wie es ist — sonst
 * prüfte der Lauf seine eigene Attrappe.
 */

let zurueck: (() => void) | null = null
afterEach(() => {
  zurueck?.()
  zurueck = null
  vi.useRealTimers()
})

describe('uhrVersetzen', () => {
  it('versetzt jetzt, die Uhr läuft weiter; feste Daten bleiben fest', async () => {
    const ziel = Date.parse('2027-03-28T01:59:30+01:00')
    zurueck = uhrVersetzen(ziel)
    expect(Math.abs(Date.now() - ziel)).toBeLessThan(1000)
    expect(Math.abs(new Date().getTime() - ziel)).toBeLessThan(1000)
    const vorher = Date.now()
    await new Promise((r) => setTimeout(r, 20))
    expect(Date.now()).toBeGreaterThanOrEqual(vorher + 15)
    expect(new Date(0).getTime()).toBe(0)
    expect(new Date('2026-11-04T12:00:00Z').toISOString()).toBe('2026-11-04T12:00:00.000Z')
    expect(Date.parse('2026-01-01T00:00:00Z')).toBe(Date.UTC(2026, 0, 1))
    expect(new Date() instanceof Date).toBe(true)
  })

  it('zurück heißt: die echte Uhr', () => {
    zurueck = uhrVersetzen(Date.parse('2030-01-01T00:00:00Z'))
    zurueck()
    zurueck = null
    expect(Math.abs(Date.now() - new Date().getTime())).toBeLessThan(1000)
    expect(new Date().getFullYear()).toBeLessThan(2030)
  })

  it('Tests, die die Zeit selbst stellen, bleiben bei ihrer Zeit', () => {
    zurueck = uhrVersetzen(Date.parse('2030-01-01T00:00:00Z'))
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 10, 4, 12))
    expect(new Date().getFullYear()).toBe(2026)
    vi.useRealTimers()
    expect(new Date().getFullYear()).toBe(2030)
  })
})

describe('testUhr', () => {
  it('nur ein vollständiger Zeitpunkt mit Zone — sonst ein klarer Abbruch statt einer stillen Fehlzeit', () => {
    expect(testUhr(undefined)).toBeNull()
    expect(testUhr('')).toBeNull()
    expect(testUhr('2027-03-28T01:59:30+01:00')).toBe(Date.UTC(2027, 2, 28, 0, 59, 30))
    expect(testUhr('2027-03-28T00:59Z')).toBe(Date.UTC(2027, 2, 28, 0, 59))
    expect(() => testUhr('2027-03-28')).toThrow(/Zone/)
    expect(() => testUhr('2027-03-28T01:59:30')).toThrow(/Zone/)
  })
})
