import { describe, expect, it } from 'vitest'
import { aktiv, ausweichFuer, einstellungen, FEATURES, preiseVollstaendig, pruefSchalter, VORGABE } from './settings'

describe('einstellungen — Vorgaben und Zusammenführung', () => {
  it('ohne gespeicherten Stand gelten die Vorgaben, alle Funktionen an außer Re-Check (Nachtrag Kap. 17)', () => {
    const s = einstellungen(undefined)
    expect(s.standardModell).toBe('claude-sonnet-5-5')
    expect(s.ausweichModell).toBe('claude-opus-5-5')
    expect(FEATURES.filter((f) => !s.features[f])).toEqual(['recheck'])
    expect(s.echteKiInSandbox).toBe(false)
    expect(s.monatsbudgetUsd).toBeNull()
  })

  it('Preise sind ab Werk leer — keine erfundenen Zahlen in der Kostenschätzung', () => {
    expect(VORGABE.modelle.some(preiseVollstaendig)).toBe(false)
  })

  it('ein einzelner gespeicherter Schalter überschreibt nur sich selbst', () => {
    const s = einstellungen({ features: { chat: false } as never })
    expect(s.features.chat).toBe(false)
    expect(s.features.ocr).toBe(true)
  })

  it('Standard- oder Ausweichmodell auf ein entferntes Modell fällt zurück', () => {
    const modelle = [{ id: 'm1', name: 'A', preise: { input: 1, output: 1, cacheRead: 1, cacheWrite: 1 }, maxTokens: 1 }]
    const s = einstellungen({ modelle, standardModell: 'weg', ausweichModell: 'auch-weg' })
    expect(s.standardModell).toBe('m1')
    // Nur ein Modell: Ausweichen geht dann nur auf dasselbe.
    expect(s.ausweichModell).toBe('m1')
  })

  it('gültige gespeicherte Werte bleiben stehen', () => {
    const s = einstellungen({ standardModell: 'claude-opus-5-5', ausweichModell: 'claude-sonnet-5-5', echteKiInSandbox: true, monatsbudgetUsd: 200 })
    expect([s.standardModell, s.ausweichModell, s.echteKiInSandbox, s.monatsbudgetUsd]).toEqual(['claude-opus-5-5', 'claude-sonnet-5-5', true, 200])
  })

  it('Organisation: ab Werk leer (nie hart codiert, Spez. 10.1 Nr. 3), gespeicherter Name begrenzt, Fremdtyp verworfen', () => {
    expect(einstellungen(undefined).organisation).toBe('')
    expect(einstellungen({ organisation: 'Example ATO' }).organisation).toBe('Example ATO')
    expect(einstellungen({ organisation: 'x'.repeat(200) }).organisation).toHaveLength(120)
    expect(einstellungen({ organisation: 42 as unknown as string }).organisation).toBe('')
  })

  it('CSV-Trenner: Vorgabe Semikolon, Komma bleibt, alles andere fällt zurück (Spez. 10.6; Audit 11/2026, EXP-17)', () => {
    expect(einstellungen(undefined).csvTrenner).toBe(';')
    expect(einstellungen({ csvTrenner: ',' }).csvTrenner).toBe(',')
    expect(einstellungen({ csvTrenner: '\t' as never }).csvTrenner).toBe(';')
  })

  it('eine leere Modellliste zählt als nicht gepflegt', () => {
    expect(einstellungen({ modelle: [] }).modelle).toEqual(VORGABE.modelle)
  })
})

describe('ausweichFuer (Spez. 13.3)', () => {
  const s = einstellungen(undefined)
  it('Standard überlastet → Ausweichmodell', () => {
    expect(ausweichFuer(s, 'claude-sonnet-5-5')).toBe('claude-opus-5-5')
  })
  it('Ausweichmodell selbst überlastet → Standardmodell, nicht dasselbe noch einmal', () => {
    expect(ausweichFuer(s, 'claude-opus-5-5')).toBe('claude-sonnet-5-5')
  })
})

describe('aktiv — der Gesamtschalter schlägt jeden Einzelschalter', () => {
  it('DocCheck aus → nichts ist aktiv', () => {
    const s = einstellungen({ features: { doccheck: false } as never })
    expect(FEATURES.some((f) => aktiv(s, f))).toBe(false)
  })
  it('DocCheck an, Chat aus → nur der Chat fehlt', () => {
    const s = einstellungen({ features: { chat: false } as never })
    expect(aktiv(s, 'chat')).toBe(false)
    expect(aktiv(s, 'ocr')).toBe(true)
  })
})

describe('pruefSchalter — eine Ableitung für Hochladen und Neuprüfen (Audit 11/2026, DC-12)', () => {
  it('bildet formalCheck, wordCheck und calcCheck ab; der Gesamtschalter schlägt sie', () => {
    expect(pruefSchalter(einstellungen(undefined))).toEqual({ formal: true, word: true, rechnen: true })
    expect(pruefSchalter(einstellungen({ features: { formalCheck: false, calcCheck: false } as never }))).toEqual({ formal: false, word: true, rechnen: false })
    expect(pruefSchalter(einstellungen({ features: { doccheck: false } as never }))).toEqual({ formal: false, word: false, rechnen: false })
  })
})

describe('preiseVollstaendig', () => {
  it('verlangt alle vier Preise, nicht negativ', () => {
    const m = (p: Partial<Record<'input' | 'output' | 'cacheRead' | 'cacheWrite', number | null>>) => ({
      id: 'x',
      name: 'x',
      maxTokens: 1,
      preise: { input: 1, output: 1, cacheRead: 1, cacheWrite: 1, ...p },
    })
    expect(preiseVollstaendig(m({}))).toBe(true)
    expect(preiseVollstaendig(m({ cacheWrite: null }))).toBe(false)
    expect(preiseVollstaendig(m({ input: -1 }))).toBe(false)
  })
})
