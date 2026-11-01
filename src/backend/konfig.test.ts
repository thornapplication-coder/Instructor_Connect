import { describe, expect, it } from 'vitest'
import { backendKonfig, geheimeVariablen, schluesselArt } from './konfig'

const jwt = (role: string) => `x.${btoa(JSON.stringify({ role })).replace(/=+$/, '')}.y`

describe('Backend-Konfiguration', () => {
  it('ohne Angaben: Sandbox, kein Fehler', () => {
    expect(backendKonfig({})).toEqual({ konfig: null, fehler: null })
  })

  it('https-Projekt oder lokale CLI mit öffentlichem Schlüssel; Schrägstrich am Ende fällt weg', () => {
    expect(backendKonfig({ VITE_SUPABASE_URL: 'https://abc.supabase.co/', VITE_SUPABASE_ANON_KEY: jwt('anon') }).konfig).toEqual({ url: 'https://abc.supabase.co', anonKey: jwt('anon') })
    expect(backendKonfig({ VITE_SUPABASE_URL: 'http://127.0.0.1:54321', VITE_SUPABASE_ANON_KEY: 'sb_publishable_abc' }).fehler).toBeNull()
  })

  it('halb konfiguriert oder unsicheres http: abgewiesen', () => {
    expect(backendKonfig({ VITE_SUPABASE_URL: 'https://abc.supabase.co' }).fehler).toBe('schluessel')
    expect(backendKonfig({ VITE_SUPABASE_ANON_KEY: 'sb_publishable_k' }).fehler).toBe('url')
    expect(backendKonfig({ VITE_SUPABASE_URL: 'http://abc.example', VITE_SUPABASE_ANON_KEY: 'sb_publishable_k' }).fehler).toBe('url')
  })

  it('geheime Schlüssel in jedem Format abgewiesen (Sicherheitsprüfung: sb_secret_ wurde vorher angenommen)', () => {
    const url = 'https://abc.supabase.co'
    expect(backendKonfig({ VITE_SUPABASE_URL: url, VITE_SUPABASE_ANON_KEY: 'sb_secret_abc' })).toEqual({ konfig: null, fehler: 'serviceRole' })
    expect(backendKonfig({ VITE_SUPABASE_URL: url, VITE_SUPABASE_ANON_KEY: jwt('service_role') }).fehler).toBe('serviceRole')
    expect(backendKonfig({ VITE_SUPABASE_URL: url, VITE_SUPABASE_ANON_KEY: jwt('supabase_admin') }).fehler).toBe('serviceRole')
    // Unbekanntes Format: nicht raten, abweisen
    expect(backendKonfig({ VITE_SUPABASE_URL: url, VITE_SUPABASE_ANON_KEY: 'a.%%%.b' }).fehler).toBe('schluessel')
  })

  it('Schlüsselarten', () => {
    expect([schluesselArt('sb_publishable_x'), schluesselArt(jwt('anon')), schluesselArt('sk-ant-api03-x'), schluesselArt('irgendwas')]).toEqual(['oeffentlich', 'oeffentlich', 'geheim', 'unbekannt'])
  })

  it('Build-Prüfung: jede VITE_-Variable mit Geheimnis wird genannt, andere Variablen nicht', () => {
    expect(geheimeVariablen({ VITE_SUPABASE_ANON_KEY: 'sb_secret_x', VITE_ANTHROPIC_KEY: 'sk-ant-1', VITE_SUPABASE_URL: 'https://a', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_y', VITE_LEER: undefined })).toEqual(['VITE_SUPABASE_ANON_KEY', 'VITE_ANTHROPIC_KEY'])
  })
})
