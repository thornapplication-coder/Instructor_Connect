import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useDruckTitel } from './useDruckTitel'

/**
 * Ebene 2: der Dokumenttitel einer Druckansicht (Audit 11/2026, EXM-04,
 * EXM-10). Der Browser schlaegt ihn beim „Als PDF sichern" als Dateinamen
 * vor — er muss beim Oeffnen stehen und beim Verlassen wieder weg sein.
 */
describe('useDruckTitel', () => {
  beforeEach(() => {
    document.title = 'Instructor Connect'
  })

  it('setzt den Titel nach dem gemeinsamen Schema und stellt ihn beim Verlassen zurueck', () => {
    const { unmount } = renderHook(() => useDruckTitel(['308F', 'Grading Sheet Recurrent', 'Jürgen Müller', '', '05.08.2026', 'OPC-Recurrent']))
    expect(document.title).toBe('308F_Grading Sheet Recurrent_Jürgen Müller_05.08.2026_OPC-Recurrent')
    unmount()
    expect(document.title).toBe('Instructor Connect')
  })

  it('folgt einer Aenderung der Teile', () => {
    const { rerender, unmount } = renderHook(({ teile }) => useDruckTitel(teile), { initialProps: { teile: ['Analytics', 'CL30'] } })
    expect(document.title).toBe('Analytics_CL30')
    rerender({ teile: ['Analytics', 'C560 XLS+'] })
    expect(document.title).toBe('Analytics_C560 XLS+')
    unmount()
    expect(document.title).toBe('Instructor Connect')
  })

  it('setzt nichts, solange es nichts zu benennen gibt', () => {
    const { rerender, unmount } = renderHook(({ teile }: { teile: string[] | null }) => useDruckTitel(teile), { initialProps: { teile: null as string[] | null } })
    expect(document.title).toBe('Instructor Connect')
    rerender({ teile: ['306', 'Additional Training'] })
    expect(document.title).toBe('306_Additional Training')
    unmount()
    expect(document.title).toBe('Instructor Connect')
  })
})
