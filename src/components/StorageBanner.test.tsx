import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../i18n'
import { STORAGE_ERROR_EVENT, STORAGE_OK_EVENT } from '../persist'
import { StorageBanner } from './StorageBanner'

/**
 * Ebene 2: der Speicher-Warnstreifen.
 *
 * Er kannte nur „fehlgeschlagen" — nach einem einzigen Fehlschlag blieb er
 * stehen, auch wenn jede weitere Änderung längst sicher lag, und behauptete
 * Verluste, die es nicht gab (Audit 11/2026, TEC-12).
 */

const echt = Object.getOwnPropertyDescriptor(navigator, 'storage')
afterEach(() => {
  if (echt) Object.defineProperty(navigator, 'storage', echt)
  else delete (navigator as unknown as Record<string, unknown>).storage
})

describe('StorageBanner', () => {
  it('geht nach einem gelungenen Speichern wieder weg', () => {
    render(<StorageBanner />)
    expect(screen.queryByRole('alert')).toBeNull()
    act(() => {
      window.dispatchEvent(new CustomEvent(STORAGE_ERROR_EVENT))
    })
    expect(screen.getByRole('alert')).toHaveTextContent('Saving failed')
    act(() => {
      window.dispatchEvent(new CustomEvent(STORAGE_OK_EVENT))
    })
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('bittet nach dem ersten Render um dauerhafte Ablage — ohne darauf zu warten (TEC-11)', () => {
    const persist = vi.fn(() => new Promise<boolean>(() => undefined))
    Object.defineProperty(navigator, 'storage', { value: { persist }, configurable: true })
    render(<StorageBanner />)
    expect(persist).toHaveBeenCalledOnce()
  })
})
