import { useTranslation } from 'react-i18next'
import { Card, Page, TopBar } from '../components/ui'
import { useStore } from '../store'
import { APP_VERSION } from '../types'
import { parseImprint } from '../imprint'

export function Imprint() {
  const { t, i18n } = useTranslation()
  const { state } = useStore()
  const text = i18n.language === 'de' ? state.settings.imprint.de : state.settings.imprint.en
  const sections = parseImprint(text)

  return (
    <>
      <TopBar title={t('imprint.title')} back="/" />
      <Page className="space-y-section">
        {sections.map((s, si) =>
          s.title === null ? (
            <div key={si}>
              {s.blocks.map((b, i) =>
                b.type === 'p' ? (
                  <p key={i} className="mb-2 text-body leading-relaxed text-dim last:mb-0">
                    {b.text}
                  </p>
                ) : null,
              )}
            </div>
          ) : (
            <Card key={si} className="p-4">
              <h2 className="mb-2 text-lead font-semibold leading-snug">{s.title}</h2>
              {s.blocks.map((b, i) =>
                b.type === 'p' ? (
                  <p key={i} className="mb-2 text-small leading-relaxed last:mb-0">
                    {b.text}
                  </p>
                ) : (
                  <ul key={i} className="mb-2 list-disc space-y-tight pl-5 text-small leading-relaxed last:mb-0">
                    {b.items.map((item, j) => (
                      <li key={j}>{item}</li>
                    ))}
                  </ul>
                ),
              )}
            </Card>
          ),
        )}
        <p className="pt-2 text-center text-micro text-dim">{t('imprint.stand', { version: APP_VERSION })}</p>
      </Page>
    </>
  )
}
