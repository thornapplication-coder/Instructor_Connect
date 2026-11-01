import { describe, expect, it } from 'vitest'
import { istGesperrteTaste } from './viewerTasten'

describe('Tastensperre im Viewer (Spez. 6.3)', () => {
  it('fängt Speichern und Drucken ab — Windows und Mac, groß und klein', () => {
    expect(istGesperrteTaste({ key: 's', ctrlKey: true, metaKey: false })).toBe(true)
    expect(istGesperrteTaste({ key: 'P', ctrlKey: false, metaKey: true })).toBe(true)
  })
  it('lässt alles andere durch', () => {
    expect(istGesperrteTaste({ key: 's', ctrlKey: false, metaKey: false })).toBe(false)
    expect(istGesperrteTaste({ key: 'f', ctrlKey: true, metaKey: false })).toBe(false)
    expect(istGesperrteTaste({ key: 's', ctrlKey: true, metaKey: false, altKey: true })).toBe(false)
  })
})
