import { describe, expect, it } from 'vitest'
import { PROFIL_KEY, profilLaden, profilSpeichern, signatur } from './profil'

const ablage = () => {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m }
}

describe('Listenprofile (N3.1 Schritt 2)', () => {
  it('dieselbe Kopfzeile findet die gespeicherte Zuordnung wieder — Schreibweise egal', () => {
    const a = ablage()
    profilSpeichern(['No.', 'Finding'], { id: 0, befund: 1 }, a)
    expect(profilLaden(['NO', 'finding'], a)).toEqual({ id: 0, befund: 1 })
    expect(profilLaden(['Nr', 'Finding'], a)).toBeNull()
    expect(signatur(['Status Compliance'])).toBe('statuscompliance')
  })

  it('gespeichert wird nur die Zuordnung, kein Inhalt der Liste', () => {
    const a = ablage()
    profilSpeichern(['Finding'], { befund: 0 }, a)
    expect(a.m.get(PROFIL_KEY)).toBe('{"finding":{"befund":0}}')
  })

  it('kaputter oder voller Speicher: kein Absturz', () => {
    const kaputt = { getItem: () => '{', setItem: () => { throw new Error('quota') } }
    expect(profilLaden(['x'], kaputt)).toBeNull()
    expect(() => profilSpeichern(['x'], {}, kaputt)).not.toThrow()
  })
})
