import { useTranslation } from 'react-i18next'
import { LogoFull } from '../components/Logo'
import { Card, Page, TopBar } from '../components/ui'
import { useStore } from '../store'
import { APP_VERSION } from '../types'

type Block = { type: 'p'; text: string } | { type: 'ul'; items: string[] }

interface Section {
  title: string | null
  blocks: Block[]
}

/**
 * Wandelt den im Admin Panel gepflegten Klartext in Abschnitte um:
 * "# " beginnt einen Abschnitt mit Überschrift, "- " eine Aufzählungszeile,
 * Leerzeilen trennen Absätze. Text vor der ersten Überschrift wird als
 * Einleitung gerendert.
 */
export function parseImprint(text: string): Section[] {
  const sections: Section[] = []
  let current: Section = { title: null, blocks: [] }
  const pushSection = () => {
    if (current.title !== null || current.blocks.length > 0) sections.push(current)
  }
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (line.startsWith('# ')) {
      pushSection()
      current = { title: line.slice(2).trim(), blocks: [] }
    } else if (line.startsWith('- ')) {
      const last = current.blocks[current.blocks.length - 1]
      if (last && last.type === 'ul') last.items.push(line.slice(2).trim())
      else current.blocks.push({ type: 'ul', items: [line.slice(2).trim()] })
    } else if (line.length > 0) {
      current.blocks.push({ type: 'p', text: line })
    }
  }
  pushSection()
  return sections
}

export function Imprint() {
  const { t, i18n } = useTranslation()
  const { state } = useStore()
  const text = i18n.language === 'de' ? state.settings.imprint.de : state.settings.imprint.en
  const sections = parseImprint(text)

  return (
    <>
      <TopBar title={t('imprint.title')} back="/" />
      <Page className="space-y-4">
        {sections.map((s, si) =>
          s.title === null ? (
            <div key={si}>
              {s.blocks.map((b, i) =>
                b.type === 'p' ? (
                  <p key={i} className="mb-2 text-[14px] leading-relaxed text-dim last:mb-0">
                    {b.text}
                  </p>
                ) : null,
              )}
            </div>
          ) : (
            <Card key={si} className="p-4">
              <h2 className="mb-2 text-[15px] font-semibold leading-snug">{s.title}</h2>
              {s.blocks.map((b, i) =>
                b.type === 'p' ? (
                  <p key={i} className="mb-2 text-[13.5px] leading-relaxed last:mb-0">
                    {b.text}
                  </p>
                ) : (
                  <ul key={i} className="mb-2 list-disc space-y-1.5 pl-5 text-[13.5px] leading-relaxed last:mb-0">
                    {b.items.map((item, j) => (
                      <li key={j}>{item}</li>
                    ))}
                  </ul>
                ),
              )}
            </Card>
          ),
        )}
        <p className="pt-2 text-center text-[12px] text-dim/80">{t('imprint.stand', { version: APP_VERSION })}</p>
        {/* Wort-Bild-Marke als Abschluss der Seite */}
        <LogoFull size={52} className="pt-4 opacity-90" />
      </Page>
    </>
  )
}
