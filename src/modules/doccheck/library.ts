import { formatDate } from '../../datum'
import type { Bibliotheksstand, BibliotheksDokument, NachpruefEmpfehlung, Sammlung } from './types'

/**
 * Master-Bibliothek: Regeln, die nicht vom Speicherort abhängen.
 *
 * In der Sandbox stehen die Dokumente unten als synthetischer Bestand — nur
 * Metadaten, keine Dateien, und bewusst KEINE echten OEM-Unterlagen
 * (Spez. Kap. 19: „Keine echten OEM-Dokumente im Repo"). Mit Phase 1b
 * kommen sie aus Supabase; die Regeln hier bleiben dieselben.
 */

/** Monate addieren, ohne über das Monatsende hinauszulaufen
 *  (31.01. + 1 Monat = 28./29.02., nicht 03.03.). */
export function plusMonate(ts: number, monate: number): number {
  const d = new Date(ts)
  const tag = d.getUTCDate()
  const ziel = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + monate, 1, d.getUTCHours(), d.getUTCMinutes()))
  const letzter = new Date(Date.UTC(ziel.getUTCFullYear(), ziel.getUTCMonth() + 1, 0)).getUTCDate()
  ziel.setUTCDate(Math.min(tag, letzter))
  return ziel.getTime()
}

/**
 * Wann ist die Revisionserinnerung fällig (Spez. 6.10)? Gezählt wird ab dem
 * jüngeren von Veröffentlichung und letztem „Stand bestätigt" — beides
 * heißt: Jemand hat hingesehen.
 */
export function erinnerungAb(doc: BibliotheksDokument, bestaetigt?: number): number {
  return plusMonate(Math.max(doc.veroeffentlicht, bestaetigt ?? 0), doc.intervallMonate)
}

/** Archivierte Revisionen mahnen nicht — sie sind ja schon ersetzt. */
export function faelligeErinnerungen(docs: BibliotheksDokument[], bestaetigt: Record<string, number>, jetzt: number): BibliotheksDokument[] {
  return docs.filter((d) => d.status === 'aktiv' && erinnerungAb(d, bestaetigt[d.id]) <= jetzt)
}

/** Gruppiert nach Sammlung in deren Reihenfolge, innerhalb nach Rang. */
export function nachSammlung(docs: BibliotheksDokument[], sammlungen: Sammlung[]): { sammlung: Sammlung; docs: BibliotheksDokument[] }[] {
  return [...sammlungen]
    .sort((a, b) => a.reihenfolge - b.reihenfolge)
    .map((s) => ({ sammlung: s, docs: docs.filter((d) => d.sammlung === s.id).sort((a, b) => a.rang - b.rang || a.titel.localeCompare(b.titel)) }))
    .filter((g) => g.docs.length > 0)
}

/** Fußzeile (Spez. 6.1): „Lib 3 · 28.10.2026". Datumsformat nach der
 *  App-Regel DD.MM.YYYY, nicht nach dem Beispiel der Spezifikation. */
export function standLabel(stand: Bibliotheksstand | undefined): string {
  return stand ? `Lib ${stand.nummer} · ${formatDate(stand.at)}` : 'Lib –'
}

export function aktuellerStand(staende: Bibliotheksstand[]): Bibliotheksstand | undefined {
  return staende.reduce<Bibliotheksstand | undefined>((max, s) => (!max || s.nummer > max.nummer ? s : max), undefined)
}

export function offeneEmpfehlungen(e: NachpruefEmpfehlung[]): NachpruefEmpfehlung[] {
  return e.filter((x) => x.status === 'offen')
}

/* ---------------- Sandbox-Bestand (synthetisch) ---------------- */

const tag = (iso: string) => Date.parse(`${iso}T08:00:00Z`)

export const SANDBOX_SAMMLUNGEN: Sammlung[] = [
  { id: 'cl30', name: 'CL30', stichworte: ['CL30', 'Challenger 300', 'HTF7000'], reihenfolge: 1 },
  { id: 'c560', name: 'C560 XLS+', stichworte: ['C560', 'Citation XLS', 'PW545'], reihenfolge: 2 },
  { id: 'easa', name: 'EASA regulations', stichworte: ['ORA', 'FCL', 'ARA', 'AMC', 'GM'], reihenfolge: 3 },
]

const doc = (d: Omit<BibliotheksDokument, 'status' | 'intervallMonate'> & Partial<BibliotheksDokument>): BibliotheksDokument => ({
  status: 'aktiv',
  intervallMonate: 12,
  ...d,
})

export const SANDBOX_DOKUMENTE: BibliotheksDokument[] = [
  doc({ id: 'd-cl30-afm', sammlung: 'cl30', typ: 'AFM', titel: 'Airplane Flight Manual (synthetic)', nummer: 'SBX-AFM-300', revision: 'Rev 41', ausgabe: '2026-09-15', rang: 1, rechtscharakter: 'oem', seiten: 812, veroeffentlicht: tag('2026-10-28') }),
  doc({ id: 'd-cl30-qrh', sammlung: 'cl30', typ: 'QRH', titel: 'Quick Reference Handbook (synthetic)', nummer: 'SBX-QRH-300', revision: 'Rev 18', ausgabe: '2025-10-01', rang: 2, rechtscharakter: 'oem', seiten: 236, veroeffentlicht: tag('2025-10-20') }),
  doc({ id: 'd-cl30-avi', sammlung: 'cl30', typ: 'AVIONICS', titel: 'Avionics Pilot’s Guide (synthetic)', nummer: 'SBX-AVI-300', revision: 'Rev C', ausgabe: '2025-10-30', rang: 5, rechtscharakter: 'oem', seiten: 1490, veroeffentlicht: tag('2025-11-05') }),
  doc({ id: 'd-c560-afm', sammlung: 'c560', typ: 'AFM', titel: 'Airplane Flight Manual (synthetic)', nummer: 'SBX-AFM-560', revision: 'Rev 12', ausgabe: '2026-03-01', rang: 1, rechtscharakter: 'oem', seiten: 640, veroeffentlicht: tag('2026-03-10') }),
  doc({ id: 'd-c560-afm-alt', sammlung: 'c560', typ: 'AFM', titel: 'Airplane Flight Manual (synthetic)', nummer: 'SBX-AFM-560', revision: 'Rev 11', ausgabe: '2024-11-01', rang: 1, rechtscharakter: 'oem', seiten: 628, veroeffentlicht: tag('2024-11-12'), status: 'archiviert' }),
  doc({ id: 'd-ora', sammlung: 'easa', typ: 'IR', titel: 'Easy Access Rules Part-ORA (synthetic extract)', nummer: 'SBX-EAR-ORA', revision: 'Rev 2026-07', ausgabe: '2026-07-01', rang: 1, rechtscharakter: 'ir', seiten: 420, veroeffentlicht: tag('2026-07-14') }),
  doc({ id: 'd-fcl', sammlung: 'easa', typ: 'AMC', titel: 'Easy Access Rules Part-FCL — AMC/GM (synthetic extract)', nummer: 'SBX-EAR-FCL', revision: 'Rev 2026-04', ausgabe: '2026-04-01', rang: 2, rechtscharakter: 'amc', seiten: 1310, veroeffentlicht: tag('2026-04-20') }),
]

export const SANDBOX_STAENDE: Bibliotheksstand[] = [
  { nummer: 1, at: tag('2025-10-20'), notiz: 'Initial library (sandbox)' },
  { nummer: 2, at: tag('2026-03-10'), notiz: 'C560 AFM Rev 12 replaces Rev 11' },
  { nummer: 3, at: tag('2026-10-28'), notiz: 'CL30 AFM Rev 41 published' },
]

export const SANDBOX_EMPFEHLUNGEN: NachpruefEmpfehlung[] = [
  { id: 'r-1', pruefdokument: 'PLM CL30', revision: 'Rev 2.0', alt: 'C560 AFM Rev 11', neu: 'C560 AFM Rev 12', abschnitte: ['2.4 Limitations', '3.1 Engine start'], status: 'offen' },
]
