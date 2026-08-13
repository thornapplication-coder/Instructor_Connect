import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { hasUnsavedWork, useUnsavedWork } from './editGuard'

/**
 * Ebene 2: die Bearbeitungs-Wache.
 *
 * Sie entscheidet, ob das Update-Banner die App selbsttätig neu laden darf.
 * Der Ernstfall wurde gemessen: eine geleistete, noch nicht gespeicherte
 * Nachtragsunterschrift (846 gesetzte Pixel) war nach dem automatischen
 * Neuladen weg — und der Pilot längst gegangen. Ein Fehler hier kostet also
 * einen Nachweis, nicht nur Bequemlichkeit.
 *
 * Geprüft wird deshalb beides: dass angemeldete Arbeit erkannt wird, UND
 * dass die Wache nach dem Abbau wieder freigibt. Bliebe der Zähler stehen,
 * käme nie wieder ein Update an — der stille Gegenfehler.
 */

beforeEach(() => {
  window.location.hash = '#/'
  document.body.innerHTML = ''
})

afterEach(() => {
  window.location.hash = '#/'
  document.body.innerHTML = ''
})

describe('hasUnsavedWork', () => {
  it('gibt im Ruhezustand frei', () => {
    expect(hasUnsavedWork()).toBe(false)
  })

  it('erkennt jeden offenen Dialog als Eingabefläche', () => {
    // Dialoge sind in dieser App immer Eingabeflächen (Umfrage, neuer
    // Eintrag, Gruppendialog) — welcher es ist, muss die Wache nicht wissen.
    document.body.innerHTML = '<div role="dialog">halb ausgefüllt</div>'
    expect(hasUnsavedWork()).toBe(true)
  })

  it('erkennt das offene Formular an der Adresse', () => {
    window.location.hash = '#/grading/new?type=308A'
    expect(hasUnsavedWork()).toBe(true)
  })

  it('erkennt die Druckansicht — dort läuft ein Dialog des Browsers', () => {
    window.location.hash = '#/grading/gr1?print=1'
    expect(hasUnsavedWork()).toBe(true)
  })

  it('gibt eine bloße Detailansicht frei', () => {
    window.location.hash = '#/grading/gr1'
    expect(hasUnsavedWork()).toBe(false)
  })
})

describe('useUnsavedWork', () => {
  it('meldet Arbeit an und beim Abbau wieder ab', () => {
    const { unmount } = renderHook(() => useUnsavedWork(true))
    expect(hasUnsavedWork()).toBe(true)
    unmount()
    // Der stille Gegenfehler: Bliebe der Zähler stehen, käme nie wieder ein
    // Update an, und niemand würde es bemerken.
    expect(hasUnsavedWork()).toBe(false)
  })

  it('meldet nichts an, solange nichts geändert wurde', () => {
    const { unmount } = renderHook(() => useUnsavedWork(false))
    expect(hasUnsavedWork()).toBe(false)
    unmount()
    expect(hasUnsavedWork()).toBe(false)
  })

  it('folgt dem Wechsel von sauber auf geändert und zurück', () => {
    const { result, rerender, unmount } = renderHook(({ d }) => useUnsavedWork(d), { initialProps: { d: false } })
    expect(result.current).toBeUndefined()
    expect(hasUnsavedWork()).toBe(false)
    rerender({ d: true })
    expect(hasUnsavedWork()).toBe(true)
    // Verworfen oder gespeichert: die Wache gibt wieder frei.
    rerender({ d: false })
    expect(hasUnsavedWork()).toBe(false)
    unmount()
    expect(hasUnsavedWork()).toBe(false)
  })

  it('zählt mehrere offene Stellen und gibt erst nach der letzten frei', () => {
    // Zwei Formulare in einer Kette (306 nach 308A) melden gleichzeitig an.
    const a = renderHook(() => useUnsavedWork(true))
    const b = renderHook(() => useUnsavedWork(true))
    expect(hasUnsavedWork()).toBe(true)
    a.unmount()
    expect(hasUnsavedWork()).toBe(true)
    b.unmount()
    expect(hasUnsavedWork()).toBe(false)
  })
})
