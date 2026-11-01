import { describe, expect, it } from 'vitest'
import { anwenden, LEER, SseLeser } from './sse'

describe('SseLeser', () => {
  it('liest ein Ereignis mit event- und data-Zeile', () => {
    const l = new SseLeser()
    expect(l.push('event: ping\ndata: {"type":"ping"}\n\n')).toEqual([{ event: 'ping', data: { type: 'ping' } }])
  })

  it('verliert nichts, wenn ein Paket mitten in der Zeile endet', () => {
    const l = new SseLeser()
    const roh = 'event: a\ndata: {"x":"hallo welt"}\n\n'
    const out = [...roh].flatMap((ch) => l.push(ch))
    expect(out).toEqual([{ event: 'a', data: { x: 'hallo welt' } }])
  })

  it('überspringt Kommentare, versteht CRLF und Doppelpunkte im Wert', () => {
    const l = new SseLeser()
    expect(l.push(': keep-alive\r\n\r\ndata: a:b\r\n\r\n')).toEqual([{ event: 'message', data: 'a:b' }])
  })

  it('fügt mehrere data-Zeilen zusammen; Leerzeile ohne Daten ist kein Ereignis', () => {
    const l = new SseLeser()
    expect(l.push('\n\ndata: eins\ndata: zwei\nid: 7\n\n')).toEqual([{ event: 'message', data: 'eins\nzwei' }])
  })
})

describe('anwenden — Messages-API-Ereignisse', () => {
  it('sammelt Text, Verbrauch und Stoppgrund', () => {
    let s = LEER
    s = anwenden(s, { event: 'message_start', data: { type: 'message_start', message: { usage: { input_tokens: 10, output_tokens: 1, cache_read_input_tokens: 4, cache_creation_input_tokens: 2 } } } })
    s = anwenden(s, { event: 'content_block_delta', data: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hal' } } })
    s = anwenden(s, { event: 'content_block_delta', data: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'lo' } } })
    s = anwenden(s, { event: 'message_delta', data: { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 7 } } })
    expect(s.text).toBe('Hallo')
    expect(s.stopGrund).toBe('end_turn')
    // Ausgabe ist kumulativ: 7, nicht 1 + 7.
    expect(s.verbrauch).toEqual({ input: 10, output: 7, cacheRead: 4, cacheWrite: 2 })
  })

  it('ignoriert Nicht-Text-Deltas (z. B. Tool-JSON) und unbekannte Ereignisse', () => {
    const s = anwenden(LEER, { event: 'content_block_delta', data: { type: 'content_block_delta', delta: { type: 'input_json_delta', partial_json: '{' } } })
    expect(s).toBe(LEER)
    expect(anwenden(LEER, { event: 'ping', data: { type: 'ping' } })).toBe(LEER)
  })

  it('message_delta ohne usage behält den bisherigen Stand', () => {
    const s = anwenden({ ...LEER, verbrauch: { ...LEER.verbrauch, output: 3 } }, { event: 'message_delta', data: { type: 'message_delta', delta: {} } })
    expect(s.verbrauch.output).toBe(3)
  })

  it('übernimmt Fehler aus dem Strom (z. B. overloaded_error) als Stand, nicht als Wurf', () => {
    const s = anwenden(LEER, { event: 'error', data: { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } } })
    expect(s.fehler).toEqual({ typ: 'overloaded_error', meldung: 'Overloaded' })
  })

  it('übersteht fehlende Felder', () => {
    expect(anwenden(LEER, { event: 'message_start', data: undefined }).verbrauch).toEqual(LEER.verbrauch)
    expect(anwenden(LEER, { event: 'error', data: {} }).fehler).toEqual({ typ: 'unknown', meldung: '' })
    expect(anwenden(LEER, { event: 'content_block_delta', data: {} })).toBe(LEER)
  })
})
