import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * Der Sandbox-Schalter (Audit 11/2026, TEC-18: stand außerhalb beider
 * Testwachen). An ihm hängen Identitätswechsel, Zeitraffer, Zurücksetzen
 * und die Gerätevorschau — alles, was es im echten Betrieb nicht geben
 * darf. Ab Werk AN (die Veröffentlichung IST die Demo), aus nur mit genau
 * `VITE_SANDBOX=false`.
 */
afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

async function schalter(wert: string): Promise<boolean> {
  vi.stubEnv('VITE_SANDBOX', wert)
  vi.resetModules()
  return (await import('./flag')).SANDBOX
}

describe('SANDBOX', () => {
  it('ohne Angabe an — die heutige Veröffentlichung ist die Demo', async () => {
    expect(await schalter('')).toBe(true)
  })

  it('VITE_SANDBOX=false schaltet ab', async () => {
    expect(await schalter('false')).toBe(false)
  })

  it('nur genau „false" schaltet ab — kein Raten bei „0" oder „nein"', async () => {
    expect(await schalter('0')).toBe(true)
    expect(await schalter('true')).toBe(true)
  })
})
