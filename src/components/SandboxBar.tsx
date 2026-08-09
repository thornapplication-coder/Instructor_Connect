import { FastForward, FlaskConical, RotateCcw, Smartphone } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { navigate } from '../router'
import { useStore } from '../store'

const DAY = 24 * 3600_000

/**
 * Persistente Sandbox-Leiste (Spez. §14): Rollenwechsler, Zeitraffer für die
 * Aufbewahrungs-Löschung und Daten-Reset. Erscheint nie in Produktion.
 * Feste Höhe h-11 — Layoutabstände (z. B. Chat-Eingabezeile) verlassen sich darauf.
 */
export function SandboxBar() {
  const { t } = useTranslation()
  const { state, currentUser, switchUser, advanceTime, resetSandbox } = useStore()
  const offsetDays = Math.round(state.timeOffsetMs / DAY)

  return (
    <div className="safe-bottom sticky bottom-0 z-30 min-h-11 border-t border-amber-400/30 bg-[#2b2410]/95 text-amber-200 backdrop-blur">
      <div className="mx-auto flex h-full max-w-3xl items-center gap-3 overflow-x-auto whitespace-nowrap px-3 text-[12px]">
        <span className="flex shrink-0 items-center gap-1.5 font-semibold uppercase tracking-wide" title={t('sandbox.banner')}>
          <FlaskConical size={14} /> Sandbox
        </span>
        {currentUser && (
          <label className="flex shrink-0 items-center gap-1.5">
            {t('sandbox.role')}
            <select
              value={currentUser.id}
              onChange={(e) => switchUser(e.target.value)}
              className="max-w-40 rounded-md border border-amber-400/30 bg-transparent px-1.5 py-0.5 text-amber-100"
            >
              {state.users
                .filter((u) => u.active)
                .map((u) => (
                  <option key={u.id} value={u.id} className="bg-[#2b2410]">
                    {u.name} — {t(`roles.${u.role}`)}
                  </option>
                ))}
            </select>
          </label>
        )}
        <span className="flex shrink-0 items-center gap-1">
          <FastForward size={14} />
          <span className="hidden sm:inline">{t('sandbox.time')}</span>
          {[1, 8, 31].map((days) => (
            <button
              key={days}
              onClick={() => advanceTime(days * DAY)}
              className="min-h-11 rounded-md border border-amber-400/30 px-3 py-0.5 hover:bg-amber-400/10"
            >
              +{days}d
            </button>
          ))}
          {offsetDays > 0 && <span className="font-semibold">({t('sandbox.offset', { days: offsetDays })})</span>}
        </span>
        <button
          onClick={resetSandbox}
          title={t('sandbox.reset')}
          className="flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1 rounded-md border border-amber-400/30 px-3 py-0.5 hover:bg-amber-400/10"
        >
          <RotateCcw size={12} />
          <span className="hidden sm:inline">{t('sandbox.reset')}</span>
        </button>
        {/* Gerätevorschau nur in der obersten Ebene anbieten, nicht im eingebetteten Rahmen */}
        {window.self === window.top && (
          <button
            onClick={() => navigate('/device')}
            title={t('sandbox.device')}
            className="flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1 rounded-md border border-amber-400/30 px-3 py-0.5 hover:bg-amber-400/10"
          >
            <Smartphone size={12} />
            <span className="hidden sm:inline">{t('sandbox.device')}</span>
          </button>
        )}
      </div>
    </div>
  )
}
