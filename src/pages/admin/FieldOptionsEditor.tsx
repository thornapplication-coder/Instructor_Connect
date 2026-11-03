import { Plus, X } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, inputCls } from '../../components/ui'
import { optionEntfernen, optionHinzufuegen, optionUmbenennen, type OptionErgebnis } from '../../optionList'
import type { FormField } from '../../types'

/**
 * Auswahlwerte eines Formularfeldes pflegen (hinzufügen, umbenennen,
 * löschen) — deckt alle Dropdowns/Ankreuzlisten ab: Event, Location,
 * Varianten, Conv. From/To, ATA-Kapitel, PRG, Operation usw.
 *
 * Audit 11/2026, GRD-17/A11Y-02: Der Editor stand in GradingAdmin.tsx und
 * führte den Wert selbst als React-Schlüssel. Jeder Tastendruck hängte das
 * Feld neu ein, der Fokus fiel auf <body>, und umbenennen ging nur ein
 * Zeichen je Klick — mit Maus wie mit Tastatur. Felder und Löschknöpfe
 * hatten keinen Namen, die Löschknöpfe 12 px. Jetzt:
 *  - Schlüssel ist die Stelle in der Liste, nicht der Wert;
 *  - getippt wird in einen Entwurf, übernommen beim Verlassen oder mit
 *    Enter (Escape verwirft) — leer und doppelt lehnt `optionUmbenennen`
 *    ab und sagt warum;
 *  - jedes Feld und jeder Löschknopf trägt einen Namen, der Knopf 44 px.
 *
 * Bedienleisten des Grading-Bereichs sind englisch (Namensraum `forms`).
 */
export function FieldOptionsEditor({ field, onChange }: { field: FormField; onChange: (options: string[]) => void }) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState('')
  // Entwurf des gerade bearbeiteten Eintrags. Solange er steht, zeigt das
  // Feld ihn statt des gespeicherten Werts.
  const [bearbeitet, setBearbeitet] = useState<{ i: number; wert: string } | null>(null)
  const [meldung, setMeldung] = useState<string | null>(null)
  const meldungId = useId()
  const eingabe = useRef<HTMLInputElement>(null)
  // Nach dem Löschen des LETZTEN Eintrags gibt es den Knopf an seiner Stelle
  // nicht mehr — dann geht der Fokus ins Eingabefeld statt auf <body>. Bei
  // jedem anderen Eintrag bleibt er auf dem Knopf derselben Stelle, der
  // jetzt den Nachbarn löscht (Schlüssel = Stelle).
  const fokusInsFeld = useRef(false)
  const options = field.options ?? []

  useEffect(() => {
    if (!fokusInsFeld.current) return
    fokusInsFeld.current = false
    eingabe.current?.focus()
  }, [options.length])

  const grundText = (e: Extract<OptionErgebnis, { ok: false }>) =>
    e.grund === 'leer' ? t('forms:admin.optionEmpty') : t('forms:admin.optionTaken', { value: e.vorhanden })

  const uebernehmen = () => {
    if (!bearbeitet) return
    const { i, wert } = bearbeitet
    setBearbeitet(null)
    if (wert === options[i]) return
    const r = optionUmbenennen(options, i, wert)
    if (!r.ok) {
      setMeldung(grundText(r))
      return
    }
    setMeldung(null)
    onChange(r.options)
  }

  const entfernen = (i: number) => {
    setBearbeitet(null)
    setMeldung(null)
    if (i === options.length - 1) fokusInsFeld.current = true
    onChange(optionEntfernen(options, i))
  }

  const add = () => {
    if (!draft.trim()) return
    const r = optionHinzufuegen(options, draft)
    if (!r.ok) {
      setMeldung(grundText(r))
      return
    }
    setMeldung(null)
    onChange(r.options)
    setDraft('')
  }

  return (
    <div className="rounded-xl border border-line/10 p-2.5">
      <p className="mb-1.5 text-micro font-medium">
        {field.label} <span className="text-dim">· {field.type}</span>
      </p>
      {/* Die Musterliste gilt app-weit und wird in den Einstellungen gepflegt */}
      {field.key === 'aircraftType' ? (
        <p className="text-micro leading-relaxed text-dim">{t('forms:admin.aircraftCentral')}</p>
      ) : (
        <>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {options.map((o, i) => {
              const wert = bearbeitet?.i === i ? bearbeitet.wert : o
              return (
                // Schlüssel = Stelle: Das Feld bleibt beim Tippen dasselbe
                // Element und behält den Fokus.
                // Die Pille ist so hoch wie das Feld (44 px, index.css), der
                // Löschknopf passt ohne negativen Rand hinein.
                <span key={i} className="flex items-center rounded-full bg-raised pl-3 text-micro">
                  <input
                    value={wert}
                    aria-label={t('forms:admin.optionValue', { field: field.label, n: i + 1 })}
                    aria-describedby={meldung ? meldungId : undefined}
                    onChange={(e) => setBearbeitet({ i, wert: e.target.value })}
                    onBlur={uebernehmen}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        uebernehmen()
                      } else if (e.key === 'Escape') {
                        setBearbeitet(null)
                        setMeldung(null)
                      }
                    }}
                    className="w-auto min-w-16 rounded border-0 bg-transparent p-0 text-micro"
                    size={Math.max(wert.length, 4)}
                  />
                  <button
                    type="button"
                    onClick={() => entfernen(i)}
                    aria-label={t('forms:admin.deleteOption', { value: o })}
                    title={t('forms:admin.deleteOption', { value: o })}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-dim transition hover:text-danger"
                  >
                    <X size={14} aria-hidden />
                  </button>
                </span>
              )
            })}
            {options.length === 0 && <span className="text-micro text-dim">—</span>}
          </div>
          <div className="flex gap-2">
            <input
              ref={eingabe}
              className={`${inputCls} text-small`}
              value={draft}
              placeholder={t('forms:admin.addValue')}
              aria-label={t('forms:admin.addOption', { field: field.label })}
              aria-describedby={meldung ? meldungId : undefined}
              onChange={(e) => {
                setDraft(e.target.value)
                setMeldung(null)
              }}
              onKeyDown={(e) => e.key === 'Enter' && add()}
            />
            <Button variant="ghost" onClick={add} label={t('forms:admin.addOption', { field: field.label })}>
              <Plus size={15} aria-hidden />
            </Button>
          </div>
          {meldung && (
            <p id={meldungId} role="alert" className="mt-1.5 text-micro leading-relaxed text-danger">
              {meldung}
            </p>
          )}
        </>
      )}
    </div>
  )
}
