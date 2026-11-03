import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Page, TopBar, TopBarAktion } from './ui'

/**
 * Kopfleiste und Seitenrahmen. Ebene 2: Name, Sprache und Klassen sind
 * Eigenschaften des DOM; ob der Titel am Telefon ungekürzt bleibt, braucht
 * Layout und steht in e2e/mobil.spec.ts.
 */
describe('TopBarAktion (Audit 11/2026, MOB-02/KERN-17)', () => {
  it('heißt wie ihre Beschriftung, zeigt sie aber erst ab sm — am Telefon nur das Plus', () => {
    const klick = vi.fn()
    render(<TopBar title="my AAA Logbook" back="/" right={<TopBarAktion label="Eintrag hinzufügen" onClick={klick} />} />)
    const knopf = screen.getByRole('button', { name: 'Eintrag hinzufügen' })
    // Die Beschriftung ist unter sm ausgeblendet, der Name bleibt.
    expect(screen.getByText('Eintrag hinzufügen')).toHaveClass('hidden', 'sm:inline')
    // 44 × 44 px auch ohne Text.
    expect(knopf).toHaveClass('min-h-11', 'min-w-11')
    fireEvent.click(knopf)
    expect(klick).toHaveBeenCalledTimes(1)
  })

  it('trägt eine abweichende Sprache, wenn sie angegeben ist', () => {
    render(<TopBarAktion label="New form" onClick={() => {}} lang="en" />)
    expect(screen.getByRole('button', { name: 'New form' })).toHaveAttribute('lang', 'en')
  })
})

describe('Sprache von Titel und Inhalt (Audit 11/2026, A11Y-12)', () => {
  it('lang steht am Titel, nicht an der ganzen Leiste — „Zurück" bleibt in der Sprache der Oberfläche', () => {
    render(<TopBar title="Grading Tool" back="/" lang="en" />)
    const titel = screen.getByRole('heading', { level: 1, name: 'Grading Tool' })
    expect(titel).toHaveAttribute('lang', 'en')
    expect(titel.closest('header')).not.toHaveAttribute('lang')
  })

  it('Page gibt lang an den Hauptbereich weiter; ohne Angabe erbt er die Seite', () => {
    const { rerender } = render(<Page lang="en">x</Page>)
    expect(screen.getByRole('main')).toHaveAttribute('lang', 'en')
    rerender(<Page>x</Page>)
    expect(screen.getByRole('main')).not.toHaveAttribute('lang')
  })
})

describe('Fenstertitel (Audit 11/2026, A11Y-13)', () => {
  it('die Kopfleiste setzt „<Seite> – Instructor Connect" und stellt beim Verlassen den Ausgangswert her', () => {
    document.title = 'Instructor Connect'
    const { unmount } = render(<TopBar title="Notes" back="/" />)
    expect(document.title).toBe('Notes – Instructor Connect')
    unmount()
    expect(document.title).toBe('Instructor Connect')
  })

  it('auch ein Titel aus Elementen (Chat-Gruppe als Knopf) gibt seinen Text', () => {
    document.title = 'Instructor Connect'
    const { unmount } = render(
      <TopBar
        title={
          <button>
            <span>CL30 Crew</span>
          </button>
        }
      />,
    )
    expect(document.title).toBe('CL30 Crew – Instructor Connect')
    unmount()
  })
})
