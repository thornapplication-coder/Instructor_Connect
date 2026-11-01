import { describe, expect, it } from 'vitest'
import { naechsterReiter } from './reiter'

describe('Reiter per Tastatur (Barrierefreiheitsprüfung 01.11.2026)', () => {
  const l = ['a', 'b', 'c'] as const
  it('Pfeile im Kreis, Pos1/Ende an den Rand', () => {
    expect(naechsterReiter(l, 'a', 'ArrowRight')).toBe('b')
    expect(naechsterReiter(l, 'c', 'ArrowRight')).toBe('a')
    expect(naechsterReiter(l, 'a', 'ArrowLeft')).toBe('c')
    expect(naechsterReiter(l, 'b', 'Home')).toBe('a')
    expect(naechsterReiter(l, 'a', 'End')).toBe('c')
  })
  it('senkrechte Leiste: Auf/Ab; andere Tasten und leere Liste → null', () => {
    expect(naechsterReiter(l, 'a', 'ArrowDown', true)).toBe('b')
    expect(naechsterReiter(l, 'a', 'ArrowUp', true)).toBe('c')
    expect(naechsterReiter(l, 'a', 'ArrowDown')).toBeNull()
    expect(naechsterReiter(l, 'a', 'Enter')).toBeNull()
    expect(naechsterReiter([], 'a', 'ArrowRight')).toBeNull()
  })
  it('unbekannter aktueller Reiter zählt als erster', () => {
    expect(naechsterReiter(['a', 'b'], 'x', 'ArrowRight')).toBe('b')
  })
})
