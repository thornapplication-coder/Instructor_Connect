import { Download, Eye, FileText, Plane, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Card, Field, inputCls, Modal, Page, TopBar } from '../components/ui'
import { useStore } from '../store'

const SAMPLE_PDF = import.meta.env.BASE_URL + 'sample.pdf'

function UploadModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const { state, addLessonPlan } = useStore()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [aircraftType, setAircraftType] = useState('')
  const [fileName, setFileName] = useState('')

  const valid = title.trim() && aircraftType

  return (
    <Modal title={t('lessons.newPlan')} onClose={onClose}>
      <div className="space-y-3.5">
        <Field label={t('lessons.aircraftType') + ' *'}>
          <select value={aircraftType} onChange={(e) => setAircraftType(e.target.value)} className="w-full rounded-xl border border-line/10 bg-bg/60 px-3 py-2.5 text-[14px]">
            <option value="">…</option>
            {[...state.settings.aircraftTypes].sort((a, b) => a.localeCompare(b)).map((a) => (
              <option key={a} value={a}>
                {a}
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
            className="w-full rounded-xl border border-dashed border-line/25 px-3 py-2.5 text-[13px] text-dim file:mr-3 file:rounded-lg file:border-0 file:bg-raised file:px-3 file:py-1.5 file:text-[13px] file:text-accent"
          />
          {fileName && <p className="mt-1.5 text-[12.5px] text-dim">{fileName}</p>}
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            disabled={!valid}
            onClick={() => {
              addLessonPlan({ title: title.trim(), description: description.trim(), aircraftType, fileName: fileName || 'lesson-plan.pdf' })
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
  const grouped = availableTypes
    .filter((a) => !activeFilter || a === activeFilter)
    .map((a) => ({ aircraftType: a, plans: shown.filter((p) => p.aircraftType === a) }))

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
              className="flex items-center gap-1 rounded-full bg-accent px-3 py-1.5 text-[13px] font-semibold text-bg hover:brightness-110"
            >
              <Plus size={15} /> {t('lessons.newPlan')}
            </button>
          ) : undefined
        }
      />
      <Page className="space-y-4">
        {currentUser!.role === 'member' && currentUser!.aircraftTypes.length === 0 && (
          <p className="rounded-xl border border-line/10 bg-surface/60 p-3.5 text-[13px] leading-relaxed text-dim">{t('lessons.noAircraft')}</p>
        )}

        {availableTypes.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            <button
              onClick={() => setFilter('')}
              className={`shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] transition ${
                !activeFilter ? 'border-accent bg-accent/15 font-semibold text-accent' : 'border-line/15 text-dim'
              }`}
            >
              {t('lessons.allTypes')}
            </button>
            {availableTypes.map((a) => (
              <button
                key={a}
                onClick={() => setFilter(activeFilter === a ? '' : a)}
                className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] transition ${
                  activeFilter === a ? 'border-accent bg-accent/15 font-semibold text-accent' : 'border-line/15 text-dim'
                }`}
              >
                <Plane size={13} /> {a}
              </button>
            ))}
          </div>
        )}

        {shown.length === 0 && <p className="pt-6 text-center text-sm text-dim">{t('lessons.empty')}</p>}

        {grouped.map(({ aircraftType, plans }) => (
          <section key={aircraftType}>
            <h2 className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-wide text-dim">
              <Plane size={14} /> {aircraftType}
            </h2>
            <div className="space-y-3">
              {plans.map((p) => (
                <Card key={p.id} className="p-4">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-raised text-accent">
                      <FileText size={19} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-semibold leading-snug">{p.title}</p>
                      {p.description && <p className="mt-0.5 text-[13px] text-dim">{p.description}</p>}
                      <p className="mt-1 text-[11.5px] text-dim/80">
                        {p.fileName} · {dateLabel(p.createdAt)} · {t('info.by', { name: userName(p.uploadedBy) })}
                      </p>
                      <div className="mt-2.5 flex flex-wrap gap-2">
                        <a
                          href={SAMPLE_PDF}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1.5 rounded-lg border border-line/15 px-3 py-1.5 text-[13px] hover:border-accent/50 hover:text-accent"
                        >
                          <Eye size={14} /> {t('info.view')}
                        </a>
                        <a
                          href={SAMPLE_PDF}
                          download={p.fileName}
                          className="flex items-center gap-1.5 rounded-lg border border-line/15 px-3 py-1.5 text-[13px] hover:border-accent/50 hover:text-accent"
                        >
                          <Download size={14} /> {t('info.download')}
                        </a>
                        {mayEdit && (
                          <button
                            onClick={() => deleteLessonPlan(p.id)}
                            className="flex items-center gap-1.5 rounded-lg border border-danger/30 px-3 py-1.5 text-[13px] text-danger hover:bg-danger/10"
                          >
                            <Trash2 size={14} /> {t('common.delete')}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </section>
        ))}

      </Page>
      {showUpload && <UploadModal onClose={() => setShowUpload(false)} />}
    </>
  )
}
