import { describe, expect, it } from 'vitest'
import { festeEintraege, MAX_UPLOAD_MB, PFLICHT_KATEGORIE, uploadGrenze, vorhandenerEintrag, type KategorieListe } from './einstellungen'
import { migrateState } from './migrateState'
import { createSeedState } from './sandbox/seed'

/**
 * Feste Kategorien (Audit 11/2026, TEC-09).
 *
 * Nachgestellt: „General" aus den Info-Kategorien geloescht und die
 * Schulungsarten geleert — gespeichert, als erledigt angezeigt, nach dem
 * Neuladen stand alles wieder da. Die Regel hier sagt, was die Oberflaeche
 * gar nicht erst loeschen laesst; der Abgleich mit migrateState unten
 * sichert, dass beide dasselbe meinen.
 */
describe('festeEintraege', () => {
  it('haelt „General" in Feedback- und Info-Kategorien fest, sonst nichts', () => {
    for (const liste of ['feedbackCategories', 'infoCategories'] as const) {
      expect(festeEintraege(liste, ['Safety', PFLICHT_KATEGORIE, 'Technical'])).toEqual([PFLICHT_KATEGORIE])
      expect(festeEintraege(liste, ['Safety', 'Technical'])).toEqual([])
    }
  })

  it('haelt bei den Schulungsarten nur die letzte verbliebene fest', () => {
    expect(festeEintraege('lessonCategories', ['Type Rating', 'Recurrent'])).toEqual([])
    expect(festeEintraege('lessonCategories', ['Recurrent'])).toEqual(['Recurrent'])
    expect(festeEintraege('lessonCategories', [])).toEqual([])
  })

  it('stimmt mit migrateState ueberein: Was die Oberflaeche loeschen laesst, bleibt geloescht', () => {
    // Jede Liste so weit leeren, wie die Regel es erlaubt — Schritt fuer
    // Schritt, wie ein Admin es per Klick taete. Nach jedem Schritt muss
    // der Neustart (migrateState) genau diesen Stand behalten.
    const listen: KategorieListe[] = ['feedbackCategories', 'infoCategories', 'lessonCategories']
    for (const liste of listen) {
      let werte = [...(createSeedState().settings[liste] ?? [])]
      expect(werte.length, liste).toBeGreaterThan(1)
      for (;;) {
        const loeschbar = werte.find((w) => !festeEintraege(liste, werte).includes(w))
        if (loeschbar === undefined) break
        werte = werte.filter((w) => w !== loeschbar)
        const st = createSeedState()
        const neu = migrateState({ ...st, settings: { ...st.settings, [liste]: werte } })
        expect(neu.settings[liste], `${liste}: ${werte.join(', ')}`).toEqual(werte)
      }
      expect(werte.length, liste).toBe(1)
    }
  })

  it('Gegenprobe: Ein Loeschen am festen Eintrag vorbei kaeme beim Start zurueck', () => {
    // Genau der Fehler aus TEC-09 — hier festgehalten, damit sichtbar
    // bleibt, WARUM die Eintraege fest sind.
    const st = createSeedState()
    const ohne = st.settings.infoCategories.filter((c) => c !== PFLICHT_KATEGORIE)
    expect(migrateState({ ...st, settings: { ...st.settings, infoCategories: ohne } }).settings.infoCategories).toContain(PFLICHT_KATEGORIE)
    expect(migrateState({ ...st, settings: { ...st.settings, lessonCategories: [] } }).settings.lessonCategories!.length).toBeGreaterThan(0)
  })
})

/**
 * Maximale Upload-Groesse (Audit 11/2026, VERW-20): Leeren ergab sofort 1,
 * danach „25" getippt ergab 125, gespeichert ohne Obergrenze.
 */
describe('uploadGrenze', () => {
  it('leer oder keine Zahl laesst den alten Wert stehen', () => {
    expect(uploadGrenze('', 25)).toBe(25)
    expect(uploadGrenze('   ', 25)).toBe(25)
    expect(uploadGrenze('abc', 25)).toBe(25)
  })

  it('uebernimmt eine gueltige Zahl unveraendert', () => {
    expect(uploadGrenze('25', 10)).toBe(25)
    expect(uploadGrenze(' 7 ', 10)).toBe(7)
  })

  it('hebt 0 und Negatives auf 1', () => {
    expect(uploadGrenze('0', 25)).toBe(1)
    expect(uploadGrenze('-5', 25)).toBe(1)
  })

  it('begrenzt nach oben auf MAX_UPLOAD_MB', () => {
    expect(uploadGrenze(String(MAX_UPLOAD_MB + 1), 25)).toBe(MAX_UPLOAD_MB)
    expect(uploadGrenze('125', 25)).toBe(MAX_UPLOAD_MB)
    expect(uploadGrenze(String(MAX_UPLOAD_MB), 25)).toBe(MAX_UPLOAD_MB)
  })

  it('rundet Bruchteile und versteht das deutsche Komma', () => {
    expect(uploadGrenze('12,6', 25)).toBe(13)
    expect(uploadGrenze('12.4', 25)).toBe(12)
  })
})

/**
 * Dubletten in den Chip-Listen (Audit 11/2026, Nachtrag VERW#3): „CL30" und
 * „cl30" gingen beide durch — die Musterregel vergleicht exakt, also waren
 * das zwei Muster.
 */
describe('vorhandenerEintrag', () => {
  it('findet denselben Wert in anderer Gross-/Kleinschreibung und nennt ihn wie gespeichert', () => {
    expect(vorhandenerEintrag(['ATR 42/72', 'CL30'], 'cl30')).toBe('CL30')
    expect(vorhandenerEintrag(['Safety', 'Technical'], 'SAFETY')).toBe('Safety')
    expect(vorhandenerEintrag(['ops@example.test'], 'Ops@Example.Test')).toBe('ops@example.test')
  })

  it('Leerraum am Rand und mehrfacher Leerraum innen machen keinen neuen Wert', () => {
    expect(vorhandenerEintrag(['C560 XLS+'], '  c560   xls+ ')).toBe('C560 XLS+')
    expect(vorhandenerEintrag(['Type Rating'], 'Type\tRating')).toBe('Type Rating')
  })

  it('zusammengesetzte und vorkomponierte Umlaute gelten als gleich', () => {
    // „Ä" als A + Kombinationszeichen (macOS-Dateinamen, manche Kopien aus PDF)
    expect(vorhandenerEintrag(['Ärztliches'], 'Ärztliches')).toBe('Ärztliches')
  })

  it('verschiedene Werte bleiben verschieden — auch bei aehnlicher Schreibung', () => {
    expect(vorhandenerEintrag(['CL30'], 'CL 30')).toBeUndefined()
    expect(vorhandenerEintrag(['CL30'], 'CL300')).toBeUndefined()
    expect(vorhandenerEintrag(['ATR 42/72'], 'ATR 42')).toBeUndefined()
    expect(vorhandenerEintrag([], 'CL30')).toBeUndefined()
  })

  it('exakt gleich wird selbstverstaendlich auch gefunden', () => {
    expect(vorhandenerEintrag(['CL30'], 'CL30')).toBe('CL30')
  })
})
