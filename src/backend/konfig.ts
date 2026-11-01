/**
 * Ist ein Backend konfiguriert? (Phase 1b)
 *
 * Ohne VITE_SUPABASE_URL und VITE_SUPABASE_ANON_KEY bleibt die App, wie sie
 * ist: Sandbox, Daten im Browser. Halb konfiguriert gilt als NICHT
 * konfiguriert — eine App, die mit falscher Adresse „online" spielt, ist
 * schlimmer als eine ehrliche Sandbox.
 *
 * Der anon-Schlüssel ist öffentlich (er steht in jedem Browser); was er
 * darf, begrenzt Row Level Security. Der service_role-Schlüssel gehört NIE
 * hierher — die Prüfung unten weist ihn ab.
 */

export interface BackendKonfig {
  url: string
  anonKey: string
}

export type KonfigFehler = 'url' | 'schluessel' | 'serviceRole'

/** JWT-Nutzlast lesen, ohne zu prüfen — nur, um die Rolle des Schlüssels zu sehen. */
function rolleImSchluessel(key: string): string | null {
  const teil = key.split('.')[1]
  if (!teil) return null
  try {
    const json = JSON.parse(atob(teil.replace(/-/g, '+').replace(/_/g, '/')))
    return typeof json.role === 'string' ? json.role : null
  } catch {
    return null
  }
}

export function backendKonfig(env: Record<string, string | undefined>): { konfig: BackendKonfig | null; fehler: KonfigFehler | null } {
  const url = env.VITE_SUPABASE_URL?.trim() ?? ''
  const anonKey = env.VITE_SUPABASE_ANON_KEY?.trim() ?? ''
  if (!url && !anonKey) return { konfig: null, fehler: null }
  // Lokal (Supabase-CLI) läuft über http://127.0.0.1 — alles andere nur über https
  if (!/^https:\/\/[^\s/]+/.test(url) && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(url)) return { konfig: null, fehler: 'url' }
  if (!anonKey) return { konfig: null, fehler: 'schluessel' }
  if (rolleImSchluessel(anonKey) === 'service_role') return { konfig: null, fehler: 'serviceRole' }
  return { konfig: { url: url.replace(/\/+$/, ''), anonKey }, fehler: null }
}
