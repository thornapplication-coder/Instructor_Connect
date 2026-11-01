import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SBX_CALC_01_NAME, SBX_FL_01_NAME, sbxCalc01, sbxFl01, sbxPkg01 } from '../src/modules/doccheck/benchmark/sbx'
import { datenstand } from '../src/modules/doccheck/export/datenstand'
import { eingabe } from '../src/modules/doccheck/export/beispiel'
import { pruefstandAus, pruefstandText } from '../src/modules/doccheck/export/pruefstand'

/** Testdateien aus Code (synthetisch, wie in Ebene 1) — keine Binärdateien im Repo. */
export const ORDNER = fileURLToPath(new URL('./.dateien', import.meta.url))

export default async function vorbereitung(): Promise<void> {
  mkdirSync(ORDNER, { recursive: true })
  writeFileSync(join(ORDNER, SBX_CALC_01_NAME), await sbxCalc01())
  writeFileSync(join(ORDNER, SBX_FL_01_NAME), await sbxFl01())
  for (const d of await sbxPkg01()) writeFileSync(join(ORDNER, d.name), d.daten)
  writeFileSync(join(ORDNER, 'beispiel.doccheck.json'), pruefstandText(pruefstandAus(datenstand(eingabe()), 'u-patrick', ['json'], '2026-11-01T09:30:00Z')))
  writeFileSync(join(ORDNER, 'neuer.doccheck.json'), JSON.stringify({ schema: 'doccheck/9' }))
}
