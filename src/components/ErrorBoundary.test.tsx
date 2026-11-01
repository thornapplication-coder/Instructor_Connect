import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
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

describe('ErrorBoundary', () => {
  it('ein absichtlicher Fehler bleibt im Bereich, der Rest der Seite steht (Abnahme Phase 1)', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<Seite />)
    expect(screen.getByText('Andere Kachel')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Fehler DC-TEST' })).toBeInTheDocument()
  })

  it('meldet den Fehler an onError', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
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
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<Seite />)
    fireEvent.click(screen.getByRole('button', { name: /Fehler/ }))
    expect(screen.getByText('Modul laeuft')).toBeInTheDocument()
  })
})
