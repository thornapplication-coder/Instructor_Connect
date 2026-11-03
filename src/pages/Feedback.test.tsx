import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../i18n'
import { StoreProvider, useStore } from '../store'
import { Feedback } from './Feedback'

/**
 * Ebene 2: Feedback-Formular (Audit 11/2026, A11Y-16, MOB-08).
 *
 * Nachgestellt im Audit: leer absenden — ein Banner nannte drei Felder,
 * markiert war keins; nach dem Ausfuellen blieb das Banner stehen. Und
 * „Dringend" trug seinen Zustand nur im wechselnden Hinweistext.
 *
 * Angemeldet ist Alex (Superadmin), Oberflaeche deutsch.
 */

let laden: ReturnType<typeof useStore> | null = null
function Griff() {
  laden = useStore()
  return null
}
const store = () => laden!

beforeEach(async () => {
  await i18n.changeLanguage('de')
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date'] })
  const mittag = new Date(2026, 10, 3, 12, 0, 0)
  vi.setSystemTime(mittag)
  const ende = new Date(mittag)
  ende.setHours(23, 59, 59, 999)
  localStorage.setItem('aaa-user', 'u-patrick')
  localStorage.setItem('aaa-session-exp', String(ende.getTime()))
  laden = null
})

afterEach(() => {
  localStorage.clear()
  vi.useRealTimers()
})

const zeichne = () =>
  render(
    <StoreProvider>
      <Griff />
      <Feedback />
    </StoreProvider>,
  )

const empfaenger = () => screen.getByLabelText('Senden an *') as HTMLSelectElement
const kategorie = () => screen.getByLabelText('Kategorie *') as HTMLSelectElement
const nachricht = () => screen.getByLabelText('Deine Nachricht *')
const absenden = () => fireEvent.click(screen.getByRole('button', { name: 'Feedback senden' }))
const waehle = (feld: HTMLSelectElement) => fireEvent.change(feld, { target: { value: feld.options[1].value } })

describe('Pflichtfelder einzeln markiert, Banner nur solange etwas fehlt (A11Y-16)', () => {
  it('vor dem ersten Absenden: nichts markiert', () => {
    zeichne()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(empfaenger()).not.toHaveAttribute('aria-invalid')
  })

  it('leer absenden: jedes fehlende Feld traegt aria-invalid und seine eigene Meldung', () => {
    zeichne()
    absenden()
    expect(screen.getByRole('alert')).toHaveTextContent('Bitte die markierten Pflichtfelder ausfüllen.')
    expect(empfaenger()).toHaveAttribute('aria-invalid', 'true')
    expect(empfaenger()).toHaveAccessibleDescription('Bitte einen Empfänger wählen.')
    expect(kategorie()).toHaveAccessibleDescription('Bitte eine Kategorie wählen.')
    expect(nachricht()).toHaveAttribute('aria-invalid', 'true')
    expect(nachricht()).toHaveAccessibleDescription('Bitte eine Nachricht eingeben.')
    // Die Meldung ist Beschreibung, nicht Teil des Namens.
    expect(empfaenger()).toHaveAccessibleName('Senden an *')
  })

  it('ausgefuellt verschwinden Markierung, Meldung und zuletzt das Banner — ohne erneutes Absenden', () => {
    zeichne()
    absenden()
    waehle(empfaenger())
    expect(empfaenger()).not.toHaveAttribute('aria-invalid')
    expect(screen.queryByText('Bitte einen Empfänger wählen.')).toBeNull()
    expect(screen.getByRole('alert')).toBeInTheDocument()
    waehle(kategorie())
    fireEvent.change(nachricht(), { target: { value: 'Sitz klemmt.' } })
    expect(screen.queryByRole('alert')).toBeNull()
    expect(nachricht()).not.toHaveAttribute('aria-invalid')
  })

  it('Musterbezug ohne Muster: das Musterfeld ist markiert', () => {
    zeichne()
    waehle(empfaenger())
    waehle(kategorie())
    fireEvent.change(nachricht(), { target: { value: 'Sitz klemmt.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Musterbezogen' }))
    absenden()
    const muster = screen.getByLabelText('Muster *')
    expect(muster).toHaveAttribute('aria-invalid', 'true')
    expect(muster).toHaveAccessibleDescription('Bitte das Muster wählen – oder „Allgemein“.')
    expect(empfaenger()).not.toHaveAttribute('aria-invalid')
    // Nichts gespeichert.
    expect(store().state.feedbackEntries.some((f) => f.message === 'Sitz klemmt.')).toBe(false)
  })

  it('vollstaendig: gespeichert', () => {
    zeichne()
    waehle(empfaenger())
    waehle(kategorie())
    fireEvent.change(nachricht(), { target: { value: 'Alles gut.' } })
    absenden()
    expect(store().state.feedbackEntries.some((f) => f.message === 'Alles gut.')).toBe(true)
  })
})

describe('Store: dieselben Pflichtfelder (A11Y-16)', () => {
  it('weist ein unvollstaendiges Feedback ab', () => {
    zeichne()
    const vorher = store().state.feedbackEntries.length
    act(() => store().submitFeedback({ category: 'X', recipient: 'Y', urgent: false, message: '   ' }))
    act(() => store().submitFeedback({ category: 'X', recipient: 'Y', urgent: false, message: 'Text', aircraftType: '' }))
    expect(store().state.feedbackEntries.length).toBe(vorher)
    act(() => store().submitFeedback({ category: 'X', recipient: 'Y', urgent: false, message: 'Text', aircraftType: 'CL30' }))
    expect(store().state.feedbackEntries.length).toBe(vorher + 1)
  })
})

describe('„Dringend" (MOB-08)', () => {
  it('meldet seinen Zustand als aria-pressed; die Beschriftung bricht nicht', () => {
    zeichne()
    const knopf = screen.getByRole('button', { name: /^Dringend/ })
    expect(knopf).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(knopf)
    expect(knopf).toHaveAttribute('aria-pressed', 'true')
    const beschriftung = screen.getByText('Dringend')
    expect(beschriftung.className).toContain('whitespace-nowrap')
    expect(beschriftung.className).toContain('shrink-0')
  })
})
