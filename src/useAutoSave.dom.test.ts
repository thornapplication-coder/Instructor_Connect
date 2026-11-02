import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAutoSave } from './useAutoSave'

/**
 * Ebene 2: Automatisch speichern (Audit 11/2026, VERW-14).
 *
 * Nachgestellt im Impressum: „NEUE ZEILE TEST" getippt, sofort „Zur
 * Übersicht" — die Zeile war weg. Der Zeitgeber wurde beim Verlassen
 * verworfen statt ausgelöst. Fake-Timer, damit die 600 ms nicht gewartet,
 * sondern gezählt werden.
 */
type Props = { wert: { de: string; en: string }; gespeichert: { de: string; en: string } }
const alt = { de: 'Impressum', en: 'Imprint' }

describe('useAutoSave', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  const aufbauen = (speichern: (w: Props['wert']) => void) =>
    renderHook(({ wert, gespeichert }: Props) => useAutoSave(wert, gespeichert, speichern), { initialProps: { wert: alt, gespeichert: alt } })

  it('Verlassen vor 600 ms speichert genau einmal — mit dem letzten Stand', () => {
    const speichern = vi.fn()
    const { rerender, unmount } = aufbauen(speichern)
    rerender({ wert: { ...alt, de: 'Impressum\nNEUE' }, gespeichert: alt })
    rerender({ wert: { ...alt, de: 'Impressum\nNEUE ZEILE TEST' }, gespeichert: alt })
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(speichern).not.toHaveBeenCalled()
    unmount()
    expect(speichern).toHaveBeenCalledTimes(1)
    expect(speichern).toHaveBeenCalledWith({ ...alt, de: 'Impressum\nNEUE ZEILE TEST' })
    vi.advanceTimersByTime(2000)
    expect(speichern).toHaveBeenCalledTimes(1)
  })

  it('ohne Aenderung kein Speichern — weder per Zeitgeber noch beim Verlassen noch beim Blur', () => {
    const speichern = vi.fn()
    const { rerender, result, unmount } = aufbauen(speichern)
    // Ein neues, gleiches Objekt ist keine Aenderung.
    rerender({ wert: { ...alt }, gespeichert: { ...alt } })
    expect(result.current.offen).toBe(false)
    act(() => {
      result.current.jetzt()
      vi.advanceTimersByTime(2000)
    })
    unmount()
    expect(speichern).not.toHaveBeenCalled()
  })

  it('speichert 600 ms nach der letzten Eingabe — jede Eingabe stellt den Zeitgeber neu', () => {
    const speichern = vi.fn()
    const { rerender } = aufbauen(speichern)
    rerender({ wert: { ...alt, en: 'Imprint A' }, gespeichert: alt })
    act(() => {
      vi.advanceTimersByTime(400)
    })
    rerender({ wert: { ...alt, en: 'Imprint AB' }, gespeichert: alt })
    act(() => {
      vi.advanceTimersByTime(400)
    })
    expect(speichern).not.toHaveBeenCalled()
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(speichern).toHaveBeenCalledTimes(1)
    expect(speichern).toHaveBeenCalledWith({ ...alt, en: 'Imprint AB' })
  })

  it('ein Neuzeichnen ohne neue Eingabe stellt den Zeitgeber nicht zurueck', () => {
    // Der Wert ist ein frisch gebautes Objekt; nach Identitaet verglichen
    // haette jeder Takt des Stores den Zeitgeber neu gestartet.
    const speichern = vi.fn()
    const { rerender } = aufbauen(speichern)
    rerender({ wert: { ...alt, de: 'X' }, gespeichert: alt })
    for (let i = 0; i < 4; i++) {
      act(() => {
        vi.advanceTimersByTime(200)
      })
      rerender({ wert: { ...alt, de: 'X' }, gespeichert: alt })
    }
    expect(speichern).toHaveBeenCalledTimes(1)
  })

  it('Blur speichert sofort, und das Verlassen danach nicht noch einmal', () => {
    const speichern = vi.fn()
    const { rerender, result, unmount } = aufbauen(speichern)
    rerender({ wert: { ...alt, de: 'Neu' }, gespeichert: alt })
    expect(result.current.offen).toBe(true)
    act(() => {
      result.current.jetzt()
    })
    expect(speichern).toHaveBeenCalledTimes(1)
    unmount()
    vi.advanceTimersByTime(2000)
    expect(speichern).toHaveBeenCalledTimes(1)
  })

  it('ist nichts mehr offen, sobald der Speicher den Stand hat', () => {
    const speichern = vi.fn()
    const { rerender, result, unmount } = aufbauen(speichern)
    rerender({ wert: { ...alt, de: 'Neu' }, gespeichert: alt })
    rerender({ wert: { ...alt, de: 'Neu' }, gespeichert: { ...alt, de: 'Neu' } })
    expect(result.current.offen).toBe(false)
    unmount()
    vi.advanceTimersByTime(2000)
    expect(speichern).not.toHaveBeenCalled()
  })
})
