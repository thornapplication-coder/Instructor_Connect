import { Mail, Pencil, Phone, Trash2 } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Avatar, Button, Card, CardGrid, DialogMeldung, Field, inputCls, Modal, Page, SectionHeading, TopBar, TopBarAktion } from '../components/ui'
import { useQuittung } from '../components/Toast'
import { kontaktFehler, kontaktGruppen, mailLink, telefonLink } from '../contacts'
import { useStore } from '../store'
import type { Contact } from '../types'

function ContactModal({ contact, onClose }: { contact: Partial<Contact> | null; onClose: () => void }) {
  const { t } = useTranslation()
  const { saveContact } = useStore()
  const quittieren = useQuittung()
  /** Ablehnung des Stores — im Dialog, nicht als Toast darunter (R3-DIALOGMELDUNG). */
  const [meldung, setMeldung] = useState<string | null>(null)
  const [form, setForm] = useState({
    department: contact?.department ?? '',
    position: contact?.position ?? '',
    name: contact?.name ?? '',
    phone: contact?.phone ?? '',
    email: contact?.email ?? '',
  })
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value })
  /* Dieselbe Pruefung wie im Store (contacts.ts, KERN-16). Pflichtfelder
     sperren nur den Knopf; ein Formatfehler bei Telefon oder E-Mail steht
     am Feld — sonst suchte man, warum „Speichern" nicht geht. */
  const fehler = kontaktFehler(form)
  const valid = fehler.length === 0
  const telefonId = useId()
  const mailId = useId()
  const telefonFalsch = fehler.includes('phone')
  const mailFalsch = fehler.includes('email')

  return (
    <Modal
      title={contact?.id ? t('common.edit') : t('contacts.newContact')}
      onClose={onClose}
      // Hintergrundklick und Escape verwarfen bisher kommentarlos
      confirmDiscard={Object.values(form).some((v) => v.trim()) ? t('common.discardConfirm') : undefined}
    >
      <div className="space-y-stack">
        <Field label={t('contacts.department')}>
          <input className={inputCls} value={form.department} onChange={set('department')} />
        </Field>
        <Field label={t('contacts.position')}>
          <input className={inputCls} value={form.position} onChange={set('position')} />
        </Field>
        <Field label={t('contacts.name')}>
          <input className={inputCls} value={form.name} onChange={set('name')} />
        </Field>
        {/* type tel/email: passende Bildschirmtastatur am Telefon. Die
            Meldung steht AUSSERHALB des <label>, sonst gehörte sie zum Namen. */}
        <div>
          <Field label={t('contacts.phone')}>
            <input
              type="tel"
              autoComplete="tel"
              className={inputCls}
              value={form.phone}
              onChange={set('phone')}
              aria-invalid={telefonFalsch || undefined}
              aria-describedby={telefonFalsch ? telefonId : undefined}
            />
          </Field>
          {telefonFalsch && (
            <p id={telefonId} className="mt-1.5 text-micro leading-relaxed text-danger">
              {t('contacts.phoneInvalid')}
            </p>
          )}
        </div>
        <div>
          <Field label={t('contacts.email')}>
            <input
              type="email"
              autoComplete="email"
              className={inputCls}
              value={form.email}
              onChange={set('email')}
              aria-invalid={mailFalsch || undefined}
              aria-describedby={mailFalsch ? mailId : undefined}
            />
          </Field>
          {mailFalsch && (
            <p id={mailId} className="mt-1.5 text-micro leading-relaxed text-danger">
              {t('contacts.emailInvalid')}
            </p>
          )}
        </div>
        <DialogMeldung text={meldung} />
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            disabled={!valid}
            onClick={() => {
              // Abgewiesen (Recht entzogen): Dialog bleibt offen, mit Grund
              // (R3-DIALOGMELDUNG); quittiert wird nach dem Schreiben.
              if (!saveContact({ id: contact?.id, ...form })) {
                setMeldung(t('dialog.notSaved'))
                return
              }
              void quittieren(t('toast.contactSaved'))
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
  const quittieren = useQuittung()
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

  // Abteilungen nach dem bereinigten Wert — „Training " ist keine zweite
  // Abteilung (contacts.ts, KERN-16).
  const { abteilungen: departments, gruppen: grouped, treffer } = kontaktGruppen(state.contacts, filter, query)

  return (
    <>
      {/* Modulname bleibt laut Spez. in beiden Sprachen Englisch */}
      <TopBar
        title="Who to call"
        back="/"
        right={
          mayEdit ? (
            <TopBarAktion label={t('contacts.newContact')} onClick={() => setEditing(null)} />
          ) : undefined
        }
      />
      <Page className="space-y-section">
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
            className={`min-h-11 shrink-0 rounded-full border px-3.5 py-1.5 text-small transition ${
              !filter ? 'border-accent bg-accent/15 font-semibold text-ink' : 'border-line/15 text-dim'
            }`}
          >
            {t('contacts.allDepartments')}
          </button>
          {departments.map((d) => (
            <button
              key={d}
              onClick={() => setFilter(filter === d ? '' : d)}
              className={`min-h-11 shrink-0 rounded-full border px-3.5 py-1.5 text-small transition ${
                filter === d ? 'border-accent bg-accent/15 font-semibold text-ink' : 'border-line/15 text-dim'
              }`}
            >
              {d}
            </button>
          ))}
        </div>

        {/* Leerer Zustand: die Seite sah sonst aus, als würde sie noch laden */}
        {state.contacts.length === 0 && <p className="pt-6 text-center text-body text-dim">{t('contacts.empty')}</p>}
        {state.contacts.length > 0 && treffer === 0 && (
          <p className="pt-6 text-center text-body text-dim">{t('contacts.noMatch')}</p>
        )}

        {grouped.map(({ department, contacts }) => (
          <section key={department}>
            <SectionHeading className="mb-2.5">{department}</SectionHeading>
            <CardGrid>
              {contacts.map((c) => (
                <Card key={c.id} className="p-4">
                  <div className="flex items-center gap-3">
                    <Avatar name={c.name} size={42} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-lead font-semibold">{c.name}</p>
                      <p className="truncate text-small text-dim">{c.position}</p>
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
                            if (window.confirm(t('contacts.deleteConfirm', { name: c.name }))) {
                              deleteContact(c.id)
                              void quittieren(t('toast.contactDeleted'))
                            }
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
                  {/* Anrufen und Schreiben nur mit Ziel: Ohne Nummer bzw.
                      Adresse fuehrten `tel:` und `mailto:` ins Leere, und
                      darunter stand „ · " (contacts.ts, KERN-16). */}
                  {(() => {
                    const tel = telefonLink(c.phone)
                    const mail = mailLink(c.email)
                    if (!tel && !mail) return null
                    return (
                      <>
                        <div className={`mt-3 grid gap-2 ${tel && mail ? 'grid-cols-2' : 'grid-cols-1'}`}>
                          {tel && (
                            <a
                              href={tel}
                              className="min-h-11 flex items-center justify-center gap-2 rounded-xl border border-line/15 py-2.5 text-small font-medium transition hover:border-accent/50 hover:text-accent"
                            >
                              <Phone size={15} /> {t('contacts.call')}
                            </a>
                          )}
                          {mail && (
                            <a
                              href={mail}
                              className="min-h-11 flex items-center justify-center gap-2 rounded-xl border border-line/15 py-2.5 text-small font-medium transition hover:border-accent/50 hover:text-accent"
                            >
                              <Mail size={15} /> {t('contacts.mail')}
                            </a>
                          )}
                        </div>
                        <p className="mt-2 text-center text-micro text-dim">{[c.phone.trim(), c.email.trim()].filter(Boolean).join(' · ')}</p>
                      </>
                    )
                  })()}
                </Card>
              ))}
            </CardGrid>
          </section>
        ))}
      </Page>
      {editing !== undefined && <ContactModal contact={editing} onClose={() => setEditing(undefined)} />}
    </>
  )
}
