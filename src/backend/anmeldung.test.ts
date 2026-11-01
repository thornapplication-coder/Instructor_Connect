import { describe, expect, it, vi } from 'vitest'
import { codeAnfordern, codePruefen, grund, type AuthClient, type AuthFehler } from './anmeldung'

const client = (x: { anfrage?: AuthFehler | null; pruefung?: { user: { id: string } | null; error: AuthFehler | null } } = {}) => ({
  signInWithOtp: vi.fn(async () => ({ error: x.anfrage ?? null })),
  verifyOtp: vi.fn(async () => ({ data: { user: x.pruefung ? x.pruefung.user : { id: 'u1' } }, error: x.pruefung?.error ?? null })),
}) satisfies AuthClient

describe('Fehlergründe', () => {
  it('Supabase-Codes → Gründe', () => {
    expect(grund({ message: '', code: 'over_email_send_rate_limit' })).toBe('zuOft')
    expect(grund({ message: '', status: 429 })).toBe('zuOft')
    expect(grund({ message: '', code: 'otp_expired' })).toBe('abgelaufen')
    expect(grund({ message: '', code: 'otp_invalid' })).toBe('falsch')
    expect(grund({ message: 'Signups not allowed for otp' })).toBe('unbekannt')
    expect(grund({ message: 'Failed to fetch' })).toBe('netz')
    expect(grund({ message: 'x', status: 500 })).toBe('fehler')
  })
})

describe('Code anfordern', () => {
  it('nur eingeladene Nutzer; Adresse normalisiert', async () => {
    const c = client()
    expect(await codeAnfordern(c, ' Alex@Example.TEST ')).toEqual({ ok: true })
    expect(c.signInWithOtp).toHaveBeenCalledWith({ email: 'alex@example.test', options: { shouldCreateUser: false } })
  })

  it('unbekannte Adresse wird wie bekannte quittiert (kein Ausforschen von Konten)', async () => {
    expect(await codeAnfordern(client({ anfrage: { message: '', code: 'otp_disabled' } }), 'x@y.test')).toEqual({ ok: true })
  })

  it('ungültige Adresse gar nicht erst senden; zu oft, Netz, sonst', async () => {
    const c = client()
    expect(await codeAnfordern(c, 'kein-at')).toEqual({ ok: false, grund: 'adresse' })
    expect(c.signInWithOtp).not.toHaveBeenCalled()
    expect(await codeAnfordern(client({ anfrage: { message: '', status: 429 } }), 'a@b.test')).toEqual({ ok: false, grund: 'zuOft' })
    expect(await codeAnfordern(client({ anfrage: { message: 'NetworkError' } }), 'a@b.test')).toEqual({ ok: false, grund: 'netz' })
    expect(await codeAnfordern(client({ anfrage: { message: '', code: 'otp_expired' } }), 'a@b.test')).toEqual({ ok: false, grund: 'fehler' })
  })
})

describe('Code prüfen', () => {
  it('sechs Ziffern, Leerzeichen erlaubt; liefert die Nutzer-ID', async () => {
    const c = client()
    expect(await codePruefen(c, 'A@B.test', '123 456')).toEqual({ ok: true, userId: 'u1' })
    expect(c.verifyOtp).toHaveBeenCalledWith({ email: 'a@b.test', token: '123456', type: 'email' })
    expect(await codePruefen(c, 'a@b.test', '12345')).toEqual({ ok: false, grund: 'format' })
  })

  it('falsch, abgelaufen; unbekannte Adresse sieht aus wie falscher Code; ohne Nutzer Fehler', async () => {
    expect(await codePruefen(client({ pruefung: { user: null, error: { message: '', code: 'otp_invalid' } } }), 'a@b.test', '000000')).toEqual({ ok: false, grund: 'falsch' })
    expect(await codePruefen(client({ pruefung: { user: null, error: { message: '', code: 'otp_expired' } } }), 'a@b.test', '000000')).toEqual({ ok: false, grund: 'abgelaufen' })
    expect(await codePruefen(client({ pruefung: { user: null, error: { message: '', code: 'user_not_found' } } }), 'a@b.test', '000000')).toEqual({ ok: false, grund: 'falsch' })
    expect(await codePruefen(client({ pruefung: { user: null, error: null } }), 'a@b.test', '000000')).toEqual({ ok: false, grund: 'fehler' })
  })
})
