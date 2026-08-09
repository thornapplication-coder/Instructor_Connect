import { CheckCircle2, ChevronDown, Download, Eye, FileDown, FileText, Plus, ScrollText, Search, Star, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Card, ChipMultiSelect, Field, inputCls, Modal, Page, TopBar } from '../components/ui'
import { csvRow, downloadCsv } from '../csv'
import { infoEntryAppliesTo, infoIsPublished, useStore } from '../store'
import { formatDate, formatDateTime } from './Grading'

const SAMPLE_PDF = import.meta.env.BASE_URL + 'sample.pdf'

/** „NEW“-Kennzeichnung: zwei Wochen ab Veröffentlichung */
const NEW_MS = 14 * 24 * 3600_000

function NewEntryModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const { state, addInfoEntry } = useStore()
  const [type, setType] = useState<'text' | 'pdf'>('text')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [body, setBody] = useState('')
  const [category, setCategory] = useState('')
  const [validFrom, setValidFrom] = useState('')
  const [validUntil, setValidUntil] = useState('')
  const [requiresAck, setRequiresAck] = useState(false)
  const [groupIds, setGroupIds] = useState<string[]>([])
  const [aircraftType, setAircraftType] = useState('')
  const groups = [...state.groups].sort((a, b) => a.name.localeCompare(b.name))

  const valid = title.trim() && category && (type === 'pdf' || body.trim())

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
        <Field label={t('info.category')}>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full rounded-xl border border-line/10 bg-bg/60 px-3 py-2.5 text-[14px]"
          >
            <option value="">…</option>
            {[...state.settings.infoCategories].sort((a, b) => a.localeCompare(b)).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
        {/* Muster des Eintrags — sortiert die Liste in Abschnitte je Flotte */}
        <Field label={t('lessons.aircraftType')}>
          <select
            value={aircraftType}
            onChange={(e) => setAircraftType(e.target.value)}
            className="w-full rounded-xl border border-line/10 bg-bg/60 px-3 py-2.5 text-[14px]"
          >
            <option value="">{t('admin.groupNoAircraft')}</option>
            {[...state.settings.aircraftTypes].sort((a, b) => a.localeCompare(b)).map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('info.description')}>
          <input className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        {/* Gültigkeit: leeres Bis-Datum = UFN (until further notice) */}
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('info.validFrom')}>
            <input type="date" className={inputCls} value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
          </Field>
          <Field label={t('info.validUntil')}>
            <input type="date" className={inputCls} value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
          </Field>
        </div>
        <p className="-mt-2 text-[11.5px] leading-relaxed text-dim/80">{t('info.ufnHint')}</p>
        {/* Zielgruppen: steuern Sichtbarkeit und Bestätigungspflicht (Mehrfachauswahl) */}
        <Field label={t('info.groupsLabel')}>
          <ChipMultiSelect options={groups.map((gr) => ({ id: gr.id, label: gr.name }))} selected={groupIds} onChange={setGroupIds} />
          <p className="mt-1.5 text-[11.5px] leading-relaxed text-dim/80">{t('info.groupsHint')}</p>
        </Field>
        {/* Lese-Bestätigung: jeder Nutzer der Zielgruppen muss aktiv „gelesen“ bestätigen */}
        <label className="flex items-center gap-2 text-[13.5px]">
          <input type="checkbox" checked={requiresAck} onChange={(e) => setRequiresAck(e.target.checked)} className="accent-accent" />
          {t('info.requiresAck')}
        </label>
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
                category,
                aircraftType,
                validFrom,
                validUntil,
                requiresAck,
                groupIds,
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
  const { t } = useTranslation()
  const { state, now, currentUser, deleteInfoEntry, markInfoSeen, toggleStarInfo, starredInfoIds, acknowledgeInfo, visibleInfoEntries, can } = useStore()
  const [query, setQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  /** aufgeklappte Bestätigungsliste (Admins) */
  const [ackOpenId, setAckOpenId] = useState<string | null>(null)

  // Besuch der Seite gilt als „gesehen“ — der grüne Punkt auf der Kachel
  // erlischt. markInfoSeen ist idempotent, volle Dependencies sind sicher.
  useEffect(() => {
    markInfoSeen()
  }, [state.infoEntries, state.currentUserId, markInfoSeen])
  const [showNew, setShowNew] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)

  // Löschen nur Admin/Superadmin
  const mayEdit = can('info_manage')
  const categories = state.settings.infoCategories

  /** Zielpersonen einer Lese-Bestätigung: aktive Mitglieder der Zielgruppen */
  const ackTargets = (entry: { groupIds?: string[] }) =>
    state.users.filter((u) => u.active && infoEntryAppliesTo(entry, u.id, state.groups))

  const groupNames = (ids?: string[]) =>
    ids?.length ? ids.map((id) => state.groups.find((g) => g.id === id)?.name ?? '—').join(', ') : t('info.allGroups')

  /** Kontrollliste der Lese-Bestätigungen als CSV exportieren (Admins) */
  const exportAckList = (entry: (typeof state.infoEntries)[number]) => {
    const acks = state.infoAcks[entry.id] ?? {}
    let csv = csvRow(['Instructor Connect — Read Confirmation Control List'])
    csv += csvRow(['Entry', entry.title, 'Groups', groupNames(entry.groupIds)])
    csv += csvRow(['Exported (date/time)', formatDateTime(now()), 'Exported by', currentUser!.name])
    csv += csvRow([])
    csv += csvRow(['Name', 'Status', 'Confirmed at'])
    ackTargets(entry).forEach((u) => {
      csv += csvRow([u.name, acks[u.id] ? 'confirmed' : 'OUTSTANDING', acks[u.id] ? formatDateTime(acks[u.id]) : ''])
    })
    downloadCsv(`read-confirmations_${entry.title.replace(/[^\w-]+/g, '-').slice(0, 40)}.csv`, csv)
  }

  /**
   * Muster eines Eintrags: eindeutig, wenn alle Zielgruppen demselben
   * Aircraft Type zugeordnet sind — sonst musterübergreifend ('').
   */
  const aircraftOf = (e: { groupIds?: string[]; aircraftType?: string }): string => {
    if (e.aircraftType) return e.aircraftType
    if (!e.groupIds?.length) return ''
    const types = [...new Set(e.groupIds.map((gid) => state.groups.find((g) => g.id === gid)?.aircraftType || ''))]
    return types.length === 1 ? types[0] : ''
  }

  // Nach Muster unterteilt; innerhalb: markierte zuoberst, dann neueste zuerst
  const entries = visibleInfoEntries
    .filter((e) => (e.title + ' ' + e.description).toLowerCase().includes(query.toLowerCase()))
    .filter((e) => !categoryFilter || e.category === categoryFilter)
    .sort((a, b) => {
      const acDiff = (aircraftOf(a) || 'zzz').localeCompare(aircraftOf(b) || 'zzz')
      if (acDiff !== 0) return acDiff
      const starDiff = Number(starredInfoIds.has(b.id)) - Number(starredInfoIds.has(a.id))
      return starDiff !== 0 ? starDiff : b.createdAt - a.createdAt
    })
  // Überschriften nur, wenn es wirklich mehrere Abschnitte gibt
  const sectionCount = new Set(entries.map((e) => aircraftOf(e))).size

  const validityLabel = (e: { validFrom?: string; validUntil?: string }) => {
    const from = e.validFrom ? formatDate(e.validFrom) : null
    const until = e.validUntil ? formatDate(e.validUntil) : 'UFN'
    return from ? `${from} – ${until}` : until
  }

  const isExpired = (e: { validUntil?: string }) =>
    !!e.validUntil && new Date(`${e.validUntil}T23:59:59`).getTime() < now()

  /** Noch nicht gültig — nur Verwalter sehen solche Einträge (Vorbereitung) */
  const isScheduled = (e: { validFrom?: string }) => !infoIsPublished(e, now())

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

        {/* Kategorie-Filter */}
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          <button
            onClick={() => setCategoryFilter('')}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-[12.5px] transition ${
              categoryFilter === '' ? 'border-accent bg-accent/15 font-semibold text-accent' : 'border-line/15 text-dim'
            }`}
          >
            {t('info.allCategories')}
          </button>
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setCategoryFilter(categoryFilter === c ? '' : c)}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-[12.5px] transition ${
                categoryFilter === c ? 'border-accent bg-accent/15 font-semibold text-accent' : 'border-line/15 text-dim'
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        {entries.length === 0 && <p className="pt-6 text-center text-sm text-dim">{t('info.empty')}</p>}

        {entries.map((entry, i) => {
          const open = openId === entry.id
          const isNew = now() - entry.createdAt < NEW_MS
          const starred = starredInfoIds.has(entry.id)
          const expired = isExpired(entry)
          const scheduled = isScheduled(entry)
          const heading =
            sectionCount > 1 && (i === 0 || aircraftOf(entries[i - 1]) !== aircraftOf(entry))
              ? aircraftOf(entry) || t('admin.groupNoAircraft')
              : null
          return (
            <div key={entry.id}>
            {heading && (
              <p className="mb-1.5 mt-3 px-1 text-[12px] font-semibold uppercase tracking-wide text-dim first:mt-0">{heading}</p>
            )}
            <Card className={`p-4 ${expired ? 'opacity-60' : ''}`}>
              <div className="flex items-start gap-3">
                {/* NEW gut lesbar unter dem Icon — nicht neben dem Titel */}
                <div className="flex shrink-0 flex-col items-center gap-1.5">
                  <span className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl bg-raised text-accent">
                    {entry.type === 'pdf' ? <FileText size={19} /> : <ScrollText size={19} />}
                  </span>
                  {isNew && (
                    <span className="rounded-md bg-emerald-600 px-1.5 py-0.5 text-[10.5px] font-bold tracking-wider text-white">NEW</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start gap-2">
                    <p className="min-w-0 flex-1 text-[15px] font-semibold leading-snug">{entry.title}</p>
                    {/* Stern: persönliche Wichtig-Markierung des Nutzers */}
                    <button
                      onClick={() => toggleStarInfo(entry.id)}
                      title={t('info.star')}
                      className={`shrink-0 rounded-lg p-1 transition ${starred ? 'text-amber-300' : 'text-dim/60 hover:text-amber-300'}`}
                    >
                      <Star size={17} fill={starred ? 'currentColor' : 'none'} />
                    </button>
                  </div>
                  {entry.description && <p className="mt-0.5 text-[13px] text-dim">{entry.description}</p>}
                  {/* Bewusst ohne Erstellungsdatum und Autor in der Übersicht */}
                  <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11.5px] text-dim/80">
                    <span className="rounded bg-raised px-1.5 py-0.5 font-medium text-dim">{entry.category}</span>
                    <span className="rounded border border-line/15 px-1.5 py-0.5 text-dim">{groupNames(entry.groupIds)}</span>
                  </p>
                  <p className={`mt-1 text-[11.5px] ${expired ? 'text-danger' : 'text-dim/80'}`}>
                    {t('info.validity')}: {validityLabel(entry)}
                    {expired && ` · ${t('info.expired')}`}
                  </p>
                  {/* Für Verwalter sichtbar: der Eintrag gilt erst später und
                      ist für die Zielgruppen noch nicht sichtbar */}
                  {scheduled && (
                    <p className="mt-1 inline-flex items-center rounded-full bg-amber-500 px-2 py-0.5 text-[11px] font-semibold text-black">
                      {t('info.scheduled')}
                    </p>
                  )}

                  {/* Lese-Bestätigung: Button für Zielgruppen-Mitglieder,
                      Übersicht + Kontrolllisten-Export für Admins */}
                  {entry.requiresAck && (() => {
                    const acks = state.infoAcks[entry.id] ?? {}
                    const myAck = acks[currentUser!.id]
                    const targets = ackTargets(entry)
                    // Vor dem Gültigkeitsbeginn wird nichts bestätigt
                    const amTarget = targets.some((u) => u.id === currentUser!.id) && !isScheduled(entry)
                    const done = targets.filter((u) => acks[u.id]).length
                    return (
                      <div className="mt-2.5 space-y-1.5">
                        {myAck ? (
                          <p className="flex items-center gap-1.5 text-[12.5px] font-medium text-emerald-500">
                            <CheckCircle2 size={14} /> {t('info.ackedAt', { date: formatDateTime(myAck) })}
                          </p>
                        ) : (
                          amTarget && (
                            <button
                              onClick={() => acknowledgeInfo(entry.id)}
                              className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-[13px] font-semibold text-bg transition hover:brightness-110"
                            >
                              <CheckCircle2 size={15} /> {t('info.ackButton')}
                            </button>
                          )
                        )}
                        {mayEdit && (
                          <div>
                            <div className="flex flex-wrap items-center gap-3">
                              <button
                                onClick={() => setAckOpenId(ackOpenId === entry.id ? null : entry.id)}
                                className="flex items-center gap-1 text-[12px] text-dim hover:text-accent"
                              >
                                {t('info.ackStatus', { done, total: targets.length })}
                                <ChevronDown size={12} className={ackOpenId === entry.id ? 'rotate-180' : ''} />
                              </button>
                              <button
                                onClick={() => exportAckList(entry)}
                                className="flex items-center gap-1 text-[12px] text-dim hover:text-accent"
                              >
                                <FileDown size={12} /> {t('info.exportAck')}
                              </button>
                            </div>
                            {ackOpenId === entry.id && (
                              <ul className="mt-1.5 space-y-1 rounded-lg bg-bg/50 p-2.5 text-[12px]">
                                {targets.map((u) => (
                                  <li key={u.id} className="flex items-center justify-between gap-2">
                                    <span>{u.name}</span>
                                    {acks[u.id] ? (
                                      <span className="text-emerald-500">{formatDateTime(acks[u.id])}</span>
                                    ) : (
                                      <span className="text-danger/80">{t('info.ackMissing')}</span>
                                    )}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })()}

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
                        onClick={() => window.confirm(t('info.confirmDelete')) && deleteInfoEntry(entry.id)}
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
            </div>
          )
        })}

        <p className="pt-2 text-center text-[11.5px] text-dim/70">{t('info.permanentNote')}</p>
      </Page>
      {showNew && <NewEntryModal onClose={() => setShowNew(false)} />}
    </>
  )
}
