import { describe, expect, it } from 'vitest'
import { HINWEIS_PRAEFIX, hinweisMerken, hinweisOffen, hinweiseVergessen, sitzungsAblage, type HinweisAblage } from './hinweis'

// Ablage-Attrappe mit dem Teil der Storage-Schnittstelle, den hinweis.ts nutzt
const ablage = (): HinweisAblage & { m: Map<string, string> } => {
  const m = new Map<string, string>()
  return {
    m,
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
    key: (i) => [...m.keys()][i] ?? null,
    get length() {
      return m.size
    },
  }
}

describe('Hinweisdialog je Anmeldung, nicht je Tab (Spez. 5.5 Nr. 2, Audit 11/2026, SEC-05)', () => {
  it('A hat bestätigt → für B offen, für A zu', () => {
    const a = ablage()
    expect(hinweisOffen(a, 'u-a')).toBe(true)
    hinweisMerken(a, 'u-a')
    expect(hinweisOffen(a, 'u-a')).toBe(false)
    // Vorher galt die Bestätigung des Vorgängers für jeden im selben Tab
    expect(hinweisOffen(a, 'u-b')).toBe(true)
  })

  it('nach dem Abmelden ist er für A wieder offen — auch der alte Schlüssel ohne Nutzer verschwindet', () => {
    const a = ablage()
    hinweisMerken(a, 'u-a')
    hinweisMerken(a, 'u-b')
    a.setItem(HINWEIS_PRAEFIX, '1')
    a.setItem('anderes', 'bleibt')
    hinweiseVergessen(a)
    expect(hinweisOffen(a, 'u-a')).toBe(true)
    expect(hinweisOffen(a, 'u-b')).toBe(true)
    expect([...a.m.keys()]).toEqual(['anderes'])
  })

  it('ohne Ablage oder ohne Nutzer immer offen; gesperrter Speicher bricht nichts ab', () => {
    expect(hinweisOffen(null, 'u-a')).toBe(true)
    expect(hinweisOffen(ablage(), null)).toBe(true)
    expect(() => hinweisMerken(null, 'u-a')).not.toThrow()
    const a = ablage()
    hinweisMerken(a, null)
    expect(a.m.size).toBe(0)
    expect(() => hinweiseVergessen(null)).not.toThrow()
    const wirft = (): never => {
      throw new Error('SecurityError')
    }
    const gesperrt: HinweisAblage = { getItem: wirft, setItem: wirft, removeItem: wirft, key: wirft, length: 1 }
    expect(hinweisOffen(gesperrt, 'u-a')).toBe(true)
    expect(() => hinweisMerken(gesperrt, 'u-a')).not.toThrow()
    expect(() => hinweiseVergessen(gesperrt)).not.toThrow()
  })

  it('sitzungsAblage: sessionStorage, wo es ihn gibt, sonst null — ohne zu werfen', () => {
    const g = globalThis as { sessionStorage?: unknown }
    const vorher = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage')
    try {
      const a = ablage()
      Object.defineProperty(globalThis, 'sessionStorage', { value: a, configurable: true })
      expect(sitzungsAblage()).toBe(a)
      Object.defineProperty(globalThis, 'sessionStorage', { get: () => { throw new Error('SecurityError') }, configurable: true })
      expect(sitzungsAblage()).toBeNull()
      Object.defineProperty(globalThis, 'sessionStorage', { value: undefined, configurable: true })
      expect(sitzungsAblage()).toBeNull()
    } finally {
      if (vorher) Object.defineProperty(globalThis, 'sessionStorage', vorher)
      else delete g.sessionStorage
    }
  })
})
