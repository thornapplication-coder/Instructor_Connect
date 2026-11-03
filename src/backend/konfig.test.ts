import { describe, expect, it } from 'vitest'
import { backendKonfig, geheimeVariablen, geheimnisseImText, schluesselArt } from './konfig'

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

  it('Bundle-Text: service_role-JWT, sb_secret_ und sk-ant- gefunden; anon-JWT und publishable nicht (Audit 11/2026, CIG-04)', () => {
    // So, wie ein Schlüssel im Bundle steht: echtes JWT-Format, mitten im Code
    const echt = (role: string) => `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${btoa(JSON.stringify({ iss: 'supabase', role, exp: 2000000000 })).replace(/=+$/, '')}.c2lnbmF0dXJlLXdlcnQtMTIz`
    const code = (k: string) => `const a="https://abc.supabase.co",b="${k}";fetch(a,{headers:{apikey:b}})`
    expect(geheimnisseImText(code(echt('service_role')))).toEqual(['JWT (role: service_role)'])
    expect(geheimnisseImText(code('sb_secret_abcdefghijklmnop1234'))).toEqual(['sb_secret_…'])
    expect(geheimnisseImText(code('sk-ant-api03-abcdefghijklmnop'))).toEqual(['sk-ant-…'])
    // Öffentliche Schlüssel dürfen ins Bundle
    expect(geheimnisseImText(code(echt('anon')))).toEqual([])
    expect(geheimnisseImText(code('sb_publishable_abcdefghijklmnop1234'))).toEqual([])
    // Die Prüfmuster im Code selbst sind kein Schlüssel; JWT-förmig ohne Rolle ebenso wenig
    expect(geheimnisseImText("k.startsWith('sb_secret_')||/^sk-ant-/.test(k)")).toEqual([])
    expect(geheimnisseImText(code(echt('anon').replace(/\.[^.]+\./, `.${btoa(JSON.stringify({ sub: 'x', exp: 2000000000 })).replace(/=+$/, '')}.`)))).toEqual([])
    // Der Schlüssel selbst steht nicht in der Meldung — sie landet im Build-Protokoll
    expect(geheimnisseImText(code('sb_secret_abcdefghijklmnop1234')).join(' ')).not.toContain('abcdefgh')
    // Mehrfach derselbe: eine Meldung
    expect(geheimnisseImText(code(echt('service_role')) + code(echt('service_role')))).toHaveLength(1)
  })
})
