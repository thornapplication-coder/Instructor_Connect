/**
 * Typen des DocCheck-Moduls.
 *
 * Sie stehen im Modul und nicht in `src/types.ts`, damit DocCheck als
 * Ganzes herausnehmbar bleibt: InstructorConnect kennt davon nur die zwei
 * Rechte am Nutzer, die optionalen Einstellungen und das Protokoll.
 */

/** Wer ist jemand IN DocCheck? Abgeleitet, nie gespeichert (siehe access.ts). */
export type DocCheckRolle = 'keine' | 'nutzer' | 'admin' | 'superadmin'

/** Zeilen der Rechte-Matrix aus Spez. Kap. 5.1. */
export type DocCheckAktion =
  | 'kachel'
  | 'bibliothekLesen'
  | 'pdfAnsehen'
  | 'pdfHerunterladen'
  | 'pruefen'
  | 'bibliothekPflegen'
  | 'endgueltigLoeschen'
  | 'erinnerungBestaetigen'
  | 'konfigurieren'
  | 'protokolleLesen'

/** Die zwei Schalter am Nutzer (Spez. Kap. 3.4). */
export interface DocCheckFlags {
  docCheckAccess?: boolean
  docCheckAdmin?: boolean
}

/** Feature-Schalter (Spez. Kap. 13.2) — abschaltbar ohne neue Version. */
export type DocCheckFeature =
  | 'doccheck'
  | 'chat'
  | 'ocr'
  | 'formalCheck'
  | 'impactCheck'
  | 'exportExcel'
  | 'exportWord'
  | 'exportCsv'
  | 'exportPptx'
  /** Nachtrag v1.2 Kap. 17 — Word-PDF-Paar (N5) */
  | 'pdfPairing'
  /** Nachtrag v1.2 Kap. 17 — Word-Technik-Check (N4) inkl. Sprache/Platzhalter (N9) */
  | 'wordCheck'

/** Preise je Million Tokens in USD. `null` = vom Superadmin noch nicht
 *  gepflegt — dann gibt es keine Kostenschätzung, statt einer erfundenen. */
export interface DocCheckPreise {
  input: number | null
  output: number | null
  cacheRead: number | null
  cacheWrite: number | null
}

export interface DocCheckModell {
  id: string
  name: string
  preise: DocCheckPreise
  maxTokens: number
}

export interface DocCheckSettings {
  features: Record<DocCheckFeature, boolean>
  modelle: DocCheckModell[]
  standardModell: string
  ausweichModell: string
  /** In der Sandbox sind KI-Aufrufe simuliert; echte gibt es erst mit dem
   *  Proxy (Phase 1b). Der Schalter steht schon da, wirkt aber noch nicht. */
  echteKiInSandbox: boolean
  monatsbudgetUsd: number | null
  /** Submission gate (N4.3): sperrt ein offener Hoch-Befund den Export
   *  „einreichungsfähig"? Ab Werk nein — nur Warnung. */
  gateSperrt: boolean
}

export type DocCheckAuditAktion = 'zugang' | 'admin' | 'feature' | 'einstellung' | 'standBestaetigt'

export interface DocCheckAuditEintrag {
  id: string
  at: number
  /** Wer hat es getan */
  von: string
  aktion: DocCheckAuditAktion
  /** Betroffener Nutzer, Schalter oder Dokument */
  ziel: string
  /** Vorher → nachher, kurz und maschinenlesbar */
  wert: string
}

/** DocCheck-Teil des Anwendungszustands (Sandbox). */
export interface DocCheckState {
  audit: DocCheckAuditEintrag[]
  /** Bibliotheksdokument-ID → Zeitpunkt der letzten Bestätigung „Stand bestätigt" */
  bestaetigt: Record<string, number>
}

/* ---------- Bibliothek ---------- */

export type DocCheckDokTyp = 'AFM' | 'QRH' | 'POH' | 'SOP' | 'AVIONICS' | 'SUPPLEMENT' | 'IR' | 'AMC' | 'GM' | 'OTHER'

export interface Sammlung {
  id: string
  name: string
  stichworte: string[]
  reihenfolge: number
}

export interface BibliotheksDokument {
  id: string
  sammlung: string
  typ: DocCheckDokTyp
  titel: string
  nummer: string
  revision: string
  /** YYYY-MM-DD */
  ausgabe: string
  rang: number
  rechtscharakter: 'oem' | 'ir' | 'amc' | 'gm' | 'intern'
  status: 'aktiv' | 'archiviert'
  seiten: number
  /** Intervall der Revisionserinnerung in Monaten (Standard 12) */
  intervallMonate: number
  /** ms epoch — Veröffentlichung in der Bibliothek */
  veroeffentlicht: number
}

export interface Bibliotheksstand {
  nummer: number
  at: number
  notiz: string
}

export interface NachpruefEmpfehlung {
  id: string
  pruefdokument: string
  revision: string
  alt: string
  neu: string
  abschnitte: string[]
  status: 'offen' | 'erledigt' | 'verworfen'
}
