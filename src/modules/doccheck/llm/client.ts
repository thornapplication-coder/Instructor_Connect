import type { DocCheckSettings } from '../types'
import { mockStrom, TESTANTWORT } from './mock'
import { anwenden, LEER, SseLeser, type Antwortstand } from './sse'

/**
 * Browser-Seite des KI-Wegs.
 *
 * Der Browser spricht NIE mit Anthropic direkt und kennt keinen Schlüssel
 * (Spez. 2, 5.3). Er baut eine Anfrage an den Proxy und liest dessen Strom.
 * Die Prüfung hier spiegelt die Prüfung des Proxys — sie ersetzt sie nicht,
 * sie erspart nur den Umweg über eine Ablehnung.
 */

export const ZWECKE = ['review', 'chat', 'revision', 'consistency', 'hoc', 'impact', 'classification', 'benchmark'] as const
export type Zweck = (typeof ZWECKE)[number]

export interface ProxyAnfrage {
  purpose: Zweck
  run_id: string
  model: string
  system: string
  messages: { role: 'user' | 'assistant'; content: string }[]
  max_tokens: number
  stream: true
}

export type Pruefung = { ok: true; anfrage: ProxyAnfrage } | { ok: false; grund: 'zweck' | 'modell' | 'maxTokens' | 'leer' }

export function anfrageBauen(s: DocCheckSettings, a: Omit<ProxyAnfrage, 'stream'>): Pruefung {
  if (!(ZWECKE as readonly string[]).includes(a.purpose)) return { ok: false, grund: 'zweck' }
  const modell = s.modelle.find((m) => m.id === a.model)
  if (!modell) return { ok: false, grund: 'modell' }
  if (!(a.max_tokens > 0) || a.max_tokens > modell.maxTokens) return { ok: false, grund: 'maxTokens' }
  if (a.messages.length === 0) return { ok: false, grund: 'leer' }
  // Nur die bekannten Felder weiterreichen — der Proxy lehnt unbekannte ab
  // (Spez. 5.3 Nr. 2), also schicken wir gar nicht erst welche.
  const { purpose, run_id, model, system, messages, max_tokens } = a
  return { ok: true, anfrage: { purpose, run_id, model, system, messages, max_tokens, stream: true } }
}

/** Liest einen Byte-Strom bis zum Ende und meldet jeden Zwischenstand. */
export async function stromLesen(strom: ReadableStream<Uint8Array>, onStand: (s: Antwortstand) => void, signal?: AbortSignal): Promise<Antwortstand> {
  const leser = new SseLeser()
  const dec = new TextDecoder()
  const reader = strom.getReader()
  let stand = LEER
  try {
    for (;;) {
      if (signal?.aborted) {
        await reader.cancel()
        break
      }
      const { value, done } = await reader.read()
      if (done) break
      for (const e of leser.push(dec.decode(value, { stream: true }))) {
        stand = anwenden(stand, e)
        onStand(stand)
      }
    }
  } finally {
    reader.releaseLock()
  }
  return stand
}

/**
 * Testaufruf über den Proxy (Abnahme Phase 1: „Testaufruf über den Proxy
 * streamt"). In der Sandbox simuliert; ohne Backend gibt es keinen anderen
 * Weg — und dann ehrlich einen Fehler statt eines stillen Rückfalls auf die
 * Attrappe.
 */
export async function testaufruf(
  s: DocCheckSettings,
  opts: { sandbox: boolean; model: string; onStand: (s: Antwortstand) => void; pauseMs?: number; signal?: AbortSignal },
): Promise<Antwortstand> {
  const p = anfrageBauen(s, {
    purpose: 'benchmark',
    run_id: 'proxy-test',
    model: opts.model,
    system: 'Reply with one short sentence.',
    messages: [{ role: 'user', content: 'Proxy test' }],
    max_tokens: 64,
  })
  if (!p.ok) throw new Error(`DC-REQ-${p.grund}`)
  if (!opts.sandbox || s.echteKiInSandbox) throw new Error('DC-NO-BACKEND')
  return stromLesen(mockStrom(TESTANTWORT, { model: p.anfrage.model, pauseMs: opts.pauseMs }), opts.onStand, opts.signal)
}
