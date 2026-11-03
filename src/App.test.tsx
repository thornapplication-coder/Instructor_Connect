import { act, fireEvent, render, screen } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import './i18n'
import App from './App'
import { AppFehler, SeitenFehler } from './components/Fehlerseite'

/**
 * Ebene 2: die Fehlergrenzen der App (Audit 11/2026, TEC-07).
 *
 * Vorher gab es außerhalb von DocCheck keine: Jeder Renderfehler machte die
 * ganze App weiß — Impressum und Sandbox-Leiste („Daten zurücksetzen")
 * eingeschlossen. War er datenbedingt, blieb das bei jedem Start so.
 *
 * Geprüft wird die echte App mit echtem Store; nur die Startseite bzw. die
 * Sandbox-Leiste werfen auf Wunsch.
 */

const wirft = vi.hoisted(() => ({ seite: false, huelle: false }))

vi.mock('./pages/Home', async (original) => {
  const echt = await original<typeof import('./pages/Home')>()
  return {
    ...echt,
    Home: (p: Parameters<typeof echt.Home>[0]) => {
      if (wirft.seite) throw new Error('Startseite kaputt')
      return createElement(echt.Home, p)
    },
  }
})

vi.mock('./components/SandboxBar', async (original) => {
  const echt = await original<typeof import('./components/SandboxBar')>()
  return {
    ...echt,
    SandboxBar: () => {
      if (wirft.huelle) throw new Error('Hülle kaputt')
      return createElement(echt.SandboxBar)
    },
  }
})

/** React meldet abgefangene Renderfehler zusätzlich als Fehlerereignis am
 *  Fenster; jsdom gibt das am console.error-Spy vorbei aus. Hier erwartet. */
const erwartet = (e: ErrorEvent) => e.preventDefault()

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  // Der Router scrollt beim Seitenwechsel nach oben — jsdom kennt das nicht.
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  window.addEventListener('error', erwartet)
  localStorage.setItem('aaa-user', 'u-patrick')
  localStorage.setItem('aaa-session-exp', String(Date.now() + 3_600_000))
  window.location.hash = '#/'
})

afterEach(() => {
  wirft.seite = false
  wirft.huelle = false
  window.removeEventListener('error', erwartet)
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('Fehlergrenzen der App', () => {
  it('eine werfende Seite zeigt die Fehlerseite — Hülle und Sandbox-Leiste bleiben', () => {
    wirft.seite = true
    render(<App />)
    expect(screen.getByRole('heading', { name: 'This view could not be displayed' })).toBeInTheDocument()
    expect(screen.getByText(/Startseite kaputt/)).toBeInTheDocument()
    // Die Hülle steht: Sandbox-Leiste samt „Daten zurücksetzen".
    expect(screen.getByText('Sandbox')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reset data' })).toBeInTheDocument()
  })

  it('ein Seitenwechsel setzt die Grenze zurück — die neue Seite erscheint', async () => {
    wirft.seite = true
    render(<App />)
    expect(screen.getByRole('heading', { name: 'This view could not be displayed' })).toBeInTheDocument()
    await act(async () => {
      window.location.hash = '#/imprint'
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    expect(screen.queryByRole('heading', { name: 'This view could not be displayed' })).toBeNull()
  })

  it('wirft die Hülle selbst, fängt die äußere Grenze — statt einer weißen Seite', () => {
    wirft.huelle = true
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Instructor Connect could not start' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Back up data and start fresh' })).toBeInTheDocument()
  })
})

describe('Ausgänge der Fehlerseiten', () => {
  it('Neu laden, Zur Startseite, Stand sichern und frisch starten', async () => {
    const neuLaden = vi.fn()
    const zuruecksetzen = vi.fn()
    window.location.hash = '#/notes'
    render(<SeitenFehler fehler={new Error('x')} zuruecksetzen={zuruecksetzen} neuLaden={neuLaden} />)
    fireEvent.click(screen.getByRole('button', { name: 'Home screen' }))
    expect(window.location.hash).toBe('#/')
    expect(zuruecksetzen).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }))
    expect(neuLaden).toHaveBeenCalledOnce()
    // Beiseitelegen sichert erst (persist.standBeiseitelegen), dann lädt neu.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Back up data and start fresh' }))
    })
    await vi.waitFor(() => expect(neuLaden).toHaveBeenCalledTimes(2))
  })

  it('scheitert das Sichern, sagt die Seite es — und lädt nicht neu', async () => {
    const persist = await import('./persist')
    vi.spyOn(persist, 'standBeiseitelegen').mockResolvedValue(false)
    const neuLaden = vi.fn()
    render(<AppFehler fehler={new Error('')} neuLaden={neuLaden} />)
    // Ohne Meldung steht wenigstens die Art des Fehlers da.
    expect(screen.getByText(/Error: Error/)).toBeInTheDocument()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Back up data and start fresh' }))
    })
    expect(await screen.findByText('The data could not be backed up — nothing was deleted.')).toBeInTheDocument()
    expect(neuLaden).not.toHaveBeenCalled()
  })
})
