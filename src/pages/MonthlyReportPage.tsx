import { useTranslation } from 'react-i18next'
import { Page, TopBar } from '../components/ui'
import { useStore } from '../store'
import { MonthlyReport } from './admin/MonthlyReport'

/**
 * Eigenständige Seite für den Monatsbericht — der Instruktor soll ihn von
 * der Startseite aus erreichen, ohne den Umweg über die Formularliste.
 *
 * Die Daten kommen aus dem GESAMTBESTAND, nicht aus visibleGradingRecords:
 * Dort greift die Wochenfrist, die bewusst die LISTE der Formulare kürzt.
 * Ein Monatsbericht, der nach sieben Tagen leer wäre, hätte keinen Zweck.
 * Sichtbar werden dadurch keine fremden Blätter — der Bericht zeigt eigene
 * Aggregate und Vergleichswerte, die niemanden namentlich nennen.
 */
export function MonthlyReportPage() {
  const { t } = useTranslation()
  const { state } = useStore()
  return (
    <>
      <TopBar title={t('grading.admin.monthly')} back="/" />
      <Page className="space-y-3">
        <p className="rounded-xl border border-line/10 bg-surface/60 p-3.5 text-[13px] text-dim">{t('grading.admin.monthlyIntro')}</p>
        <MonthlyReport records={state.gradingRecords} />
      </Page>
    </>
  )
}
