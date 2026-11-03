import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '../i18n'
import { registriereOffeneArbeit } from '../editGuard'
import { UpdateBanner } from './UpdateBanner'

/**
 * Ebene 2: der Update-Streifen mit einem nachgebauten Service-Worker-Container.
 *
 * Audit 11/2026, TEC-02: DocCheck meldet seine Sitzung jetzt als offene
 * Arbeit. Damit lädt ein DocCheck-Tab nicht mehr nach, wenn ein ANDERER Tab
 * die neue Version übernimmt — und dann gibt es keinen wartenden Worker
 * mehr, dem „Jetzt aktualisieren" SKIP_WAITING schicken könnte. Der Knopf
 * tat in dieser Lage nichts. Geprüft wird, dass er selbst neu lädt und dass
 * das Neuladen von allein folgt, sobald die Arbeit erledigt ist.
 */

class Worker extends EventTarget {
  state = 'installed'
  postMessage = vi.fn()
}

let container: EventTarget & { controller: object | null; register: (url: string) => Promise<unknown> }
let reg: { waiting: Worker | null; installing: Worker | null; update: ReturnType<typeof vi.fn>; addEventListener: ReturnType<typeof vi.fn> }
let abmelden: (() => void) | undefined

function einrichten({ controller = {} as object | null, wartet = true } = {}) {
  reg = { waiting: wartet ? new Worker() : null, installing: null, update: vi.fn(async () => undefined), addEventListener: vi.fn() }
  container = Object.assign(new EventTarget(), { controller, register: vi.fn(async () => reg) })
  Object.defineProperty(navigator, 'serviceWorker', { value: container, configurable: true })
}

/** Registrierung (Promise) durchlaufen lassen. */
const registriert = () => act(async () => undefined)

/** Ein anderer Tab hat übernommen: kein wartender Worker mehr, neuer Controller. */
function fremdeUebernahme() {
  reg.waiting = null
  act(() => {
    container.dispatchEvent(new Event('controllerchange'))
  })
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'performance'] })
})

afterEach(() => {
  abmelden?.()
  abmelden = undefined
  vi.useRealTimers()
  Reflect.deleteProperty(navigator, 'serviceWorker')
})

describe('UpdateBanner', () => {
  it('übernimmt eine wartende Version von selbst, wenn nichts offen ist', async () => {
    einrichten()
    const neuLaden = vi.fn()
    render(<UpdateBanner neuLaden={neuLaden} />)
    await registriert()
    expect(screen.getByRole('button', { name: 'Update now' })).toBeInTheDocument()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(7000)
    })
    expect(reg.waiting!.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' })
    act(() => {
      container.dispatchEvent(new Event('controllerchange'))
    })
    expect(neuLaden).toHaveBeenCalledOnce()
  })

  it('lädt bei Übernahme aus einem anderen Tab sofort nach, wenn nichts offen ist', async () => {
    einrichten()
    const neuLaden = vi.fn()
    render(<UpdateBanner neuLaden={neuLaden} />)
    await registriert()
    fremdeUebernahme()
    expect(neuLaden).toHaveBeenCalledOnce()
  })

  it('offene Arbeit: kein Neuladen bei fremder Übernahme, der Knopf lädt selbst (TEC-02)', async () => {
    einrichten()
    abmelden = registriereOffeneArbeit(() => true)
    const neuLaden = vi.fn()
    render(<UpdateBanner neuLaden={neuLaden} />)
    await registriert()
    fremdeUebernahme()
    expect(neuLaden).not.toHaveBeenCalled()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000)
    })
    // Die Sitzungsdokumente bleiben: nichts lädt von selbst neu.
    expect(neuLaden).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Update now' }))
    expect(neuLaden).toHaveBeenCalledOnce()
  })

  /*
   * Gegenprüfung zu TEC-02: Nach einer fremden Übernahme läuft dieser Tab mit
   * altem Code unter dem neuen Worker — was er erst jetzt nachlädt (etwa die
   * Bibliothek eines Exports), kann fehlen. Der Streifen sagte trotzdem
   * „wird automatisch geladen", was die offene Arbeit gerade verhindert.
   */
  it('nach fremder Übernahme mit offener Arbeit mahnt der Streifen statt „automatisch"', async () => {
    einrichten()
    abmelden = registriereOffeneArbeit(() => true)
    render(<UpdateBanner neuLaden={vi.fn()} />)
    await registriert()
    // Solange die Version nur wartet, stimmt der ruhige Hinweis.
    expect(screen.getByRole('status')).toHaveTextContent('New version available')
    expect(screen.getByRole('status')).toHaveClass('bg-accent')
    fremdeUebernahme()
    const streifen = screen.getByRole('status')
    expect(streifen).toHaveTextContent('already active')
    expect(streifen).not.toHaveTextContent('updating automatically')
    expect(streifen).toHaveClass('bg-wait')
    expect(screen.getByRole('button', { name: 'Update now' })).toBeInTheDocument()
  })

  it('offene Arbeit erledigt: das ausstehende Neuladen folgt von selbst', async () => {
    einrichten()
    let offen = true
    abmelden = registriereOffeneArbeit(() => offen)
    const neuLaden = vi.fn()
    render(<UpdateBanner neuLaden={neuLaden} />)
    await registriert()
    fremdeUebernahme()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })
    expect(neuLaden).not.toHaveBeenCalled()
    offen = false
    await act(async () => {
      await vi.advanceTimersByTimeAsync(7000)
    })
    expect(neuLaden).toHaveBeenCalledOnce()
    // Danach nicht in jedem Takt erneut.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })
    expect(neuLaden).toHaveBeenCalledOnce()
  })

  it('zeigt den Streifen auch, wenn dieser Tab die wartende Version nie gesehen hat', async () => {
    einrichten({ wartet: false })
    abmelden = registriereOffeneArbeit(() => true)
    render(<UpdateBanner neuLaden={vi.fn()} />)
    await registriert()
    expect(screen.queryByRole('button', { name: 'Update now' })).toBeNull()
    fremdeUebernahme()
    expect(screen.getByRole('button', { name: 'Update now' })).toBeInTheDocument()
  })

  it('lädt bei der Erstinstallation nicht neu', async () => {
    einrichten({ controller: null, wartet: false })
    const neuLaden = vi.fn()
    render(<UpdateBanner neuLaden={neuLaden} />)
    await registriert()
    fremdeUebernahme()
    expect(neuLaden).not.toHaveBeenCalled()
  })

  /*
   * Gegenprüfung P3 (im Browser nachgestellt): Die Marke „Erstinstallation"
   * blieb für die ganze Lebenszeit des Tabs stehen. Wer die App zum ersten
   * Mal öffnete und den Tab offen ließ, überging danach JEDE Übernahme aus
   * einem anderen Tab — mit DocCheck-Dokumenten stand weiter „wird
   * automatisch geladen", und der Knopf schickte SKIP_WAITING ins Leere.
   */
  it('nach der Erstinstallation ist der nächste Wechsel ein Update — mit offener Arbeit mahnt der Streifen', async () => {
    einrichten({ controller: null, wartet: false })
    abmelden = registriereOffeneArbeit(() => true)
    const neuLaden = vi.fn()
    render(<UpdateBanner neuLaden={neuLaden} />)
    await registriert()
    fremdeUebernahme() // die Installation selbst
    expect(screen.queryByRole('status')).toBeNull()
    fremdeUebernahme() // später: ein anderer Tab übernimmt eine neue Version
    expect(neuLaden).not.toHaveBeenCalled()
    expect(screen.getByRole('status')).toHaveTextContent('already active')
    fireEvent.click(screen.getByRole('button', { name: 'Update now' }))
    expect(neuLaden).toHaveBeenCalledOnce()
  })

  it('nach der Erstinstallation lädt eine fremde Übernahme ohne offene Arbeit sofort nach', async () => {
    einrichten({ controller: null, wartet: false })
    const neuLaden = vi.fn()
    render(<UpdateBanner neuLaden={neuLaden} />)
    await registriert()
    fremdeUebernahme()
    expect(neuLaden).not.toHaveBeenCalled()
    fremdeUebernahme()
    expect(neuLaden).toHaveBeenCalledOnce()
  })
})
