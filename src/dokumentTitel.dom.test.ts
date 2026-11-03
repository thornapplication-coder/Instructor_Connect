import { render, renderHook } from '@testing-library/react'
import { createElement } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { APP_TITEL, geltenderTitel, knotenText, titelAnmelden, useDokumentTitel } from './dokumentTitel'
import { useDruckTitel } from './useDruckTitel'

/**
 * Ebene 2 (setzt `document.title`): Fenstertitel je Ansicht (Audit 11/2026,
 * A11Y-13) — vorher hieß jede Ansicht „Instructor Connect".
 */
beforeEach(() => {
  document.title = APP_TITEL
})

describe('geltenderTitel', () => {
  it('ohne Anmeldung der App-Name, sonst die jüngste Seite mit App-Namen', () => {
    expect(geltenderTitel([])).toBe('Instructor Connect')
    expect(geltenderTitel([{ titel: 'Admin Panel', art: 'seite' }, { titel: 'Notes', art: 'seite' }])).toBe('Notes – Instructor Connect')
  })

  it('eine Druckansicht geht jeder Seite vor — ihr Titel ist der Dateiname des PDF', () => {
    expect(geltenderTitel([{ titel: '307A_Line Check', art: 'druck' }, { titel: '307A · Line Check', art: 'seite' }])).toBe('307A_Line Check')
  })
})

describe('titelAnmelden', () => {
  it('die Reihenfolge der Abmeldung spielt keine Rolle', () => {
    // Genau der Fall, an dem „vorigen Titel zurückschreiben" scheitert:
    // Seite und Druckansicht melden sich an und in derselben Reihenfolge ab.
    const seite = titelAnmelden({ titel: '307A · Line Check', art: 'seite' })
    const druck = titelAnmelden({ titel: '307A_Line Check', art: 'druck' })
    expect(document.title).toBe('307A_Line Check')
    seite()
    expect(document.title).toBe('307A_Line Check')
    druck()
    expect(document.title).toBe('Instructor Connect')
  })

  it('zwei Ansichten mit gleichem Titel stören sich nicht; doppeltes Abmelden schadet nicht', () => {
    const a = titelAnmelden({ titel: 'Chat', art: 'seite' })
    const b = titelAnmelden({ titel: 'Chat', art: 'seite' })
    a()
    a()
    expect(document.title).toBe('Chat – Instructor Connect')
    b()
    expect(document.title).toBe('Instructor Connect')
  })
})

describe('useDokumentTitel mit useDruckTitel', () => {
  // Wie GradingView: die Druckansicht (Eltern) rendert die Kopfleiste (Kind).
  function Kopf({ seite }: { seite: string }) {
    useDokumentTitel(seite)
    return null
  }
  function Ansicht({ seite, druck }: { seite: string; druck: string[] | null }) {
    useDruckTitel(druck)
    return createElement(Kopf, { seite })
  }

  it('Seiten- und Drucktitel ändern sich im selben Durchgang — danach bleibt kein fremder Titel stehen', () => {
    // Gegenprobe mit „vorigen Titel merken und zurückschreiben" in beiden
    // Hooks: Nach dem Verlassen stand „Grading Tool – …" statt des
    // App-Namens, weil React die Effekte des Kindes zuerst abräumt und der
    // Kopf sich dann den alten Titel der Eltern als „vorher" merkte.
    const { rerender, unmount } = render(createElement(Ansicht, { seite: 'Grading Tool', druck: ['306'] }))
    expect(document.title).toBe('306')
    rerender(createElement(Ansicht, { seite: '308F · Grading Sheet Recurrent', druck: ['308F', 'Grading Sheet Recurrent'] }))
    expect(document.title).toBe('308F_Grading Sheet Recurrent')
    rerender(createElement(Ansicht, { seite: '308F · Grading Sheet Recurrent', druck: null }))
    expect(document.title).toBe('308F · Grading Sheet Recurrent – Instructor Connect')
    unmount()
    expect(document.title).toBe('Instructor Connect')
  })

  it('ohne Titel meldet sich nichts an', () => {
    const { unmount } = renderHook(() => useDokumentTitel(null))
    expect(document.title).toBe('Instructor Connect')
    unmount()
    expect(document.title).toBe('Instructor Connect')
  })
})

describe('knotenText', () => {
  it('liest den Text auch aus einem Titel, der ein Knopf ist (Chat-Gruppe)', () => {
    const titel = createElement('button', null, createElement('span', { className: 'truncate' }, 'CL30 Crew'))
    expect(knotenText(titel)).toBe('CL30 Crew')
  })

  it('verbindet Teile, zählt Zahlen mit und übergeht Leeres und Symbole ohne Text', () => {
    expect(knotenText(['307A', ' · ', 42, null, false, undefined, createElement('svg')])).toBe('307A · 42')
    expect(knotenText(null)).toBe('')
    expect(knotenText(true)).toBe('')
  })
})
