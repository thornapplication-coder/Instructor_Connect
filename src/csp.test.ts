import { describe, expect, it } from 'vitest'
import { cspFuer } from './csp'

/** Richtlinie als Tabelle: Anweisung → Quellen. */
const anweisungen = (csp: string) => new Map(csp.split('; ').map((a) => [a.split(' ')[0], a.split(' ').slice(1)]))

describe('Content-Security-Policy (Audit 11/2026, SEC-07)', () => {
  const ohne = cspFuer(null)
  const a = anweisungen(ohne)

  it('sperrt Plugins und Basis-Umleitung; Formulare senden nirgendwohin', () => {
    expect(a.get('object-src')).toEqual(["'none'"])
    expect(a.get('base-uri')).toEqual(["'self'"])
    expect(a.get('form-action')).toEqual(["'none'"])
    expect(a.get('default-src')).toEqual(["'self'"])
  })

  it('kein eval für JavaScript, kein Inline-Skript, keine Platzhalter und keine ganzen Schemata', () => {
    const quellen = [...a.values()].flat()
    // 'wasm-unsafe-eval' ist erlaubt (WebAssembly) — 'unsafe-eval' nicht.
    expect(quellen).not.toContain("'unsafe-eval'")
    expect(a.get('script-src')).toEqual(["'self'", "'wasm-unsafe-eval'"])
    expect(quellen.filter((q) => q.includes('*'))).toEqual([])
    expect(quellen.filter((q) => /^(https?|wss?):$/.test(q))).toEqual([])
  })

  it('ohne Backend nur die eigene Herkunft als Ziel', () => {
    expect(a.get('connect-src')).toEqual(["'self'", 'blob:', 'data:'])
    expect(ohne).not.toMatch(/https?:\/\//)
  })

  it('mit Backend dessen Adresse (und WebSocket-Fassung) — nur in connect-src', () => {
    const mit = anweisungen(cspFuer({ url: 'https://abc.supabase.co', anonKey: 'sb_publishable_x' }))
    expect(mit.get('connect-src')).toEqual(["'self'", 'blob:', 'data:', 'https://abc.supabase.co', 'wss://abc.supabase.co'])
    expect(mit.get('script-src')).toEqual(a.get('script-src'))
    // Lokale CLI über http mit Port
    expect(anweisungen(cspFuer({ url: 'http://127.0.0.1:54321', anonKey: 'k' })).get('connect-src')).toContain('ws://127.0.0.1:54321')
  })

  it('eine Adresse, die eine eigene Anweisung einschleusen würde, bricht ab', () => {
    expect(() => cspFuer({ url: 'https://x;script-src', anonKey: 'k' })).toThrow('CSP')
  })
})
