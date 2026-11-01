/**
 * Ist ein Backend konfiguriert? (Phase 1b)
 *
 * Ohne VITE_SUPABASE_URL und VITE_SUPABASE_ANON_KEY bleibt die App, wie sie
 * ist: Sandbox, Daten im Browser. Halb konfiguriert gilt als NICHT
 * konfiguriert — eine App, die mit falscher Adresse „online" spielt, ist
 * schlimmer als eine ehrliche Sandbox.
 *
 * Erlaubt sind nur ÖFFENTLICHE Schlüssel: der neue „publishable key"
 * (sb_publishable_…) oder ein JWT mit Rolle anon. Alles andere wird
 * abgewiesen — auch ein unbekanntes Format. Ein geheimer Schlüssel
 * (sb_secret_…, JWT service_role) umgeht Row Level Security vollständig;
 * und weil Vite VITE_*-Werte fest ins Bundle schreibt, stünde er sonst auf
 * der öffentlichen Seite. Deshalb prüft `geheimeVariablen` zusätzlich beim
 * Build (vite.config.ts) und bricht ihn ab.
 */

export interface BackendKonfig {
  url: string
  anonKey: string
}

export type KonfigFehler = 'url' | 'schluessel' | 'serviceRole'
export type SchluesselArt = 'oeffentlich' | 'geheim' | 'unbekannt'

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

export function schluesselArt(key: string): SchluesselArt {
  const k = key.trim()
  if (k.startsWith('sb_secret_') || /^sk-ant-/.test(k)) return 'geheim'
  if (k.startsWith('sb_publishable_')) return 'oeffentlich'
  const rolle = rolleImSchluessel(k)
  if (rolle === 'anon') return 'oeffentlich'
  if (rolle) return 'geheim' // service_role oder jede andere privilegierte Rolle
  return 'unbekannt'
}

export function backendKonfig(env: Record<string, string | undefined>): { konfig: BackendKonfig | null; fehler: KonfigFehler | null } {
  const url = env.VITE_SUPABASE_URL?.trim() ?? ''
  const anonKey = env.VITE_SUPABASE_ANON_KEY?.trim() ?? ''
  if (!url && !anonKey) return { konfig: null, fehler: null }
  // Lokal (Supabase-CLI) läuft über http://127.0.0.1 — alles andere nur über https
  if (!/^https:\/\/[^\s/]+/.test(url) && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(url)) return { konfig: null, fehler: 'url' }
  if (!anonKey) return { konfig: null, fehler: 'schluessel' }
  const art = schluesselArt(anonKey)
  if (art === 'geheim') return { konfig: null, fehler: 'serviceRole' }
  if (art === 'unbekannt') return { konfig: null, fehler: 'schluessel' }
  return { konfig: { url: url.replace(/\/+$/, ''), anonKey }, fehler: null }
}

/**
 * Für den Build: Welche VITE_*-Variablen enthalten etwas Geheimes? Alle
 * VITE_*-Werte landen im öffentlichen Bundle — ein Geheimnis darf dort
 * nie stehen, egal unter welchem Namen.
 */
export function geheimeVariablen(env: Record<string, string | undefined>): string[] {
  return Object.entries(env)
    .filter(([k, v]) => k.startsWith('VITE_') && v && schluesselArt(v) === 'geheim')
    .map(([k]) => k)
}
