import type { DocCheckFeature, DocCheckModell, DocCheckSettings } from './types'

/**
 * Einstellungen von DocCheck — Vorgaben und Zusammenführung.
 *
 * Im Anwendungszustand steht nur, was der Superadmin geändert hat
 * (`settings.docCheck` ist optional). Alles andere kommt von hier. So
 * braucht ein Altbestand keinen Nachtrag in `migrateState` — und ein
 * Nachtrag ohne Marke ist genau der Fehler, vor dem CLAUDE.md warnt.
 */

export const FEATURES: DocCheckFeature[] = [
  'doccheck',
  'chat',
  'ocr',
  'formalCheck',
  'impactCheck',
  'exportExcel',
  'exportWord',
  'exportCsv',
  'exportPptx',
]

const OHNE_PREIS = { input: null, output: null, cacheRead: null, cacheWrite: null }

/**
 * Modelle: Kennungen sind Vorgaben, Preise bewusst LEER. Die Spezifikation
 * (Kap. 2, 6.8) legt die Pflege beim Superadmin, und eine erfundene Zahl in
 * der Kostenschätzung wäre schlimmer als keine — sie würde bestätigt.
 */
export const VORGABE_MODELLE: DocCheckModell[] = [
  { id: 'claude-sonnet-5-5', name: 'Sonnet', preise: OHNE_PREIS, maxTokens: 16000 },
  { id: 'claude-opus-5-5', name: 'Opus', preise: OHNE_PREIS, maxTokens: 16000 },
]

export const VORGABE: DocCheckSettings = {
  features: Object.fromEntries(FEATURES.map((f) => [f, true])) as Record<DocCheckFeature, boolean>,
  modelle: VORGABE_MODELLE,
  standardModell: 'claude-sonnet-5-5',
  ausweichModell: 'claude-opus-5-5',
  echteKiInSandbox: false,
  monatsbudgetUsd: null,
}

export function einstellungen(gespeichert: Partial<DocCheckSettings> | undefined): DocCheckSettings {
  const g = gespeichert ?? {}
  const modelle = g.modelle?.length ? g.modelle : VORGABE.modelle
  const ids = modelle.map((m) => m.id)
  // Zeigt das Standard- oder Ausweichmodell auf ein entferntes Modell, fällt
  // es auf das erste zurück — eine Auswahl ins Leere würde jeden Lauf
  // abweisen, ohne dass jemand sieht, warum.
  const standard = g.standardModell && ids.includes(g.standardModell) ? g.standardModell : ids[0]
  const ausweich = g.ausweichModell && ids.includes(g.ausweichModell) ? g.ausweichModell : (ids[1] ?? ids[0])
  return {
    features: { ...VORGABE.features, ...(g.features ?? {}) },
    modelle,
    standardModell: standard,
    ausweichModell: ausweich,
    echteKiInSandbox: g.echteKiInSandbox ?? VORGABE.echteKiInSandbox,
    monatsbudgetUsd: g.monatsbudgetUsd ?? VORGABE.monatsbudgetUsd,
  }
}

/**
 * Welches Modell übernimmt bei Überlastung (Spez. 5.3 Nr. 6, 13.3)?
 * Ist das gewählte selbst das Ausweichmodell, springt das Standardmodell
 * ein — sonst wiche man auf das überlastete Modell aus.
 */
export function ausweichFuer(s: DocCheckSettings, gewaehlt: string): string {
  return gewaehlt === s.ausweichModell ? s.standardModell : s.ausweichModell
}

/**
 * Ist eine Funktion verfügbar? Der Gesamtschalter schlägt jeden
 * Einzelschalter: „DocCheck aus" heißt Wartung, auch wenn der Chat noch an
 * steht.
 */
export function aktiv(s: DocCheckSettings, f: DocCheckFeature): boolean {
  return s.features.doccheck && s.features[f]
}

/** Sind alle Preise eines Modells gepflegt? Sonst keine Kostenschätzung. */
export function preiseVollstaendig(m: DocCheckModell): boolean {
  return Object.values(m.preise).every((p) => typeof p === 'number' && p >= 0)
}
