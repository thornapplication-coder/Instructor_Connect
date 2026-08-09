import { BellOff, ChevronRight, Clock, Plus } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Avatar, Button, Card, Field, inputCls, Modal, NewDot, Page, TopBar } from '../components/ui'
import { navigate } from '../router'
import { isAdminUser, useStore } from '../store'

export function ChatList() {
  const { t } = useTranslation()
  const { state, currentUser, effectiveRetention, visibleMessages, myGroups, unreadGroups, addGroup } = useStore()
  // Admins und Superadmin dürfen direkt aus dem Chat neue Gruppen anlegen
  const [showNew, setShowNew] = useState(false)
  const [name, setName] = useState('')
  const [purpose, setPurpose] = useState('')
  const [aircraft, setAircraft] = useState('')
  const aircraftTypes = [...state.settings.aircraftTypes].sort((a, b) => a.localeCompare(b))

  return (
    <>
      <TopBar
        title={t('chat.title')}
        back="/"
        right={
          isAdminUser(currentUser) ? (
            <button
              onClick={() => setShowNew(true)}
              className="flex items-center gap-1 rounded-full bg-accent px-3 py-1.5 text-[13px] font-semibold text-bg hover:brightness-110"
            >
              <Plus size={15} /> {t('admin.addGroup')}
            </button>
          ) : undefined
        }
      />
      <Page>
        <p className="mb-3 text-[13px] font-medium uppercase tracking-wide text-dim">{t('chat.yourGroups')}</p>
        {myGroups.length === 0 && <p className="text-sm text-dim">{t('chat.noGroups')}</p>}
        <div className="space-y-3">
          {myGroups.map((g, i) => {
            // Zwischenüberschrift je Muster — nur wenn mehrere Abschnitte existieren
            const sectionOf = (x: typeof g) => x.aircraftType || ''
            const sections = new Set(myGroups.map(sectionOf))
            const heading =
              sections.size > 1 && (i === 0 || sectionOf(myGroups[i - 1]) !== sectionOf(g))
                ? sectionOf(g) || t('admin.groupNoAircraft')
                : null
            const msgs = visibleMessages(g.id)
            const last = msgs[msgs.length - 1]
            const lastAuthor = last ? state.users.find((u) => u.id === last.authorId) : null
            return (
              <div key={g.id}>
              {heading && (
                <p className="mb-1.5 mt-3 px-1 text-[12px] font-semibold uppercase tracking-wide text-dim first:mt-0">{heading}</p>
              )}
              <Card onClick={() => navigate(`/chat/${g.id}`)} className="relative flex items-center gap-3 p-4">
                {unreadGroups.has(g.id) && <NewDot className="-right-1 -top-1" />}
                <Avatar name={g.name} size={44} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-[15px] font-semibold">{g.name}</p>
                    {/* Muster der Gruppe — die Themen unterscheiden sich je Typ */}
                    {g.aircraftType && (
                      <span className="shrink-0 rounded-full bg-raised px-2 py-0.5 text-[11px] font-medium text-accent">{g.aircraftType}</span>
                    )}
                    {g.muted && <BellOff size={13} className="shrink-0 text-dim" />}
                  </div>
                  <p className="truncate text-[13px] text-dim">
                    {last ? `${lastAuthor?.name.split(' ')[0]}: ${last.text}` : t('chat.noMessages')}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <span className="flex items-center gap-1 text-[11px] text-dim">
                    <Clock size={11} /> {t(`retention.${effectiveRetention(g)}`)}
                  </span>
                  <ChevronRight size={16} className="text-dim" />
                </div>
              </Card>
              </div>
            )
          })}
        </div>
        {showNew && (
          <Modal title={t('admin.addGroup')} onClose={() => setShowNew(false)}>
            <div className="space-y-3.5">
              <Field label={t('admin.groupName')}>
                <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
              </Field>
              <Field label={t('admin.purpose')}>
                <input className={inputCls} value={purpose} onChange={(e) => setPurpose(e.target.value)} />
              </Field>
              <Field label={t('admin.groupAircraft')}>
                <select
                  value={aircraft}
                  onChange={(e) => setAircraft(e.target.value)}
                  className="w-full rounded-xl border border-line/10 bg-bg/60 px-3 py-2.5 text-[14px]"
                >
                  <option value="">{t('admin.groupNoAircraft')}</option>
                  {aircraftTypes.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setShowNew(false)}>
                  {t('common.cancel')}
                </Button>
                <Button
                  disabled={!name.trim()}
                  onClick={() => {
                    addGroup(name.trim(), purpose.trim(), aircraft || undefined)
                    setShowNew(false)
                    setName('')
                    setPurpose('')
                    setAircraft('')
                  }}
                >
                  {t('common.save')}
                </Button>
              </div>
            </div>
          </Modal>
        )}
      </Page>
    </>
  )
}
