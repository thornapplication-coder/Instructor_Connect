import { VOLL_GELESEN, type Befund } from '../pruefung/befund'
import type { ExportDokument, ExportEingabe } from './datenstand'

/**
 * Referenz-Datenstände für die Export-Tests (Spez. v1.1 Kap. 10.8):
 * Grenzfälle wie 0 Befunde, viele Befunde, lange Texte, Umlaute,
 * Sonderzeichen, Formelanfänge — synthetisch, keine echten Dokumente.
 */

export const dok = (id: string, rolle: ExportDokument['rolle'], x: Partial<ExportDokument> = {}): ExportDokument => ({
  id, rolle, name: `${id}.docx`, typ: '', titel: '', nummer: '', revision: '', datum: '', rang: '', seiten: 3, sha256: `${id}`.padEnd(64, '0'), ...x,
})

export const befund = (id: string, dokId: string, x: Partial<Befund> = {}): Befund => ({
  id, quelle: 'formal', pruefpunkt: 'lep', kategorie: 'Document Control', prioritaet: 'Medium', dokId, dokName: dokId, text: `Finding ${id}`,
  fundstellen: [{ seite: 'S. 2', ort: '1 General', auszug: 'Excerpt' }], verifizierung: 'Verified (rule-based)', status: 'Open', ...x,
})

export function eingabe(x: Partial<ExportEingabe> = {}): ExportEingabe {
  return {
    datum: '2026-11-01T09:30:00Z',
    laufnummer: 7,
    appVersion: '1.22.0',
    organisation: 'Example ATO',
    art: 'erst',
    pruefer: { name: 'Alex Beispiel', funktion: 'Head of Training' },
    bibliothek: 'Lib 12 · 2026-10-28',
    dokumente: [
      dok('tm', 'review', { typ: 'TM', titel: 'Training Manual CL30', nummer: 'TM-CL30', revision: 'Rev 0.1', datum: '2026-10-01', seiten: 42 }),
      dok('apx', 'review', { typ: 'TM', titel: 'Appendix 4 – Line Training', revision: 'R1', seiten: 8 }),
      dok('ear', 'master', { typ: 'EAR', titel: 'Part-ORA extract', revision: 'Issue 3', rang: '1' }),
    ],
    befunde: [
      befund('F-02', 'tm', { prioritaet: 'Low', kategorie: 'Editorial', fundstellen: [{ seite: 'S. 12', auszug: 'take-off' }] }),
      befund('F-01', 'tm', { prioritaet: 'High', kategorie: 'Inconsistency', text: 'Table total does not match: 24:00 vs 16:00.', anleitung: 'felder', fundstellen: [{ seite: 'S. 3', ort: '2.1 Hours', auszug: '=SUM(A1) „Grüße" ; "quoted"\nzweite Zeile' }] }),
      befund('W-01', 'apx', { prioritaet: 'High', kategorie: 'Gap', verifizierung: 'To verify', weitere: [{ dokId: 'tm', dokName: 'Training Manual CL30' }] }),
      befund('P-01', 'paket', { prioritaet: 'Medium', kategorie: 'Inconsistency', dokName: 'Package', fundstellen: [{ auszug: 'APX 4 not listed' }] }),
      befund('F-03', 'tm', { prioritaet: 'Medium', fundstellen: [{ seite: 'S. 3', auszug: 'LEP' }] }),
    ],
    ampeln: [{ dokId: 'tm', gruppen: { formal: { lep: 'wait', seiten: 'ok', inhalt: 'na' }, word: { unsichtbar: 'bad' } } }],
    lesestand: VOLL_GELESEN,
    ...x,
  }
}
