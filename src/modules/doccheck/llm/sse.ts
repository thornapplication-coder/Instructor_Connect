/**
 * Lesen eines Server-Sent-Events-Stroms im Format der Messages API.
 *
 * Der Proxy (Phase 1b) reicht den Strom von Anthropic unverändert durch; in
 * der Sandbox erzeugt `mock.ts` denselben Strom. Der Browser liest also in
 * beiden Fällen dasselbe Format — und die Sandbox prüft damit den echten
 * Leseweg mit, nicht eine Abkürzung daneben.
 *
 * Bewusst zeilenweise und puffernd: Ein Netzwerkpaket endet, wo es will,
 * auch mitten in einer Zeile. Ein Parser, der jedes Paket für sich liest,
 * verliert genau dort Text — und das fällt erst bei langen Antworten auf.
 */

export interface SseEreignis {
  event: string
  data: unknown
}

export class SseLeser {
  private rest = ''
  private event = ''
  private daten: string[] = []

  /** Nimmt ein beliebig geschnittenes Stück auf und liefert die fertigen Ereignisse. */
  push(stueck: string): SseEreignis[] {
    this.rest += stueck
    const out: SseEreignis[] = []
    let i: number
    while ((i = this.rest.indexOf('\n')) >= 0) {
      const zeile = this.rest.slice(0, i).replace(/\r$/, '')
      this.rest = this.rest.slice(i + 1)
      if (zeile === '') {
        if (this.daten.length) out.push(this.fertig())
        continue
      }
      if (zeile.startsWith(':')) continue // Kommentar / Keep-alive
      const [feld, ...wert] = zeile.split(':')
      const v = wert.join(':').replace(/^ /, '')
      if (feld === 'event') this.event = v
      else if (feld === 'data') this.daten.push(v)
    }
    return out
  }

  private fertig(): SseEreignis {
    const roh = this.daten.join('\n')
    let data: unknown = roh
    try {
      data = JSON.parse(roh)
    } catch {
      /* kein JSON — als Text weitergeben */
    }
    const e = { event: this.event || 'message', data }
    this.event = ''
    this.daten = []
    return e
  }
}

export interface Verbrauch {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
}

export interface Antwortstand {
  text: string
  verbrauch: Verbrauch
  stopGrund: string | null
  fehler: { typ: string; meldung: string } | null
}

export const LEER: Antwortstand = { text: '', verbrauch: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, stopGrund: null, fehler: null }

type Obj = Record<string, unknown>
const zahl = (v: unknown) => (typeof v === 'number' ? v : 0)

/** Ein Ereignis auf den bisherigen Stand anwenden (rein, ohne Seiteneffekt). */
export function anwenden(stand: Antwortstand, e: SseEreignis): Antwortstand {
  const d = (e.data ?? {}) as Obj
  switch (d.type ?? e.event) {
    case 'message_start': {
      const u = ((d.message as Obj)?.usage ?? {}) as Obj
      return {
        ...stand,
        verbrauch: {
          input: zahl(u.input_tokens),
          output: zahl(u.output_tokens),
          cacheRead: zahl(u.cache_read_input_tokens),
          cacheWrite: zahl(u.cache_creation_input_tokens),
        },
      }
    }
    case 'content_block_delta': {
      const delta = (d.delta ?? {}) as Obj
      return delta.type === 'text_delta' ? { ...stand, text: stand.text + String(delta.text ?? '') } : stand
    }
    case 'message_delta': {
      const u = (d.usage ?? {}) as Obj
      // Die Ausgabe-Tokens in message_delta sind KUMULATIV, nicht ein
      // Zuschlag — aufaddiert stünde im Nutzungslog das Doppelte.
      return {
        ...stand,
        stopGrund: String(((d.delta ?? {}) as Obj).stop_reason ?? stand.stopGrund ?? ''),
        verbrauch: { ...stand.verbrauch, output: typeof u.output_tokens === 'number' ? u.output_tokens : stand.verbrauch.output },
      }
    }
    case 'error': {
      const err = (d.error ?? {}) as Obj
      return { ...stand, fehler: { typ: String(err.type ?? 'unknown'), meldung: String(err.message ?? '') } }
    }
    default:
      return stand
  }
}
