import { act, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import '../i18n'
import { SignaturePad } from './SignaturePad'

/**
 * Getippte Unterschrift und Fokus (Audit 11/2026, A11Y-04): Enter im
 * Namensfeld oder „Sign" ersetzt Feld und Knopf durch die Vorschau — der
 * Fokus fiel auf <body>, und wer per Tastatur arbeitete, fing das lange
 * Formular von vorn an. Ebene 2: Es geht um echte Elemente und ihren Fokus.
 *
 * jsdom zeichnet nicht: Das Canvas bekommt einen Kontext, der nur misst
 * und ein festes Bild liefert, und `ResizeObserver` eine leere
 * Nachbildung — gezeichnet wird hier nichts, geprüft wird der Fokus.
 */
const getContextOriginal = HTMLCanvasElement.prototype.getContext
const toDataUrlOriginal = HTMLCanvasElement.prototype.toDataURL
beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    font: '',
    fillStyle: '',
    textBaseline: '',
    measureText: (s: string) => ({ width: s.length * 10 }),
    setTransform: () => undefined,
    save: () => undefined,
    restore: () => undefined,
    clearRect: () => undefined,
    fillRect: () => undefined,
    fillText: () => undefined,
  })) as unknown as typeof HTMLCanvasElement.prototype.getContext
  HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AAAA'
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  )
})
afterAll(() => {
  HTMLCanvasElement.prototype.getContext = getContextOriginal
  HTMLCanvasElement.prototype.toDataURL = toDataUrlOriginal
  vi.unstubAllGlobals()
})

/** Das Formular hält den Wert — wie GradingForm. */
function Formular({ start = null }: { start?: string | null }) {
  const [wert, setWert] = useState<string | null>(start)
  return <SignaturePad value={wert} onChange={setWert} label="Instructor signature" />
}

function tippmodus() {
  fireEvent.click(screen.getByRole('button', { name: /Type name instead/ }))
  return screen.getByRole('textbox', { name: 'Instructor signature' })
}

describe('SignaturePad: Fokus nach der getippten Unterschrift (A11Y-04)', () => {
  it('Name tippen, Enter → der Fokus steht auf „Clear", nicht auf <body>', () => {
    render(<Formular />)
    const feld = tippmodus()
    feld.focus()
    fireEvent.change(feld, { target: { value: 'Alex Beispiel' } })
    act(() => {
      fireEvent.keyDown(feld, { key: 'Enter' })
    })
    expect(screen.getByRole('img', { name: 'Instructor signature' })).toBeInTheDocument()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /Clear/ }))
  })

  it('„Sign" per Knopf → ebenfalls „Clear"', () => {
    render(<Formular />)
    const feld = tippmodus()
    fireEvent.change(feld, { target: { value: 'Alex Beispiel' } })
    const knopf = screen.getByRole('button', { name: 'Sign' })
    knopf.focus()
    act(() => {
      fireEvent.click(knopf)
    })
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /Clear/ }))
  })

  it('ohne Fokus im Tippbereich wird niemandem der Fokus weggezogen', () => {
    render(
      <>
        <button>anderswo</button>
        <Formular />
      </>,
    )
    const feld = tippmodus()
    fireEvent.change(feld, { target: { value: 'Alex Beispiel' } })
    const anderswo = screen.getByRole('button', { name: 'anderswo' })
    anderswo.focus()
    // Wie ein Klick per Zeigegerät, dessen Fokus woanders blieb.
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Sign' }))
    })
    expect(screen.getByRole('img', { name: 'Instructor signature' })).toBeInTheDocument()
    expect(document.activeElement).toBe(anderswo)
  })

  it('leerer Name unterschreibt nicht', () => {
    render(<Formular />)
    const feld = tippmodus()
    feld.focus()
    fireEvent.change(feld, { target: { value: '   ' } })
    fireEvent.keyDown(feld, { key: 'Enter' })
    expect(screen.queryByRole('img')).toBeNull()
    expect(document.activeElement).toBe(feld)
  })
})
