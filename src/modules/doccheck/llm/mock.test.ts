import { describe, expect, it } from 'vitest'
import { mockEreignisse, mockStrom, TESTANTWORT } from './mock'
import { anwenden, LEER, SseLeser } from './sse'

describe('mockEreignisse', () => {
  it('ergibt über den echten Parser genau den Text — derselbe Leseweg wie im Betrieb', () => {
    const l = new SseLeser()
    const stand = mockEreignisse('Hallo DocCheck', { model: 'm', stueck: 3 })
      .flatMap((e) => l.push(e))
      .reduce(anwenden, LEER)
    expect(stand.text).toBe('Hallo DocCheck')
    expect(stand.stopGrund).toBe('end_turn')
  })

  it('kostet in der Sandbox nichts an Eingabe, zählt aber die Ausgabe', () => {
    const l = new SseLeser()
    const stand = mockEreignisse('x'.repeat(40), { model: 'm' }).flatMap((e) => l.push(e)).reduce(anwenden, LEER)
    expect(stand.verbrauch.input).toBe(0)
    expect(stand.verbrauch.output).toBe(10)
  })

  it('Stückgröße unter 1 wird auf 1 angehoben', () => {
    expect(mockEreignisse('abc', { model: 'm', stueck: 0 }).filter((e) => e.includes('text_delta'))).toHaveLength(3)
  })
})

describe('mockStrom', () => {
  it('liefert Bytes quer zu den Ereignisgrenzen und schließt am Ende', async () => {
    const r = mockStrom(TESTANTWORT, { model: 'm', schnitt: 5, pauseMs: 0 }).getReader()
    const dec = new TextDecoder()
    let roh = ''
    let stuecke = 0
    for (;;) {
      const { value, done } = await r.read()
      if (done) break
      stuecke++
      roh += dec.decode(value)
    }
    expect(stuecke).toBeGreaterThan(50)
    expect(roh).toBe(mockEreignisse(TESTANTWORT, { model: 'm' }).join(''))
  })

  it('wartet zwischen den Stücken, wenn eine Pause gesetzt ist', async () => {
    const r = mockStrom('ab', { model: 'm', schnitt: 100000, pauseMs: 5 }).getReader()
    const t0 = Date.now()
    await r.read()
    expect(Date.now() - t0).toBeGreaterThanOrEqual(4)
  })
})
