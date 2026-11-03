import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { FilterAuswahl } from '../../components/ui'
import { PERIODS, type PeriodKey } from '../../gradingStats'
import { useStore } from '../../store'

/**
 * Filterzeile von Statistik und Standardisierungsbericht: Flotte, Behörde,
 * Zeitraum. Beide Ansichten zeigen denselben Ausschnitt (der Zustand liegt in
 * GradingAdmin) und haben deshalb auch dieselbe Zeile.
 *
 * Audit 11/2026, UID-17/A11Y-07: Vorher standen dafür zwei Gestalten
 * nebeneinander — die Statistik mit Beschriftungen, die mit keinem Feld
 * verbunden waren, der Bericht mit drei bildschirmbreiten Auswahlfeldern
 * untereinander und ganz ohne Namen. Am Papier steht die Zeile nicht; dort
 * sagt der Dokumentkopf dasselbe.
 */
export function AuswertungsFilter({
  fleet,
  onFleetChange,
  fleetOptions,
  authority,
  onAuthorityChange,
  period,
  onPeriodChange,
  children,
}: {
  fleet: string
  onFleetChange: (v: string) => void
  fleetOptions: string[]
  authority: '' | 'AT' | 'UK'
  onAuthorityChange: (v: '' | 'AT' | 'UK') => void
  period: PeriodKey
  onPeriodChange: (p: PeriodKey) => void
  /** rechts angehängt: Sitzungszahl, Druck- und Exportknöpfe */
  children?: ReactNode
}) {
  const { t } = useTranslation()
  const { state } = useStore()
  const doc = state.settings.documentHeader
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 print:hidden">
      <FilterAuswahl label={t('forms:admin.fleetFilter')} sichtbar value={fleet} onChange={onFleetChange}>
        <option value="">{t('forms:admin.allAircraft')}</option>
        {fleetOptions.map((f) => (
          <option key={f} value={f}>
            {f}
          </option>
        ))}
      </FilterAuswahl>
      <FilterAuswahl label={t('forms:admin.authorityFilter')} sichtbar value={authority} onChange={(v) => onAuthorityChange(v as '' | 'AT' | 'UK')}>
        <option value="">{t('forms:admin.allAuthorities')}</option>
        <option value="AT">{t('forms:authorityAT', { nr: doc?.approvalNumber || 'AT.ATO.106' })}</option>
        <option value="UK">{t('forms:authorityUK', { nr: doc?.approvalNumberUK || 'GBR.ATO.0541' })}</option>
      </FilterAuswahl>
      <FilterAuswahl label={t('forms:std.period.label')} sichtbar value={period} onChange={(v) => onPeriodChange(v as PeriodKey)}>
        {PERIODS.map((p) => (
          <option key={p.key} value={p.key}>
            {t(`forms:std.period.${p.key}`)}
          </option>
        ))}
      </FilterAuswahl>
      {children}
    </div>
  )
}
