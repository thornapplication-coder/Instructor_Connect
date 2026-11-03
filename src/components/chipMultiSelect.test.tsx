import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ChipMultiSelect } from './ui'

/**
 * Mehrfachauswahl mit festem Chip (Ebene 2, Audit 11/2026, VERW-09).
 *
 * Im Admin-Panel nahm sich ein Gruppenadmin mit einem Klick auf den eigenen
 * Chip selbst aus der Gruppe. Der Chip bleibt sichtbar und erreichbar —
 * er sagt, ob die Person drin ist —, laesst sich aber nicht umschalten.
 */
describe('ChipMultiSelect', () => {
  const optionen = [
    { id: 'u-christian', label: 'Chris Beispiel (du)', fest: true },
    { id: 'u-patrick', label: 'Alex Beispiel' },
  ]

  it('ein fester Chip meldet seinen Zustand und laesst sich nicht umschalten', async () => {
    const onChange = vi.fn()
    const nutzer = userEvent.setup()
    render(<ChipMultiSelect options={optionen} selected={['u-christian', 'u-patrick']} onChange={onChange} />)
    const selbst = screen.getByRole('button', { name: 'Chris Beispiel (du)' })
    expect(selbst).toHaveAttribute('aria-pressed', 'true')
    expect(selbst).toHaveAttribute('aria-disabled', 'true')
    // Per Tastatur erreichbar — aria-disabled, nicht disabled.
    await nutzer.tab()
    expect(selbst).toHaveFocus()
    await nutzer.keyboard('{Enter}')
    await nutzer.click(selbst)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('die uebrigen Chips schalten wie bisher', async () => {
    const onChange = vi.fn()
    const nutzer = userEvent.setup()
    render(<ChipMultiSelect options={optionen} selected={['u-christian', 'u-patrick']} onChange={onChange} />)
    const alex = screen.getByRole('button', { name: 'Alex Beispiel' })
    expect(alex).not.toHaveAttribute('aria-disabled')
    await nutzer.click(alex)
    expect(onChange).toHaveBeenCalledWith(['u-christian'])
  })
})
