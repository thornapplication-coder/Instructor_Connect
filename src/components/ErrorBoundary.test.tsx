import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ErrorBoundary } from './ErrorBoundary'

function Wirft({ an }: { an: boolean }): JSX.Element {
  if (an) throw new Error('DC-TEST')
  return <p>Modul laeuft</p>
}

/** Nachbau der Lage in App.tsx: Nachbar-Bereich ausserhalb der Grenze. */
function Seite() {
  const [kaputt, setKaputt] = useState(true)
  return (
    <div>
      <p>Andere Kachel</p>
      <ErrorBoundary
        fallback={(f, reset) => (
          <button
            onClick={() => {
              setKaputt(false)
              reset()
            }}
          >
            Fehler {f.message}
          </button>
        )}
      >
        <Wirft an={kaputt} />
      </ErrorBoundary>
    </div>
  )
}

/**
 * Erwartete Fehler bleiben still (Audit 11/2026, CIG-06).
 *
 * Der Spy auf console.error allein reichte nicht: React meldet einen
 * abgefangenen Renderfehler zusätzlich als Fehlerereignis am Fenster, und
 * jsdom schreibt ein UNBEHANDELTES Fehlerereignis über seine virtuelle
 * Konsole direkt nach stderr — am Spy vorbei. Jeder Testlauf, auch in CI
 * und vor jeder Veröffentlichung, trug so sechs Stacktraces „Uncaught
 * [Error: DC-TEST]" bei grünen Tests; ein echter Fehler wäre darin
 * untergegangen. `preventDefault()` markiert das Ereignis als behandelt.
 * Nur in dieser Datei: Anderswo ist ein solcher Fehler eben NICHT erwartet.
 */
const schlucken = (e: ErrorEvent) => e.preventDefault()

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  window.addEventListener('error', schlucken)
})

afterEach(() => {
  window.removeEventListener('error', schlucken)
  vi.restoreAllMocks()
})

describe('ErrorBoundary', () => {
  it('ein absichtlicher Fehler bleibt im Bereich, der Rest der Seite steht (Abnahme Phase 1)', () => {
    render(<Seite />)
    expect(screen.getByText('Andere Kachel')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Fehler DC-TEST' })).toBeInTheDocument()
  })

  it('meldet den Fehler an onError', () => {
    const onError = vi.fn()
    render(
      <ErrorBoundary onError={onError} fallback={(f) => <p>{f.message}</p>}>
        <Wirft an />
      </ErrorBoundary>,
    )
    expect(onError).toHaveBeenCalledOnce()
    expect(screen.getByText('DC-TEST')).toBeInTheDocument()
  })

  it('laesst sich zuruecksetzen — danach rendert der Bereich wieder', () => {
    render(<Seite />)
    fireEvent.click(screen.getByRole('button', { name: /Fehler/ }))
    expect(screen.getByText('Modul laeuft')).toBeInTheDocument()
  })

  it('setzt sich zurück, sobald sich „zuruecksetzenBei" ändert (Seitenwechsel, Audit 11/2026, TEC-07)', () => {
    const { rerender } = render(
      <ErrorBoundary zuruecksetzenBei="/notes" fallback={(f) => <p>Fehler {f.message}</p>}>
        <Wirft an />
      </ErrorBoundary>,
    )
    expect(screen.getByText('Fehler DC-TEST')).toBeInTheDocument()
    // Gleicher Schlüssel: Die Meldung bleibt, auch wenn der Inhalt jetzt ginge.
    rerender(
      <ErrorBoundary zuruecksetzenBei="/notes" fallback={(f) => <p>Fehler {f.message}</p>}>
        <Wirft an={false} />
      </ErrorBoundary>,
    )
    expect(screen.getByText('Fehler DC-TEST')).toBeInTheDocument()
    rerender(
      <ErrorBoundary zuruecksetzenBei="/" fallback={(f) => <p>Fehler {f.message}</p>}>
        <Wirft an={false} />
      </ErrorBoundary>,
    )
    expect(screen.getByText('Modul laeuft')).toBeInTheDocument()
  })
})
