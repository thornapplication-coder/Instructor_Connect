/**
 * Anmeldung per E-Mail-Code über Supabase Auth (Phase 1b, Etappe 1) —
 * dasselbe Verfahren wie bisher in der Sandbox, jetzt mit echtem Versand.
 *
 * Der Client wird hineingereicht (die Teile von supabase-js, die hier
 * gebraucht werden): So ist der Ablauf ohne Netz testbar, und das Bundle
 * lädt supabase-js erst, wenn ein Backend konfiguriert ist.
 */

export interface AuthFehler {
  message: string
  code?: string
  status?: number
}

export interface AuthClient {
  signInWithOtp(a: { email: string; options: { shouldCreateUser: boolean } }): Promise<{ error: AuthFehler | null }>
  verifyOtp(a: { email: string; token: string; type: 'email' }): Promise<{ data: { user: { id: string } | null }; error: AuthFehler | null }>
}

export type AnfrageErgebnis = { ok: true } | { ok: false; grund: 'adresse' | 'zuOft' | 'netz' | 'fehler' }
export type PruefErgebnis = { ok: true; userId: string } | { ok: false; grund: 'format' | 'falsch' | 'abgelaufen' | 'zuOft' | 'netz' | 'fehler' }

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Supabase-Fehler → Grund, den die Oberfläche übersetzt. */
export function grund(e: AuthFehler): 'zuOft' | 'abgelaufen' | 'falsch' | 'unbekannt' | 'netz' | 'fehler' {
  const c = e.code ?? ''
  if (c.startsWith('over_') || e.status === 429) return 'zuOft'
  if (c === 'otp_expired') return 'abgelaufen'
  if (c === 'otp_invalid' || c === 'invalid_credentials') return 'falsch'
  // Mit shouldCreateUser: false meldet Supabase unbekannte Adressen so
  if (c === 'otp_disabled' || c === 'signup_disabled' || c === 'user_not_found' || /signups? not allowed/i.test(e.message)) return 'unbekannt'
  if (e.status === 0 || /fetch|network/i.test(e.message)) return 'netz'
  return 'fehler'
}

/**
 * Code anfordern. Nur eingeladene Nutzer (shouldCreateUser: false). Eine
 * unbekannte Adresse wird wie eine bekannte quittiert: Sonst ließe sich
 * durch Ausprobieren feststellen, wer ein Konto hat.
 */
export async function codeAnfordern(c: AuthClient, email: string): Promise<AnfrageErgebnis> {
  const adresse = email.trim().toLowerCase()
  if (!EMAIL.test(adresse)) return { ok: false, grund: 'adresse' }
  const { error } = await c.signInWithOtp({ email: adresse, options: { shouldCreateUser: false } })
  if (!error) return { ok: true }
  const g = grund(error)
  if (g === 'unbekannt') return { ok: true }
  return { ok: false, grund: g === 'zuOft' || g === 'netz' ? g : 'fehler' }
}

export async function codePruefen(c: AuthClient, email: string, code: string): Promise<PruefErgebnis> {
  const token = code.replace(/\s+/g, '')
  if (!/^\d{6}$/.test(token)) return { ok: false, grund: 'format' }
  const { data, error } = await c.verifyOtp({ email: email.trim().toLowerCase(), token, type: 'email' })
  if (error) {
    const g = grund(error)
    // Unbekannte Adresse = falscher Code: dieselbe Antwort, kein Hinweis auf Konten
    return { ok: false, grund: g === 'unbekannt' ? 'falsch' : g }
  }
  if (!data.user) return { ok: false, grund: 'fehler' }
  return { ok: true, userId: data.user.id }
}
