import { describe, expect, it } from 'vitest'
import { einstellungen } from '../settings'
import { anfrageBauen, stromLesen, testaufruf } from './client'
import { mockStrom, TESTANTWORT } from './mock'

const s = einstellungen(undefined)
const basis = {
  purpose: 'chat' as const,
  run_id: 'r1',
  model: 'claude-sonnet-5-5',
  system: 'sys',
  messages: [{ role: 'user' as const, content: 'hi' }],
  max_tokens: 100,
}

describe('anfrageBauen — spiegelt die Prüfung des Proxys (Spez. 5.3)', () => {
  it('gültige Anfrage wird immer gestreamt', () => {
    const p = anfrageBauen(s, basis)
    expect(p.ok && p.anfrage.stream).toBe(true)
  })

  it('lehnt unbekannten Zweck, fremdes Modell, zu viele Tokens und leere Nachrichten ab', () => {
    expect(anfrageBauen(s, { ...basis, purpose: 'other' as never })).toEqual({ ok: false, grund: 'zweck' })
    expect(anfrageBauen(s, { ...basis, model: 'gpt' })).toEqual({ ok: false, grund: 'modell' })
    expect(anfrageBauen(s, { ...basis, max_tokens: 16001 })).toEqual({ ok: false, grund: 'maxTokens' })
    expect(anfrageBauen(s, { ...basis, max_tokens: 0 })).toEqual({ ok: false, grund: 'maxTokens' })
    expect(anfrageBauen(s, { ...basis, messages: [] })).toEqual({ ok: false, grund: 'leer' })
  })

  it('reicht keine unbekannten Felder weiter', () => {
    const p = anfrageBauen(s, { ...basis, api_key: 'geheim' } as never)
    expect(p.ok && Object.keys(p.anfrage).sort()).toEqual(['max_tokens', 'messages', 'model', 'purpose', 'run_id', 'stream', 'system'])
  })
})

describe('stromLesen', () => {
  it('meldet Zwischenstände und endet mit dem vollen Text', async () => {
    const staende: string[] = []
    const fertig = await stromLesen(mockStrom('Hallo Welt', { model: 'm', schnitt: 4 }), (x) => staende.push(x.text))
    expect(fertig.text).toBe('Hallo Welt')
    expect(staende.length).toBeGreaterThan(2)
  })

  it('bricht ab, wenn das Signal gesetzt ist', async () => {
    const ctrl = new AbortController()
    ctrl.abort()
    const fertig = await stromLesen(mockStrom('Hallo', { model: 'm' }), () => {}, ctrl.signal)
    expect(fertig.text).toBe('')
  })
})

describe('testaufruf', () => {
  it('streamt in der Sandbox die simulierte Antwort', async () => {
    const r = await testaufruf(s, { sandbox: true, model: 'claude-opus-5-5', onStand: () => {} })
    expect(r.text).toBe(TESTANTWORT)
  })

  it('ohne Backend ehrlich ein Fehler statt eines stillen Rückfalls auf die Attrappe', async () => {
    await expect(testaufruf(s, { sandbox: false, model: 'claude-sonnet-5-5', onStand: () => {} })).rejects.toThrow('DC-NO-BACKEND')
    await expect(testaufruf({ ...s, echteKiInSandbox: true }, { sandbox: true, model: 'claude-sonnet-5-5', onStand: () => {} })).rejects.toThrow('DC-NO-BACKEND')
  })

  it('ungültiges Modell scheitert vor jedem Netzweg', async () => {
    await expect(testaufruf(s, { sandbox: true, model: 'unbekannt', onStand: () => {} })).rejects.toThrow('DC-REQ-modell')
  })
})
