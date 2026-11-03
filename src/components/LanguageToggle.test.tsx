import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import i18n from '../i18n'
import { LanguageToggle } from './ui'

/**
 * Sprachumschalter (Audit 11/2026, A11Y-09/A11Y-08): Er stand auf
 * Startseite und Anmeldung je von Hand im Code — auf der Anmeldeseite ohne
 * `aria-pressed`, auf beiden mit einem Rahmen, der den Fokusring abschnitt.
 * Ebene 2: Zustand und Rolle sind Eigenschaften des DOM. Ob der Ring
 * sichtbar bleibt, braucht Layout und steht in e2e/barrierefreiheit.spec.ts.
 */

afterEach(async () => {
  await act(() => i18n.changeLanguage('en'))
})

describe('LanguageToggle', () => {
  it('meldet die aktive Sprache als gedrückt und wechselt per Klick', async () => {
    await act(() => i18n.changeLanguage('en'))
    render(<LanguageToggle />)
    const gruppe = screen.getByRole('group', { name: 'Language' })
    expect(gruppe).toContainElement(screen.getByRole('button', { name: 'en', pressed: true }))
    expect(screen.getByRole('button', { name: 'de', pressed: false })).toBeInTheDocument()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'de' }))
    })
    expect(i18n.language).toBe('de')
    expect(document.documentElement.lang).toBe('de')
    expect(screen.getByRole('button', { name: 'de', pressed: true })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'en', pressed: false })).toBeInTheDocument()
    // Die Gruppe heißt jetzt in der neuen Sprache.
    expect(screen.getByRole('group', { name: 'Sprache' })).toBeInTheDocument()
  })

  it('schneidet den Fokusring nicht ab: kein overflow-hidden am Rahmen, Rundung an den Knöpfen', () => {
    render(<LanguageToggle />)
    const gruppe = screen.getByRole('group')
    expect(gruppe.className).not.toMatch(/\boverflow-(hidden|clip)\b/)
    const [erster, letzter] = screen.getAllByRole('button')
    expect(erster.className).toMatch(/\bfirst:rounded-l-/)
    expect(letzter.className).toMatch(/\blast:rounded-r-/)
    // Der fokussierte Knopf liegt über seinem Nachbarn — sonst verdeckte
    // die blaue Fläche von „DE" die linke Kante des Rings um „EN".
    expect(letzter.className).toMatch(/\bfocus-visible:z-10\b/)
  })
})
