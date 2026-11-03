import { Bell, BellOff, Clock, HardDriveDownload, Shield, Trash2, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Avatar, Badge, Button, Card, CardHeading, Field, Page, selectCls, TopBar } from '../components/ui'
import { navigate } from '../router'
import { isGroupAdmin } from '../adminAccess'
import { gruppenTauglich } from '../aircraftScope'
import { entfernenBlockiert, gruppenAenderungFehler } from '../gruppen'
import { istStumm } from '../chatMute'
import { toast } from '../components/Toast'
import { mayAccessGroup, useStore } from '../store'
import type { RetentionKey } from '../types'

const RETENTION_KEYS: RetentionKey[] = ['24h', '7d', '30d', '90d', 'never']

export function ChatInfo({ groupId }: { groupId: string }) {
  const { t } = useTranslation()
  const { state, currentUser, effectiveRetention, setGroupRetention, setGroupMembers, toggleMute, deleteGroup, groupDeleteBlockers } =
    useStore()
  const group = state.groups.find((g) => g.id === groupId)
  // Gruppendetails (Mitgliederliste, Einstellungen) nur für Zugriffsberechtigte
  if (!group || !mayAccessGroup(currentUser, group)) {
    navigate('/chat')
    return null
  }

  const admins = state.users.filter((u) => group.adminIds.includes(u.id))
  const members = state.users
    .filter((u) => group.memberIds.includes(u.id))
    .sort((a, b) => a.name.localeCompare(b.name))
  // Hinzufuegen nur, wer die Gruppe auch betreten kann (Muster, Chat-Modul).
  // Angeboten wurde jeder Aktive — auch der Training Admin ohne Chat und das
  // Mitglied fremden Musters, die danach als Mitglied zaehlten, ohne je
  // hineinzukommen (Audit 11/2026, KERN-07).
  const nonMembers = state.users
    .filter((u) => u.active && !group.memberIds.includes(u.id) && gruppenTauglich(state.settings, u, group))
    .sort((a, b) => a.name.localeCompare(b.name))
  const mayManage = isGroupAdmin(currentUser, group)
  // Wer nur in dieser einen Gruppe ist, verlöre mit ihr den Chat-Zugang und
  // die Sichtbarkeit der Instructor Info. Das Löschen wird dann nicht still
  // abgelehnt, sondern begründet gesperrt.
  const blockers = mayManage ? groupDeleteBlockers(group.id) : []
  // Persoenlich — nicht mehr am Gruppenobjekt fuer alle (KERN-06).
  const stumm = istStumm(state.mutedGroups, currentUser?.id, group.id)
  /** Mitglieder aendern; bei Ablehnung sagen, dass nichts passiert ist —
   *  vorher tat der Klick still nichts (Audit 11/2026, KERN-08). */
  const mitglieder = (ids: string[]) => {
    if (!setGroupMembers(group.id, ids)) toast(t('chatInfo.membersRejected'), 'bad')
  }

  return (
    <>
      <TopBar title={t('chatInfo.title')} back={`/chat/${groupId}`} />
      <Page className="space-y-section">
        <div className="flex flex-col items-center gap-2 py-2 text-center">
          <Avatar name={group.name} size={64} />
          <h2 className="text-title font-bold">{group.name}</h2>
          <p className="max-w-sm text-small text-dim">{group.purpose}</p>
        </div>

        {/* p-0: Den Innenabstand tragen die Zeilen (p-4), zwischen ihnen
            stehen Trennlinien ueber die volle Breite (designScale.test.ts). */}
        <Card className="divide-y divide-line/[0.06] p-0">
          <div className="flex items-start gap-3 p-4">
            <Clock size={18} className="mt-0.5 shrink-0 text-accent" />
            <div>
              <p className="text-body font-semibold">
                {t('chatInfo.retention')}: {t(`retention.${effectiveRetention(group)}`)}
              </p>
              <p className="mt-0.5 text-micro text-dim">{t('chatInfo.retentionNote')}</p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-4">
            <Trash2 size={18} className="mt-0.5 shrink-0 text-accent" />
            <p className="text-small">{t('chatInfo.attachmentNote')}</p>
          </div>
          <div className="flex items-start gap-3 p-4">
            <HardDriveDownload size={18} className="mt-0.5 shrink-0 text-accent" />
            <p className="text-small">
              {t('chatInfo.maxUpload')}: <span className="font-semibold">{state.settings.maxUploadMB} MB</span>
            </p>
          </div>
          <div className="flex items-start gap-3 p-4">
            <Shield size={18} className="mt-0.5 shrink-0 text-accent" />
            <div className="flex flex-wrap items-center gap-2 text-small">
              {t('chatInfo.admin')}:
              {admins.map((a) => (
                <Badge key={a.id}>{a.name}</Badge>
              ))}
            </div>
          </div>
          <button
            onClick={() => toggleMute(group.id)}
            aria-pressed={stumm}
            className="flex w-full items-center gap-3 p-4 text-left hover:bg-line/[0.03]"
          >
            {stumm ? <BellOff size={18} className="shrink-0 text-accent" /> : <Bell size={18} className="shrink-0 text-accent" />}
            <span className="text-small">
              {stumm ? t('chat.muted') : t('chat.mute')}
              <span className="mt-0.5 block text-micro text-dim">{t('chat.muteOnlyYou')}</span>
            </span>
          </button>
        </Card>

        <Card className="p-4">
          <CardHeading className="mb-3 flex items-center gap-2">
            <Users size={15} /> {t('chatInfo.members', { count: members.length })}
          </CardHeading>
          <ul className="space-y-stack">
            {members.map((m) => {
              // Wer hier seine letzte erreichbare Gruppe hat, kann nicht
              // entfernt werden — der Knopf sagt das, statt still nichts zu
              // tun (gruppen.ts, KERN-08).
              const blockiert = mayManage && m.id !== currentUser!.id && entfernenBlockiert(state.settings, m, state.groups, group.id)
              const grundId = `entfernen-${m.id}`
              return (
              <li key={m.id} className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                <Avatar name={m.name} size={30} />
                <span className="min-w-0 flex-1 truncate text-body">{m.name}</span>
                {/* Mitglied auf dem Papier, aber ohne Zugang (fremdes Muster,
                    kein Chat-Modul) — benannt statt mitgezaehlt. */}
                {!gruppenTauglich(state.settings, m, group) && <Badge tone="dim">{t('chatInfo.noAccess')}</Badge>}
                {group.adminIds.includes(m.id) && <Badge tone="accent">{t('chatInfo.admin')}</Badge>}
                {mayManage && m.id !== currentUser!.id && (
                  <button
                    disabled={blockiert}
                    aria-describedby={blockiert ? grundId : undefined}
                    onClick={() => {
                      // Immer mit Rueckfrage: vorher 55×18 px und sofort
                      // wirksam — ein Fehltipper beim Scrollen nahm jemandem
                      // den Gruppenchat (Audit 11/2026, MOB-05). Geht dabei
                      // der letzte Admin, fragt die Rueckfrage des
                      // Admin-Panels (gruppen.ts, VERW-09) — EINE Frage,
                      // nicht zwei hintereinander.
                      const ohne = group.memberIds.filter((id) => id !== m.id)
                      const frage =
                        gruppenAenderungFehler(currentUser, group, ohne, group.adminIds) === 'ohneAdmin'
                          ? t('admin.groupNoAdminConfirm', { name: group.name })
                          : t('chatInfo.removeMemberConfirm', { name: m.name, group: group.name })
                      if (!window.confirm(frage)) return
                      mitglieder(ohne)
                    }}
                    className="-my-2 min-h-11 rounded-lg px-2 text-micro text-dim hover:text-danger disabled:cursor-not-allowed disabled:hover:text-dim"
                  >
                    {t('chatInfo.removeMember')}
                  </button>
                )}
                {blockiert && (
                  <p id={grundId} className="w-full pl-10 text-micro leading-relaxed text-dim">
                    {t('chatInfo.removeBlocked', { name: m.name })}
                  </p>
                )}
              </li>
              )
            })}
          </ul>
        </Card>

        {mayManage && (
          <Card className="space-y-section p-4">
            <CardHeading>{t('chatInfo.manage')}</CardHeading>
            <Field label={t('chatInfo.retentionOverride')}>
              <select
                value={group.retention ?? 'default'}
                onChange={(e) => setGroupRetention(group.id, e.target.value === 'default' ? null : (e.target.value as RetentionKey))}
                className={selectCls}
              >
                <option value="default">{t('retention.default', { value: t(`retention.${state.settings.defaultRetention}`) })}</option>
                {RETENTION_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {t(`retention.${k}`)}
                  </option>
                ))}
              </select>
            </Field>
            {nonMembers.length > 0 && (
              <Field label={t('chatInfo.addMember')}>
                <select
                  value=""
                  onChange={(e) => e.target.value && mitglieder([...group.memberIds, e.target.value])}
                  className={selectCls}
                >
                  <option value="">…</option>
                  {nonMembers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}

            {/* Löschen gehört dorthin, wo die Gruppe verwaltet wird — bisher
                lag es nur im Admin Panel, und der Gruppenadmin kommt dort
                nicht überall hin. */}
            <div className="border-t border-line/10 pt-4">
              <Button
                variant="danger"
                disabled={blockers.length > 0}
                className="flex w-full items-center justify-center gap-2"
                onClick={() => {
                  if (blockers.length > 0) return
                  const count = state.messages.filter((m) => m.groupId === group.id).length
                  if (!window.confirm(t('chatInfo.deleteGroupConfirm', { name: group.name, count }))) return
                  deleteGroup(group.id)
                  navigate('/chat')
                }}
              >
                <Trash2 size={16} /> {t('chatInfo.deleteGroup')}
              </Button>
              <p className={`mt-2 text-micro leading-relaxed ${blockers.length > 0 ? 'text-danger' : 'text-dim'}`}>
                {blockers.length > 0
                  ? t('chatInfo.deleteBlocked', { names: blockers.map((u) => u.name).join(', ') })
                  : t('chatInfo.deleteGroupHint')}
              </p>
            </div>
          </Card>
        )}
      </Page>
    </>
  )
}
