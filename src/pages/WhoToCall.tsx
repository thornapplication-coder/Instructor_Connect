import { Mail, Pencil, Phone, Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Avatar, Button, Card, Field, inputCls, Modal, Page, SectionHeading, TopBar } from '../components/ui'
import { useStore } from '../store'
import type { Contact } from '../types'

function ContactModal({ contact, onClose }: { contact: Partial<Contact> | null; onClose: () => void }) {
  const { t } = useTranslation()
  const { saveContact } = useStore()
  const [form, setForm] = useState({
    department: contact?.department ?? '',
    position: contact?.position ?? '',
    name: contact?.name ?? '',
    phone: contact?.phone ?? '',
    email: contact?.email ?? '',
  })
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value })
  const valid = form.department.trim() && form.name.trim()

  return (
    <Modal
      title={contact?.id ? t('common.edit') : t('contacts.newContact')}
      onClose={onClose}
      // Hintergrundklick und Escape verwarfen bisher kommentarlos
      confirmDiscard={Object.values(form).some((v) => v.trim()) ? t('common.discardConfirm') : undefined}
    >
      <div className="space-y-3.5">
        <Field label={t('contacts.department')}>
          <input className={inputCls} value={form.department} onChange={set('department')} autoFocus />
        </Field>
        <Field label={t('contacts.position')}>
          <input className={inputCls} value={form.position} onChange={set('position')} />
        </Field>
        <Field label={t('contacts.name')}>
          <input className={inputCls} value={form.name} onChange={set('name')} />
        </Field>
        <Field label={t('contacts.phone')}>
          <input className={inputCls} value={form.phone} onChange={set('phone')} />
        </Field>
        <Field label={t('contacts.email')}>
          <input className={inputCls} value={form.email} onChange={set('email')} />
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            disabled={!valid}
            onClick={() => {
              saveContact({ id: contact?.id, ...form })
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

export function WhoToCall() {
  const { t } = useTranslation()
  const { state, currentUser, deleteContact, markContactsSeen, can } = useStore()
  const [filter, setFilter] = useState('')
  const [query, setQuery] = useState('')

  // Besuch der Seite gilt als „gesehen“ — der grüne Punkt auf der Kachel
  // erlischt. markContactsSeen ist idempotent, volle Dependencies sind sicher.
  useEffect(() => {
    markContactsSeen()
  }, [state.contactsChangedAt, state.currentUserId, markContactsSeen])
  const [editing, setEditing] = useState<Partial<Contact> | null | undefined>(undefined)

  // Superadmin und Admins pflegen das Verzeichnis; einzelne Mitglieder
  // können zusätzlich über das canEditDirectory-Flag freigeschaltet werden.
  const mayEdit = can('contacts_manage')

  const departments = [...new Set(state.contacts.map((c) => c.department))].sort((a, b) => a.localeCompare(b))
  const needle = query.trim().toLowerCase()
  const visible = state.contacts
    .filter((c) => !filter || c.department === filter)
    // Ohne Suchfeld war ein Kontakt in einem langen Verzeichnis nur durch
    // Scrollen zu finden.
    .filter((c) => !needle || `${c.name} ${c.position} ${c.department} ${c.email} ${c.phone}`.toLowerCase().includes(needle))
    .sort((a, b) => a.department.localeCompare(b.department) || a.name.localeCompare(b.name))
  const grouped = departments
    .filter((d) => !filter || d === filter)
    .map((d) => ({ department: d, contacts: visible.filter((c) => c.department === d) }))

  return (
    <>
      {/* Modulname bleibt laut Spez. in beiden Sprachen Englisch */}
      <TopBar
        title="Who to call"
        back="/"
        right={
          mayEdit ? (
            <button
              onClick={() => setEditing(null)}
              className="min-h-11 flex items-center gap-1 rounded-full bg-accent px-3 py-1.5 text-[13px] font-semibold text-bg hover:brightness-110"
            >
              <Plus size={15} /> {t('contacts.newContact')}
            </button>
          ) : undefined
        }
      />
      <Page className="space-y-4">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('contacts.search')}
          aria-label={t('contacts.search')}
          className={inputCls}
        />
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setFilter('')}
            className={`min-h-11 shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] transition ${
              !filter ? 'border-accent bg-accent/15 font-semibold text-accent' : 'border-line/15 text-dim'
            }`}
          >
            {t('contacts.allDepartments')}
          </button>
          {departments.map((d) => (
            <button
              key={d}
              onClick={() => setFilter(filter === d ? '' : d)}
              className={`min-h-11 shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] transition ${
                filter === d ? 'border-accent bg-accent/15 font-semibold text-accent' : 'border-line/15 text-dim'
              }`}
            >
              {d}
            </button>
          ))}
        </div>

        {/* Leerer Zustand: die Seite sah sonst aus, als würde sie noch laden */}
        {state.contacts.length === 0 && <p className="pt-6 text-center text-sm text-dim">{t('contacts.empty')}</p>}
        {state.contacts.length > 0 && visible.length === 0 && (
          <p className="pt-6 text-center text-sm text-dim">{t('contacts.noMatch')}</p>
        )}

        {grouped.map(({ department, contacts }) => (
          <section key={department}>
            <SectionHeading className="mb-2.5">{department}</SectionHeading>
            <div className="space-y-3">
              {contacts.map((c) => (
                <Card key={c.id} className="p-4">
                  <div className="flex items-center gap-3">
                    <Avatar name={c.name} size={42} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-semibold">{c.name}</p>
                      <p className="truncate text-[13px] text-dim">{c.position}</p>
                    </div>
                    {/* Beide Aktionen mit 44px Trefferfläche und Abstand —
                        Löschen fragt nach, es gibt kein Rückgängig. */}
                    {mayEdit && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => setEditing(c)}
                          aria-label={t('contacts.editContact')}
                          title={t('contacts.editContact')}
                          className="flex h-11 w-11 items-center justify-center rounded-full text-dim hover:bg-line/5 hover:text-accent"
                        >
                          <Pencil size={17} />
                        </button>
                        <button
                          onClick={() => {
                            if (window.confirm(t('contacts.deleteConfirm', { name: c.name }))) deleteContact(c.id)
                          }}
                          aria-label={t('contacts.deleteContact')}
                          title={t('contacts.deleteContact')}
                          className="flex h-11 w-11 items-center justify-center rounded-full text-dim hover:bg-line/5 hover:text-danger"
                        >
                          <Trash2 size={17} />
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <a
                      href={`tel:${c.phone.replace(/\s+/g, '')}`}
                      className="min-h-11 flex items-center justify-center gap-2 rounded-xl border border-line/15 py-2.5 text-[13.5px] font-medium transition hover:border-accent/50 hover:text-accent"
                    >
                      <Phone size={15} /> {t('contacts.call')}
                    </a>
                    <a
                      href={`mailto:${c.email}`}
                      className="min-h-11 flex items-center justify-center gap-2 rounded-xl border border-line/15 py-2.5 text-[13.5px] font-medium transition hover:border-accent/50 hover:text-accent"
                    >
                      <Mail size={15} /> {t('contacts.mail')}
                    </a>
                  </div>
                  <p className="mt-2 text-center text-[12px] text-dim">
                    {c.phone} · {c.email}
                  </p>
                </Card>
              ))}
            </div>
          </section>
        ))}
      </Page>
      {editing !== undefined && <ContactModal contact={editing} onClose={() => setEditing(undefined)} />}
    </>
  )
}
