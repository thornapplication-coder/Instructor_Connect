import { Download, Eye, FileText, Plus, ScrollText, Search, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Card, Field, inputCls, Modal, Page, TopBar } from '../components/ui'
import { useStore } from '../store'

function dateLabel(ts: number, lng: string) {
  return new Date(ts).toLocaleDateString(lng === 'de' ? 'de-AT' : 'en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const SAMPLE_PDF = import.meta.env.BASE_URL + 'sample.pdf'

function NewEntryModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const { addInfoEntry } = useStore()
  const [type, setType] = useState<'text' | 'pdf'>('text')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [body, setBody] = useState('')

  const valid = title.trim() && (type === 'pdf' || body.trim())

  return (
    <Modal title={t('info.newEntry')} onClose={onClose}>
      <div className="space-y-4">
        <Field label={t('info.typeLabel')}>
          <div className="flex gap-2">
            {(['text', 'pdf'] as const).map((tp) => (
              <button
                key={tp}
                onClick={() => setType(tp)}
                className={`flex-1 rounded-xl border px-3 py-2.5 text-sm transition ${
                  type === tp ? 'border-accent bg-accent/10 font-semibold text-accent' : 'border-line/10 text-dim'
                }`}
              >
                {t(tp === 'pdf' ? 'info.pdfEntry' : 'info.textEntry')}
              </button>
            ))}
          </div>
        </Field>
        <Field label={t('info.entryTitle')}>
          <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </Field>
        <Field label={t('info.description')}>
          <input className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        {type === 'text' ? (
          <Field label={t('info.body')}>
            <textarea className={`${inputCls} min-h-28`} value={body} onChange={(e) => setBody(e.target.value)} />
          </Field>
        ) : (
          <div className="rounded-xl border border-dashed border-line/20 p-4 text-center text-[13px] text-dim">
            sample.pdf · {t('chat.attachedDemo')}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            disabled={!valid}
            onClick={() => {
              addInfoEntry({
                type,
                title: title.trim(),
                description: description.trim(),
                body: type === 'text' ? body.trim() : undefined,
                fileName: type === 'pdf' ? 'sample.pdf' : undefined,
              })
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

export function InstructorInfo() {
  const { t, i18n } = useTranslation()
  const { state, currentUser, deleteInfoEntry, markInfoSeen } = useStore()
  const [query, setQuery] = useState('')

  // Besuch der Seite gilt als „gesehen“ — der grüne Punkt auf der Kachel
  // erlischt. markInfoSeen ist idempotent, volle Dependencies sind sicher.
  useEffect(() => {
    markInfoSeen()
  }, [state.infoEntries, state.currentUserId, markInfoSeen])
  const [showNew, setShowNew] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)

  const mayEdit = currentUser!.role !== 'member'
  const entries = state.infoEntries
    .filter((e) => (e.title + ' ' + e.description).toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => a.title.localeCompare(b.title))

  return (
    <>
      {/* Modulname bleibt laut Spez. in beiden Sprachen Englisch */}
      <TopBar
        title="Instructor Info"
        back="/"
        right={
          mayEdit ? (
            <button
              onClick={() => setShowNew(true)}
              className="flex items-center gap-1 rounded-full bg-accent px-3 py-1.5 text-[13px] font-semibold text-bg hover:brightness-110"
            >
              <Plus size={15} /> {t('info.newEntry')}
            </button>
          ) : undefined
        }
      />
      <Page className="space-y-3">
        <div className="relative">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-dim" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('info.searchPlaceholder')}
            className={`${inputCls} pl-10`}
          />
        </div>

        {entries.length === 0 && <p className="pt-6 text-center text-sm text-dim">{t('info.empty')}</p>}

        {entries.map((entry) => {
          const author = state.users.find((u) => u.id === entry.authorId)
          const open = openId === entry.id
          return (
            <Card key={entry.id} className="p-4">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-raised text-accent">
                  {entry.type === 'pdf' ? <FileText size={19} /> : <ScrollText size={19} />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold leading-snug">{entry.title}</p>
                  {entry.description && <p className="mt-0.5 text-[13px] text-dim">{entry.description}</p>}
                  <p className="mt-1 text-[11.5px] text-dim/80">
                    {t(entry.type === 'pdf' ? 'info.pdfEntry' : 'info.textEntry')} · {dateLabel(entry.createdAt, i18n.language)} ·{' '}
                    {t('info.by', { name: author?.name ?? '—' })}
                  </p>
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {entry.type === 'pdf' ? (
                      <>
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
                          download={entry.fileName}
                          className="flex items-center gap-1.5 rounded-lg border border-line/15 px-3 py-1.5 text-[13px] hover:border-accent/50 hover:text-accent"
                        >
                          <Download size={14} /> {t('info.download')}
                        </a>
                      </>
                    ) : (
                      <button
                        onClick={() => setOpenId(open ? null : entry.id)}
                        className="flex items-center gap-1.5 rounded-lg border border-line/15 px-3 py-1.5 text-[13px] hover:border-accent/50 hover:text-accent"
                      >
                        <Eye size={14} /> {open ? t('common.close') : t('info.view')}
                      </button>
                    )}
                    {mayEdit && (
                      <button
                        onClick={() => deleteInfoEntry(entry.id)}
                        className="flex items-center gap-1.5 rounded-lg border border-danger/30 px-3 py-1.5 text-[13px] text-danger hover:bg-danger/10"
                      >
                        <Trash2 size={14} /> {t('common.delete')}
                      </button>
                    )}
                  </div>
                  {open && entry.body && (
                    <p className="mt-3 whitespace-pre-wrap rounded-xl bg-bg/50 p-3.5 text-[13.5px] leading-relaxed">{entry.body}</p>
                  )}
                </div>
              </div>
            </Card>
          )
        })}

        <p className="pt-2 text-center text-[11.5px] text-dim/70">{t('info.permanentNote')}</p>
      </Page>
      {showNew && <NewEntryModal onClose={() => setShowNew(false)} />}
    </>
  )
}
