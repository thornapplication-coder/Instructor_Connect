import { BellOff, ChevronRight } from 'lucide-react'
import { musterZurAuswahl } from '../aircraftScope'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Avatar, Button, Card, Field, inputCls, Modal, NewDot, Page, SectionHeading, selectCls, TopBar, TopBarAktion } from '../components/ui'
import { kurzeZeit } from '../drafts'
import { istStumm } from '../chatMute'
import { gruppenNameFehler } from '../gruppen'
import { toast } from '../components/Toast'
import { navigate } from '../router'
import { darfGruppeAnlegen } from '../storeRechte'
import { useStore } from '../store'

export function ChatList() {
  const { t, i18n } = useTranslation()
  const { state, currentUser, visibleMessages, myGroups, unreadGroups, addGroup, now } = useStore()
  // Admins und Superadmin dürfen direkt aus dem Chat neue Gruppen anlegen
  const [showNew, setShowNew] = useState(false)
  const [name, setName] = useState('')
  const [purpose, setPurpose] = useState('')
  const [aircraft, setAircraft] = useState('')
  // Nur die eigenen Muster: Eine Gruppe fremden Musters koennte der
  // Anleger anschliessend selbst nicht betreten.
  const aircraftTypes = musterZurAuswahl(currentUser, [...state.settings.aircraftTypes].sort((a, b) => a.localeCompare(b)))
  // Dieselbe Namensregel wie Store und Admin-Panel (gruppen.ts). Hier fehlte
  // sie: „autothrottle" liess sich anlegen, der Dialog schloss, und der Store
  // hatte still abgewiesen (Audit 11/2026, KERN-08). Leer ist noch kein
  // Fehler, nur ein nicht aktiver Speichern-Knopf.
  const nameFehler = gruppenNameFehler(state.groups, null, name)
  const nameTaken = nameFehler === 'vergeben'
  const nameFehlerId = useId()

  return (
    <>
      <TopBar
        title={t('chat.title')}
        back="/"
        right={
          // Dieselbe Regel, die der Store beim Anlegen prueft (storeRechte.ts) —
          // „Ohne Muster" liegt in jedem Bereich, die Musterwahl folgt im Dialog.
          darfGruppeAnlegen(state.settings, currentUser, undefined) ? (
            <TopBarAktion label={t('admin.addGroup')} onClick={() => setShowNew(true)} />
          ) : undefined
        }
      />
      <Page>
        <SectionHeading className="mb-3">{t('chat.yourGroups')}</SectionHeading>
        {myGroups.length === 0 && <p className="text-body text-dim">{t('chat.noGroups')}</p>}
        <div className="space-y-stack">
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
                <SectionHeading className="mb-2 mt-4 px-1 first:mt-0">{heading}</SectionHeading>
              )}
              <Card onClick={() => navigate(`/chat/${g.id}`)} className="relative flex items-center gap-3 p-4">
                {unreadGroups.has(g.id) && <NewDot className="-right-1 -top-1" />}
                <Avatar name={g.name} size={44} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="min-w-0 flex-1 truncate text-lead font-semibold">{g.name}</p>
                    {/* Muster der Gruppe — die Themen unterscheiden sich je Typ.
                        Der Chip darf schrumpfen und kürzen: mit shrink-0 nahm
                        ein langer Mustername dem Gruppennamen den gesamten
                        Platz, und in der Liste war kein einziger Name mehr
                        lesbar. max-w begrenzt ihn auf ein Drittel der Zeile. */}
                    {g.aircraftType && (
                      <span className="max-w-[33%] shrink truncate rounded-full bg-accent/15 px-2.5 py-0.5 text-micro font-medium text-ink">
                        {g.aircraftType}
                      </span>
                    )}
                    {/* Stumm je Nutzer — nicht mehr fuer alle (chatMute.ts, KERN-06) */}
                    {istStumm(state.mutedGroups, currentUser?.id, g.id) && (
                      <BellOff size={13} className="shrink-0 text-dim" role="img" aria-label={t('chat.muted')} />
                    )}
                  </div>
                  <p className="truncate text-small text-dim">
                    {/* Ein gelöschter Autor ergab „undefined:", ein reiner
                        Anhang eine leere Zeile — beides sah nach Fehler aus. */}
                    {last
                      ? `${lastAuthor?.name.split(' ')[0] ?? t('chat.unknownAuthor')}: ${
                          last.text.trim() || (last.attachment ? `📎 ${last.attachment.name}` : t('chat.attachmentOnly'))
                        }`
                      : t('chat.noMessages')}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  {/*
                    Rechts steht die Zeit der LETZTEN NACHRICHT, nicht die
                    Loeschfrist. An dieser Stelle zeigt jede Messaging-App die
                    Zeit — „🕐 7 Tage" wurde deshalb als „vor 7 Tagen, nichts
                    los" gelesen, und welche Gruppe gerade lebt, stand
                    nirgends. Die Aufbewahrung erklaert die Chat-Info, wo sie
                    ohnehin ausfuehrlich steht.
                  */}
                  <span className="whitespace-nowrap text-micro text-dim">{last ? kurzeZeit(last.createdAt, i18n.language, now()) : ''}</span>
                  <ChevronRight size={16} className="text-dim" />
                </div>
              </Card>
              </div>
            )
          })}
        </div>
        {showNew && (
          <Modal title={t('admin.addGroup')} onClose={() => setShowNew(false)}>
            <div className="space-y-stack">
              <Field label={t('admin.groupName')}>
                <input
                  className={`${inputCls} ${nameTaken ? 'border-danger/60' : ''}`}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  aria-invalid={nameTaken || undefined}
                  aria-describedby={nameTaken ? nameFehlerId : undefined}
                />
                {nameTaken && (
                  <p id={nameFehlerId} className="mt-1.5 text-micro leading-relaxed text-danger">
                    {t('admin.groupNameTaken')}
                  </p>
                )}
              </Field>
              <Field label={t('admin.purpose')}>
                <input className={inputCls} value={purpose} onChange={(e) => setPurpose(e.target.value)} />
              </Field>
              <Field label={t('admin.groupAircraft')}>
                <select
                  value={aircraft}
                  onChange={(e) => setAircraft(e.target.value)}
                  className={selectCls}
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
                  disabled={nameFehler !== null}
                  onClick={() => {
                    // Bei Ablehnung bleibt der Dialog mit den Eingaben offen.
                    if (!addGroup(name.trim(), purpose.trim(), aircraft || undefined)) {
                      toast(t('chat.groupNotCreated'), 'bad')
                      return
                    }
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
