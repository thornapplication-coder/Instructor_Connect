import { describe, expect, it } from 'vitest'
import { PROFIL_KEY, profileBereinigen, profilLaden, profilSchluessel, profilSpeichern, signatur, WERTE_KEY, werteLaden, werteSpeichern } from './profil'

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

  it('gespeichert wird nur die Zuordnung, kein Inhalt der Liste — auch nicht der Kopf (Audit 11/2026, SEC-02)', () => {
    const a = ablage()
    // Eine Befundzeile, die wie ein Kopf aussieht („Issue …", „Action …") — vorher stand ihr Text als Schlüssel im Klartext da
    const zeile = ['F-001', 'Issue: CONFIDENTIAL OEM remark about TOTAL 16:00', 'Action: correct the total']
    profilSpeichern(zeile, { id: 0, befund: 1, empfehlung: 2 }, a)
    werteSpeichern(zeile, { resolved: 'Closed', partial: null, open: 'Open', justify: null, unverifiable: null }, a)
    const roh = [...a.m.values()].join('\n').toLowerCase()
    for (const wort of ['confidential', 'oem', 'issue', 'action', 'f001', 'total']) expect(roh).not.toContain(wort)
    expect(JSON.parse(a.m.get(PROFIL_KEY)!)).toEqual({ [profilSchluessel(zeile)]: { id: 0, befund: 1, empfehlung: 2 } })
    expect(profilLaden(zeile, a)).toEqual({ id: 0, befund: 1, empfehlung: 2 })
    expect(profilSchluessel(zeile)).toMatch(/^#[0-9a-f]{16}$/)
    expect(profilSchluessel(['Finding'])).not.toBe(profilSchluessel(['Findings']))
  })

  it('alte Profile mit Klartext-Schlüssel gelten weiter und werden beim nächsten Speichern umgeschrieben (SEC-02)', () => {
    const a = ablage()
    a.setItem(PROFIL_KEY, JSON.stringify({ 'no|finding': { id: 0, befund: 1 }, 'nr|befund|status': { id: 0, befund: 1, status: 2 } }))
    a.setItem(WERTE_KEY, JSON.stringify({ 'no|status': { resolved: 'Closed' } }))
    expect(profilLaden(['No.', 'Finding'], a)).toEqual({ id: 0, befund: 1 })
    expect(werteLaden(['No', 'Status'], a)).toEqual({ resolved: 'Closed' })
    profilSpeichern(['ID', 'Finding'], { id: 0, befund: 1 }, a)
    const gespeichert = JSON.parse(a.m.get(PROFIL_KEY)!) as Record<string, unknown>
    expect(Object.keys(gespeichert).every((k) => k.startsWith('#'))).toBe(true)
    expect(Object.keys(gespeichert)).toHaveLength(3)
    // Nach dem Umschreiben unter der Prüfsumme wiedergefunden
    expect(profilLaden(['Nr', 'Befund', 'Status'], a)).toEqual({ id: 0, befund: 1, status: 2 })
    // Kein Objekt in der Ablage: wie leer
    a.setItem(PROFIL_KEY, 'null')
    expect(profilLaden(['No.', 'Finding'], a)).toBeNull()
    a.setItem(PROFIL_KEY, '[1]')
    expect(profilLaden(['No.', 'Finding'], a)).toBeNull()
  })

  it('beim Öffnen von DocCheck: alte Klartext-Schlüssel werden umgeschrieben, ohne dass erst gespeichert werden muss (Gegenprüfung SEC-02)', () => {
    const a = ablage()
    // so lag eine Befundzeile einer kopflosen Liste vor dem Fix in der Ablage
    a.setItem(PROFIL_KEY, JSON.stringify({ 'f001|confidentialoemremark|open': { id: 0, befund: 1 }, '#0123456789abcdef': { befund: 0 } }))
    a.setItem(WERTE_KEY, JSON.stringify({ 'f001|confidentialoemremark|open': { resolved: 'Closed' } }))
    profileBereinigen(a)
    for (const key of [PROFIL_KEY, WERTE_KEY]) expect(a.m.get(key)!.toLowerCase()).not.toContain('confidential')
    expect(JSON.parse(a.m.get(PROFIL_KEY)!)).toEqual({ [profilSchluessel(['F-001', 'CONFIDENTIAL OEM remark', 'Open'])]: { id: 0, befund: 1 }, '#0123456789abcdef': { befund: 0 } })
    expect(profilLaden(['F-001', 'CONFIDENTIAL OEM remark', 'Open'], a)).toEqual({ id: 0, befund: 1 })
    // nichts Altes da: nichts geschrieben; gesperrter Speicher: kein Absturz
    const leer = ablage()
    profileBereinigen(leer)
    expect(leer.m.size).toBe(0)
    expect(() => profileBereinigen({ getItem: () => '{"a|b":{}}', setItem: () => { throw new Error('quota') } })).not.toThrow()
  })

  it('kaputter oder voller Speicher: kein Absturz', () => {
    const kaputt = { getItem: () => '{', setItem: () => { throw new Error('quota') } }
    expect(profilLaden(['x'], kaputt)).toBeNull()
    expect(() => profilSpeichern(['x'], {}, kaputt)).not.toThrow()
  })

  it('Werte-Mapping je Liste — getrennt vom Spaltenprofil, kaputter Speicher ohne Absturz', () => {
    const a = ablage()
    const w = { resolved: 'Closed', partial: 'In Review', open: 'Open', justify: null, unverifiable: null }
    werteSpeichern(['No.', 'Status'], w, a)
    expect(werteLaden(['no', 'STATUS'], a)).toEqual(w)
    expect(a.m.has(PROFIL_KEY)).toBe(false)
    expect(a.m.has(WERTE_KEY)).toBe(true)
    const kaputt = { getItem: () => '{', setItem: () => { throw new Error('quota') } }
    expect(werteLaden(['x'], kaputt)).toBeNull()
    expect(() => werteSpeichern(['x'], w, kaputt)).not.toThrow()
  })
})
