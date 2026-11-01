/**
 * Simulierte KI für Sandbox und Tests (Spez. 3.7: „In der Sandbox sind
 * KI-Aufrufe standardmäßig simuliert und kosten nichts").
 *
 * Erzeugt einen Strom im Format der Messages API — derselbe Leseweg wie im
 * Betrieb (siehe sse.ts). Die festen Antworten liegen später unter
 * `benchmark/`; für Phase 1 genügt die Testantwort des Proxy-Testaufrufs.
 */

export const TESTANTWORT =
  'DocCheck sandbox: this response is simulated. No document content left the browser, no tokens were billed. ' +
  'The real proxy (doccheck-claude-proxy) replaces this stream in phase 1b — same format, same parser.'

/** Die SSE-Ereignisse einer vollständigen Antwort als Text. */
export function mockEreignisse(text: string, opts: { model: string; stueck?: number; eingabe?: number }): string[] {
  const groesse = Math.max(1, opts.stueck ?? 12)
  const teile: string[] = []
  for (let i = 0; i < text.length; i += groesse) teile.push(text.slice(i, i + groesse))
  const ev = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  const ausgabe = Math.ceil(text.length / 4)
  return [
    ev('message_start', { type: 'message_start', message: { id: 'msg_sandbox', model: opts.model, usage: { input_tokens: opts.eingabe ?? 0, output_tokens: 1 } } }),
    ev('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }),
    ': keep-alive\n\n',
    ...teile.map((t) => ev('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: t } })),
    ev('content_block_stop', { type: 'content_block_stop', index: 0 }),
    ev('message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: ausgabe } }),
    ev('message_stop', { type: 'message_stop' }),
  ]
}

/**
 * Als Byte-Strom wie von `fetch` — mit Pausen, damit das Streaming in der
 * Oberfläche sichtbar ist. Die Stücke werden absichtlich quer zu den
 * Ereignisgrenzen geschnitten: Genau das passiert im Netz auch.
 */
export function mockStrom(text: string, opts: { model: string; pauseMs?: number; schnitt?: number }): ReadableStream<Uint8Array> {
  const roh = mockEreignisse(text, { model: opts.model }).join('')
  const schnitt = Math.max(1, opts.schnitt ?? 37)
  const enc = new TextEncoder()
  let pos = 0
  return new ReadableStream<Uint8Array>({
    async pull(ctrl) {
      if (pos >= roh.length) {
        ctrl.close()
        return
      }
      if (opts.pauseMs) await new Promise((r) => setTimeout(r, opts.pauseMs))
      ctrl.enqueue(enc.encode(roh.slice(pos, pos + schnitt)))
      pos += schnitt
    },
  })
}
