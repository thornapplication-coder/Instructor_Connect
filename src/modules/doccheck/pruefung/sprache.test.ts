import { describe, expect, it } from 'vitest'
import { dokumentSprache, einschuebe, istAdresse, istZitat, spracheVon, woerter } from './sprache'

describe('Spracherkennung (N9)', () => {
  it('erkennt Englisch, Deutsch, Spanisch, Italienisch, Französisch ab drei Wörtern', () => {
    expect(spracheVon('The pilot shall check the hydraulic pressure before take-off.')).toBe('en')
    expect(spracheVon('Bitte noch prüfen, das ist nicht mehr aktuell und muss geändert werden.')).toBe('de')
    expect(spracheVon('Esta sección no está actualizada y se debe revisar.')).toBe('es')
    expect(spracheVon('Questo paragrafo non è aggiornato e deve essere rivisto per il manuale.')).toBe('it')
    expect(spracheVon('Cette section est à revoir pour le manuel et les procédures.')).toBe('fr')
  })

  it('zu kurz oder unentschieden → null; Fachbegriffe zählen nicht', () => {
    expect(spracheVon('BATT OFF')).toBeNull()
    expect(spracheVon('VMO MMO KIAS FL')).toBeNull()
    expect(spracheVon('Der the und and')).toBeNull()
  })

  it('Dokumentsprache nach Textmenge', () => {
    expect(dokumentSprache(['The crew shall monitor the engine and the fuel system.', 'Bitte prüfen und nicht vergessen.', 'kurz'])).toBe('en')
    expect(dokumentSprache(['x'])).toBeNull()
  })

  it('Adressen und Zitate sind Ausnahmen', () => {
    expect(istAdresse('Aviation Academy, Hauptstraße 12, 1010 Wien', ['straße'])).toBe(true)
    expect(istAdresse('A-1300 Schwechat', [])).toBe(true)
    expect(istAdresse('Bitte die Seite prüfen und anpassen', ['straße'])).toBe(false)
    expect(istZitat('„Bitte nicht berühren und nicht entfernen"')).toBe(true)
    expect(istZitat('Normaler Text')).toBe(false)
  })

  it('Einschübe: einzelne Wörter der Landessprache, Groß-/Kleinschreibung beachtet', () => {
    expect(einschuebe('Select Normale mode, siehe chapter 2 und continue.', ['Normale', 'siehe', 'und', 'Seite'])).toEqual(['Normale', 'siehe', 'und'])
    expect(einschuebe('see page 2', ['Seite'])).toEqual([])
    expect(woerter('Ä-ö 12 x')).toEqual(['ä', 'ö', 'x'])
  })
})
