import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { csvNum } from './csv'
import { formatDateTime } from './datum'
import {
  adminExcel,
  ADMIN_EXPORT_TITEL,
  adminExportZeilen,
  adminTabelle,
  adminZeile,
  dezimalStunden,
  BRIEFING_STD_MIN,
  DEBRIEFING_STD_MIN,
  darfLogbuchOeffnen,
  eintraegeUnterFilter,
  eintragAusFormular,
  entfernteFormularEintraege,
  filtereEintraege,
  formatDauer,
  LEERES_LOGBUCH,
  logbuchCsvZeilen,
  logbuchDateiName,
  logbuchSicht,
  logbuchVon,
  nachMonaten,
  overrideSetzen,
  parseDauer,
  parseDauerEingabe,
  sichtbareEintraege,
  summeUnterFilter,
  summiere,
  zaehltInsLogbuch,
  zeilenAlsCsv,
  type LogbookEintrag,
  type LogbookStand,
} from './logbook'
import type { GradingRecord, Role } from './types'

/**
 * Das Logbuch ist ein Taetigkeitsnachweis — die Grundlage einer FI/TRI/SFI-
 * Verlaengerung. Eine falsch gezaehlte Stunde hier ist keine Kosmetik,
 * sondern eine falsche Angabe gegenueber der Behoerde. Die Zusagen des
 * Nutzers stehen deshalb woertlich als Faelle:
 *
 *  - nur fertige Formulare (alle Unterschriften),
 *  - 306 und 310 nie,
 *  - 308 = Simulator Training mit +1:00 Briefing und +0:30 Debriefing,
 *  - 307 = Ground Training, nur das Duration-Feld,
 *  - Korrekturen und Loeschungen ueberleben die Neuableitung,
 *  - manuelle Eintraege zusaetzlich,
 *  - Admin sieht Fremdes nur in seinen Mustern.
 */

const blatt = (over: Partial<GradingRecord> = {}): GradingRecord => ({
  id: 'r1',
  formTypeId: '308A',
  instructorId: 'u1',
  header: { date: '2026-08-10', aircraftType: 'CL30', flightTimePF: '02:00', flightTimePM: '02:00' },
  trainees: [{ traineeId: 't1', traineeName: 'Sophie Berger', position: 'CDR', grades: [], positiveComment: '', developmentComment: '', summaryComment: '', overall: null }],
  sessionStatus: null,
  freeText: {},
  signatureInstructor: 'sig',
  signatureTrainee: 'sig',
  status: 'signed',
  mailStatus: 'sent',
  createdAt: 1000,
  ...over,
})

describe('parseDauer / formatDauer', () => {
  it('liest HH:MM und schreibt es zurueck', () => {
    expect(parseDauer('02:30')).toBe(150)
    expect(formatDauer(150)).toBe('02:30')
    expect(formatDauer(parseDauer('00:00'))).toBe('00:00')
  })

  it('macht aus Kaputtem 0 statt NaN', () => {
    // NaN summiert sich durch jede Auswertung — ein leeres Feld darf die
    // Monatssumme nicht vergiften.
    expect(parseDauer('')).toBe(0)
    expect(parseDauer(undefined)).toBe(0)
    expect(parseDauer('4h')).toBe(0)
    expect(parseDauer('02:99')).toBe(0)
  })

  it('zeigt Negatives als 00:00', () => {
    expect(formatDauer(-30)).toBe('00:00')
  })
})

describe('Was zaehlt', () => {
  it('zaehlt nur vollstaendig unterschriebene Formulare', () => {
    expect(zaehltInsLogbuch(blatt())).toBe(true)
    expect(zaehltInsLogbuch(blatt({ status: 'draft' }))).toBe(false)
    expect(zaehltInsLogbuch(blatt({ status: 'awaiting_signature' }))).toBe(false)
  })

  it('zaehlt 306 und 310 nie', () => {
    // Folgeformulare dokumentieren die Session des Ausgangsblatts — sie
    // mitzuzaehlen hiesse, dieselbe Stunde zweimal nachzuweisen.
    expect(zaehltInsLogbuch(blatt({ formTypeId: '306' }))).toBe(false)
    expect(zaehltInsLogbuch(blatt({ formTypeId: '310' }))).toBe(false)
  })

  it('zaehlt fremde Formulartypen nicht automatisch', () => {
    // Fuer einen eigenen Typ sagt keine Regel, was Briefing und Session
    // waeren — der Weg dafuer ist der manuelle Eintrag.
    expect(zaehltInsLogbuch(blatt({ formTypeId: '311' }))).toBe(false)
  })
})

describe('308 — Simulator Training', () => {
  it('rechnet Session aus PF + PM und legt Briefing/Debriefing als Startwerte dazu', () => {
    const e = eintragAusFormular(blatt())!
    expect(e.kategorie).toBe('Simulator Training')
    expect(e.session).toBe(240)
    expect(e.briefing).toBe(BRIEFING_STD_MIN)
    expect(e.debriefing).toBe(DEBRIEFING_STD_MIN)
    expect(e.gesamt).toBe(240 + 60 + 30)
    expect(e.datum).toBe('2026-08-10')
    expect(e.piloten).toEqual(['Sophie Berger'])
  })

  /* Erwartung mit GTY-03 bewusst geprueft, nicht still angepasst
     (Nachtrag L-FORMTYP#5): Die Session zaehlt 0 — eine Zahl erfinden
     hiesse raten —, Briefing und Debriefing bleiben als Startwerte stehen,
     weil sie bei JEDEM 308 pauschal gesetzt sind und das unterschriebene
     Blatt belegt, dass die Session stattfand (308 = Simulator Training).
     Neu ist nur, dass der Eintrag die fehlende Zeit ausweist, statt 00:00
     als gemessen erscheinen zu lassen. Wer hier 0 statt 90 erwartet,
     nimmt einem belegten Durchgang seine Vor- und Nachbereitung. */
  it('uebersteht fehlende Zeitfelder: Session 0, Startwerte bleiben, Zeit als fehlend markiert', () => {
    const e = eintragAusFormular(blatt({ header: { date: '2026-08-10', aircraftType: 'CL30' } }))!
    expect(e.session).toBe(0)
    expect(e.briefing).toBe(BRIEFING_STD_MIN)
    expect(e.debriefing).toBe(DEBRIEFING_STD_MIN)
    expect(e.gesamt).toBe(90)
    // … sagt aber, dass die Zeit fehlt (GTY-03)
    expect(e.zeitFehlt).toBe(true)
    // und ist KEINE Korrektur: Das sind die Werte des Formulars (KERN-04).
    expect(e.korrigiert).toBeUndefined()
  })
})

/**
 * Audit 11/2026, GTY-03: Das 308G (Bewertung eines Instruktor-Kandidaten)
 * fuehrt kein Flight Time PF/PM. Jedes 308G stand deshalb als „Simulator
 * Training" mit Session 00:00 und pauschal 1:30 im Taetigkeitsnachweis —
 * der Grundlage der TRI/SFI-Verlaengerung. Der Typ bekommt die Pflichtangabe
 * Session Time; ein Altbestand ohne jede Zeit heisst `zeitFehlt`, statt
 * still 00:00 als gemessen auszuweisen.
 */
describe('308G — Sessiondauer statt Flight Time (Audit 11/2026, GTY-03)', () => {
  const g = (header: Record<string, string>) => blatt({ formTypeId: '308G', header: { date: '2026-08-10', aircraftType: 'CL30', ...header } })

  it('308G nimmt die Sessiondauer — Simulator Training mit Briefing und Debriefing', () => {
    const e = eintragAusFormular(g({ sessionTime: '03:00' }))!
    expect(e.kategorie).toBe('Simulator Training')
    expect(e.session).toBe(180)
    expect(e.gesamt).toBe(180 + BRIEFING_STD_MIN + DEBRIEFING_STD_MIN)
    expect(e.zeitFehlt).toBeUndefined()
  })

  it('308G ohne Zeit → zeitFehlt; die Session zaehlt 0 und wird nicht als gemessen ausgewiesen', () => {
    const e = eintragAusFormular(g({}))!
    expect(e.zeitFehlt).toBe(true)
    expect(e.session).toBe(0)
    const z = logbuchCsvZeilen({
      inhaber: 'M', sicht: { eintraege: [e], ausgeblendet: 0, bereich: null }, eintraege: [e], filter: {}, exportiertAm: 0, exportiertVon: 'M',
    })
    const kopf = z.find((r) => r[0] === 'Date')!
    const zeile = z.find((r) => r[0] === '10.08.2026')!
    expect(zeile[kopf.indexOf('Session')]).toBe('missing')
    expect(zeile[kopf.indexOf('Session (h)')]).toBe('')
    // Die Summe rechnet sie als 0 — und bleibt eine Zahl.
    expect(z[z.length - 1][kopf.indexOf('Session (h)')]).toBe(0)
  })

  it('eine Korrektur mit Session ergaenzt die Zeit; eine Notiz allein nicht', () => {
    const ergaenzt = eintragAusFormular(g({}), { session: 120 })!
    expect(ergaenzt.zeitFehlt).toBeUndefined()
    expect(ergaenzt.session).toBe(120)
    // Gegen das Formular ist das eine Abweichung (KERN-04): Formular 0 + 1:30
    expect(ergaenzt.korrigiert?.gesamt).toBe(90)
    expect(eintragAusFormular(g({}), { notiz: 'FFS 2' })!.zeitFehlt).toBe(true)
  })

  it('PF/PM gehen vor, sobald eines davon ausgefuellt ist — auch „00:00" ist eine Angabe', () => {
    expect(eintragAusFormular(blatt({ header: { date: '2026-08-10', flightTimePF: '01:00', sessionTime: '05:00' } }))!.session).toBe(60)
    const null0 = eintragAusFormular(blatt({ header: { date: '2026-08-10', flightTimePF: '00:00', flightTimePM: '00:00' } }))!
    expect(null0.zeitFehlt).toBeUndefined()
    expect(null0.session).toBe(0)
    // Ein leeres Feld ist keine Angabe
    expect(eintragAusFormular(blatt({ header: { date: '2026-08-10', flightTimePF: '  ', flightTimePM: '' } }))!.zeitFehlt).toBe(true)
  })

  it('307 ohne Duration heisst ebenso zeitFehlt — eine Regel fuer jeden Formulartyp', () => {
    expect(eintragAusFormular(blatt({ formTypeId: '307A', header: { date: '2026-08-09' } }))!.zeitFehlt).toBe(true)
    expect(eintragAusFormular(blatt({ formTypeId: '307A', header: { date: '2026-08-09', duration: '02:00' } }))!.zeitFehlt).toBeUndefined()
  })
})

describe('307 — Ground Training', () => {
  const g = blatt({
    formTypeId: '307A',
    header: { date: '2026-08-09', aircraftType: 'C560 XLS+', duration: '03:15' },
    trainees: [],
    attendance: [{ name: 'Lukas Steiner', licenceNo: '', signature: null } as never],
  })

  it('nimmt genau das Duration-Feld, ohne Zuschlaege', () => {
    const e = eintragAusFormular(g)!
    expect(e.kategorie).toBe('Ground Training')
    expect(e.session).toBe(195)
    expect(e.briefing).toBe(0)
    expect(e.debriefing).toBe(0)
    expect(e.gesamt).toBe(195)
  })

  it('nennt die Teilnehmer aus der Anwesenheitsliste', () => {
    expect(eintragAusFormular(g)!.piloten).toEqual(['Lukas Steiner'])
  })
})

describe('Korrekturen (Overrides)', () => {
  it('ersetzt einzelne Teilzeiten und laesst den Rest stehen', () => {
    const e = eintragAusFormular(blatt(), { briefing: 45 })!
    expect(e.briefing).toBe(45)
    expect(e.session).toBe(240)
    expect(e.gesamt).toBe(45 + 240 + 30)
  })

  it('entfernt einen Eintrag endgueltig, auch bei Neuableitung', () => {
    expect(eintragAusFormular(blatt(), { geloescht: true })).toBeNull()
  })
})

describe('logbuchVon', () => {
  const records = [
    blatt(),
    blatt({ id: 'r2', instructorId: 'u2' }),
    blatt({ id: 'r3', status: 'draft' }),
    blatt({ id: 'r4', formTypeId: '306' }),
  ]

  it('nimmt nur die eigenen, fertigen, zaehlbaren Formulare', () => {
    const eintraege = logbuchVon(records, 'u1', LEERES_LOGBUCH)
    expect(eintraege.map((e) => e.id)).toEqual(['r1'])
  })

  it('mischt manuelle Eintraege dazu, neueste zuerst', () => {
    const stand = {
      overrides: {},
      manuell: [{ id: 'm1', datum: '2026-08-12', aircraftType: 'CL30', kategorie: 'Other Training', dauer: 120, notiz: 'CRM-Workshop' }],
    }
    const eintraege = logbuchVon(records, 'u1', stand)
    expect(eintraege.map((e) => e.id)).toEqual(['m1', 'r1'])
    expect(eintraege[0].gesamt).toBe(120)
  })

  it('wendet Overrides des Eigentuemers an', () => {
    const stand = { overrides: { r1: { geloescht: true } }, manuell: [] }
    expect(logbuchVon(records, 'u1', stand)).toEqual([])
  })
})

describe('Filter', () => {
  const eintraege = logbuchVon(
    [
      blatt(),
      blatt({ id: 'r5', formTypeId: '307A', header: { date: '2026-08-01', aircraftType: 'C560 XLS+', duration: '02:00' }, trainees: [], attendance: [{ name: 'Max Muster' } as never] }),
    ],
    'u1',
    LEERES_LOGBUCH,
  )

  it('filtert nach Zeitraum, Muster, Kategorie, Formulartyp und Pilot', () => {
    expect(filtereEintraege(eintraege, { von: '2026-08-05' }).map((e) => e.id)).toEqual(['r1'])
    expect(filtereEintraege(eintraege, { bis: '2026-08-05' }).map((e) => e.id)).toEqual(['r5'])
    expect(filtereEintraege(eintraege, { muster: 'C560 XLS+' }).map((e) => e.id)).toEqual(['r5'])
    expect(filtereEintraege(eintraege, { kategorie: 'Simulator Training' }).map((e) => e.id)).toEqual(['r1'])
    expect(filtereEintraege(eintraege, { formTyp: '307A' }).map((e) => e.id)).toEqual(['r5'])
    expect(filtereEintraege(eintraege, { pilot: 'sophie' }).map((e) => e.id)).toEqual(['r1'])
  })

  it('kombiniert Filter als UND', () => {
    expect(filtereEintraege(eintraege, { muster: 'CL30', kategorie: 'Ground Training' })).toEqual([])
  })
})

describe('Summen', () => {
  it('summiert gesamt, je Kategorie und je Muster', () => {
    const eintraege = logbuchVon(
      [blatt(), blatt({ id: 'r6', header: { ...blatt().header, aircraftType: 'C560 XLS+' } })],
      'u1',
      LEERES_LOGBUCH,
    )
    const s = summiere(eintraege)
    expect(s.eintraege).toBe(2)
    expect(s.gesamt).toBe(2 * 330)
    expect(s.jeKategorie['Simulator Training']).toBe(660)
    expect(s.jeMuster['CL30']).toBe(330)
    expect(s.jeMuster['C560 XLS+']).toBe(330)
  })
})

describe('Wer sieht wessen Logbuch', () => {
  const wer = (id: string, role: Role, aircraftTypes: string[] = []) => ({ id, role, aircraftTypes })
  const eintraege = logbuchVon(
    [blatt(), blatt({ id: 'r7', header: { ...blatt().header, aircraftType: 'C560 XLS+' } })],
    'u1',
    LEERES_LOGBUCH,
  )

  it('das eigene immer vollstaendig', () => {
    expect(sichtbareEintraege(wer('u1', 'member'), 'u1', eintraege)).toHaveLength(2)
  })

  it('Superadmin und Training Admin sehen fremde vollstaendig', () => {
    expect(sichtbareEintraege(wer('x', 'superadmin'), 'u1', eintraege)).toHaveLength(2)
    expect(sichtbareEintraege(wer('x', 'training_admin'), 'u1', eintraege)).toHaveLength(2)
  })

  it('ein Gruppenadmin sieht Fremdes nur in seinen Mustern', () => {
    const gefiltert = sichtbareEintraege(wer('x', 'group_admin', ['CL30']), 'u1', eintraege)
    expect(gefiltert.map((e) => e.aircraftType)).toEqual(['CL30'])
  })

  it('ein Mitglied sieht Fremdes gar nicht', () => {
    expect(sichtbareEintraege(wer('x', 'member', ['CL30', 'C560 XLS+']), 'u1', eintraege)).toEqual([])
  })

  it('darfLogbuchOeffnen deckt sich mit der Sicht', () => {
    expect(darfLogbuchOeffnen(wer('u1', 'member'), 'u1')).toBe(true)
    expect(darfLogbuchOeffnen(wer('x', 'member'), 'u1')).toBe(false)
    expect(darfLogbuchOeffnen(wer('x', 'group_admin'), 'u1')).toBe(true)
    expect(darfLogbuchOeffnen(wer('x', 'training_admin'), 'u1')).toBe(true)
  })
})

describe('Admin-Auswertung (Zeitfilter)', () => {
  const e = (kategorie: string, briefing: number, session: number, debriefing: number): import('./logbook').LogbookEintrag => ({
    id: `e-${kategorie}-${session}`,
    quelle: 'manuell',
    datum: '2026-08-10',
    aircraftType: 'CL30',
    kategorie,
    briefing,
    session,
    debriefing,
    gesamt: briefing + session + debriefing,
    piloten: [],
    notiz: '',
  })
  const bestand = [
    e('Simulator Training', 60, 240, 30), // wie eine fertige 308
    e('Ground Training', 0, 90, 0), // wie eine 307
    e('Other Training', 0, 45, 0),
    e('CRM Workshop', 0, 120, 0), // Freitext-Kategorie
  ]

  it('zaehlt „alle" mit Briefing, „ohneBriefing" nur die Session', () => {
    // 330 + 90 + 45 + 120 = 585; ohne Briefing fallen 60+30 der 308 weg.
    expect(summeUnterFilter(bestand, 'alle')).toEqual({ minuten: 585, anzahl: 4 })
    expect(summeUnterFilter(bestand, 'ohneBriefing')).toEqual({ minuten: 495, anzahl: 4 })
  })

  it('filtert je Kategorie und zaehlt dort die volle Zeit', () => {
    expect(summeUnterFilter(bestand, 'simulator')).toEqual({ minuten: 330, anzahl: 1 })
    expect(summeUnterFilter(bestand, 'ground')).toEqual({ minuten: 90, anzahl: 1 })
  })

  it('faengt Freitext-Kategorien unter „other" — die drei Gruppen decken alles', () => {
    // Sonst ergaeben die drei Kategoriesummen zusammen weniger als „alle",
    // und ein manueller Eintrag mit eigener Bezeichnung waere unauffindbar.
    expect(summeUnterFilter(bestand, 'other')).toEqual({ minuten: 165, anzahl: 2 })
    const dreiGruppen = (['ground', 'simulator', 'other'] as const).reduce(
      (s, f) => s + summeUnterFilter(bestand, f).minuten,
      0,
    )
    expect(dreiGruppen).toBe(summeUnterFilter(bestand, 'alle').minuten)
  })

  it('liefert die gefilterten Eintraege fuer die Anzeige', () => {
    expect(eintraegeUnterFilter(bestand, 'other').map((x) => x.kategorie)).toEqual(['Other Training', 'CRM Workshop'])
    expect(eintraegeUnterFilter(bestand, 'alle')).toHaveLength(4)
  })
})

describe('adminZeile (Detail-Tabelle)', () => {
  const e = (kategorie: string, muster: string, briefing: number, session: number, debriefing: number): import('./logbook').LogbookEintrag => ({
    id: `z-${kategorie}-${session}`,
    quelle: 'manuell',
    datum: '2026-08-10',
    aircraftType: muster,
    kategorie,
    briefing,
    session,
    debriefing,
    gesamt: briefing + session + debriefing,
    piloten: [],
    notiz: '',
  })
  const bestand = [
    e('Simulator Training', 'CL30', 60, 240, 30),
    e('Ground Training', 'C560 XLS+', 0, 90, 0),
    e('CRM Workshop', '', 0, 120, 0), // Freitext, ohne Muster
  ]

  it('schluesselt je Kategorie auf; die Spalten ergeben zusammen die Gesamtspalte', () => {
    const z = adminZeile(bestand, false)
    expect(z).toMatchObject({ anzahl: 3, ground: 90, simulator: 330, other: 120, gesamt: 540 })
    expect(z.ground + z.simulator + z.other).toBe(z.gesamt)
  })

  it('zaehlt ohne Briefing nur die Session — auch in den Kategoriespalten', () => {
    const z = adminZeile(bestand, true)
    expect(z).toMatchObject({ simulator: 240, ground: 90, other: 120, gesamt: 450 })
    expect(z.ground + z.simulator + z.other).toBe(z.gesamt)
  })

  it('nennt die vorkommenden Muster sortiert und ohne leere Werte', () => {
    expect(adminZeile(bestand, false).muster).toEqual(['C560 XLS+', 'CL30'])
  })
})

describe('nachMonaten', () => {
  const e = (datum: string): import('./logbook').LogbookEintrag => ({
    id: `m-${datum}`,
    quelle: 'manuell',
    datum,
    aircraftType: 'CL30',
    kategorie: 'Other Training',
    briefing: 0,
    session: 60,
    debriefing: 0,
    gesamt: 60,
    piloten: [],
    notiz: '',
  })

  it('gruppiert nach Monat, neuester zuerst', () => {
    const g = nachMonaten([e('2026-08-05'), e('2026-08-01'), e('2026-07-15')])
    expect(g.map((x) => (x.art === 'monat' ? x.monat : 'luecke'))).toEqual(['2026-08', '2026-07'])
    expect(g[0].art === 'monat' && g[0].eintraege).toHaveLength(2)
  })

  it('zeigt einen EINZELNEN leeren Monat als leeren Monat', () => {
    // Ein fehlender Monat saehe aus wie ein Uebertragungsfehler.
    const g = nachMonaten([e('2026-08-05'), e('2026-06-20')])
    expect(g.map((x) => (x.art === 'monat' ? x.monat : `luecke:${x.monate}`))).toEqual(['2026-08', '2026-07', '2026-06'])
    expect(g[1].art === 'monat' && g[1].eintraege).toEqual([])
  })

  it('faltet mehrere leere Monate am Stueck zu einer Zeile', () => {
    // Befund: ein Eintrag von 2019 neben einem von 2026 ergab 88 leere
    // Abschnitte. Die Aussage bleibt, sie braucht nur nicht 88 Zeilen.
    const g = nachMonaten([e('2026-08-05'), e('2026-03-01')])
    expect(g.map((x) => (x.art === 'monat' ? x.monat : `luecke ${x.von}..${x.bis} (${x.monate})`))).toEqual([
      '2026-08',
      'luecke 2026-04..2026-07 (4)',
      '2026-03',
    ])
  })

  it('bleibt auch ueber sieben Jahre kurz', () => {
    const g = nachMonaten([e('2026-08-05'), e('2019-03-10')])
    expect(g).toHaveLength(3)
    expect(g[1].art).toBe('luecke')
    expect(g[1].art === 'luecke' && g[1].monate).toBe(88)
  })

  it('ueberbrueckt den Jahreswechsel', () => {
    const g = nachMonaten([e('2026-01-10'), e('2025-11-30')])
    expect(g.map((x) => (x.art === 'monat' ? x.monat : 'luecke'))).toEqual(['2026-01', '2025-12', '2025-11'])
  })

  it('liefert fuer einen leeren Bestand keine Abschnitte', () => {
    expect(nachMonaten([])).toEqual([])
  })
})

describe('adminTabelle', () => {
  const nutzer = [
    { id: 'u1', name: 'Anna Instruktor', active: true },
    { id: 'u2', name: 'Bert Instruktor', active: false },
    { id: 'u3', name: 'Ohne Logbuch', active: true },
  ]
  const records = [
    blatt({ id: 'a1', instructorId: 'u1' }),
    blatt({ id: 'a2', instructorId: 'u1', formTypeId: '307A', header: { date: '2026-07-02', aircraftType: 'C560 XLS+', duration: '02:00' }, trainees: [], attendance: [{ name: 'X' } as never] }),
    blatt({ id: 'b1', instructorId: 'u2' }),
  ]

  it('laesst weg, wer gar kein Logbuch fuehrt', () => {
    const t = adminTabelle(nutzer, records, {}, {}, false)
    expect(t.zeilen.map((z) => z.id)).toEqual(['u1', 'u2'])
  })

  it('summiert die Zeilen — die Summenzeile ist die Summe der Spalten', () => {
    const t = adminTabelle(nutzer, records, {}, {}, false)
    expect(t.summe.gesamt).toBe(t.zeilen.reduce((s, z) => s + z.gesamt, 0))
    expect(t.summe.ground + t.summe.simulator + t.summe.other).toBe(t.summe.gesamt)
    expect(t.summe.anzahl).toBe(3)
  })

  it('nennt die Muster des GANZEN Bestands, nicht nur der gefilterten Sicht', () => {
    // Sonst verschwindet der eigene Filterwert aus der Auswahl, sobald er greift.
    const t = adminTabelle(nutzer, records, {}, { muster: 'CL30' }, false)
    expect(t.musterListe).toEqual(['C560 XLS+', 'CL30'])
  })

  it('behaelt eine Zeile, die nur unter dem Filter leer ist', () => {
    const t = adminTabelle(nutzer, records, {}, { muster: 'C560 XLS+' }, false)
    const anna = t.zeilen.find((z) => z.id === 'u1')!
    const bert = t.zeilen.find((z) => z.id === 'u2')!
    expect(anna.gesamt).toBe(120)
    expect(bert.gesamt).toBe(0) // steht weiter da: „nichts in diesem Muster" ist eine Aussage
  })

  it('merkt sich, wer deaktiviert ist', () => {
    expect(adminTabelle(nutzer, records, {}, {}, false).zeilen.find((z) => z.id === 'u2')!.aktiv).toBe(false)
  })

  it('reicht die Zaehlweise ohne Briefing durch', () => {
    const mit = adminTabelle(nutzer, records, {}, {}, false).summe.gesamt
    const ohne = adminTabelle(nutzer, records, {}, {}, true).summe.gesamt
    expect(mit - ohne).toBe(2 * (BRIEFING_STD_MIN + DEBRIEFING_STD_MIN))
  })
})

describe('dezimalStunden', () => {
  it('rechnet Minuten in Stunden mit zwei Nachkommastellen', () => {
    expect(dezimalStunden(150)).toBe(2.5)
    expect(dezimalStunden(90)).toBe(1.5)
    expect(dezimalStunden(0)).toBe(0)
    expect(dezimalStunden(65)).toBe(1.08)
  })

  it('macht aus Negativem 0 statt einer negativen Stundenzahl im Nachweis', () => {
    expect(dezimalStunden(-30)).toBe(0)
  })
})

describe('Ein Durchgang ist EIN Eintrag (Audit 11/2026, LOG-01)', () => {
  // Zwei Piloten in einer Session ergeben zwei Blaetter mit demselben
  // batchId und demselben Kopf (GradingForm, buildRecords). Gezaehlt wurde je
  // Blatt: 5:30 Instruktorzeit standen als 11:00 im Nachweis, in CSV, Excel
  // und in der Summe aller Instruktoren. gradingStats und monthlyReport
  // zaehlen laengst den Durchgang.
  const pilot = (name: string) => [{ ...blatt().trainees[0], traineeName: name }]
  const a = blatt({ id: 'a', batchId: 'd1', trainees: pilot('Sophie Berger') })
  const b = blatt({ id: 'b', batchId: 'd1', trainees: pilot('Lukas Steiner') })

  it('zwei Piloten, ein Durchgang → ein Eintrag mit 5:30 und beiden Piloten', () => {
    const e = logbuchVon([a, b], 'u1', LEERES_LOGBUCH)
    expect(e).toHaveLength(1)
    expect(e[0].gesamt).toBe(330)
    expect(formatDauer(e[0].gesamt)).toBe('05:30')
    expect(e[0].piloten).toEqual(['Sophie Berger', 'Lukas Steiner'])
    expect(e[0].id).toBe('a') // das aelteste Blatt
    expect(e[0].blattIds).toEqual(['a', 'b'])
  })

  it('getrennte Durchgaenge bleiben getrennt, ein Blatt ohne batchId ist sein eigener', () => {
    const c = blatt({ id: 'c', batchId: 'd2' })
    const alt = blatt({ id: 'alt' })
    expect(logbuchVon([a, b, c, alt], 'u1', LEERES_LOGBUCH).map((e) => e.id).sort()).toEqual(['a', 'alt', 'c'])
  })

  it('das aelteste Blatt nach Erfassung, bei gleicher Zeit die Folge der Ablage', () => {
    const spaet = blatt({ id: 'spaet', batchId: 'd3', createdAt: 2000 })
    const frueh = blatt({ id: 'frueh', batchId: 'd3', createdAt: 1000 })
    expect(logbuchVon([spaet, frueh], 'u1', LEERES_LOGBUCH)[0].blattIds).toEqual(['frueh', 'spaet'])
    expect(logbuchVon([b, a], 'u1', LEERES_LOGBUCH)[0].id).toBe('b')
  })

  it('teilweise unterschrieben: zaehlt, sobald EIN Blatt fertig ist — mit dessen Piloten', () => {
    // Festgelegte Regel: Die Session hat stattgefunden, das fertige Blatt
    // belegt sie. Wer noch unterschreiben muss, steht noch nicht da; die
    // Zeit zaehlt einmal, nicht erst mit dem letzten Blatt.
    const offen = { ...b, status: 'awaiting_signature' as const }
    const e = logbuchVon([a, offen], 'u1', LEERES_LOGBUCH)
    expect(e).toHaveLength(1)
    expect(e[0].piloten).toEqual(['Sophie Berger'])
    expect(e[0].gesamt).toBe(330)
    expect(e[0].blattIds).toEqual(['a', 'b'])
  })

  it('die ID bleibt dieselbe, wenn das zweite Blatt spaeter fertig wird', () => {
    // Sonst haenge eine Korrektur am falschen Eintrag, sobald das aeltere
    // Blatt nachsigniert wird.
    const vorher = logbuchVon([{ ...a, status: 'awaiting_signature' }, b], 'u1', LEERES_LOGBUCH)
    const nachher = logbuchVon([a, b], 'u1', LEERES_LOGBUCH)
    expect(vorher[0].id).toBe('a')
    expect(vorher[0].piloten).toEqual(['Lukas Steiner'])
    expect(nachher[0].id).toBe('a')
  })

  it('ohne ein fertiges Blatt kein Eintrag', () => {
    const offen = (r: GradingRecord) => ({ ...r, status: 'awaiting_signature' as const })
    expect(logbuchVon([offen(a), offen(b)], 'u1', LEERES_LOGBUCH)).toEqual([])
  })

  it('Override an einem Blatt des Durchgangs gilt fuer den Durchgang', () => {
    // Altbestand: Vorher war jedes Blatt ein eigener Eintrag mit eigener
    // Korrektur — die bleibt erhalten, egal an welchem Blatt sie haengt.
    const e = logbuchVon([a, b], 'u1', { overrides: { b: { session: 180, notiz: 'Sim-Ausfall' } }, manuell: [] })
    expect(e).toHaveLength(1)
    expect(e[0].session).toBe(180)
    expect(e[0].notiz).toBe('Sim-Ausfall')
  })

  it('eine Korrektur unter der Eintrags-ID geht vor', () => {
    const e = logbuchVon([a, b], 'u1', { overrides: { a: { session: 120 }, b: { session: 180 } }, manuell: [] })
    expect(e[0].session).toBe(120)
  })

  it('Altbestand: der geloeschte Doppeleintrag entfernt nicht die Session', () => {
    // Wer die Verdopplung von Hand beseitigt hatte, loeschte den Eintrag des
    // zweiten Piloten. Daraus wird jetzt nicht „Session entfernt".
    expect(logbuchVon([a, b], 'u1', { overrides: { b: { geloescht: true } }, manuell: [] })).toHaveLength(1)
    // Eine Zeitkorrektur geht einer Loeschmarke vor.
    const e = logbuchVon([a, b], 'u1', { overrides: { a: { geloescht: true }, b: { session: 200 } }, manuell: [] })
    expect(e[0].session).toBe(200)
    // Entfernt ist der Durchgang, wenn jedes fertige Blatt die Marke traegt.
    expect(logbuchVon([a, b], 'u1', { overrides: { a: { geloescht: true }, b: { geloescht: true } }, manuell: [] })).toEqual([])
  })

  it('adminTabelle zaehlt den Durchgang einmal', () => {
    const t = adminTabelle([{ id: 'u1', name: 'Anna Instruktor', active: true }], [a, b], {}, {}, false)
    expect(t.zeilen[0].anzahl).toBe(1)
    expect(t.zeilen[0].gesamt).toBe(330)
    expect(t.summe.gesamt).toBe(330)
  })
})

describe('overrideSetzen — Korrekturen je Durchgang (Audit 11/2026, LOG-01)', () => {
  const eintrag = { id: 'a', blattIds: ['a', 'b'] }

  it('eine Zeitkorrektur steht unter der Eintrags-ID, alte Korrekturen der Blaetter fallen weg', () => {
    expect(overrideSetzen({ b: { session: 1 }, x: { notiz: 'fremd' } }, eintrag, { session: 90 })).toEqual({ a: { session: 90 }, x: { notiz: 'fremd' } })
  })

  it('die Loeschmarke steht auf JEDEM Blatt — auch ein spaeter fertiges ist erfasst', () => {
    const ov = overrideSetzen({ a: { session: 1 } }, eintrag, { geloescht: true })
    expect(ov).toEqual({ a: { geloescht: true }, b: { geloescht: true } })
    const blaetter = [blatt({ id: 'a', batchId: 'd' }), blatt({ id: 'b', batchId: 'd', status: 'awaiting_signature' })]
    expect(logbuchVon(blaetter, 'u1', { overrides: ov, manuell: [] })).toEqual([])
    expect(logbuchVon(blaetter.map((r) => ({ ...r, status: 'signed' as const })), 'u1', { overrides: ov, manuell: [] })).toEqual([])
  })

  it('null nimmt alles zurueck — keine Altkorrektur taucht wieder auf', () => {
    expect(overrideSetzen({ a: { session: 1 }, b: { session: 2 } }, eintrag, null)).toEqual({})
  })

  it('ohne blattIds (Einzelblatt) wirkt sie auf die ID', () => {
    expect(overrideSetzen({}, { id: 'r1' }, { briefing: 30 })).toEqual({ r1: { briefing: 30 } })
    expect(overrideSetzen({ r1: { briefing: 30 } }, { id: 'r1', blattIds: [] }, null)).toEqual({})
  })
})

describe('parseDauerEingabe — Eingabe auf jedem Geraet (Audit 11/2026, KERN-02)', () => {
  // Am iPhone hat der Ziffernblock (inputMode numeric) keinen Doppelpunkt;
  // „130" wurde still zu 00:00, im Korrekturdialog verschwand so die
  // Session-Zeit aus dem Nachweis.
  it('liest H:MM wie bisher', () => {
    expect(parseDauerEingabe('1:30')).toBe(90)
    expect(parseDauerEingabe(' 02:00 ')).toBe(120)
  })

  it('liest reine Ziffern als HMM bzw. HHMM', () => {
    expect(parseDauerEingabe('130')).toBe(90)
    expect(parseDauerEingabe('0130')).toBe(90)
    expect(parseDauerEingabe('1230')).toBe(750)
  })

  it('meldet Mehrdeutiges und Unlesbares mit null statt 0', () => {
    expect(parseDauerEingabe('90')).toBeNull() // 90 Minuten oder 90 Stunden?
    expect(parseDauerEingabe('1.30')).toBeNull()
    expect(parseDauerEingabe('1,5')).toBeNull()
    expect(parseDauerEingabe('abc')).toBeNull()
    expect(parseDauerEingabe('1:75')).toBeNull()
    expect(parseDauerEingabe('175')).toBeNull()
    expect(parseDauerEingabe('12345')).toBeNull()
  })

  it('ein leeres Feld und „0" sind keine Zeit, kein Fehler', () => {
    expect(parseDauerEingabe('')).toBe(0)
    expect(parseDauerEingabe('0')).toBe(0)
    expect(parseDauerEingabe('00:00')).toBe(0)
  })

  it('Formularwerte liest parseDauer unveraendert', () => {
    // Die Ableitung aus dem Formular bleibt bei 0 fuer Kaputtes — das
    // Grading-Formular prueft seine Felder selbst.
    expect(parseDauer('130')).toBe(0)
    expect(parseDauer('01:30')).toBe(90)
  })
})

describe('logbuchSicht — was der Mustervorbehalt auslaesst (Audit 11/2026, KERN-03)', () => {
  const wer = (id: string, role: Role, aircraftTypes: string[] = []) => ({ id, role, aircraftTypes })
  const c560 = (id: string, datum: string) => blatt({ id, header: { date: datum, aircraftType: 'C560 XLS+', flightTimePF: '02:00', flightTimePM: '02:00' } })
  const eintraege = logbuchVon(
    [c560('m1', '2026-08-01'), c560('m2', '2026-08-02'), c560('m3', '2026-08-03'), blatt({ id: 'ohne', header: { date: '2026-08-04', flightTimePF: '01:00' } })],
    'u1',
    LEERES_LOGBUCH,
  )

  it('Gruppenadmin CL30 auf einem C560-Logbuch: einer sichtbar, drei ausgeblendet, Bereich CL30', () => {
    const s = logbuchSicht(wer('x', 'group_admin', ['CL30']), 'u1', eintraege)
    expect(s.eintraege.map((e) => e.id)).toEqual(['ohne']) // ohne Muster gilt fuer alle
    expect(s.ausgeblendet).toBe(3)
    expect(s.bereich).toEqual(['CL30'])
  })

  it('Superadmin, Training Admin und Eigentuemer: keine Schranke', () => {
    for (const v of [wer('x', 'superadmin'), wer('x', 'training_admin'), wer('u1', 'member')]) {
      const s = logbuchSicht(v, 'u1', eintraege)
      expect(s).toEqual({ eintraege, ausgeblendet: 0, bereich: null })
    }
  })

  it('ein Mitglied sieht Fremdes gar nicht — und das steht auch so da', () => {
    expect(logbuchSicht(wer('x', 'member', ['C560 XLS+']), 'u1', eintraege)).toEqual({ eintraege: [], ausgeblendet: 4, bereich: [] })
  })

  it('sichtbareEintraege bleibt dieselbe Regel', () => {
    expect(sichtbareEintraege(wer('x', 'group_admin', ['CL30']), 'u1', eintraege)).toEqual(logbuchSicht(wer('x', 'group_admin', ['CL30']), 'u1', eintraege).eintraege)
  })
})

describe('korrigiert — abweichende Zeiten sind erkennbar (Audit 11/2026, KERN-04)', () => {
  it('eine abweichende Session traegt die Formularwerte mit', () => {
    const e = eintragAusFormular(blatt(), { session: 0 })!
    expect(e.korrigiert).toEqual({ briefing: 60, session: 240, debriefing: 30, gesamt: 330 })
    expect(e.gesamt).toBe(90)
  })

  it('eine Notiz allein oder gleiche Werte sind keine Korrektur', () => {
    expect(eintragAusFormular(blatt(), { notiz: 'nur Notiz' })!.korrigiert).toBeUndefined()
    expect(eintragAusFormular(blatt(), { briefing: 60, session: 240, debriefing: 30 })!.korrigiert).toBeUndefined()
    expect(eintragAusFormular(blatt())!.korrigiert).toBeUndefined()
  })

  it('auch eine geaenderte Briefing- oder Debriefing-Zeit zaehlt', () => {
    expect(eintragAusFormular(blatt(), { briefing: 45 })!.korrigiert?.briefing).toBe(60)
    expect(eintragAusFormular(blatt(), { debriefing: 15 })!.korrigiert?.debriefing).toBe(30)
  })
})

describe('entfernteFormularEintraege — Wiederherstellen (Audit 11/2026, KERN-05)', () => {
  const records = [blatt(), blatt({ id: 'r2', header: { ...blatt().header, date: '2026-08-20' } })]

  it('nach dem Entfernen fehlt der Eintrag im Logbuch und steht unter „entfernt" — mit Formularwerten', () => {
    const stand: LogbookStand = { overrides: overrideSetzen({}, { id: 'r1', blattIds: ['r1'] }, { geloescht: true }), manuell: [] }
    expect(logbuchVon(records, 'u1', stand).map((e) => e.id)).toEqual(['r2'])
    const weg = entfernteFormularEintraege(records, 'u1', stand)
    expect(weg.map((e) => e.id)).toEqual(['r1'])
    expect(weg[0].gesamt).toBe(330)
  })

  it('nach dem Zuruecknehmen gilt das Umgekehrte', () => {
    const geloescht = overrideSetzen({}, { id: 'r1', blattIds: ['r1'] }, { geloescht: true })
    const stand: LogbookStand = { overrides: overrideSetzen(geloescht, { id: 'r1', blattIds: ['r1'] }, null), manuell: [] }
    expect(logbuchVon(records, 'u1', stand).map((e) => e.id)).toEqual(['r2', 'r1'])
    expect(entfernteFormularEintraege(records, 'u1', stand)).toEqual([])
  })

  it('nennt nur die eigenen, fertigen Durchgaenge', () => {
    const stand: LogbookStand = { overrides: { r3: { geloescht: true }, r4: { geloescht: true } }, manuell: [] }
    const fremd = blatt({ id: 'r3', instructorId: 'u2' })
    const offen = blatt({ id: 'r4', status: 'awaiting_signature' })
    expect(entfernteFormularEintraege([fremd, offen], 'u1', stand)).toEqual([])
  })
})

describe('logbuchCsvZeilen (Audit 11/2026, KERN-14, LOG-02)', () => {
  const jetzt = Date.UTC(2026, 10, 1, 14, 5)
  const e = (over: Partial<LogbookEintrag>): LogbookEintrag => ({
    id: 'x', quelle: 'formular', formTypeId: '308A', datum: '2026-08-10', aircraftType: 'CL30', kategorie: 'Simulator Training',
    briefing: 60, session: 240, debriefing: 30, gesamt: 330, piloten: ['Sophie Berger'], notiz: '', ...over,
  })
  // 3 × 5:30 = 16:30 — ueber 24 h waere „16:30" als Tageszeit schon falsch, als Summe erst recht.
  const drei = [e({ id: 'a' }), e({ id: 'b', datum: '2026-08-11' }), e({ id: 'c', datum: '2026-08-12' })]
  const voll = { eintraege: drei, ausgeblendet: 0, bereich: null }
  const zeilen = logbuchCsvZeilen({ inhaber: 'Mika Beispiel', sicht: voll, eintraege: drei, filter: {}, exportiertAm: jetzt, exportiertVon: 'Chris Beispiel' })
  const kopf = zeilen.find((z) => z[0] === 'Date')!
  const spalte = (name: string) => kopf.indexOf(name)

  it('nennt Datum, Uhrzeit und die exportierende Person', () => {
    expect(zeilen[1]).toEqual(['Exported (date/time)', formatDateTime(jetzt), 'Exported by', 'Chris Beispiel'])
    expect(String(zeilen[1][1])).toMatch(/^\d{2}\.\d{2}\.\d{4} \d{2}:\d{2}$/)
  })

  it('schreibt die Summe unter die Spalte Total — und unter Total (h)', () => {
    const summe = zeilen[zeilen.length - 1]
    expect(summe[0]).toBe('Total')
    expect(summe[spalte('Total')]).toBe('16:30')
    expect(summe[spalte('Total (h)')]).toBe(16.5)
    expect(summe[spalte('Session')]).toBe('12:00')
    expect(summe.length).toBe(kopf.length)
  })

  it('fuehrt Dezimalstunden je Zeit — 16:30 wird 16,5 in der Datei', () => {
    expect(kopf).toEqual(expect.arrayContaining(['Briefing (h)', 'Session (h)', 'Debriefing (h)', 'Total (h)']))
    expect(zeilen.find((z) => z[0] === '10.08.2026')![spalte('Total (h)')]).toBe(5.5)
    const csv = zeilenAlsCsv(zeilen)
    expect(csv).toContain(`Total;;;;;03:00;3;12:00;12;01:30;${csvNum(1.5)};16:30;${csvNum(16.5)};;\n`)
    expect(csvNum(16.5)).toBe('16,50')
  })

  it('markiert korrigierte Eintraege mit der Formularzeit (KERN-04)', () => {
    const z = logbuchCsvZeilen({
      inhaber: 'Mika', sicht: voll, filter: {}, exportiertAm: jetzt, exportiertVon: 'Mika',
      eintraege: [e({ session: 0, gesamt: 90, korrigiert: { briefing: 60, session: 240, debriefing: 30, gesamt: 330 } }), e({ id: 'y' })],
    })
    const k = z.find((r) => r[0] === 'Date')!.indexOf('Adjusted (form total)')
    const daten = z.filter((r) => r[0] === '10.08.2026')
    expect(daten.map((r) => r[k])).toEqual(['05:30', ''])
  })

  it('nennt die Filter und „all" nur, wo wirklich nichts eingeschraenkt ist', () => {
    expect(zeilen.find((z) => z[0] === 'Aircraft type')).toEqual(['Aircraft type', 'all'])
    expect(zeilen.find((z) => z[0] === 'Period')).toEqual(['Period', 'all'])
    expect(zeilen.find((z) => z[0] === 'Outside scope (not shown)')).toBeUndefined()
    const gefiltert = logbuchCsvZeilen({
      inhaber: 'Mika', sicht: voll, eintraege: drei.slice(0, 1), exportiertAm: jetzt, exportiertVon: 'Mika',
      filter: { von: '2026-08-01', muster: 'CL30', kategorie: 'Simulator Training', formTyp: '308A', pilot: 'sophie' },
    })
    expect(gefiltert.find((z) => z[0] === 'Period')).toEqual(['Period', '01.08.2026 - …'])
    expect(gefiltert.find((z) => z[0] === 'Entries')).toEqual(['Entries', '1 of 3'])
    expect(gefiltert.find((z) => z[0] === 'Pilot')).toEqual(['Pilot', 'sophie'])
  })

  it('nennt beim Mustervorbehalt den Bereich und die nicht gezeigten Eintraege (KERN-03)', () => {
    const sicht = { eintraege: [], ausgeblendet: 3, bereich: ['CL30'] }
    const z = logbuchCsvZeilen({ inhaber: 'Mika', sicht, eintraege: [], filter: {}, exportiertAm: jetzt, exportiertVon: 'Chris' })
    expect(z.find((r) => r[0] === 'Aircraft type')).toEqual(['Aircraft type', 'CL30 (scope of viewer)'])
    expect(z.find((r) => r[0] === 'Outside scope (not shown)')).toEqual(['Outside scope (not shown)', 3])
    expect(zeilenAlsCsv(z)).toContain('Outside scope (not shown);3\n')
  })

  it('manuelle Eintraege heissen „manual" in der Spalte Form', () => {
    const z = logbuchCsvZeilen({ inhaber: 'M', sicht: voll, eintraege: [e({ quelle: 'manuell', formTypeId: undefined })], filter: {}, exportiertAm: jetzt, exportiertVon: 'M' })
    expect(z.find((r) => r[0] === '10.08.2026')![3]).toBe('manual')
  })
})

describe('adminExportZeilen (Audit 11/2026, KERN-14)', () => {
  const jetzt = Date.UTC(2026, 10, 1, 9, 30)
  const t = adminTabelle([{ id: 'u1', name: 'Anna Instruktor', active: true }], [blatt()], {}, {}, false)

  it('nennt Uhrzeit und Exportierenden wie die Logbuch-CSV', () => {
    const z = adminExportZeilen({ tabelle: t, filter: {}, ohneBriefing: false, exportiertAm: jetzt, exportiertVon: 'Super Admin' })
    expect(z[1]).toEqual(['Exported (date/time)', formatDateTime(jetzt), 'Exported by', 'Super Admin'])
    expect(z.find((r) => r[0] === 'Counting')).toEqual(['Counting', 'with briefing'])
    expect(z.find((r) => r[0] === 'Anna Instruktor')).toEqual(['Anna Instruktor', 'CL30', 1, '00:00', 0, '05:30', 5.5, '00:00', 0, '05:30', 5.5])
    expect(z[z.length - 1]).toEqual(['Total', '', 1, '00:00', 0, '05:30', 5.5, '00:00', 0, '05:30', 5.5])
  })

  it('schreibt aktive Filter in den Kopf', () => {
    const z = adminExportZeilen({ tabelle: t, filter: { bis: '2026-08-31', muster: 'CL30' }, ohneBriefing: true, exportiertAm: jetzt, exportiertVon: 'S' })
    expect(z.find((r) => r[0] === 'Period')).toEqual(['Period', '… - 31.08.2026'])
    expect(z.find((r) => r[0] === 'Aircraft type')).toEqual(['Aircraft type', 'CL30'])
    expect(z.find((r) => r[0] === 'Counting')).toEqual(['Counting', 'without briefing'])
  })

  /* Audit 11/2026, XLSX-01/EXM-09: Excel bekommt Kopfzeile, Stundenspalten,
     Titel und Zeitpunkt aus derselben Stelle wie die Zeilen — die Seite
     zaehlt nichts ab. */
  it('adminExcel: dieselben Zeilen, Kopfzeile und Stundenspalten zeigen auf die Tabelle', () => {
    const eingabe = { tabelle: t, filter: {}, ohneBriefing: false, exportiertAm: jetzt, exportiertVon: 'S' }
    const { zeilen, optionen } = adminExcel(eingabe)
    expect(zeilen).toEqual(adminExportZeilen(eingabe))
    const kopf = zeilen[optionen.kopfzeile! - 1]
    expect(kopf[0]).toBe('Instructor')
    expect(optionen.dezimalSpalten!.map((i) => kopf[i])).toEqual(['Ground (h)', 'Simulator (h)', 'Other (h)', 'Total (h)'])
    // Unter dem Kopf stehen in diesen Spalten Zahlen — sonst griffe „0.00" ins Leere.
    for (const i of optionen.dezimalSpalten!) expect(typeof zeilen[optionen.kopfzeile!][i]).toBe('number')
    // Rechts ab „Entries", die Summe ist die letzte Zeile
    expect(optionen.rechtsSpalten!.map((i) => kopf[i])).toEqual(['Entries', 'Ground', 'Ground (h)', 'Simulator', 'Simulator (h)', 'Other', 'Other (h)', 'Total', 'Total (h)'])
    expect(zeilen[optionen.summenzeile! - 1][0]).toBe('Total')
    expect(optionen.summenzeile).toBe(zeilen.length)
    expect(optionen.titel).toBe(ADMIN_EXPORT_TITEL)
    expect(zeilen[0]).toEqual([ADMIN_EXPORT_TITEL])
    expect(optionen.erstellt).toBe(jetzt)
  })

  it('adminExcel: ein Zeitraum steht im Titel der Dateieigenschaften', () => {
    const { optionen } = adminExcel({ tabelle: t, filter: { von: '2026-08-01', bis: '2026-08-31' }, ohneBriefing: false, exportiertAm: jetzt, exportiertVon: 'S' })
    expect(optionen.titel).toBe(`${ADMIN_EXPORT_TITEL} · 01.08.2026 - 31.08.2026`)
  })
})

/**
 * Audit 11/2026, EXM-01 (Teil Logbuch): Fehlt das Schulungsdatum im Kopf,
 * gilt der Tag der Unterschrift — bisher der UTC-Tag aus `toISOString()`.
 * Eine Unterschrift um 00:30 in Wien stand damit am Vortag, am Monatsersten
 * sogar im Vormonat. Die CI laeuft in UTC und sah das nie; der Test stellt
 * die Zeitzone deshalb selbst (Node liest `process.env.TZ` zur Laufzeit).
 */
describe('Ersatzdatum in Ortszeit (Audit 11/2026, EXM-01)', () => {
  let vorher: string | undefined
  beforeEach(() => {
    vorher = process.env.TZ
    process.env.TZ = 'Europe/Vienna'
  })
  afterEach(() => {
    if (vorher === undefined) delete process.env.TZ
    else process.env.TZ = vorher
  })

  it('Formular ohne header.date, signedAt 23:30Z → 2026-11-02', () => {
    const e = eintragAusFormular(blatt({ header: { aircraftType: 'CL30', flightTimePF: '01:00' }, createdAt: Date.UTC(2026, 10, 1, 20), signedAt: Date.UTC(2026, 10, 1, 23, 30) }))!
    expect(e.datum).toBe('2026-11-02')
    // … und damit im November, nicht im Oktober
    expect(nachMonaten([e])[0]).toMatchObject({ monat: '2026-11' })
  })

  it('ohne Unterschrift zaehlt die Erfassung — ebenso in Ortszeit', () => {
    // Sommerzeit: 22:15Z ist in Wien 00:15 des Folgetags
    const e = eintragAusFormular(blatt({ header: { aircraftType: 'CL30' }, createdAt: Date.UTC(2026, 6, 31, 22, 15), signedAt: undefined }))!
    expect(e.datum).toBe('2026-08-01')
  })

  it('ein Schulungstag im Kopf geht weiterhin vor', () => {
    expect(eintragAusFormular(blatt({ signedAt: Date.UTC(2026, 10, 1, 23, 30) }))!.datum).toBe('2026-08-10')
  })
})

/**
 * Audit 11/2026, EXM-10/FN-01: Die Logbuch-Exporte hiessen bei jedem Auszug
 * gleich („aaa-logbook-instructors.csv") und wurden im Downloadordner zu
 * „(1)"-Kopien; der Name der Einzel-CSV verlor mit `/[^\w-]+/` jeden Umlaut
 * („aaa-logbook_J-rgen-M-ller.csv"). Jetzt das gemeinsame Schema aus
 * dateiName.ts mit dem Stand-Datum hinten — dem ORTSTAG des Exports, nicht
 * dem UTC-Tag (die CI laeuft in UTC, deshalb stellt der Test Wien ein).
 */
describe('logbuchDateiName — Stand-Datum und Umlaute (Audit 11/2026, EXM-10/FN-01)', () => {
  let vorher: string | undefined
  beforeEach(() => {
    vorher = process.env.TZ
    process.env.TZ = 'Europe/Vienna'
  })
  afterEach(() => {
    if (vorher === undefined) delete process.env.TZ
    else process.env.TZ = vorher
  })
  // 23:30Z am 01.11. ist in Wien schon 00:30 am 02.11.
  const SPAET = Date.UTC(2026, 10, 1, 23, 30)

  it('Einzel-CSV: Inhaber mit Umlauten, Ortstag hinten', () => {
    expect(logbuchDateiName('Jürgen Müller', SPAET, 'csv')).toBe('aaa-logbook_Jürgen-Müller_2026-11-02.csv')
    // Das Beispiel des Gegenpruefers (Nachtrag L-AUSGABE#1): ß und ein
    // Bindestrich im Namen — vorher „J-rgen-Gr--M-ller".
    expect(logbuchDateiName('Jürgen Größ-Müller', SPAET, 'csv')).toBe('aaa-logbook_Jürgen-Größ-Müller_2026-11-02.csv')
  })

  it('Admin-Auswertung: CSV und Excel tragen dasselbe Stand-Datum', () => {
    expect(logbuchDateiName(null, SPAET, 'csv')).toBe('aaa-logbook-instructors_2026-11-02.csv')
    expect(logbuchDateiName(null, SPAET, 'xlsx')).toBe('aaa-logbook-instructors_2026-11-02.xlsx')
  })

  it('zwei Auszuege an verschiedenen Tagen heissen verschieden', () => {
    const tagDrauf = SPAET + 24 * 60 * 60 * 1000
    expect(logbuchDateiName(null, tagDrauf, 'csv')).not.toBe(logbuchDateiName(null, SPAET, 'csv'))
    expect(logbuchDateiName('Sophie Berger', tagDrauf, 'csv')).toBe('aaa-logbook_Sophie-Berger_2026-11-03.csv')
  })

  it('Zeichen, die ein Dateiname nicht tragen darf, fallen aus dem Namen', () => {
    const name = logbuchDateiName('Ops/Training: Lead*', SPAET, 'csv')
    expect(name).toBe('aaa-logbook_Ops-Training-Lead_2026-11-02.csv')
    expect(name).not.toMatch(/[\\/:*?"<>|]/)
  })
})
