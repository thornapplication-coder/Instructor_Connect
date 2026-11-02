import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '../../i18n'

/**
 * Ebene 2: die Hülle der DocCheck-Kachel, wenn das Modul nicht kommt
 * (Audit 11/2026, TEC-08).
 *
 * „Erneut versuchen" setzte nur die Fehlergrenze zurück — nach einem
 * gescheiterten Nachladen eine Sackgasse: Das `lazy` hält sein abgelehntes
 * Versprechen, und Chromium merkt sich den gescheiterten Modulabruf. Jetzt
 * lädt der Knopf bei einem Ladefehler die Seite neu; bei einem Renderfehler
 * setzt er weiter nur zurück (ein Neuladen verwürfe die Sitzungsdokumente).
 *
 * Jeder Test lädt die Hülle frisch: Das `lazy` steht auf Modulebene, und ein
 * einmal abgelehnter Import bliebe für alle folgenden Tests abgelehnt.
 */

vi.mock('../../store', () => ({
  useStore: () => ({
    docCheckSettings: { features: { doccheck: true } },
    docCheckRolle: 'pruefer',
    updateDocCheckSettings: vi.fn(),
  }),
}))

/** React meldet abgefangene Renderfehler zusätzlich am Fenster — hier erwartet. */
const erwartet = (e: ErrorEvent) => e.preventDefault()

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  window.addEventListener('error', erwartet)
  vi.resetModules()
})

afterEach(() => {
  window.removeEventListener('error', erwartet)
  vi.doUnmock('./DocCheckApp')
  vi.restoreAllMocks()
})

async function huelle(modul: () => Record<string, unknown>) {
  vi.doMock('./DocCheckApp', modul)
  const { DocCheckRoute } = await import('./index')
  const neuLaden = vi.fn()
  render(<DocCheckRoute neuLaden={neuLaden} />)
  return neuLaden
}

describe('DocCheck-Hülle: „Erneut versuchen"', () => {
  it('nach einem Ladefehler lädt der Knopf die Seite neu', async () => {
    // Eine werfende Mock-Fabrik verpackt vitest in eine eigene Meldung. Ein
    // Modul, das seinen Inhalt nicht hergibt, liefert dagegen genau den
    // Fehler des Browsers an die Grenze — wie ein abgelehntes `lazy`, das
    // React mit seinem Ablehnungsgrund wirft.
    const neuLaden = await huelle(() => ({
      get default(): never {
        throw new TypeError('Failed to fetch dynamically imported module: https://app.test/assets/DocCheckApp-a1.js')
      },
    }))
    expect(await screen.findByText("Error code: DC-LOAD")).toBeInTheDocument()
    expect(screen.getByText(/downloaded when first opened/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(neuLaden).toHaveBeenCalledOnce()
  })

  it('nach einem Renderfehler setzt er nur zurück — kein Neuladen, keine verlorenen Dokumente', async () => {
    let kaputt = true
    const neuLaden = await huelle(() => ({
      default: () => {
        if (kaputt) throw new TypeError("Cannot read properties of undefined (reading 'docs')")
        return <p>Modul läuft</p>
      },
    }))
    // Ein Renderfehler hieß vorher ebenfalls „DC-LOAD".
    expect(await screen.findByText('Error code: DC-RENDER')).toBeInTheDocument()
    expect(screen.getByText(/affects DocCheck only/)).toBeInTheDocument()
    kaputt = false
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Modul läuft')).toBeInTheDocument()
    expect(neuLaden).not.toHaveBeenCalled()
  })

  it('ein eigener DC-Code bleibt stehen', async () => {
    await huelle(() => ({
      default: () => {
        throw new Error('DC-WORKER')
      },
    }))
    expect(await screen.findByText('Error code: DC-WORKER')).toBeInTheDocument()
  })
})
