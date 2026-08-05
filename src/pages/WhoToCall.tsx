import { Mail, Pencil, Phone, Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Avatar, Button, Card, Field, inputCls, Modal, Page, TopBar } from '../components/ui'
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
    <Modal title={contact?.id ? t('common.edit') : t('contacts.newContact')} onClose={onClose}>
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
  const { state, currentUser, deleteContact, markContactsSeen } = useStore()
  const [filter, setFilter] = useState('')

  // Besuch der Seite gilt als „gesehen“ — der grüne Punkt auf der Kachel
  // erlischt. markContactsSeen ist idempotent, volle Dependencies sind sicher.
  useEffect(() => {
    markContactsSeen()
  }, [state.contactsChangedAt, state.currentUserId, markContactsSeen])
  const [editing, setEditing] = useState<Partial<Contact> | null | undefined>(undefined)

  // Superadmin und Admins pflegen das Verzeichnis; einzelne Mitglieder
  // können zusätzlich über das canEditDirectory-Flag freigeschaltet werden.
  const mayEdit = currentUser!.role !== 'member' || currentUser!.canEditDirectory

  const departments = [...new Set(state.contacts.map((c) => c.department))].sort((a, b) => a.localeCompare(b))
  const visible = state.contacts
    .filter((c) => !filter || c.department === filter)
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
              className="flex items-center gap-1 rounded-full bg-accent px-3 py-1.5 text-[13px] font-semibold text-bg hover:brightness-110"
            >
              <Plus size={15} /> {t('contacts.newContact')}
            </button>
          ) : undefined
        }
      />
      <Page className="space-y-4">
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setFilter('')}
            className={`shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] transition ${
              !filter ? 'border-accent bg-accent/15 font-semibold text-accent' : 'border-line/15 text-dim'
            }`}
          >
            {t('contacts.allDepartments')}
          </button>
          {departments.map((d) => (
            <button
              key={d}
              onClick={() => setFilter(filter === d ? '' : d)}
              className={`shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] transition ${
                filter === d ? 'border-accent bg-accent/15 font-semibold text-accent' : 'border-line/15 text-dim'
              }`}
            >
              {d}
            </button>
          ))}
        </div>

        {grouped.map(({ department, contacts }) => (
          <section key={department}>
            <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-dim">{department}</h2>
            <div className="space-y-3">
              {contacts.map((c) => (
                <Card key={c.id} className="p-4">
                  <div className="flex items-center gap-3">
                    <Avatar name={c.name} size={42} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-semibold">{c.name}</p>
                      <p className="truncate text-[13px] text-dim">{c.position}</p>
                    </div>
                    {mayEdit && (
                      <div className="flex gap-1">
                        <button onClick={() => setEditing(c)} className="rounded-full p-2 text-dim hover:bg-line/5 hover:text-accent">
                          <Pencil size={15} />
                        </button>
                        <button onClick={() => deleteContact(c.id)} className="rounded-full p-2 text-dim hover:bg-line/5 hover:text-danger">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <a
                      href={`tel:${c.phone.replace(/\s+/g, '')}`}
                      className="flex items-center justify-center gap-2 rounded-xl border border-line/15 py-2.5 text-[13.5px] font-medium transition hover:border-accent/50 hover:text-accent"
                    >
                      <Phone size={15} /> {t('contacts.call')}
                    </a>
                    <a
                      href={`mailto:${c.email}`}
                      className="flex items-center justify-center gap-2 rounded-xl border border-line/15 py-2.5 text-[13.5px] font-medium transition hover:border-accent/50 hover:text-accent"
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
