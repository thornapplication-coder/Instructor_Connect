import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../i18n'
import { StoreProvider, useStore } from '../store'
import { WhoToCall } from './WhoToCall'

/**
 * Ebene 2: Who to call (Audit 11/2026, KERN-16) — keine Knoepfe ohne Ziel,
 * keine doppelte Abteilung, Formatfehler am Feld.
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
      <WhoToCall />
    </StoreProvider>,
  )

/** Die Karte eines Kontakts — die Karte traegt als einziges Element darueber p-4. */
const karte = (name: string) => screen.getByText(name).closest('.p-4') as HTMLElement

describe('Knoepfe nur mit Ziel (KERN-16)', () => {
  it('ohne Telefon kein „Anrufen", ohne Adresse kein „Nachricht senden", keine Zeile „ · "', () => {
    zeichne()
    act(() => store().saveContact({ department: 'Training', position: 'Nur Mail', name: 'Mail Beispiel', phone: '', email: 'mail@example.test' }))
    act(() => store().saveContact({ department: 'Training', position: 'Nur Telefon', name: 'Tel Beispiel', phone: '+43 1 5550 777', email: '' }))
    act(() => store().saveContact({ department: 'Training', position: 'Nichts', name: 'Ohne Beispiel', phone: '', email: '' }))

    const nurMail = karte('Mail Beispiel')
    expect(within(nurMail).queryByRole('link', { name: 'Anrufen' })).toBeNull()
    expect(within(nurMail).getByRole('link', { name: 'Nachricht senden' })).toHaveAttribute('href', 'mailto:mail@example.test')
    expect(within(nurMail).getByText('mail@example.test')).toBeInTheDocument()

    const nurTel = karte('Tel Beispiel')
    expect(within(nurTel).getByRole('link', { name: 'Anrufen' })).toHaveAttribute('href', 'tel:+4315550777')
    expect(within(nurTel).queryByRole('link', { name: 'Nachricht senden' })).toBeNull()
    expect(within(nurTel).getByText('+43 1 5550 777')).toBeInTheDocument()

    const ohne = karte('Ohne Beispiel')
    expect(within(ohne).queryAllByRole('link')).toHaveLength(0)
    expect(ohne.textContent).not.toContain(' · ')
  })

  it('„Training " aus dem Altbestand ist kein zweiter Chip', () => {
    zeichne()
    // Altbestand direkt hineingelegt — der Store speichert so etwas nicht
    // mehr. Der naechste Speichervorgang zeichnet neu und nimmt ihn mit.
    store().state.contacts.push({ id: 'c-alt', department: 'Training ', position: '', name: 'Alt Beispiel', phone: '', email: '' })
    act(() => store().saveContact({ department: 'Training', position: '', name: 'Neu Beispiel', phone: '', email: '' }))
    expect(screen.getByText('Alt Beispiel')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Training' })).toHaveLength(1)
    // EIN Abschnitt „Training", darin beide.
    const abschnitte = screen.getAllByRole('heading', { level: 2, name: 'Training' })
    expect(abschnitte).toHaveLength(1)
    const abschnitt = abschnitte[0].closest('section')!
    expect(within(abschnitt).getByText('Alt Beispiel')).toBeInTheDocument()
    expect(within(abschnitt).getByText('Neu Beispiel')).toBeInTheDocument()
  })
})

describe('Dialog: Formatfehler am Feld (KERN-16)', () => {
  it('unlesbare Nummer: Meldung, aria-invalid, Speichern gesperrt; Feldtypen tel/email', () => {
    zeichne()
    fireEvent.click(screen.getByRole('button', { name: 'Neuer Kontakt' }))
    const dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Abteilung'), { target: { value: 'Training' } })
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Neu Beispiel' } })
    const tel = within(dialog).getByLabelText('Telefonnummer')
    const mail = within(dialog).getByLabelText('E-Mail-Adresse')
    expect(tel).toHaveAttribute('type', 'tel')
    expect(mail).toHaveAttribute('type', 'email')
    fireEvent.change(tel, { target: { value: 'bitte anrufen' } })
    expect(tel).toHaveAttribute('aria-invalid', 'true')
    expect(tel).toHaveAccessibleDescription(/sieht nicht nach einer Telefonnummer aus/)
    expect(within(dialog).getByRole('button', { name: 'Speichern' })).toBeDisabled()
    fireEvent.change(tel, { target: { value: '+43 1 5550 999' } })
    expect(tel).not.toHaveAttribute('aria-invalid')
    expect(within(dialog).getByRole('button', { name: 'Speichern' })).toBeEnabled()
  })
})
