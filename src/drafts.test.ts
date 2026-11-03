import { describe, expect, it } from 'vitest'
import {
  alteEntwuerfeUebernehmen,
  entwurfLesen,
  entwurfMitEingaben,
  entwurfSchluessel as K,
  entwurfZerlegen,
  fortsetzenAdresse,
  hatEigeneEingaben,
  kurzeZeit,
  readDrafts,
} from './drafts'

/**
 * Beide Funktionen lagen als Hilfsfunktionen in Seitendateien und waren
 * damit von der Testpflicht befreit — beide Wachen des Projekts globen auf
 * `src/*.ts`. Aufgefallen ist das erst beim Gegenlesen.
 *
 * Bewacht wird hier vor allem der Fehler, der dabei mit ans Licht kam: Die
 * Entwurfsliste suchte nach `aaa-draft-<user>-new-` und fand damit
 * Folgeformulare nie — ausgerechnet die Blaetter, die eine Nachschulung
 * belegen und an die man erinnert werden will.
 */

/** Alle Nutzerkennungen der Tests — readDrafts braucht sie, um Entwürfe
 *  im alten Schlüssel zuzuordnen (R3-ENTWURFSPRAEFIX). */
const NUTZER = ['u1', 'u2', 'u-x', 'u-michael']

/**
 * Schmale localStorage-Nachbildung; die echte gibt es auf Ebene 1 nicht.
 * `Object.keys` liefert wie beim echten Speicher den AKTUELLEN Bestand —
 * die Übernahme alter Schlüssel schreibt und löscht beim Lesen.
 */
function speicherMit(eintraege: Record<string, string>): Storage {
  const daten: Record<string, string> = { ...eintraege }
  const methoden = {
    getItem: (k: string) => daten[k] ?? null,
    setItem: (k: string, v: string) => void (daten[k] = v),
    removeItem: (k: string) => void delete daten[k],
    clear: () => Object.keys(daten).forEach((k) => delete daten[k]),
    key: (i: number) => Object.keys(daten)[i] ?? null,
  }
  return new Proxy(methoden as unknown as Storage, {
    get: (ziel, k) => (k === 'length' ? Object.keys(daten).length : Reflect.get(ziel, k)),
    set: (ziel, k, v) => Reflect.set(ziel, k, v),
    ownKeys: () => Object.keys(daten),
    getOwnPropertyDescriptor: (_ziel, k) =>
      typeof k === 'string' && k in daten ? { value: daten[k], enumerable: true, configurable: true } : undefined,
  })
}

const blatt = JSON.stringify({
  trainees: [{ traineeName: 'Sophie Berger', grades: [{ grade: 3 }, { grade: null }, { grade: 'NO' }] }],
})

describe('readDrafts', () => {
  it('findet ein neues Blatt und zaehlt die gesetzten Noten', () => {
    // „NO" ist gesetzt (not observed), null ist offen — 2 von 3.
    const d = readDrafts('u1', NUTZER, speicherMit({ [K('u1', 'new', '308A')]: blatt }))
    expect(d).toEqual([{ key: K('u1', 'new', '308A'), formTypeId: '308A', bezug: 'new', kette: [], wer: 'Sophie Berger', noten: 2, gesamt: 3 }])
  })

  it('findet auch ein angefangenes Folgeformular', () => {
    // Der eigentliche Befund: Der Schluessel traegt hier die Kennung des
    // Ausgangsblatts statt „new". Mit der alten Suche fiel er heraus.
    const d = readDrafts('u1', NUTZER, speicherMit({ [K('u1', 'gr7', '306')]: JSON.stringify({ header: { traineeName: 'Lukas Steiner' } }) }))
    expect(d).toEqual([{ key: K('u1', 'gr7', '306'), formTypeId: '306', bezug: 'gr7', kette: [], wer: 'Lukas Steiner', noten: 0, gesamt: 0 }])
  })

  it('geht keinen fremden Entwurf an', () => {
    // Geteiltes iPad: Der Schluessel traegt den Nutzer, und nur der eigene
    // Entwurf darf auftauchen.
    const s = speicherMit({ [K('u1', 'new', '308A')]: blatt, [K('u2', 'new', '308F')]: blatt })
    expect(readDrafts('u1', NUTZER, s).map((d) => d.formTypeId)).toEqual(['308A'])
  })

  it('laesst andere Eintraege des Speichers unangetastet', () => {
    // Der Entwurf traegt eine eigene Eingabe — ein leerer waere seit GRD-10
    // ein Phantom (siehe unten) und gehoerte nicht in diese Liste.
    const s = speicherMit({ 'aaa-theme': 'dark', 'aaa-state': '{}', [K('u1', 'new', '310')]: JSON.stringify({ freeText: { 'Deferred items': 'V1 cut' } }) })
    expect(readDrafts('u1', NUTZER, s).map((d) => d.formTypeId)).toEqual(['310'])
    expect(s.getItem('aaa-theme')).toBe('dark')
    expect(s.getItem('aaa-state')).toBe('{}')
  })

  it('nennt den Piloten aus den Kopfdaten, wenn kein Trainee eingetragen ist', () => {
    const s = speicherMit({ [K('u1', 'new', '306')]: JSON.stringify({ trainees: [], header: { traineeName: 'Max Muster' } }) })
    expect(readDrafts('u1', NUTZER, s)[0].wer).toBe('Max Muster')
  })

  it('bleibt ohne Namen leer statt „undefined" zu zeigen', () => {
    // Eine Note ohne Namen — ohne jede Eingabe waere es ein Phantom (GRD-10).
    const s = speicherMit({ [K('u1', 'new', '308A')]: JSON.stringify({ trainees: [{ grades: [{ grade: 3 }] }] }) })
    expect(readDrafts('u1', NUTZER, s)[0].wer).toBe('')
  })

  it('verliert wegen eines beschaedigten Entwurfs nicht die uebrigen', () => {
    // Ein halb geschriebener Eintrag (Absturz beim Speichern) darf nicht die
    // ganze Liste kosten.
    const s = speicherMit({ [K('u1', 'new', '308A')]: '{kaputt', [K('u1', 'new', '306')]: blatt })
    const d = readDrafts('u1', NUTZER, s)
    expect(d).toHaveLength(2)
    expect(d.find((x) => x.formTypeId === '306')!.wer).toBe('Sophie Berger')
  })

  it('meldet nichts, wenn es gar keinen Speicher gibt', () => {
    // Privates Fenster mit gesperrtem Speicher: kein Fehler, nur nichts.
    const kaputt = new Proxy({} as Storage, {
      ownKeys() {
        throw new Error('kein localStorage')
      },
    })
    expect(readDrafts('u1', NUTZER, kaputt)).toEqual([])
  })
})

describe('kurzeZeit', () => {
  const jetzt = new Date(2026, 7, 13, 14, 30).getTime()

  it('zeigt heute die Uhrzeit', () => {
    const heuteFrueh = new Date(2026, 7, 13, 8, 5).getTime()
    expect(kurzeZeit(heuteFrueh, 'de', jetzt)).toMatch(/08[:.]05/)
  })

  it('zeigt in der letzten Woche den Wochentag', () => {
    const vorgestern = new Date(2026, 7, 11, 9, 0).getTime()
    expect(kurzeZeit(vorgestern, 'de', jetzt)).toMatch(/^Di/)
    expect(kurzeZeit(vorgestern, 'en', jetzt)).toMatch(/^Tue/)
  })

  it('zeigt davor das Datum als DD.MM.YYYY — in beiden Sprachen', () => {
    // Die Grenze liegt bei sechs Tagen — danach sagt ein Wochentag nicht
    // mehr, welche Woche gemeint ist. Das Format ist die app-weite Festlegung
    // DD.MM.YYYY, nicht das Gebietsschema: Englisch zeigte vorher 20/07.
    const langeHer = new Date(2026, 6, 20, 9, 0).getTime()
    expect(kurzeZeit(langeHer, 'de', jetzt)).toBe('20.07.2026')
    expect(kurzeZeit(langeHer, 'en', jetzt)).toBe('20.07.2026')
  })

  it('behandelt Mitternacht als heute', () => {
    const mitternacht = new Date(2026, 7, 13, 0, 0).getTime()
    expect(kurzeZeit(mitternacht, 'de', jetzt)).toMatch(/00[:.]00/)
  })
})

describe('readDrafts — weitere Formen', () => {
  it('kommt mit einem Entwurf ohne Piloten-Feld zurecht', () => {
    // Kopfdaten vorhanden, aber ohne `traineeName` — Altbestand und der
    // Normalfall bei 307A/B, wo die Namen in der Anwesenheitsliste stehen.
    // Mit einem Feld, das keine Vorbelegung ist — nur das Muster allein
    // waere ein Phantom aus blossem Oeffnen (GRD-10).
    const s = speicherMit({ [K('u1', 'new', '307A')]: JSON.stringify({ header: { aircraftType: 'CL30', event: 'CRM' } }) })
    expect(readDrafts('u1', NUTZER, s)[0]).toMatchObject({ wer: '', noten: 0, gesamt: 0 })
  })

  it('kommt mit einem Piloten ohne Notenfeld zurecht', () => {
    // Ein Entwurf, der beim Anlegen des Piloten unterbrochen wurde: Der
    // Eintrag steht, `grades` fehlt noch.
    const s = speicherMit({ [K('u1', 'new', '308A')]: JSON.stringify({ trainees: [{ traineeName: 'A' }] }) })
    expect(readDrafts('u1', NUTZER, s)[0]).toMatchObject({ wer: 'A', noten: 0, gesamt: 0 })
  })

  it('uebersteht einen Schluessel ohne Inhalt', () => {
    // Der Schluessel steht in der Liste, der Wert ist weg — so sieht ein
    // Speicher aus, den der Browser bei Platzmangel teilweise geraeumt hat.
    const leer = {
      getItem: () => null,
      length: 1,
      key: () => K('u1', 'new', '306'),
      [K('u1', 'new', '306')]: '',
    } as unknown as Storage
    expect(readDrafts('u1', NUTZER, leer)).toEqual([
      { key: K('u1', 'new', '306'), formTypeId: '306', bezug: 'new', kette: [], wer: '', noten: 0, gesamt: 0 },
    ])
  })

  it('zaehlt ueber mehrere Piloten eines Blattes hinweg', () => {
    const zwei = JSON.stringify({
      trainees: [
        { traineeName: 'A', grades: [{ grade: 3 }, { grade: null }] },
        { traineeName: 'B', grades: [{ grade: 4 }, { grade: 2 }] },
      ],
    })
    expect(readDrafts('u1', NUTZER, speicherMit({ [K('u1', 'new', '308A')]: zwei }))[0]).toMatchObject({ wer: 'A, B', noten: 3, gesamt: 4 })
  })
})

/**
 * Audit 11/2026, GRD-01: „Fortsetzen" eines 306/310 verlor den Bezug zum
 * Elternblatt. Die Liste oeffnete `/grading/new?type=310`, das Formular
 * suchte den Schluessel `…-new-310` und fand nichts — und das neu
 * ausgefuellte 310 trug kein parentId, erfuellte also die Pflicht des
 * Elternblatts nie.
 */
describe('Entwurf fortsetzen — mit Elternblatt und Kette', () => {
  it('liest den Bezug zwischen Nutzer und LETZTEM Strich — Kennungen tragen selbst Striche', () => {
    // So beobachtet: Nutzer mit Strich, Record-ID mit zwei Strichen.
    const s = speicherMit({ [K('u-michael', 'gr-1793571773598-1', '306')]: JSON.stringify({ header: { traineeName: 'Mika' } }) })
    expect(readDrafts('u-michael', NUTZER, s)[0]).toMatchObject({ bezug: 'gr-1793571773598-1', formTypeId: '306' })
  })

  it('ein neues Blatt hat den Bezug „new"', () => {
    const s = speicherMit({ [K('u-x', 'new', '308A')]: blatt })
    expect(readDrafts('u-x', NUTZER, s)[0]).toMatchObject({ bezug: 'new', formTypeId: '308A' })
  })

  // Jeder Entwurf hier traegt eine eigene Eingabe (einen Freitext) — ohne
  // sie waere er seit GRD-10 ein Phantom und stuende gar nicht in der Liste.
  const eingabe = { freeText: { 'Deferred items': 'V1 cut' } }

  it('liest die mitgesicherte Kette zurueck', () => {
    const roh = JSON.stringify({ header: {}, ...eingabe, next: '306:gr-2,310:gr-1' })
    const s = speicherMit({ [K('u1', 'gr-1', '310')]: roh })
    expect(readDrafts('u1', NUTZER, s)[0].kette).toEqual([
      { type: '306', parentId: 'gr-2' },
      { type: '310', parentId: 'gr-1' },
    ])
  })

  it('nimmt eine unlesbare Kette als leer, statt den Entwurf zu verlieren', () => {
    const s = speicherMit({ [K('u1', 'gr-1', '310')]: JSON.stringify({ ...eingabe, next: 42 }) })
    expect(readDrafts('u1', NUTZER, s)[0]).toMatchObject({ bezug: 'gr-1', kette: [] })
  })

  it('ein Schluessel ohne Bezugsteil gilt als neues Blatt — neu wie alt', () => {
    expect(readDrafts('u1', NUTZER, speicherMit({ 'aaa-draft-[u1]-308A': blatt }))[0]).toMatchObject({ bezug: 'new', formTypeId: '308A' })
    expect(readDrafts('u1', NUTZER, speicherMit({ 'aaa-draft-u1-308A': blatt }))[0]).toMatchObject({ bezug: 'new', formTypeId: '308A' })
  })

  it('fortsetzenAdresse haengt Elternblatt und Rest der Kette an', () => {
    expect(fortsetzenAdresse({ formTypeId: '310', bezug: 'gr-1793571773598-1', kette: [] })).toBe(
      '/grading/new?type=310&parent=gr-1793571773598-1',
    )
    expect(
      fortsetzenAdresse({ formTypeId: '306', bezug: 'gr-1', kette: [{ type: '306', parentId: 'gr-2' }, { type: '310', parentId: 'gr-1' }] }),
    ).toBe('/grading/new?type=306&parent=gr-1&next=306:gr-2,310:gr-1')
  })

  it('ein neues Blatt geht ohne Bezug weiter', () => {
    expect(fortsetzenAdresse({ formTypeId: '308A', bezug: 'new', kette: [] })).toBe('/grading/new?type=308A')
  })

  it('haengt an ein Nicht-Folgeformular keinen Bezug — das Formular wuerde ihn verwerfen', () => {
    expect(fortsetzenAdresse({ formTypeId: '308A', bezug: 'gr-1', kette: [{ type: '306', parentId: 'gr-1' }] })).toBe('/grading/new?type=308A')
  })

  it('Rundlauf: Liste → Adresse → derselbe Schluessel, unter dem das Formular sichert', () => {
    // Das Formular bildet `entwurfSchluessel(user, parentId ?? 'new', typ)`.
    // Die Adresse muss genau dieses parentId wieder hineinreichen.
    const key = K('u-michael', 'gr-1793571773598-1', '310')
    const [d] = readDrafts('u-michael', NUTZER, speicherMit({ [key]: JSON.stringify({ ...eingabe, next: '306:gr-1793571773598-2' }) }))
    const p = new URLSearchParams(fortsetzenAdresse(d).split('?')[1])
    expect(K('u-michael', p.get('parent') ?? 'new', p.get('type')!)).toBe(key)
    expect(p.get('next')).toBe('306:gr-1793571773598-2')
  })
})

/**
 * Audit 11/2026, GRD-10/TEC-05: Bloßes Oeffnen eines Formulars hinterliess
 * einen Entwurf — die Vorbelegung setzt immer das Datum, und als
 * „ungesichert" galt jeder Kopfwert. Beobachtet: nach Auswahl von 308A lag
 * `aaa-draft-u-michael-new-308A` mit Datum, Muster, Device, Qualifikation
 * und Sitz im Speicher, die Liste zeigte „Draft · 308A", das naechste
 * Oeffnen „A draft of this form was restored.".
 */
describe('hatEigeneEingaben — die Vorbelegung ist keine Eingabe', () => {
  const vorbelegt = {
    header: { date: '2026-11-02', aircraftType: 'C560 XLS+', trainingDevice: 'FFS', instructorQual: 'TKI', instructorSeat: 'Right' },
    freeText: {},
    authority: 'AT',
  }
  const leererPilot = { traineeName: '', grades: [{ grade: null, comment: '' }], positiveComment: '', developmentComment: '', summaryComment: '', overall: null }
  const unberuehrt = {
    header: { ...vorbelegt.header },
    trainees: [leererPilot],
    freeText: {},
    attendance: [{ name: '' }],
    sessionStatus: null,
    authority: 'AT',
  }

  it('nur Vorbelegung: keine eigene Eingabe', () => {
    expect(hatEigeneEingaben(unberuehrt, vorbelegt)).toBe(false)
  })

  it('ein Pilotenname ist eine Eingabe', () => {
    expect(hatEigeneEingaben({ ...unberuehrt, trainees: [{ ...leererPilot, traineeName: 'Sophie' }] }, vorbelegt)).toBe(true)
  })

  it('eine Note ist eine Eingabe — auch „NO"', () => {
    expect(hatEigeneEingaben({ ...unberuehrt, trainees: [{ ...leererPilot, grades: [{ grade: 4 }] }] }, vorbelegt)).toBe(true)
    expect(hatEigeneEingaben({ ...unberuehrt, trainees: [{ ...leererPilot, grades: [{ grade: 'NO' }] }] }, vorbelegt)).toBe(true)
  })

  it('Kommentare und ein gewaehltes Ergebnis sind Eingaben', () => {
    expect(hatEigeneEingaben({ ...unberuehrt, trainees: [{ ...leererPilot, summaryComment: 'gut' }] }, vorbelegt)).toBe(true)
    expect(hatEigeneEingaben({ ...unberuehrt, trainees: [{ ...leererPilot, grades: [{ grade: null, comment: 'x' }] }] }, vorbelegt)).toBe(true)
    expect(hatEigeneEingaben({ ...unberuehrt, trainees: [{ ...leererPilot, overall: 'competent' }] }, vorbelegt)).toBe(true)
  })

  it('ein geaendertes oder geloeschtes vorbelegtes Datum ist eine Eingabe', () => {
    expect(hatEigeneEingaben({ ...unberuehrt, header: { ...vorbelegt.header, date: '2026-11-01' } }, vorbelegt)).toBe(true)
    expect(hatEigeneEingaben({ ...unberuehrt, header: { ...vorbelegt.header, date: '' } }, vorbelegt)).toBe(true)
  })

  it('ein zusaetzliches Kopffeld ist eine Eingabe, ein leeres nicht', () => {
    expect(hatEigeneEingaben({ ...unberuehrt, header: { ...vorbelegt.header, event: 'LOFT 3' } }, vorbelegt)).toBe(true)
    expect(hatEigeneEingaben({ ...unberuehrt, header: { ...vorbelegt.header, event: '  ' } }, vorbelegt)).toBe(false)
  })

  it('ein aus dem Elternblatt vorbefuellter Freitext (306) ist keine Eingabe — eine Aenderung daran schon', () => {
    const basis = { ...vorbelegt, freeText: { Deficiencies: 'KNO (1)' } }
    expect(hatEigeneEingaben({ ...unberuehrt, freeText: { Deficiencies: 'KNO (1)' } }, basis)).toBe(false)
    expect(hatEigeneEingaben({ ...unberuehrt, freeText: { Deficiencies: 'KNO (1), more briefing' } }, basis)).toBe(true)
  })

  it('Session, Anwesende und eine umgestellte Behoerde sind Eingaben', () => {
    expect(hatEigeneEingaben({ ...unberuehrt, sessionStatus: 'completed' }, vorbelegt)).toBe(true)
    expect(hatEigeneEingaben({ ...unberuehrt, attendance: [{ name: 'Lukas' }] }, vorbelegt)).toBe(true)
    expect(hatEigeneEingaben({ ...unberuehrt, authority: 'UK' }, vorbelegt)).toBe(true)
  })

  it('ein zweiter, leerer Pilot ist noch keine Eingabe', () => {
    expect(hatEigeneEingaben({ ...unberuehrt, trainees: [leererPilot, leererPilot] }, vorbelegt)).toBe(false)
  })
})

describe('Phantom-Entwuerfe — weder in der Liste noch im Speicher', () => {
  it('ein Entwurf mit seiner Vorbelegung und ohne Abweichung ist ein Phantom', () => {
    const basis = { header: { date: '2026-11-02', aircraftType: 'C560 XLS+' }, freeText: {}, authority: 'AT' }
    expect(entwurfMitEingaben({ header: { ...basis.header }, trainees: [], authority: 'AT', basis })).toBe(false)
    expect(entwurfMitEingaben({ header: { ...basis.header, event: 'LOFT' }, authority: 'AT', basis })).toBe(true)
  })

  it('misst an der MITGESICHERTEN Vorbelegung — ein frueher geaendertes Datum bleibt eine Eingabe', () => {
    // Der Nutzer hat das vorbelegte Datum bewusst auf gestern gesetzt.
    const basis = { header: { date: '2026-11-02' } }
    expect(entwurfMitEingaben({ header: { date: '2026-11-01' }, basis })).toBe(true)
  })

  it('Altbestand ohne Basis: nur die damals vorbelegten Felder gelten als Vorbelegung', () => {
    // So beobachtet (TEC-05): `#/grading/new?type=306` nur geoeffnet.
    const phantom = { header: { date: '2026-11-01', aircraftType: 'C560 XLS+', instructorQual: 'TKI', instructorSeat: 'Right' }, trainees: [], freeText: {}, attendance: [{ name: '', signature: null }], sessionStatus: null, step: 1, authority: 'AT' }
    expect(entwurfMitEingaben(phantom)).toBe(false)
    expect(entwurfMitEingaben({ ...phantom, header: { ...phantom.header, traineeName: 'Mika' } })).toBe(true)
    expect(entwurfMitEingaben({ ...phantom, authority: 'UK' })).toBe(true)
  })

  it('readDrafts zeigt Phantome nicht und raeumt sie weg — echte Entwuerfe bleiben', () => {
    const s = speicherMit({
      [K('u-michael', 'new', '308A')]: JSON.stringify({
        header: { date: '2026-11-01', aircraftType: 'C560 XLS+', trainingDevice: 'FFS', instructorQual: 'TKI', instructorSeat: 'Right' },
        trainees: [{ traineeName: '', grades: [{ grade: null, comment: '' }] }],
        freeText: {},
        attendance: [{ name: '', signature: null }],
        sessionStatus: null,
        step: 1,
        authority: 'AT',
      }),
      [K('u-michael', 'new', '306')]: '{}',
      [K('u-michael', 'new', '308F')]: blatt,
    })
    expect(readDrafts('u-michael', NUTZER, s).map((d) => d.formTypeId)).toEqual(['308F'])
    expect(s.getItem(K('u-michael', 'new', '308A'))).toBeNull()
    expect(s.getItem(K('u-michael', 'new', '306'))).toBeNull()
    expect(s.getItem(K('u-michael', 'new', '308F'))).toBe(blatt)
  })

  it('loescht nichts, was sich nicht lesen laesst — ob darin etwas steckte, weiss niemand', () => {
    const s = speicherMit({ [K('u1', 'new', '308A')]: '{kaputt' })
    expect(readDrafts('u1', NUTZER, s)).toHaveLength(1)
    expect(s.getItem(K('u1', 'new', '308A'))).toBe('{kaputt')
  })

  it('ein Speicher, der nicht loeschen laesst, kostet die Liste nicht', () => {
    const s = speicherMit({ [K('u1', 'new', '306')]: '{}', [K('u1', 'new', '308A')]: blatt })
    s.removeItem = () => {
      throw new Error('gesperrt')
    }
    expect(readDrafts('u1', NUTZER, s).map((d) => d.formTypeId)).toEqual(['308A'])
  })

  it('ein Wert, der kein Objekt ist, zaehlt als leer', () => {
    const s = speicherMit({ [K('u1', 'new', '306')]: 'null', [K('u1', 'new', '310')]: '42' })
    expect(readDrafts('u1', NUTZER, s)).toEqual([])
  })
})

/**
 * Audit 11/2026, R3-ENTWURFSPRAEFIX: Gesucht wurde per `startsWith` nach
 * `aaa-draft-<nutzer>-`. Kennungen tragen selbst Bindestriche — für „u"
 * passte damit auch jeder Entwurf von „u-x": Auf einem geteilten iPad sah
 * der eine die Bewertungen des anderen. Gegenprobe: `readDrafts` wieder per
 * Präfix → „u und u-x" rot (u sieht beide).
 */
describe('Entwürfe gehören genau einem Nutzer (R3-ENTWURFSPRAEFIX)', () => {
  const nutzer = ['u', 'u-x']

  it('„u" und „u-x" sehen nur ihre eigenen Entwürfe', () => {
    const s = speicherMit({ [K('u', 'new', '308A')]: blatt, [K('u-x', 'new', '308F')]: blatt })
    expect(readDrafts('u', nutzer, s).map((d) => d.formTypeId)).toEqual(['308A'])
    expect(readDrafts('u-x', nutzer, s).map((d) => d.formTypeId)).toEqual(['308F'])
  })

  it('die Kennung steht kodiert und wird ganz verglichen — auch mit „]" oder „-" darin', () => {
    expect(K('u-x', 'gr-1-2', '306')).toBe('aaa-draft-[u-x]-gr-1-2-306')
    expect(entwurfZerlegen(K('a]b-c', 'new', '308A'))).toEqual({ userId: 'a]b-c', bezug: 'new', typ: '308A' })
    expect(entwurfZerlegen(K('u', 'gr-1793571773598-1', '310'))).toEqual({ userId: 'u', bezug: 'gr-1793571773598-1', typ: '310' })
  })

  it('zerlegt nur Schlüssel der neuen Form', () => {
    expect(entwurfZerlegen('aaa-draft-u-new-308A')).toBeNull()
    expect(entwurfZerlegen('aaa-draft-[u-new-308A')).toBeNull()
    expect(entwurfZerlegen('aaa-draft-[u]new-308A')).toBeNull()
    expect(entwurfZerlegen('aaa-draft-[%E0%A4%A]-new-308A')).toBeNull()
    expect(entwurfZerlegen('aaa-theme')).toBeNull()
  })

  it('alter Schlüssel: gehört dem LÄNGSTEN passenden Nutzer — „u-x", nicht „u" mit Bezug „x-new"', () => {
    const s = speicherMit({ 'aaa-draft-u-x-new-308A': blatt, 'aaa-draft-u-new-308F': blatt })
    expect(readDrafts('u', nutzer, s).map((d) => d.formTypeId)).toEqual(['308F'])
    expect(readDrafts('u-x', nutzer, s).map((d) => d.formTypeId)).toEqual(['308A'])
    // Übernommen, nicht verloren: unter dem neuen Schlüssel, der alte ist weg.
    expect(s.getItem(K('u-x', 'new', '308A'))).toBe(blatt)
    expect(s.getItem('aaa-draft-u-x-new-308A')).toBeNull()
  })

  it('alter Schlüssel ohne bekannten Nutzer bleibt unangetastet und wird niemandem gezeigt', () => {
    const s = speicherMit({ 'aaa-draft-fremd-new-308A': blatt })
    expect(readDrafts('u', nutzer, s)).toEqual([])
    expect(s.getItem('aaa-draft-fremd-new-308A')).toBe(blatt)
  })

  it('überschreibt beim Übernehmen keinen neueren Entwurf unter dem neuen Schlüssel', () => {
    const neuer = JSON.stringify({ trainees: [{ traineeName: 'Neu', grades: [] }] })
    const s = speicherMit({ 'aaa-draft-u-new-308A': blatt, [K('u', 'new', '308A')]: neuer })
    alteEntwuerfeUebernehmen(s, nutzer)
    expect(s.getItem(K('u', 'new', '308A'))).toBe(neuer)
    expect(s.getItem('aaa-draft-u-new-308A')).toBe(blatt)
  })

  it('ohne die Nutzerliste zählt wenigstens der eigene Nutzer', () => {
    const s = speicherMit({ 'aaa-draft-u-new-308A': blatt })
    expect(readDrafts('u', [], s).map((d) => d.formTypeId)).toEqual(['308A'])
  })

  it('das Formular findet seinen Entwurf auch unter dem alten Schlüssel — und übernimmt ihn', () => {
    const s = speicherMit({ 'aaa-draft-u-x-gr-1-306': blatt })
    expect(entwurfLesen(s, 'u-x', 'gr-1', '306')).toBe(blatt)
    expect(s.getItem(K('u-x', 'gr-1', '306'))).toBe(blatt)
    expect(s.getItem('aaa-draft-u-x-gr-1-306')).toBeNull()
    // Der alte Schlüssel wird GENAU nachgeschlagen: „u" findet den von „u-x" nicht.
    expect(entwurfLesen(speicherMit({ 'aaa-draft-u-x-new-308A': blatt }), 'u', 'x-new', '308B')).toBeNull()
    expect(entwurfLesen(speicherMit({}), 'u', 'new', '308A')).toBeNull()
    expect(entwurfLesen(speicherMit({ [K('u', 'new', '308A')]: blatt }), 'u', 'new', '308A')).toBe(blatt)
  })
})
