import { NotebookPen, Pencil, Pin, Plus, Search, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Card, CardGrid, Field, inputCls, Modal, Page, SectionHeading, TopBar } from '../components/ui'
import { toast } from '../components/Toast'
import { groupNotes, notePreview, PINNED, searchNotes } from '../notes'
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

  const geaendert = title !== (note?.title ?? '') || body !== (note?.body ?? '')

  return (
    <Modal
      title={note ? t('notes.edit') : t('notes.new')}
      onClose={onClose}
      confirmDiscard={geaendert ? t('common.discardConfirm') : undefined}
    >
      <div className="space-y-stack">
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
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            disabled={!title.trim()}
            onClick={() => {
              saveNote({ id: note?.id, title, body })
              toast(t('toast.noteSaved'))
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
  /** null = Dialog zu, undefined = neue Notiz, Note = diese aendern */
  const [editor, setEditor] = useState<Note | undefined | null>(null)

  const dateLabel = (ts: number) =>
    new Date(ts).toLocaleDateString(i18n.language === 'de' ? 'de-AT' : 'en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })

  const gefiltert = useMemo(() => searchNotes(visibleNotes, query), [visibleNotes, query])
  const gruppen = useMemo(() => groupNotes(gefiltert), [gefiltert])

  return (
    <>
      <TopBar
        title={t('notes.heading')}
        back="/"
        right={
          <button
            onClick={() => setEditor(undefined)}
            className="min-h-11 flex items-center gap-1 rounded-full bg-accent px-3 py-1.5 text-small font-semibold text-bg hover:brightness-110"
          >
            <Plus size={15} /> {t('notes.new')}
          </button>
        }
      />
      <Page className="space-y-section">
        {/* Was eine Notiz ist und was sie nicht ist — einmal, oben, sichtbar. */}
        <p className="rounded-xl border border-line/10 bg-surface/60 p-3.5 text-small leading-relaxed text-dim">
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

        {/* Suchergebnis ansagen — sichtbar aendert sich nur die Liste. */}
        <p role="status" className="sr-only">
          {t('notes.resultCount', { shown: gefiltert.length, total: visibleNotes.length })}
        </p>

        {/* Leere Liste wie ueberall sonst in der App: ein Satz, sonst nichts.
            Ein zweiter „Neue Notiz"-Knopf mitten auf der Seite stand in
            Konkurrenz zu dem in der Kopfzeile — derselbe Vorgang darf nicht
            zweimal danebenstehen. */}
        {visibleNotes.length === 0 && <p className="pt-6 text-center text-body text-dim">{t('notes.empty')}</p>}
        {visibleNotes.length > 0 && gefiltert.length === 0 && (
          <p className="pt-6 text-center text-body text-dim">{t('notes.noMatch')}</p>
        )}

        {gruppen.map(({ key, notes }) => (
          <section key={key} className="space-y-stack">
            {/* Ueberschrift nur, wenn es auch etwas zu unterscheiden gibt:
                Eine einzelne Gruppe braucht keinen Titel ueber der ganzen
                Liste — das waere eine Beschriftung ohne Gegenstueck. */}
            {gruppen.length > 1 && (
              <SectionHeading icon={key === PINNED ? <Pin size={13} className="shrink-0 text-accent" /> : undefined}>
                {t(key === PINNED ? 'notes.pinned' : 'notes.others')}
              </SectionHeading>
            )}
            <CardGrid>
            {notes.map((n) => (
              <Card key={n.id} className="p-4">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-raised text-accent">
                    <NotebookPen size={19} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-lead font-semibold leading-snug">{n.title}</p>
                    {n.body && <p className="mt-1 text-small leading-relaxed text-dim">{notePreview(n.body)}</p>}
                    <p className="mt-1.5 flex flex-wrap items-baseline gap-x-1.5 text-micro text-dim">
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
                    {/* Das Symbol zeigt den ZUSTAND, nicht die Aktion: In der
                        Gruppe „Angeheftet" stand ein durchgestrichener Pin —
                        gemeldet als Widerspruch, und zu Recht. Angeheftet ist
                        jetzt ein ausgefuellter Pin in Akzentfarbe, nicht
                        angeheftet ein leerer in Grau. Was ein Tippen bewirkt,
                        sagen `aria-pressed` und die Beschriftung. */}
                    <Pin size={17} fill={n.pinned ? 'currentColor' : 'none'} />
                  </button>
                </div>
                {/* auf die Textspalte ausgerichtet: Symbol (40) + Abstand (12) */}
                <div className="mt-2.5 flex flex-wrap gap-2 pl-[52px]">
                  <button
                    onClick={() => setEditor(n)}
                    className="min-h-11 flex items-center gap-1.5 rounded-lg border border-line/15 px-3 py-1.5 text-small transition hover:border-accent/50 hover:text-accent"
                  >
                    <Pencil size={14} /> {t('notes.edit')}
                  </button>
                  <button
                    onClick={() => {
                      // Eine Notiz ist schnell geschrieben und ebenso schnell
                      // weg — deshalb dieselbe Rueckfrage wie ueberall sonst.
                      if (window.confirm(t('notes.deleteConfirm', { title: n.title }))) {
                          deleteNote(n.id)
                          toast(t('toast.noteDeleted'))
                        }
                    }}
                    className="min-h-11 flex items-center gap-1.5 rounded-lg border border-danger/30 px-3 py-1.5 text-small text-danger transition hover:bg-danger/10"
                  >
                    <Trash2 size={14} /> {t('common.delete')}
                  </button>
                </div>
              </Card>
            ))}
            </CardGrid>
          </section>
        ))}
      </Page>
      {editor !== null && <NoteEditor note={editor} onClose={() => setEditor(null)} />}
    </>
  )
}
