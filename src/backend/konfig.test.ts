import { describe, expect, it } from 'vitest'
import { backendKonfig } from './konfig'

const jwt = (role: string) => `x.${btoa(JSON.stringify({ role })).replace(/=+$/, '')}.y`

describe('Backend-Konfiguration', () => {
  it('ohne Angaben: Sandbox, kein Fehler', () => {
    expect(backendKonfig({})).toEqual({ konfig: null, fehler: null })
  })

  it('https-Projekt oder lokale CLI; Schrägstrich am Ende fällt weg', () => {
    expect(backendKonfig({ VITE_SUPABASE_URL: 'https://abc.supabase.co/', VITE_SUPABASE_ANON_KEY: jwt('anon') }).konfig).toEqual({ url: 'https://abc.supabase.co', anonKey: jwt('anon') })
    expect(backendKonfig({ VITE_SUPABASE_URL: 'http://127.0.0.1:54321', VITE_SUPABASE_ANON_KEY: 'k' }).fehler).toBeNull()
  })

  it('halb konfiguriert, unsicheres http oder service_role-Schlüssel: abgewiesen', () => {
    expect(backendKonfig({ VITE_SUPABASE_URL: 'https://abc.supabase.co' }).fehler).toBe('schluessel')
    expect(backendKonfig({ VITE_SUPABASE_ANON_KEY: 'k' }).fehler).toBe('url')
    expect(backendKonfig({ VITE_SUPABASE_URL: 'http://abc.example', VITE_SUPABASE_ANON_KEY: 'k' }).fehler).toBe('url')
    expect(backendKonfig({ VITE_SUPABASE_URL: 'https://abc.supabase.co', VITE_SUPABASE_ANON_KEY: jwt('service_role') })).toEqual({ konfig: null, fehler: 'serviceRole' })
    // Kaputter Schlüssel ist kein service_role — RLS entscheidet dann
    expect(backendKonfig({ VITE_SUPABASE_URL: 'https://a.supabase.co', VITE_SUPABASE_ANON_KEY: 'a.%%%.b' }).fehler).toBeNull()
  })
})
