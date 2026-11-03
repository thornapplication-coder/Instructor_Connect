import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import i18n from '../i18n'
import { Modal } from './ui'

/**
 * Audit 11/2026, UID-04: Der Dialog wurde an Ort und Stelle gerendert. In
 * einem `space-y-stack`-Stapel bekam die feste Abdunklung dadurch 12 px
 * margin-top; oben blieb ein heller Streifen, und ein Klick dorthin traf den
 * Zurück-Knopf der Kopfleiste — Eingaben weg, ohne Rückfrage. Jetzt hängt
 * er direkt unter <body>. Ebene 2: Die Lage im DOM ist prüfbar, der
 * Abstand selbst braucht Layout.
 */
function Seite({ lang }: { lang?: string }) {
  const [auf, setAuf] = useState(false)
  return (
    <main>
      <div className="space-y-stack">
        <p>Vorher</p>
        <button onClick={() => setAuf(true)}>Neuer Nutzer</button>
        {auf && (
          <Modal title="Benutzer anlegen" onClose={() => setAuf(false)} lang={lang}>
            <input aria-label="Name" />
          </Modal>
        )}
      </div>
    </main>
  )
}

describe('Modal', () => {
  it('hängt die Abdunklung direkt unter <body>, nicht in den Stapel der Seite', () => {
    render(<Seite />)
    fireEvent.click(screen.getByText('Neuer Nutzer'))
    const dialog = screen.getByRole('dialog', { name: 'Benutzer anlegen' })
    const abdunklung = dialog.parentElement!
    expect(abdunklung).toHaveAttribute('role', 'presentation')
    expect(abdunklung.parentElement).toBe(document.body)
    expect(document.querySelector('.space-y-stack')).not.toContainElement(dialog)
  })

  it('Fokus und Schließen wirken auch über das Portal: Escape schließt, Fokus zurück zum Auslöser', () => {
    render(<Seite />)
    const oeffner = screen.getByText('Neuer Nutzer')
    oeffner.focus()
    fireEvent.click(oeffner)
    expect(screen.getByRole('dialog')).toContainElement(document.activeElement as HTMLElement)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(oeffner)
    // Die Scroll-Sperre der Seite ist wieder aufgehoben.
    expect(document.body.style.overflow).toBe('')
  })

  it('ein Klick auf die Abdunklung schließt, einer in den Dialog nicht', () => {
    render(<Seite />)
    fireEvent.click(screen.getByText('Neuer Nutzer'))
    fireEvent.click(screen.getByLabelText('Name'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('dialog').parentElement!)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('fragt vor dem Verwerfen nach, wenn confirmDiscard gesetzt ist', () => {
    const zu = vi.fn()
    const frage = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(
      <Modal title="Notiz" onClose={zu} confirmDiscard="Verwerfen?">
        <p>x</p>
      </Modal>,
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(frage).toHaveBeenCalledWith('Verwerfen?')
    expect(zu).not.toHaveBeenCalled()
    frage.mockReturnValue(true)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(zu).toHaveBeenCalledTimes(1)
    frage.mockRestore()
  })

  // A11Y-12: Unter <body> erbt der Dialog die Sprache seiner Seite nicht
  // mehr — Grading-Dialoge geben sie deshalb selbst an.
  it('trägt die angegebene Sprache am Dialog', async () => {
    await i18n.changeLanguage('de')
    render(<Seite lang="en" />)
    fireEvent.click(screen.getByText('Neuer Nutzer'))
    expect(screen.getByRole('dialog')).toHaveAttribute('lang', 'en')
    // „Schließen" bleibt in der Sprache der Oberfläche und sagt das selbst.
    expect(screen.getByRole('button', { name: 'Schließen' })).toHaveAttribute('lang', 'de')
  })

  it('ohne abweichende Sprache trägt auch der Schließen-Knopf keine eigene', async () => {
    await i18n.changeLanguage('de')
    render(<Seite />)
    fireEvent.click(screen.getByText('Neuer Nutzer'))
    expect(screen.getByRole('button', { name: 'Schließen' })).not.toHaveAttribute('lang')
  })
})
