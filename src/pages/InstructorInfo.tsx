import { CheckCircle2, ChevronDown, Download, Eye, FileDown, FileText, Plus, ScrollText, Search, Star, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge, Button, Card, Field, inputCls, Modal, Page, SectionHeading, selectCls, TopBar } from '../components/ui'
import { csvRow, downloadCsv } from '../csv'
import { infoEntryAppliesTo, infoIsExpired, infoIsPublished, infoPublishedAt, useStore, userMayModule } from '../store'
import type { InfoEntry } from '../types'
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
  const [aircraftType, setAircraftType] = useState('')
  const groups = [...state.groups].sort((a, b) => a.name.localeCompare(b.name))

  const valid = title.trim() && category && (type === 'pdf' || body.trim())

  return (
    <Modal
      title={t('info.newEntry')}
      onClose={onClose}
      confirmDiscard={title.trim() || body.trim() || category ? t('common.discardConfirm') : undefined}
    >
      <div className="space-y-section">
        <Field label={t('info.typeLabel')} group>
          <div className="flex gap-2">
            {(['text', 'pdf'] as const).map((tp) => (
              <button
                key={tp}
                aria-pressed={type === tp}
                onClick={() => setType(tp)}
                className={`min-h-11 flex-1 rounded-xl border px-3 py-2.5 text-body transition ${
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
            className={selectCls}
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
            className={selectCls}
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
        <p className="-mt-2 text-micro leading-relaxed text-dim">{t('info.ufnHint')}</p>
        {/* Lese-Bestätigung: jeder Nutzer des Moduls muss aktiv „gelesen“ bestätigen */}
        <label className="flex items-center gap-2 text-small">
          <input type="checkbox" checked={requiresAck} onChange={(e) => setRequiresAck(e.target.checked)} className="h-6 w-6 shrink-0 accent-accent" />
          {t('info.requiresAck')}
        </label>
        {type === 'text' ? (
          <Field label={t('info.body')}>
            <textarea className={`${inputCls} min-h-28`} value={body} onChange={(e) => setBody(e.target.value)} />
          </Field>
        ) : (
          <div className="rounded-xl border border-dashed border-line/20 p-4 text-center text-small text-dim">
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
  // Alphabetisch wie das Auswahlfeld im Anlegen-Dialog — die Chips folgten
  // bisher der internen Reihenfolge der Einstellungen.
  const categories = [...state.settings.infoCategories].sort((a, b) => a.localeCompare(b))

  /** Zielpersonen einer Lese-Bestätigung: aktive Mitglieder der Zielgruppen */
  // Bestätigen kann nur, wer die Instructor Info auch erreicht — ein Training
  // Admin ohne Zugang zählte sonst in jeder Quote als dauerhaft säumig.
  const ackTargets = (entry: (typeof state.infoEntries)[number]) =>
    state.users
      .filter((u) => u.active && userMayModule(state.settings, u, 'info') && infoEntryAppliesTo(entry, u.id, state.groups))
      // Alphabetisch — die interne Reihenfolge war für eine Kontrollliste
      // nicht nachvollziehbar.
      .sort((a, b) => a.name.localeCompare(b.name))

  /** Kontrollliste der Lese-Bestätigungen als CSV exportieren (Admins) */
  const exportAckList = (entry: (typeof state.infoEntries)[number]) => {
    const acks = state.infoAcks[entry.id] ?? {}
    let csv = csvRow(['Instructor Connect — Read Confirmation Control List'])
    csv += csvRow(['Entry', entry.title])
    csv += csvRow(['Exported (date/time)', formatDateTime(now()), 'Exported by', currentUser!.name])
    csv += csvRow([])
    csv += csvRow(['Name', 'Status', 'Confirmed at'])
    ackTargets(entry).forEach((u) => {
      csv += csvRow([u.name, acks[u.id] ? 'confirmed' : 'PENDING', acks[u.id] ? formatDateTime(acks[u.id]) : ''])
    })
    downloadCsv(`read-confirmations_${entry.title.replace(/[^\w-]+/g, '-').slice(0, 40)}.csv`, csv)
  }

  /**
   * Muster eines Eintrags: eindeutig, wenn alle Zielgruppen demselben
   * Aircraft Type zugeordnet sind — sonst musterübergreifend ('').
   */
  const aircraftOf = (e: { aircraftType?: string }): string => e.aircraftType ?? ''

  // Nach Muster unterteilt; innerhalb: markierte zuoberst, dann neueste zuerst
  const entries = visibleInfoEntries
    // Suche greift auch in den Text und die Kategorie — Titel und
    // Beschreibung allein ließen den Inhalt unauffindbar.
    .filter((e) => [e.title, e.description, e.body ?? '', e.category, e.fileName ?? ''].join(' ').toLowerCase().includes(query.toLowerCase()))
    .filter((e) => !categoryFilter || e.category === categoryFilter)
    .sort((a, b) => {
      /* Offene Kenntnisnahmen ganz nach oben — vor Muster und Stern. Sie sind
         die einzige Pflicht des Moduls und konnten bisher unter markierten
         Eintraegen und hinter dem Musterabschnitt liegen. */
      const offen = (e: InfoEntry) => (e.requiresAck && !state.infoAcks[e.id]?.[currentUser!.id] ? 0 : 1)
      const ackDiff = offen(a) - offen(b)
      if (ackDiff !== 0) return ackDiff
      const acDiff = (aircraftOf(a) || 'zzz').localeCompare(aircraftOf(b) || 'zzz')
      if (acDiff !== 0) return acDiff
      const starDiff = Number(starredInfoIds.has(b.id)) - Number(starredInfoIds.has(a.id))
      return starDiff !== 0 ? starDiff : b.createdAt - a.createdAt
    })
  // Überschriften nur, wenn es wirklich mehrere Abschnitte gibt
  const sectionCount = new Set(entries.map((e) => aircraftOf(e))).size

  /**
   * Beschriftung der Gültigkeit. „Valid: 17.08.2026" war nicht von einem
   * Beginn zu unterscheiden — deshalb wird die fehlende Seite benannt
   * statt weggelassen.
   */
  const validityLabel = (e: { validFrom?: string; validUntil?: string }) => {
    const from = e.validFrom ? formatDate(e.validFrom) : null
    const until = e.validUntil ? formatDate(e.validUntil) : 'UFN'
    if (from) return `${from} – ${until}`
    return `${t('info.sinceRelease')} – ${until}`
  }

  const isExpired = (e: { validUntil?: string }) => infoIsExpired(e, now())

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
              className="min-h-11 flex items-center gap-1 rounded-full bg-accent px-3 py-1.5 text-small font-semibold text-bg hover:brightness-110"
            >
              <Plus size={15} /> {t('info.newEntry')}
            </button>
          ) : undefined
        }
      />
      <Page className="space-y-stack">
        <div className="relative">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-dim" />
          <input
            value={query}
            aria-label={t('info.searchPlaceholder')}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('info.searchPlaceholder')}
            className={`${inputCls} pl-10`}
          />
        </div>

        {/* Kategorie-Filter */}
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          <button
            onClick={() => setCategoryFilter('')}
            className={`min-h-11 shrink-0 rounded-full border px-4 py-1.5 text-micro transition ${
              categoryFilter === '' ? 'border-accent bg-accent/15 font-semibold text-ink' : 'border-line/15 text-dim'
            }`}
          >
            {t('info.allCategories')}
          </button>
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setCategoryFilter(categoryFilter === c ? '' : c)}
              className={`min-h-11 shrink-0 rounded-full border px-4 py-1.5 text-micro transition ${
                categoryFilter === c ? 'border-accent bg-accent/15 font-semibold text-ink' : 'border-line/15 text-dim'
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        {/* „Keine Eintraege gefunden" erschien auch, wenn nur die Suche oder der
            Kategoriefilter alles verdeckte — der Nutzer glaubte, sein Bestand
            sei weg. Muster aus Who-to-call und Notes. */}
        {entries.length === 0 &&
          (query.trim() || categoryFilter ? (
            <div className="space-y-stack pt-6 text-center">
              <p className="text-body text-dim">{t('info.noMatch')}</p>
              <button
                onClick={() => {
                  setQuery('')
                  setCategoryFilter('')
                }}
                className="min-h-11 rounded-xl border border-line/15 px-4 text-small transition hover:border-accent/50 hover:text-accent"
              >
                {t('info.showAll')}
              </button>
            </div>
          ) : (
            <p className="pt-6 text-center text-body text-dim">{t('info.empty')}</p>
          ))}

        {entries.map((entry, i) => {
          const open = openId === entry.id
          // „Neu" zählt ab Veröffentlichung, nicht ab Erstellung: ein
          // vorbereiteter Eintrag ging sonst ohne Markierung online.
          const isNew = now() - infoPublishedAt(entry) < NEW_MS
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
              <SectionHeading className="mb-2 mt-4 px-1 first:mt-0">{heading}</SectionHeading>
            )}
            <Card className={`p-3 ${expired ? 'opacity-60' : ''}`}>
              <div className="flex items-start gap-2.5">
                {/* NEW gut lesbar unter dem Icon — nicht neben dem Titel */}
                <div className="flex shrink-0 flex-col items-center gap-1.5">
                  <span className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl bg-raised text-accent">
                    {entry.type === 'pdf' ? <FileText size={19} /> : <ScrollText size={19} />}
                  </span>
                  {isNew && (
                    <span className="rounded-md bg-emerald-700 px-1.5 py-0.5 text-micro font-bold tracking-wider text-white">NEW</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start gap-2">
                    <p className="min-w-0 flex-1 text-lead font-semibold leading-snug">{entry.title}</p>
                    {/* Stern: persönliche Wichtig-Markierung des Nutzers */}
                    <button
                      onClick={() => toggleStarInfo(entry.id)}
                      title={t('info.star')}
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg transition ${starred ? 'text-wait' : 'text-dim hover:text-wait'}`}
                    >
                      <Star size={17} fill={starred ? 'currentColor' : 'none'} />
                    </button>
                  </div>
                  {entry.description && <p className="mt-0.5 text-small text-dim">{entry.description}</p>}
                  {/* Bewusst ohne Erstellungsdatum und Autor in der Übersicht */}
                  <p className="mt-1 flex flex-wrap items-center gap-1.5 text-micro text-dim">
                    <span className="rounded bg-raised px-1.5 py-0.5 font-medium text-dim">{entry.category}</span>
                  </p>
                  <p className={`mt-1 text-micro ${expired ? 'text-danger' : 'text-dim'}`}>
                    {t('info.validity')}: {validityLabel(entry)}
                    {expired && ` · ${t('info.expired')}`}
                  </p>
                  {/* Für Verwalter sichtbar: der Eintrag gilt erst später und
                      ist für die Zielgruppen noch nicht sichtbar */}
                  {scheduled && (
                    <p className="mt-1">
                      <Badge tone="wait" strong>{t('info.scheduled')}</Badge>
                    </p>
                  )}

                  {/* Lese-Bestätigung: Button für Zielgruppen-Mitglieder,
                      Übersicht + Kontrolllisten-Export für Admins */}
                  {entry.requiresAck && (() => {
                    const acks = state.infoAcks[entry.id] ?? {}
                    const myAck = acks[currentUser!.id]
                    const targets = ackTargets(entry)
                    // Vor dem Gültigkeitsbeginn und nach dem Gültigkeitsende
                    // wird nichts bestätigt — ein überholtes Dokument darf
                    // nicht als „gelesen" in die Kontrollliste wandern.
                    const amTarget =
                      targets.some((u) => u.id === currentUser!.id) && !isScheduled(entry) && !infoIsExpired(entry, now())
                    const done = targets.filter((u) => acks[u.id]).length
                    return (
                      <div className="mt-2 space-y-tight">
                        {myAck ? (
                          <p className="flex items-center gap-1.5 text-micro font-medium text-ok">
                            <CheckCircle2 size={14} /> {t('info.ackedAt', { date: formatDateTime(myAck) })}
                          </p>
                        ) : (
                          amTarget && (
                            <button
                              onClick={() => acknowledgeInfo(entry.id)}
                              className="min-h-11 flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-small font-semibold text-bg transition hover:brightness-110"
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
                                className="flex min-h-11 items-center gap-1 text-micro text-dim hover:text-accent"
                              >
                                {t('info.ackStatus', { done, total: targets.length })}
                                <ChevronDown size={12} className={ackOpenId === entry.id ? 'rotate-180' : ''} />
                              </button>
                              <button
                                onClick={() => exportAckList(entry)}
                                className="flex min-h-11 items-center gap-1 text-micro text-dim hover:text-accent"
                              >
                                <FileDown size={12} /> {t('info.exportAck')}
                              </button>
                            </div>
                            {ackOpenId === entry.id && (
                              <ul className="mt-1.5 space-y-tight rounded-lg bg-bg/50 p-2.5 text-micro">
                                {targets.map((u) => (
                                  <li key={u.id} className="flex items-center justify-between gap-2">
                                    <span>{u.name}</span>
                                    {acks[u.id] ? (
                                      <span className="text-ok">{formatDateTime(acks[u.id])}</span>
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

                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {entry.type === 'pdf' ? (
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
                          download={entry.fileName}
                          className="min-h-11 flex items-center gap-1.5 rounded-lg border border-line/15 px-3 py-1.5 text-small hover:border-accent/50 hover:text-accent"
                        >
                          <Download size={14} /> {t('info.download')}
                        </a>
                      </>
                    ) : (
                      <button
                        onClick={() => setOpenId(open ? null : entry.id)}
                        className="min-h-11 flex items-center gap-1.5 rounded-lg border border-line/15 px-3 py-1.5 text-small hover:border-accent/50 hover:text-accent"
                      >
                        <Eye size={14} /> {open ? t('common.close') : t('info.view')}
                      </button>
                    )}
                    {mayEdit && (
                      <button
                        onClick={() => window.confirm(t('info.confirmDelete')) && deleteInfoEntry(entry.id)}
                        className="min-h-11 flex items-center gap-1.5 rounded-lg border border-danger/30 px-3 py-1.5 text-small text-danger hover:bg-danger/10"
                      >
                        <Trash2 size={14} /> {t('common.delete')}
                      </button>
                    )}
                  </div>
                  {open && entry.body && (
                    <p className="mt-3 whitespace-pre-wrap rounded-xl bg-bg/50 p-3.5 text-small leading-relaxed">{entry.body}</p>
                  )}
                </div>
              </div>
            </Card>
            </div>
          )
        })}

        <p className="pt-2 text-center text-micro text-dim">{t('info.permanentNote')}</p>
      </Page>
      {showNew && <NewEntryModal onClose={() => setShowNew(false)} />}
    </>
  )
}
