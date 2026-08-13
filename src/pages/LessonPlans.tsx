import { Download, Eye, FileText, Plane, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Card, CardGrid, Field, inputCls, Modal, Page, SectionHeading, selectCls, TopBar } from '../components/ui'
import { useStore } from '../store'

const SAMPLE_PDF = import.meta.env.BASE_URL + 'sample.pdf'

function UploadModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const { state, addLessonPlan } = useStore()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [aircraftType, setAircraftType] = useState('')
  const [category, setCategory] = useState('')
  const [fileName, setFileName] = useState('')

  const valid = title.trim() && aircraftType

  return (
    <Modal
      title={t('lessons.newPlan')}
      onClose={onClose}
      confirmDiscard={title.trim() || description.trim() || aircraftType || category || fileName ? t('common.discardConfirm') : undefined}
    >
      <div className="space-y-stack">
        <Field label={t('lessons.aircraftType') + ' *'}>
          <select value={aircraftType} onChange={(e) => setAircraftType(e.target.value)} className={selectCls}>
            <option value="">…</option>
            {[...state.settings.aircraftTypes].sort((a, b) => a.localeCompare(b)).map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </Field>
        {/* Schulungsart: erste Zelle leer, Rest alphabetisch — wie überall in
            der App (#16). Die Liste kommt aus den Einstellungen und ist im
            Admin-Panel pflegbar; sie gliedert zugleich die Liste. */}
        <Field label={t('lessons.category')}>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className={selectCls}>
            <option value="">…</option>
            {[...(state.settings.lessonCategories ?? [])].sort((a, b) => a.localeCompare(b)).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('lessons.title') + ' *'}>
          <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </Field>
        <Field label={t('lessons.description')}>
          <input className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Field label={t('lessons.file')}>
          {/* Sandbox: Datei wird nur benannt, nicht wirklich übertragen */}
          <input
            type="file"
            accept="application/pdf"
            onChange={(e) => setFileName(e.target.files?.[0]?.name ?? '')}
            className="w-full rounded-xl border border-dashed border-line/25 px-3 py-2.5 text-small text-dim file:mr-3 file:rounded-lg file:border-0 file:bg-raised file:px-3 file:py-1.5 file:text-small file:text-accent"
          />
          {fileName && <p className="mt-1.5 text-micro text-dim">{fileName}</p>}
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            disabled={!valid}
            onClick={() => {
              // Ohne hochgeladene Datei wird auch keine behauptet — die Karte
              // bot sonst Ansehen und Herunterladen für ein Dokument an, das
              // es nie gab.
              addLessonPlan({ title: title.trim(), description: description.trim(), aircraftType, category, fileName: fileName.trim() })
              onClose()
            }}
          >
            {t('common.save')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

export function LessonPlans() {
  const { t, i18n } = useTranslation()
  const { state, currentUser, visibleLessonPlans, deleteLessonPlan, can } = useStore()
  const [filter, setFilter] = useState('')
  const [showUpload, setShowUpload] = useState(false)

  const mayEdit = can('lessons_manage')
  const dateLabel = (ts: number) => new Date(ts).toLocaleDateString(i18n.language === 'de' ? 'de-AT' : 'en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const userName = (id: string) => state.users.find((u) => u.id === id)?.name ?? '—'

  // Nur Muster anbieten, für die der Nutzer auch Pläne sieht
  const availableTypes = [...new Set(visibleLessonPlans.map((p) => p.aircraftType))].sort((a, b) => a.localeCompare(b))
  // Ein Filter auf ein nicht (mehr) sichtbares Muster wird ignoriert, sonst
  // bliebe die Liste nach Rollenwechsel oder Entzug eines Musters leer.
  const activeFilter = availableTypes.includes(filter) ? filter : ''
  const shown = visibleLessonPlans.filter((p) => !activeFilter || p.aircraftType === activeFilter)
  /**
   * Zwei Ebenen: Muster, darunter Schulungsart.
   *
   * Innerhalb eines Musters lagen bisher Type Rating, Recurrent und
   * Conversion in einer einzigen Reihe — bei drei Plänen geht das, bei
   * dreißig sucht man. Die Schulungsarten erscheinen alphabetisch (wie das
   * Auswahlfeld), Pläne ohne Zuordnung stehen am Ende unter „Ohne
   * Zuordnung": Sie sollen sichtbar bleiben, aber nicht vorne stehen.
   */
  const grouped = availableTypes
    .filter((a) => !activeFilter || a === activeFilter)
    .map((a) => {
      const plans = shown.filter((p) => p.aircraftType === a)
      const kategorien = [...new Set(plans.map((p) => p.category?.trim() || ''))]
        .sort((x, y) => (x === '' ? 1 : y === '' ? -1 : x.localeCompare(y)))
        .map((c) => ({ category: c, plans: plans.filter((p) => (p.category?.trim() || '') === c) }))
      return { aircraftType: a, groups: kategorien }
    })

  return (
    <>
      {/* Modulname bleibt in beiden Sprachen Englisch */}
      <TopBar
        title="Lesson Plan"
        back="/"
        right={
          mayEdit ? (
            <button
              onClick={() => setShowUpload(true)}
              className="min-h-11 flex items-center gap-1 rounded-full bg-accent px-3 py-1.5 text-small font-semibold text-bg hover:brightness-110"
            >
              <Plus size={15} /> {t('lessons.newPlan')}
            </button>
          ) : undefined
        }
      />
      <Page className="space-y-section">
        {currentUser!.role === 'member' && currentUser!.aircraftTypes.length === 0 && (
          <p className="rounded-xl border border-line/10 bg-surface/60 p-3.5 text-small leading-relaxed text-dim">{t('lessons.noAircraft')}</p>
        )}

        {availableTypes.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            <button
              onClick={() => setFilter('')}
              className={`min-h-11 shrink-0 rounded-full border px-3.5 py-1.5 text-small transition ${
                !activeFilter ? 'border-accent bg-accent/15 font-semibold text-ink' : 'border-line/15 text-dim'
              }`}
            >
              {t('lessons.allTypes')}
            </button>
            {availableTypes.map((a) => (
              <button
                key={a}
                onClick={() => setFilter(activeFilter === a ? '' : a)}
                className={`min-h-11 flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-small transition ${
                  activeFilter === a ? 'border-accent bg-accent/15 font-semibold text-ink' : 'border-line/15 text-dim'
                }`}
              >
                <Plane size={13} /> {a}
              </button>
            ))}
          </div>
        )}

        {shown.length === 0 && <p className="pt-6 text-center text-body text-dim">{t('lessons.empty')}</p>}

        {grouped.map(({ aircraftType, groups }) => (
          <section key={aircraftType} className="space-y-stack">
            <SectionHeading icon={<Plane size={14} className="shrink-0 text-accent" />}>{aircraftType}</SectionHeading>
            {groups.map(({ category, plans }) => (
            <div key={category || '—'} className="space-y-stack">
              <h3 className="ml-3.5 text-micro font-semibold text-ink">{category || t('lessons.noCategory')}</h3>
              <CardGrid>
              {plans.map((p) => (
                <Card key={p.id} className="p-4">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-raised text-accent">
                      <FileText size={19} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-lead font-semibold leading-snug">{p.title}</p>
                      {p.description && <p className="mt-0.5 text-small text-dim">{p.description}</p>}
                      <p className="mt-1 text-micro text-dim">
                        {[p.fileName, dateLabel(p.createdAt), t('info.by', { name: userName(p.uploadedBy) })].filter(Boolean).join(' · ')}
                      </p>
                      <div className="mt-2.5 flex flex-wrap gap-2">
                        {p.fileName ? (
                          <>
                            <a
                              href={SAMPLE_PDF}
                              target="_blank"
                              rel="noreferrer"
                              className="min-h-11 flex items-center gap-1.5 rounded-lg border border-line/15 px-3 py-1.5 text-small hover:border-accent/50 hover:text-accent"
                            >
                              <Eye size={14} /> {t('info.view')}
                            </a>
                            <a
                              href={SAMPLE_PDF}
                              download={p.fileName}
                              className="min-h-11 flex items-center gap-1.5 rounded-lg border border-line/15 px-3 py-1.5 text-small hover:border-accent/50 hover:text-accent"
                            >
                              <Download size={14} /> {t('info.download')}
                            </a>
                          </>
                        ) : (
                          <span className="text-micro text-dim">{t('lessons.noFile')}</span>
                        )}
                        {mayEdit && (
                          <button
                            onClick={() => {
                              if (window.confirm(t('lessons.deleteConfirm', { title: p.title }))) deleteLessonPlan(p.id)
                            }}
                            className="min-h-11 flex items-center gap-1.5 rounded-lg border border-danger/30 px-3 py-1.5 text-small text-danger hover:bg-danger/10"
                          >
                            <Trash2 size={14} /> {t('common.delete')}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
              </CardGrid>
            </div>
            ))}
          </section>
        ))}

      </Page>
      {showUpload && <UploadModal onClose={() => setShowUpload(false)} />}
    </>
  )
}
