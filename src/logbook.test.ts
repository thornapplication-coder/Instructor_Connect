import { describe, expect, it } from 'vitest'
import {
  BRIEFING_STD_MIN,
  DEBRIEFING_STD_MIN,
  darfLogbuchOeffnen,
  eintraegeUnterFilter,
  eintragAusFormular,
  filtereEintraege,
  formatDauer,
  LEERES_LOGBUCH,
  logbuchVon,
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
