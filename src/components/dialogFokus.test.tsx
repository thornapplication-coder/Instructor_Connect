import { fireEvent, render, screen } from '@testing-library/react'
import { useRef, useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { useDialogFokus } from './ui'

/**
 * Fokusführung der Dialoge (Barrierefreiheitsprüfung 01.11.2026): Der
 * DocCheck-Viewer übernahm den Fokus nicht und gab ihn nicht zurück. Jetzt
 * teilen Modal und Viewer EINEN Hook — geprüft wird er hier. (Die Tab-Falle
 * braucht Layout; jsdom kennt kein offsetParent, sie bleibt Ebene 3.)
 */
function Dialog({ onEscape, feld = false }: { onEscape: () => void; feld?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useDialogFokus(ref, onEscape)
  return (
    <div ref={ref} tabIndex={-1} role="dialog" aria-label="Viewer">
      Inhalt
      {feld && <input aria-label="Titel" autoFocus />}
    </div>
  )
}

function Seite({ onEscape, feld = false, auf: anfangsAuf = false }: { onEscape: () => void; feld?: boolean; auf?: boolean }) {
  const [auf, setAuf] = useState(anfangsAuf)
  const [oeffnerDa, setOeffnerDa] = useState(true)
  return (
    <>
      <h1 data-page-heading tabIndex={-1}>
        Notes
      </h1>
      {oeffnerDa && <button onClick={() => setAuf(true)}>Öffnen</button>}
      <button onClick={() => setAuf(false)}>Zu</button>
      {/* „Löschen" nimmt den Knopf mit, der den Dialog geöffnet hat */}
      <button
        onClick={() => {
          setOeffnerDa(false)
          setAuf(false)
        }}
      >
        Löschen
      </button>
      {auf && <Dialog onEscape={onEscape} feld={feld} />}
    </>
  )
}

describe('useDialogFokus', () => {
  it('Fokus in den Dialog, Escape meldet, beim Schließen zurück zum Auslöser', () => {
    const esc = vi.fn()
    render(<Seite onEscape={esc} />)
    const oeffner = screen.getByText('Öffnen')
    oeffner.focus()
    fireEvent.click(oeffner)
    expect(document.activeElement).toBe(screen.getByRole('dialog'))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(esc).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(document, { key: 'a' })
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(esc).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByText('Zu'))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(oeffner)
  })

  // Audit 11/2026, A11Y-03: React fokussiert ein autoFocus-Feld beim
  // Einhängen, also VOR jedem Effekt. Der Hook las den Auslöser im Effekt
  // und merkte sich damit das Feld selbst — nach dem Schließen stand der
  // Fokus auf <body>. Gegenprobe: Auslöser wieder im Effekt lesen → rot.
  it('Dialog mit autoFocus-Feld: beim Schließen zurück zum Auslöser, nicht auf <body>', () => {
    render(<Seite onEscape={() => {}} feld />)
    const oeffner = screen.getByText('Öffnen')
    oeffner.focus()
    fireEvent.click(oeffner)
    expect(screen.getByRole('dialog')).toContainElement(document.activeElement as HTMLElement)
    fireEvent.click(screen.getByText('Zu'))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(oeffner)
  })

  // A11Y-17: Der DocCheck-Hinweis geht beim Laden auf — Auslöser ist <body>.
  it('ohne Auslöser (beim Laden geöffnet): nach dem Schließen auf der Seitenüberschrift', () => {
    render(<Seite onEscape={() => {}} auf />)
    expect(document.activeElement).toBe(screen.getByRole('dialog'))
    fireEvent.click(screen.getByText('Zu'))
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Notes' }))
  })

  it('Auslöser verschwindet mit dem Schließen: auf der Seitenüberschrift statt auf <body>', () => {
    render(<Seite onEscape={() => {}} />)
    const oeffner = screen.getByText('Öffnen')
    oeffner.focus()
    fireEvent.click(oeffner)
    fireEvent.click(screen.getByText('Löschen'))
    expect(screen.queryByText('Öffnen')).toBeNull()
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Notes' }))
  })
})
