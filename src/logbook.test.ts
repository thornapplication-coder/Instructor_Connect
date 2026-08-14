import { describe, expect, it } from 'vitest'
import {
  adminTabelle,
  adminZeile,
  dezimalStunden,
  BRIEFING_STD_MIN,
  DEBRIEFING_STD_MIN,
  darfLogbuchOeffnen,
  eintraegeUnterFilter,
  eintragAusFormular,
  filtereEintraege,
  formatDauer,
  LEERES_LOGBUCH,
  logbuchVon,
  nachMonaten,
  parseDauer,
  sichtbareEintraege,
  summeUnterFilter,
  summiere,
  zaehltInsLogbuch,
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

  it('uebersteht fehlende Zeitfelder', () => {
    const e = eintragAusFormular(blatt({ header: { date: '2026-08-10', aircraftType: 'CL30' } }))!
    expect(e.session).toBe(0)
    expect(e.gesamt).toBe(90)
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
