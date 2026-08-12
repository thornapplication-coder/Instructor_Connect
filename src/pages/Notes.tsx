import { NotebookPen, Pencil, Pin, PinOff, Plane, Plus, Search, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Card, Field, inputCls, Modal, Page, SectionHeading, selectCls, TopBar } from '../components/ui'
import { aircraftTypesOf, groupNotes, notePreview, PINNED, searchNotes } from '../notes'
import { useStore } from '../store'
import type { Note } from '../types'

/**
 * Notizen — die persoenliche Merkliste.
 *
 * Aufbau wie die uebrigen Listen der App: Suchfeld, Filterleiste nach Muster,
 * darunter die nach Gruppen gegliederten Karten. Damit muss niemand ein
 * zweites Bedienmuster lernen.
 *
 * Zwei Dinge sind hier anders und stehen deshalb auch in der Oberflaeche:
 * Die Notizen sind privat, und sie sind kein Nachweis. Beides waere sonst
 * eine stille Annahme — und stille Annahmen sind in einer Ablage mit
 * Nachweispflicht genau das Falsche.
 */

/** Anlegen und Aendern teilen sich denselben Dialog. */
function NoteEditor({ note, onClose }: { note?: Note; onClose: () => void }) {
  const { t } = useTranslation()
  const { state, saveNote } = useStore()
  const [title, setTitle] = useState(note?.title ?? '')
  const [body, setBody] = useState(note?.body ?? '')
  const [aircraftType, setAircraftType] = useState(note?.aircraftType ?? '')

  const geaendert =
    title !== (note?.title ?? '') || body !== (note?.body ?? '') || aircraftType !== (note?.aircraftType ?? '')

  return (
    <Modal
      title={note ? t('notes.edit') : t('notes.new')}
      onClose={onClose}
      confirmDiscard={geaendert ? t('common.discardConfirm') : undefined}
    >
      <div className="space-y-3.5">
        <Field label={`${t('notes.title')} *`}>
          <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} autoFocus maxLength={120} />
        </Field>
        <Field label={t('notes.body')}>
          {/* Mehrzeilig und mitwachsend: Eine Notiz ist selten ein Satz. */}
          <textarea
            className={`${inputCls} min-h-32 resize-y leading-relaxed`}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={6}
          />
        </Field>
        {/* Musterbezug: erste Zelle leer, Rest alphabetisch — wie ueberall (#16). */}
        <Field label={t('notes.aircraftType')}>
          <select value={aircraftType} onChange={(e) => setAircraftType(e.target.value)} className={selectCls}>
            <option value="">{t('notes.general')}</option>
            {[...state.settings.aircraftTypes].sort((a, b) => a.localeCompare(b)).map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            disabled={!title.trim()}
            onClick={() => {
              saveNote({ id: note?.id, title, body, aircraftType })
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

export function Notes() {
  const { t, i18n } = useTranslation()
  const { visibleNotes, deleteNote, toggleNotePin } = useStore()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('')
  /** null = Dialog zu, undefined = neue Notiz, Note = diese aendern */
  const [editor, setEditor] = useState<Note | undefined | null>(null)

  const dateLabel = (ts: number) =>
    new Date(ts).toLocaleDateString(i18n.language === 'de' ? 'de-AT' : 'en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })

  const musterTypen = useMemo(() => aircraftTypesOf(visibleNotes), [visibleNotes])
  // Ein Filter auf ein Muster, zu dem es keine Notiz (mehr) gibt, wird
  // ignoriert — sonst bliebe die Liste nach dem Loeschen der letzten Notiz
  // dieses Musters ohne erkennbaren Grund leer.
  const activeFilter = musterTypen.includes(filter) ? filter : ''
  const gefiltert = useMemo(
    () => searchNotes(visibleNotes, query).filter((n) => !activeFilter || (n.aircraftType ?? '') === activeFilter),
    [visibleNotes, query, activeFilter],
  )
  const gruppen = useMemo(() => groupNotes(gefiltert), [gefiltert])
  const gruppenTitel = (key: string) =>
    key === PINNED ? t('notes.pinned') : key === '' ? t('notes.general') : key

  return (
    <>
      <TopBar
        title={t('notes.title_plural')}
        back="/"
        right={
          <button
            onClick={() => setEditor(undefined)}
            className="min-h-11 flex items-center gap-1 rounded-full bg-accent px-3 py-1.5 text-[13px] font-semibold text-bg hover:brightness-110"
          >
            <Plus size={15} /> {t('notes.new')}
          </button>
        }
      />
      <Page className="space-y-4">
        {/* Was eine Notiz ist und was sie nicht ist — einmal, oben, sichtbar. */}
        <p className="rounded-xl border border-line/10 bg-surface/60 p-3.5 text-[13px] leading-relaxed text-dim">
          {t('notes.intro')}
        </p>

        <label className="relative block">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-dim" />
          <span className="sr-only">{t('notes.search')}</span>
          <input
            className={`${inputCls} pl-9`}
            placeholder={t('notes.search')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>

        {musterTypen.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            <button
              onClick={() => setFilter('')}
              className={`min-h-11 shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] transition ${
                !activeFilter ? 'border-accent bg-accent/15 font-semibold text-accent' : 'border-line/15 text-dim'
              }`}
            >
              {t('notes.allTypes')}
            </button>
            {musterTypen.map((a) => (
              <button
                key={a}
                onClick={() => setFilter(activeFilter === a ? '' : a)}
                className={`min-h-11 flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] transition ${
                  activeFilter === a ? 'border-accent bg-accent/15 font-semibold text-accent' : 'border-line/15 text-dim'
                }`}
              >
                <Plane size={13} /> {a}
              </button>
            ))}
          </div>
        )}

        {/* Suchergebnis ansagen — sichtbar aendert sich nur die Liste. */}
        <p role="status" className="sr-only">
          {t('notes.resultCount', { shown: gefiltert.length, total: visibleNotes.length })}
        </p>

        {visibleNotes.length === 0 && (
          <div className="flex flex-col items-center gap-3 pt-10 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-raised text-accent">
              <NotebookPen size={26} />
            </span>
            <p className="text-sm text-dim">{t('notes.empty')}</p>
            <Button onClick={() => setEditor(undefined)}>
              <Plus size={15} /> {t('notes.new')}
            </Button>
          </div>
        )}
        {visibleNotes.length > 0 && gefiltert.length === 0 && (
          <p className="pt-6 text-center text-sm text-dim">{t('notes.noMatch')}</p>
        )}

        {gruppen.map(({ key, notes }) => (
          <section key={key || 'general'} className="space-y-3">
            <SectionHeading icon={key === PINNED ? <Pin size={13} className="shrink-0 text-accent" /> : undefined}>
              {gruppenTitel(key)}
            </SectionHeading>
            {notes.map((n) => (
              <Card key={n.id} className="p-4">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-raised text-accent">
                    <NotebookPen size={19} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-semibold leading-snug">{n.title}</p>
                    {n.body && <p className="mt-1 text-[13.5px] leading-relaxed text-dim">{notePreview(n.body)}</p>}
                    <p className="mt-1.5 flex flex-wrap items-baseline gap-x-1.5 text-[11.5px] text-dim">
                      {n.aircraftType && <span className="shrink-0 font-medium">{n.aircraftType} ·</span>}
                      {/* Geaendert steht vor Angelegt: Bei einer Merkliste
                          zaehlt, wann man zuletzt drangesessen ist. */}
                      <span className="shrink-0">{t('notes.updatedAt', { date: dateLabel(n.updatedAt) })}</span>
                    </p>
                  </div>
                  {/* Nur das Anheften steht oben rechts: Es ist ein
                      Umschalter, kein Vorgang. Bearbeiten und Loeschen liegen
                      als beschriftete Knoepfe darunter — drei 44er-Knoepfe
                      neben dem Text drueckten den Titel am Handy auf drei
                      Zeilen, und was ein Symbol bedeutet, muss man ohnehin
                      raten. Dieselbe Aufteilung wie bei den Lesson Plans. */}
                  <button
                    onClick={() => toggleNotePin(n.id)}
                    aria-pressed={n.pinned}
                    title={n.pinned ? t('notes.unpin') : t('notes.pin')}
                    aria-label={n.pinned ? t('notes.unpin') : t('notes.pin')}
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg transition hover:bg-accent/10 ${
                      n.pinned ? 'text-accent' : 'text-dim hover:text-accent'
                    }`}
                  >
                    {n.pinned ? <PinOff size={17} /> : <Pin size={17} />}
                  </button>
                </div>
                {/* auf die Textspalte ausgerichtet: Symbol (40) + Abstand (12) */}
                <div className="mt-2.5 flex flex-wrap gap-2 pl-[52px]">
                  <button
                    onClick={() => setEditor(n)}
                    className="min-h-11 flex items-center gap-1.5 rounded-lg border border-line/15 px-3 py-1.5 text-[13px] transition hover:border-accent/50 hover:text-accent"
                  >
                    <Pencil size={14} /> {t('notes.edit')}
                  </button>
                  <button
                    onClick={() => {
                      // Eine Notiz ist schnell geschrieben und ebenso schnell
                      // weg — deshalb dieselbe Rueckfrage wie ueberall sonst.
                      if (window.confirm(t('notes.deleteConfirm', { title: n.title }))) deleteNote(n.id)
                    }}
                    className="min-h-11 flex items-center gap-1.5 rounded-lg border border-danger/30 px-3 py-1.5 text-[13px] text-danger transition hover:bg-danger/10"
                  >
                    <Trash2 size={14} /> {t('common.delete')}
                  </button>
                </div>
              </Card>
            ))}
          </section>
        ))}
      </Page>
      {editor !== null && <NoteEditor note={editor} onClose={() => setEditor(null)} />}
    </>
  )
}
