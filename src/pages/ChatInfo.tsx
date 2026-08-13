import { Bell, BellOff, Clock, HardDriveDownload, Shield, Trash2, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Avatar, Badge, Button, Card, CardHeading, Field, Page, selectCls, TopBar } from '../components/ui'
import { navigate } from '../router'
import { isGroupAdmin, mayAccessGroup, useStore } from '../store'
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
  const nonMembers = state.users
    .filter((u) => u.active && !group.memberIds.includes(u.id))
    .sort((a, b) => a.name.localeCompare(b.name))
  const mayManage = isGroupAdmin(currentUser, group)
  // Wer nur in dieser einen Gruppe ist, verlöre mit ihr den Chat-Zugang und
  // die Sichtbarkeit der Instructor Info. Das Löschen wird dann nicht still
  // abgelehnt, sondern begründet gesperrt.
  const blockers = mayManage ? groupDeleteBlockers(group.id) : []

  return (
    <>
      <TopBar title={t('chatInfo.title')} back={`/chat/${groupId}`} />
      <Page className="space-y-4">
        <div className="flex flex-col items-center gap-2 py-2 text-center">
          <Avatar name={group.name} size={64} />
          <h2 className="text-xl font-bold">{group.name}</h2>
          <p className="max-w-sm text-[13.5px] text-dim">{group.purpose}</p>
        </div>

        <Card className="divide-y divide-line/[0.06]">
          <div className="flex items-start gap-3 p-4">
            <Clock size={18} className="mt-0.5 shrink-0 text-accent" />
            <div>
              <p className="text-[14px] font-semibold">
                {t('chatInfo.retention')}: {t(`retention.${effectiveRetention(group)}`)}
              </p>
              <p className="mt-0.5 text-[12.5px] text-dim">{t('chatInfo.retentionNote')}</p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-4">
            <Trash2 size={18} className="mt-0.5 shrink-0 text-accent" />
            <p className="text-[13.5px]">{t('chatInfo.attachmentNote')}</p>
          </div>
          <div className="flex items-start gap-3 p-4">
            <HardDriveDownload size={18} className="mt-0.5 shrink-0 text-accent" />
            <p className="text-[13.5px]">
              {t('chatInfo.maxUpload')}: <span className="font-semibold">{state.settings.maxUploadMB} MB</span>
            </p>
          </div>
          <div className="flex items-start gap-3 p-4">
            <Shield size={18} className="mt-0.5 shrink-0 text-accent" />
            <div className="flex flex-wrap items-center gap-2 text-[13.5px]">
              {t('chatInfo.admin')}:
              {admins.map((a) => (
                <Badge key={a.id}>{a.name}</Badge>
              ))}
            </div>
          </div>
          <button onClick={() => toggleMute(group.id)} className="flex w-full items-center gap-3 p-4 text-left hover:bg-line/[0.03]">
            {group.muted ? <BellOff size={18} className="shrink-0 text-accent" /> : <Bell size={18} className="shrink-0 text-accent" />}
            <p className="text-[13.5px]">{group.muted ? t('chat.muted') : t('chat.mute')}</p>
          </button>
        </Card>

        <Card className="p-4">
          <CardHeading className="mb-3 flex items-center gap-2">
            <Users size={15} /> {t('chatInfo.members', { count: members.length })}
          </CardHeading>
          <ul className="space-y-2.5">
            {members.map((m) => (
              <li key={m.id} className="flex items-center gap-2.5">
                <Avatar name={m.name} size={30} />
                <span className="min-w-0 flex-1 truncate text-[14px]">{m.name}</span>
                {group.adminIds.includes(m.id) && <Badge tone="accent">{t('chatInfo.admin')}</Badge>}
                {mayManage && m.id !== currentUser!.id && (
                  <button
                    onClick={() => setGroupMembers(group.id, group.memberIds.filter((id) => id !== m.id))}
                    className="text-[12px] text-dim hover:text-danger"
                  >
                    {t('chatInfo.removeMember')}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </Card>

        {mayManage && (
          <Card className="space-y-4 p-4">
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
                  onChange={(e) => e.target.value && setGroupMembers(group.id, [...group.memberIds, e.target.value])}
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
              <p className={`mt-2 text-[12.5px] leading-relaxed ${blockers.length > 0 ? 'text-danger' : 'text-dim'}`}>
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
