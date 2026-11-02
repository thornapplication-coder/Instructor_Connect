import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../i18n'
import { StoreProvider, useStore } from '../store'
import { Admin, FeedbackTab, UploadGrenzeFeld } from './Admin'

/**
 * Admin-Panel mit echtem Store (Ebene 2, Audit 11/2026, P8).
 *
 * Angemeldet ist Alex (Superadmin). Der Seed hat zwei offene Feedbacks
 * (fb1 dringend, fb2) und eine Upload-Grenze von 25 MB.
 */

let laden: ReturnType<typeof useStore> | null = null
function Griff() {
  laden = useStore()
  return null
}
const store = () => laden!

function zeigen(inhalt: React.ReactNode) {
  render(
    <StoreProvider>
      <Griff />
      {inhalt}
    </StoreProvider>,
  )
}

beforeEach(async () => {
  await i18n.changeLanguage('de')
  // Wie storeVerwaltung.test.tsx: Zeitgeber eingefroren, damit keine
  // Sicherung in IndexedDB in den naechsten Test reicht.
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date'] })
  const mittag = new Date(2026, 10, 2, 12, 0, 0)
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

/**
 * A11Y-04: Leertaste auf „Erledigt" → Fokus auf <body>. Offene und erledigte
 * Eintraege stehen in zwei Listen; die Karte wird beim Umschalten neu
 * eingehaengt.
 */
describe('Feedback: Fokus nach „Erledigt" (A11Y-04)', () => {
  const kaestchen = (id: string) => {
    const karte = document.querySelector<HTMLElement>(`[data-feedback-id="${id}"]`)!
    return within(karte).getByRole('checkbox', { name: 'Erledigt' })
  }

  it('bleibt auf dem Kaestchen derselben Karte — hin und zurueck', () => {
    zeigen(<FeedbackTab />)
    const vorher = kaestchen('fb2')
    vorher.focus()
    act(() => {
      fireEvent.click(vorher)
    })
    expect(store().state.feedbackEntries.find((f) => f.id === 'fb2')?.resolvedBy).toBe('u-patrick')
    // Die Karte ist umgezogen (neu eingehaengt) — und hat den Fokus mitgenommen.
    expect(kaestchen('fb2')).not.toBe(vorher)
    expect(kaestchen('fb2')).toBeChecked()
    expect(kaestchen('fb2')).toHaveFocus()

    act(() => {
      fireEvent.click(kaestchen('fb2'))
    })
    expect(kaestchen('fb2')).not.toBeChecked()
    expect(kaestchen('fb2')).toHaveFocus()
  })

  it('zeigt Dringend und Erledigt als Badge, die Karte bleibt ungedaempft (VERW-17)', () => {
    zeigen(<FeedbackTab />)
    act(() => {
      fireEvent.click(kaestchen('fb1'))
    })
    const karte = document.querySelector<HTMLElement>('[data-feedback-id="fb1"]')!
    expect(karte.innerHTML).not.toMatch(/\bopacity-\d+/)
    // Die Marken tragen die Badge-Gestalt: Schrift ink, Farbe in der Flaeche.
    const dringend = within(karte).getByText('Dringend').closest('span')!
    expect(dringend.className).toContain('text-ink')
    const erledigt = within(karte).getAllByText('Erledigt').map((e) => e.closest('span')).find((s) => s?.className.includes('rounded-full'))!
    expect(erledigt.className).toContain('text-ink')
  })
})

/** VERW-20: Leeren ergab sofort 1, danach „25" getippt ergab 125. */
describe('Maximale Upload-Groesse (VERW-20)', () => {
  const feld = () => screen.getByRole('spinbutton', { name: 'Maximale Upload-Größe (MB)' })

  it('laesst das Feld leer werden und speichert erst beim Verlassen', () => {
    zeigen(<UploadGrenzeFeld />)
    act(() => feld().focus())
    fireEvent.change(feld(), { target: { value: '' } })
    expect(feld()).toHaveValue(null)
    expect(store().state.settings.maxUploadMB).toBe(25)
    fireEvent.change(feld(), { target: { value: '20' } })
    expect(store().state.settings.maxUploadMB).toBe(25)
    act(() => feld().blur())
    expect(store().state.settings.maxUploadMB).toBe(20)
    expect(feld()).toHaveValue(20)
  })

  it('begrenzt nach oben, leer verlassen laesst den Wert stehen', () => {
    zeigen(<UploadGrenzeFeld />)
    act(() => feld().focus())
    fireEvent.change(feld(), { target: { value: '125' } })
    fireEvent.keyDown(feld(), { key: 'Enter' })
    act(() => feld().blur())
    expect(store().state.settings.maxUploadMB).toBe(50)
    act(() => feld().focus())
    fireEvent.change(feld(), { target: { value: '' } })
    act(() => feld().blur())
    expect(store().state.settings.maxUploadMB).toBe(50)
    expect(feld()).toHaveValue(50)
  })

  it('Escape verwirft den Entwurf', () => {
    zeigen(<UploadGrenzeFeld />)
    act(() => feld().focus())
    fireEvent.change(feld(), { target: { value: '7' } })
    fireEvent.keyDown(feld(), { key: 'Escape' })
    expect(feld()).toHaveValue(25)
    act(() => feld().blur())
    expect(store().state.settings.maxUploadMB).toBe(25)
  })
})

/**
 * VERW-21: Rollen-Auswahl ohne Namen, Nutzer- und Gruppenzeilen klappten
 * ohne aria-expanded auf, die Chat-Sperre trug einen festen Farbwert.
 */
describe('Barrierefreiheit der Verwaltung (VERW-21)', () => {
  it('Nutzerzeile: Aufklappknopf meldet Zustand und Ziel, Rollen-Auswahl nennt die Person', () => {
    zeigen(<Admin sub="users" />)
    const zeile = screen.getByRole('button', { name: /Chris Beispiel/, expanded: false })
    const ziel = document.getElementById(zeile.getAttribute('aria-controls')!)
    expect(ziel).not.toBeNull()
    act(() => {
      fireEvent.click(zeile)
    })
    expect(zeile).toHaveAttribute('aria-expanded', 'true')
    expect(within(ziel!).getByRole('combobox', { name: 'Rolle: Chris Beispiel' })).toBeInTheDocument()
  })

  it('Gruppenzeile: Aufklappknopf meldet Zustand und Ziel', () => {
    zeigen(<Admin sub="groups" />)
    const name = store().state.groups[0].name
    const zeile = screen.getByRole('button', { name: new RegExp(name), expanded: false })
    expect(document.getElementById(zeile.getAttribute('aria-controls')!)).not.toBeNull()
    act(() => {
      fireEvent.click(zeile)
    })
    expect(zeile).toHaveAttribute('aria-expanded', 'true')
  })

  /**
   * VERW-02 in der Ansicht: Die Logik (personenRechtWirkt) ist in
   * adminAccess.test.ts ausgeschrieben — hier, dass die Rechte-Seite sie
   * auch FRAGT. Vorher war „Darf bewerten" beim Gruppenadmin ein bedienbares
   * Kaestchen; der Haken verschwand, und Chris bewertete weiter.
   */
  it('Personenrechte ohne Wirkung bei der Rolle: gesperrt, mit dem Wert aus der Matrix', () => {
    zeigen(<Admin sub="permissions" />)
    const chris = screen.getByRole('checkbox', { name: 'Chris Beispiel: Darf bewerten (Grading) — bei dieser Rolle über die Rollen-Matrix geregelt' })
    expect(chris).toBeDisabled()
    expect(chris).toBeChecked()
    // Die Matrix entscheidet — und das Kaestchen folgt ihr, nicht dem Flag.
    act(() => store().setPermission('group_admin', 'grading_create', false))
    expect(chris).not.toBeChecked()
    expect(store().state.users.find((u) => u.id === 'u-christian')?.canGrade).toBe(true)
    // Beim Mitglied wirkt das Flag: dort bleibt es ein Kaestchen zum Umschalten.
    const mika = screen.getByRole('checkbox', { name: 'Mika Beispiel: Darf bewerten (Grading)' })
    expect(mika).toBeEnabled()
    act(() => {
      fireEvent.click(mika)
    })
    expect(store().state.users.find((u) => u.id === 'u-michael')?.canGrade).toBe(false)
  })

  /**
   * VERW-03 in der Ansicht: Der Training Admin bekam den Grading-Bereich fest.
   * Entzog der Superadmin ihm „Alle Grading-Formulare sehen", zeigte das
   * Panel trotzdem alle Formulare samt CSV-Export.
   */
  it('Training Admin ohne grading_view_all: kein Grading-Bereich, auch nicht ueber die Adresse', () => {
    zeigen(<Admin sub="grading" />)
    act(() => store().setPermission('training_admin', 'grading_view_all', false))
    act(() => store().switchUser('u-max'))
    expect(screen.getByText('Du hast keinen Zugriff auf das Admin-Panel.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /CSV/ })).toBeNull()
  })

  it('Personenrechte: Kaestchen mit 44-px-Label, Chat-Sperre in der Token-Farbe', () => {
    zeigen(<Admin sub="permissions" />)
    const sperre = screen.getByRole('checkbox', { name: 'Mika Beispiel: Im Chat gesperrt' })
    expect(sperre).toHaveClass('accent-danger')
    expect(sperre.closest('label')).toHaveClass('min-h-11', 'min-w-11')
    for (const docCheck of screen.getAllByRole('checkbox', { name: /^Mika Beispiel: DocCheck/ })) {
      expect(docCheck.closest('label')).toHaveClass('min-h-11', 'min-w-11')
    }
  })
})

/**
 * VERW-18: × an CL30 — der Chip sprang ohne Meldung ans Listenende.
 * TEC-09: „General" liess sich loeschen und kam beim Start zurueck.
 */
describe('Einstellungen: Muster und Pflichtkategorien', () => {
  it('ein verwendetes Muster nennt den Grund mit Zahlen und bleibt an seiner Stelle', () => {
    zeigen(<Admin sub="settings" />)
    const vorher = store().state.settings.aircraftTypes
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Löschen: CL30' }))
    })
    const meldung = screen.getByRole('alert')
    expect(meldung).toHaveTextContent('„CL30“ bleibt')
    expect(meldung).toHaveTextContent(/\d+ Gruppe/)
    expect(meldung).toHaveTextContent(/\d+ Nutzern?/)
    expect(store().state.settings.aircraftTypes).toEqual(vorher)
  })

  it('„General" hat in Feedback- und Info-Kategorien keinen Loeschknopf', () => {
    zeigen(<Admin sub="settings" />)
    expect(screen.queryAllByRole('button', { name: 'Löschen: General' })).toEqual([])
    expect(screen.getAllByText('„General“ ist die Grundkategorie und bleibt immer erhalten.')).toHaveLength(2)
  })
})
