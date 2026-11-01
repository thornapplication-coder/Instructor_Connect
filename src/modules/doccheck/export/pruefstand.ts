import type { Ampel, Kategorie, Prioritaet } from '../pruefung/befund'
import { datenstand as neuerStand, EXPORT_LAYOUT_VERSION, exportId, dateiStamm, LABELS as L, type Datenstand, type ExportDokument, type Gesamt } from './datenstand'

/**
 * Prüfstand-Datei `.doccheck.json` (Spez. v1.1 Kap. 12).
 *
 * Gespeichert werden NUR Metadaten, Hashes, Befunde und kurze Auszüge —
 * keine Dokumentinhalte (Kap. 12, „Inhalt"). Damit lässt sich ein
 * Prüfstand am iPad öffnen, ansehen und exportieren, ohne dass ein
 * Dokument das Gerät wechselt.
 *
 * Laden ist ein Eingang von außen: Die Datei kann von irgendwoher kommen.
 * Darum wird sie geprüft (Schema, Pflichtfelder, Wertelisten, Größe) und
 * bei Abweichung abgewiesen — nicht geraten. Angezeigt wird sie nur über
 * React, also maskiert.
 */

export const SCHEMA = 'doccheck/1'
/** Obergrenze für eine Prüfstand-Datei — 500 Befunde mit Auszügen liegen weit darunter. */
export const MAX_BYTES = 20 * 1024 * 1024

const GESAMT_JSON: Record<Gesamt, string> = { ready: 'ready', afterCorrection: 'ready_after_correction', notReady: 'not_ready' }
const AMPEL_JSON: Record<Ampel, string> = { ok: 'green', wait: 'yellow', bad: 'red', na: 'not_applicable' }

export interface PruefstandBefund {
  id: string
  docId: string
  document: string
  docNumber: string
  revisionDate: string
  chapter: string
  pageLabel: string
  paragraph: string
  excerpt: string
  reference: string
  referenceType: string
  requirement: string
  masterQuote: string
  masterSource: string
  category: Kategorie
  techType: string
  priority: Prioritaet
  description: string
  correction: string
  otherDocs: string
  verification: string
  revisionStatus: string
  responsible: string
  due: string
  status: string
}

export interface Pruefstand {
  schema: typeof SCHEMA
  app: { version: string; exportLayout: string }
  library: { label: string }
  createdAt: string
  updatedAt: string
  organisation: string
  reviewType: 'erst' | 'revision'
  reviewer: { userId: string; name: string; function: string }
  settings: { checks: string[]; model: string; language: 'en' }
  documents: { id: string; role: ExportDokument['rolle']; fileName: string; sha256: string; docType: string; title: string; docNumber: string; revision: string; date: string; rank: string; pages: number }[]
  findings: PruefstandBefund[]
  assessment: { overall: string; top5: string[]; confirmedBy: string; confirmedAt: string }
  formalChecks: { document: string; group: string; check: string; status: string }[]
  exports: { exportId: string; formats: string[]; ts: string }[]
}

/** Spalten des Datenstands ↔ Felder der Datei — eine Tabelle für beide Richtungen. */
const FELDER: (keyof PruefstandBefund | null)[] = [
  'id', 'document', 'docNumber', 'revisionDate', 'chapter', 'pageLabel', 'paragraph', 'excerpt', 'reference', 'referenceType', 'requirement', 'masterQuote', 'masterSource',
  'category', 'techType', 'priority', 'description', 'correction', 'otherDocs', 'verification', 'revisionStatus', 'responsible', 'due', 'status',
]

export function pruefstandAus(d: Datenstand, userId: string, formate: string[], ts: string): Pruefstand {
  return {
    schema: SCHEMA,
    app: { version: d.appVersion, exportLayout: d.layout },
    library: { label: d.bibliothek },
    createdAt: ts,
    updatedAt: ts,
    organisation: d.organisation,
    reviewType: d.art,
    reviewer: { userId, name: d.pruefer.name, function: d.pruefer.funktion },
    settings: { checks: L.checks, model: '', language: 'en' },
    documents: d.dokumente.map((x) => ({ id: x.id, role: x.rolle, fileName: x.name, sha256: x.sha256, docType: x.typ, title: x.titel, docNumber: x.nummer, revision: x.revision, date: x.datum, rank: x.rang, pages: x.seiten })),
    findings: d.befunde.map((b) => {
      const f = Object.fromEntries(FELDER.map((k, i) => [k, b.spalten[i]])) as unknown as PruefstandBefund
      return { ...f, docId: b.dokId }
    }),
    assessment: { overall: GESAMT_JSON[d.gesamt], top5: d.top5, confirmedBy: '', confirmedAt: '' },
    formalChecks: d.ampeln.map((a) => ({ document: a.dokument, group: a.gruppe, check: a.punkt, status: AMPEL_JSON[a.ampel] })),
    exports: [{ exportId: d.exportId, formats: formate, ts }],
  }
}

export function pruefstandText(p: Pruefstand): string {
  return `${JSON.stringify(p, null, 2)}\n`
}

export type LadeFehler = 'DC-STATE-SIZE' | 'DC-STATE-JSON' | 'DC-STATE-VERSION' | 'DC-STATE-FORMAT'

const istText = (v: unknown) => typeof v === 'string'

/**
 * Datei prüfen und lesen. Eine neuere Schema-Version wird abgewiesen statt
 * halb gelesen; ältere gibt es noch nicht (Kap. 12 „Migration": greift,
 * sobald es eine zweite Version gibt).
 */
export function pruefstandLesen(text: string): Pruefstand | LadeFehler {
  if (new TextEncoder().encode(text).length > MAX_BYTES) return 'DC-STATE-SIZE'
  let roh: unknown
  try {
    roh = JSON.parse(text.replace(/^﻿/, ''))
  } catch {
    return 'DC-STATE-JSON'
  }
  if (!roh || typeof roh !== 'object') return 'DC-STATE-FORMAT'
  const p = roh as Partial<Pruefstand>
  if (typeof p.schema !== 'string' || !p.schema.startsWith('doccheck/')) return 'DC-STATE-FORMAT'
  if (p.schema !== SCHEMA) return 'DC-STATE-VERSION'
  if (!Array.isArray(p.documents) || !Array.isArray(p.findings) || !p.assessment || !Array.isArray(p.formalChecks)) return 'DC-STATE-FORMAT'
  const befundOk = (b: Partial<PruefstandBefund>) =>
    FELDER.every((k) => k === null || istText(b[k])) && istText(b.docId) && L.categories.includes(b.category as string) && L.priorities.includes(b.priority as string)
  if (!p.findings.every((b) => b && befundOk(b))) return 'DC-STATE-FORMAT'
  if (!p.documents.every((x) => x && istText(x.id) && istText(x.sha256) && ['review', 'master', 'session'].includes(x.role) && typeof x.pages === 'number')) return 'DC-STATE-FORMAT'
  if (!p.formalChecks.every((a) => a && istText(a.check) && Object.values(AMPEL_JSON).includes(a.status))) return 'DC-STATE-FORMAT'
  if (!Array.isArray(p.assessment.top5) || !Object.values(GESAMT_JSON).includes(p.assessment.overall)) return 'DC-STATE-FORMAT'
  return p as Pruefstand
}

/**
 * Datenstand aus einem geladenen Prüfstand — für Exporte am iPad. IDs,
 * Reihenfolge und Inhalte bleiben, wie sie gespeichert wurden; neu sind
 * nur Export-ID und Datum, denn es ist ein neuer Export.
 */
export function datenstandAus(p: Pruefstand, datum: string, laufnummer: number): Datenstand {
  const dokumente: ExportDokument[] = p.documents.map((x) => ({ id: x.id, rolle: x.role, name: x.fileName, typ: x.docType, titel: x.title, nummer: x.docNumber, revision: x.revision, datum: x.date, rang: x.rank, seiten: x.pages, sha256: x.sha256 }))
  const leer = neuerStand({ datum, laufnummer, appVersion: p.app.version, organisation: p.organisation, art: p.reviewType, pruefer: { name: p.reviewer.name, funktion: p.reviewer.function }, bibliothek: p.library.label, dokumente, befunde: [], ampeln: [] })
  const befunde = p.findings.map((f) => ({
    id: f.id,
    dokId: f.docId,
    seiteNr: Number(f.pageLabel.match(/\d+/)?.[0] ?? Number.MAX_SAFE_INTEGER),
    spalten: FELDER.map((k) => (k ? f[k] : '')),
    kategorie: f.category,
    prioritaet: f.priority,
    verifizierung: f.verification,
  }))
  for (const b of befunde) leer.zaehlung[b.kategorie][b.prioritaet]++
  const zurueck = Object.fromEntries(Object.entries(AMPEL_JSON).map(([k, v]) => [v, k])) as Record<string, Ampel>
  const gesamt = (Object.entries(GESAMT_JSON).find(([, v]) => v === p.assessment.overall)?.[0] ?? 'notReady') as Gesamt
  return {
    ...leer,
    exportId: exportId(datum, laufnummer),
    layout: EXPORT_LAYOUT_VERSION,
    befunde,
    zuPruefen: befunde.filter((b) => b.verifizierung.startsWith('To verify')).length,
    ampeln: p.formalChecks.map((a) => ({ dokument: a.document, gruppe: a.group, punkt: a.check, ampel: zurueck[a.status] })),
    gesamt,
    top5: p.assessment.top5.filter((id) => befunde.some((b) => b.id === id)),
    dateiStamm: dateiStamm(datum, leer.haupt),
  }
}

/**
 * Welche Dokumente des Prüfstands sind (wieder) geladen? Kap. 12: Prüf-
 * und Sitzungsdokumente fordert die App erneut an und prüft die Hashes —
 * ein gleichnamiges, aber geändertes Dokument ist NICHT dasselbe.
 */
export function hashAbgleich(p: Pruefstand, geladen: { sha256: string }[]): { id: string; titel: string; da: boolean }[] {
  const hashes = new Set(geladen.map((g) => g.sha256))
  return p.documents.map((x) => ({ id: x.id, titel: x.title || x.fileName, da: hashes.has(x.sha256) }))
}
