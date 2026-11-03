import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DocumentHead } from './DocumentHead'

/**
 * Kopf gedruckter Berichte (Ebene 2, Audit 11/2026, RPT-01): Die Statistik
 * druckte ohne ATO, Titel und Zeitpunkt. Geprüft wird, dass der Kopf alle
 * vier Angaben trägt und im Modus „nur Druck" auf dem Bildschirm ausbleibt.
 */
describe('DocumentHead', () => {
  const kopf = (nurDruck?: boolean) =>
    render(
      <DocumentHead
        absender={['Aviation Academy Austria', '', 'AT.ATO.106']}
        titel="Analytics"
        bereich="Period: Last 12 months · Fleet: All aircraft types · Authority: All authorities"
        stempel="Exported/printed on 02.11.2026 10:00 by Mika Beispiel — Instructor Connect"
        nurDruck={nurDruck}
      />,
    )

  it('nennt Absender, Titel, Bereich und Stempel — leere Teile des Absenders entfallen', () => {
    const { container } = kopf()
    expect(screen.getByText('Aviation Academy Austria · AT.ATO.106')).toBeTruthy()
    expect(screen.getByRole('heading', { level: 2, name: 'Analytics' })).toBeTruthy()
    expect(screen.getByText(/Authority: All authorities/)).toBeTruthy()
    expect(screen.getByText(/by Mika Beispiel/)).toBeTruthy()
    expect(container.firstElementChild!.className).not.toContain('hidden')
  })

  it('„nur Druck": auf dem Bildschirm verborgen, im Ausdruck sichtbar', () => {
    const { container } = kopf(true)
    expect(container.firstElementChild!.className).toContain('hidden')
    expect(container.firstElementChild!.className).toContain('print:block')
  })
})
