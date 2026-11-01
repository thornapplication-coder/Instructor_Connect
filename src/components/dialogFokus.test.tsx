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
function Dialog({ onEscape }: { onEscape: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useDialogFokus(ref, onEscape)
  return (
    <div ref={ref} tabIndex={-1} role="dialog" aria-label="Viewer">
      Inhalt
    </div>
  )
}

function Seite({ onEscape }: { onEscape: () => void }) {
  const [auf, setAuf] = useState(false)
  return (
    <>
      <button onClick={() => setAuf(true)}>Öffnen</button>
      <button onClick={() => setAuf(false)}>Zu</button>
      {auf && <Dialog onEscape={onEscape} />}
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
})
