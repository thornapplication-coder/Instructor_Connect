import { AlertTriangle, ArrowLeft, CheckCircle2, ChevronDown, ClipboardList, History, MessageSquareText, Monitor, Paperclip, Plus, ScrollText, Settings, ShieldCheck, Trash2, Users, UsersRound, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Avatar, Badge, Button, Card, ChipMultiSelect, Field, inputCls, Modal, Page, selectCls, TopBar } from '../components/ui'
import { navigate } from '../router'
import { storageInfo, type StorageInfo } from '../persist'
import { useStore } from '../store'
import { GradingAdmin } from './admin/GradingAdmin'
import { formatDateTime } from './Grading'
import { APP_VERSION, type FeedbackEntry, PERM_KEYS, type ConfigurableRole, type RetentionKey, type Role } from '../types'

const RETENTION_KEYS: RetentionKey[] = ['24h', '7d', '30d', '90d', 'never']
type Tab = 'users' | 'permissions' | 'grading' | 'groups' | 'feedback' | 'settings' | 'imprint' | 'changelog'

function StringListEditor({ label, values, onChange }: { label: string; values: string[]; onChange: (v: string[]) => void }) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState('')
  const add = () => {
    const v = draft.trim()
    if (v && !values.includes(v)) onChange([...values, v])
    setDraft('')
  }
  return (
    // Gruppe statt <label>: die Beschriftung gehört zur Liste, nicht zum
    // ersten Löschknopf darin.
    <Field label={label} group>
      <div className="mb-2 flex flex-wrap gap-2">
        {values.map((v) => (
          <span key={v} className="flex items-center gap-1.5 rounded-full bg-raised px-3 py-1.5 text-[13px]">
            {v}
            <button
              onClick={() => onChange(values.filter((x) => x !== v))}
              aria-label={`${t('common.delete')}: ${v}`}
              className="text-dim hover:text-danger"
            >
              <X size={13} />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          className={inputCls}
          value={draft}
          aria-label={label}
          placeholder={t('admin.addValue')}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <Button variant="ghost" onClick={add}>
          <Plus size={16} />
        </Button>
      </div>
    </Field>
  )
}

function UsersTab() {
  const { t } = useTranslation()
  const { state, updateUser, addUser, setGroupMembers } = useStore()
  const [showNew, setShowNew] = useState(false)
  // Bei rund 130 Instruktoren ist die Liste kompakt und aufklappbar:
  // sichtbar bleiben Name, E-Mail und Rolle — Details erst auf Klick.
  const [openId, setOpenId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  // Filter: Rolle, Status und Gruppenzugehörigkeit
  const [fRole, setFRole] = useState('')
  const [fStatus, setFStatus] = useState('')
  const [fGroup, setFGroup] = useState('')
  // Sortierung: alphabetisch nach Name oder nach Funktion (Superadmin zuerst)
  const [sortMode, setSortMode] = useState<'name' | 'role'>('name')
  const [form, setForm] = useState({ name: '', email: '', phone: '', role: 'member' as Role, groupIds: [] as string[] })
  const emailTaken =
    !!form.email.trim() && state.users.some((u) => u.email.trim().toLowerCase() === form.email.trim().toLowerCase())

  const sortedGroups = [...state.groups].sort((a, b) => a.name.localeCompare(b.name))
  const ROLE_RANK: Record<Role, number> = { superadmin: 0, group_admin: 1, training_admin: 2, member: 3 }
  const allUsers = [...state.users].sort((a, b) =>
    sortMode === 'role' ? ROLE_RANK[a.role] - ROLE_RANK[b.role] || a.name.localeCompare(b.name) : a.name.localeCompare(b.name),
  )
  const users = allUsers.filter((u) => {
    if (query.trim() && !`${u.name} ${u.email}`.toLowerCase().includes(query.trim().toLowerCase())) return false
    if (fRole && u.role !== fRole) return false
    if (fStatus === 'active' && !u.active) return false
    if (fStatus === 'inactive' && u.active) return false
    if (fGroup && !sortedGroups.find((g) => g.id === fGroup)?.memberIds.includes(u.id)) return false
    return true
  })

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => setShowNew(true)} className="flex items-center gap-1.5">
          <Plus size={15} /> {t('admin.addUser')}
        </Button>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('admin.searchUsers')}
          className={`${inputCls} min-w-48 flex-1`}
        />
        <select value={fRole} onChange={(e) => setFRole(e.target.value)} className="rounded-xl border border-line/10 bg-bg/60 px-3 py-2 text-[13px]">
          <option value="">{t('admin.allRoles')}</option>
          {(['member', 'training_admin', 'group_admin', 'superadmin'] as Role[]).map((r) => (
            <option key={r} value={r}>
              {t(`roles.${r}`)}
            </option>
          ))}
        </select>
        <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} className="rounded-xl border border-line/10 bg-bg/60 px-3 py-2 text-[13px]">
          <option value="">{t('admin.allStatus')}</option>
          <option value="active">{t('admin.active')}</option>
          <option value="inactive">{t('admin.inactive')}</option>
        </select>
        <select value={fGroup} onChange={(e) => setFGroup(e.target.value)} className="rounded-xl border border-line/10 bg-bg/60 px-3 py-2 text-[13px]">
          <option value="">{t('admin.allGroups')}</option>
          {sortedGroups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
        <select value={sortMode} onChange={(e) => setSortMode(e.target.value as 'name' | 'role')} className="rounded-xl border border-line/10 bg-bg/60 px-3 py-2 text-[13px]">
          <option value="name">{t('admin.sortByName')}</option>
          <option value="role">{t('admin.sortByRole')}</option>
        </select>
        <span className="shrink-0 text-[12.5px] text-dim">
          {users.length}/{allUsers.length}
        </span>
      </div>
      <p className="px-1 text-[12px] leading-relaxed text-dim">{t('admin.deactivateHint')}</p>
      {users.length === 0 && <p className="pt-4 text-center text-sm text-dim">{t('admin.noUsersMatch')}</p>}
      {users.map((u, i) => (
        <div key={u.id}>
        {sortMode === 'role' && (i === 0 || users[i - 1].role !== u.role) && (
          <p className="mb-1.5 mt-2 px-1 text-[12px] font-semibold uppercase tracking-wide text-dim">{t(`roles.${u.role}`)}</p>
        )}
        <Card className={`p-3 ${u.active ? '' : 'opacity-55'}`}>
          {/* Kopfzeile: immer sichtbar, ganze Zeile klappt auf */}
          <button onClick={() => setOpenId(openId === u.id ? null : u.id)} className="flex w-full items-center gap-3 text-left">
            <Avatar name={u.name} size={34} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-semibold">{u.name}</p>
              <p className="truncate text-[12px] text-dim">{u.email}</p>
            </div>
            <span className="shrink-0 text-[12px] text-dim">{t(`roles.${u.role}`)}</span>
            {!u.active && <Badge tone="dim">{t('admin.inactive')}</Badge>}
            <ChevronDown size={16} className={`shrink-0 text-dim transition ${openId === u.id ? 'rotate-180' : ''}`} />
          </button>
          <div className={openId === u.id ? '' : 'hidden'}>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px]">
            <select
              value={u.role}
              onChange={(e) => updateUser(u.id, { role: e.target.value as Role })}
              className="rounded-lg border border-line/10 bg-bg/60 px-2 py-1.5"
            >
              {(['member', 'training_admin', 'group_admin', 'superadmin'] as Role[]).map((r) => (
                <option key={r} value={r}>
                  {t(`roles.${r}`)}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1.5 text-dim">
              <input
                type="checkbox"
                checked={u.canEditDirectory}
                onChange={(e) => updateUser(u.id, { canEditDirectory: e.target.checked })}
                className="h-6 w-6 shrink-0 accent-accent"
              />
              {t('admin.canEditDirectory')}
            </label>
            {/* Grading Tool greift auf diese Flags zu: wer bewerten darf und
                wer in der Trainee-Auswahl erscheint. */}
            <label className="flex items-center gap-1.5 text-dim">
              <input
                type="checkbox"
                checked={u.canGrade}
                onChange={(e) => updateUser(u.id, { canGrade: e.target.checked })}
                className="h-6 w-6 shrink-0 accent-accent"
              />
              {t('admin.canGrade')}
            </label>
            <label className="flex items-center gap-1.5 text-dim">
              <input
                type="checkbox"
                checked={u.isTrainee}
                onChange={(e) => updateUser(u.id, { isTrainee: e.target.checked })}
                className="h-6 w-6 shrink-0 accent-accent"
              />
              {t('admin.isTrainee')}
            </label>
            {/* Chat-Sperre: Nutzer kann mitlesen, aber nichts mehr senden */}
            <label className={`flex items-center gap-1.5 ${u.chatBlocked ? 'font-semibold text-danger' : 'text-dim'}`}>
              <input
                type="checkbox"
                checked={!!u.chatBlocked}
                onChange={(e) => updateUser(u.id, { chatBlocked: e.target.checked })}
                className="h-6 w-6 shrink-0 accent-[#e05252]"
              />
              {t('admin.chatBlocked')}
            </label>
            {/* Konten werden deaktiviert, nicht gelöscht — sonst stünde auf
                unterschriebenen Formularen und in Chats ein Verweis ins
                Leere, und die Historie verlöre ihren Urheber. */}
            <span className="ml-auto flex gap-2">
              <button
                onClick={() => updateUser(u.id, { active: !u.active })}
                className="min-h-11 rounded-lg px-2 py-1 text-dim hover:bg-line/5 hover:text-ink"
              >
                {u.active ? t('admin.deactivate') : t('admin.activate')}
              </button>
            </span>
          </div>
          {/* Gruppenzugehörigkeit direkt am Nutzer pflegbar — steuert
              Chat-Zugang und Instructor-Info-Sichtbarkeit */}
          <div className="mt-2.5">
            <p className="mb-1.5 text-[12.5px] text-dim">{t('admin.userGroups')}</p>
            <ChipMultiSelect
              options={sortedGroups.map((g) => ({ id: g.id, label: g.name }))}
              selected={sortedGroups.filter((g) => g.memberIds.includes(u.id)).map((g) => g.id)}
              onChange={(ids) => {
                // Dieselbe Invariante wie beim Anlegen: ohne Gruppe verliert
                // der Nutzer Chat-Zugang und Instructor-Info-Sichtbarkeit.
                if (ids.length === 0) {
                  window.alert(t('admin.lastGroupBlocked'))
                  return
                }
                sortedGroups.forEach((g) => {
                  const has = g.memberIds.includes(u.id)
                  const want = ids.includes(g.id)
                  if (has !== want) setGroupMembers(g.id, want ? [...g.memberIds, u.id] : g.memberIds.filter((x) => x !== u.id))
                })
              }}
            />
          </div>
          {/* Zugewiesene Muster steuern, welche Lesson Plans der Nutzer sieht */}
          <div className="mt-2.5">
            <p className="mb-1.5 text-[12.5px] text-dim">{t('admin.aircraftTypes')}</p>
            <div className="flex flex-wrap gap-1.5">
              {[...state.settings.aircraftTypes].sort((a, b) => a.localeCompare(b)).map((a) => {
                const on = u.aircraftTypes.includes(a)
                return (
                  <button
                    key={a}
                    onClick={() =>
                      updateUser(u.id, { aircraftTypes: on ? u.aircraftTypes.filter((x) => x !== a) : [...u.aircraftTypes, a] })
                    }
                    className={`min-h-11 rounded-full border px-2.5 py-1 text-[12px] transition ${
                      on ? 'border-accent bg-accent/15 font-medium text-accent' : 'border-line/12 text-dim'
                    }`}
                  >
                    {a}
                  </button>
                )
              })}
            </div>
          </div>
          </div>
        </Card>
        </div>
      ))}
      {showNew && (
        <Modal
          title={t('admin.addUser')}
          onClose={() => setShowNew(false)}
          confirmDiscard={
            form.name.trim() || form.email.trim() || form.phone.trim() || form.groupIds.length > 0 ? t('common.discardConfirm') : undefined
          }
        >
          <div className="space-y-3.5">
            <Field label={t('contacts.name')}>
              <input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
            </Field>
            {/* Die E-Mail ist die einzige Anmeldekennung — Pflichtfeld */}
            <Field label={t('contacts.email') + ' *'}>
              <input
                type="email"
                className={`${inputCls} ${emailTaken ? 'border-danger/60' : ''}`}
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
              {/* Die Adresse muss eindeutig bleiben — sonst hätten zwei Konten
                  denselben Login. Direkt am Feld, nicht erst beim Speichern. */}
              {emailTaken ? (
                <p className="mt-1.5 text-[11.5px] leading-relaxed text-danger">{t('admin.emailTaken')}</p>
              ) : (
                <p className="mt-1.5 text-[11.5px] leading-relaxed text-dim">{t('admin.emailLoginHint')}</p>
              )}
            </Field>
            <Field label={t('contacts.phone')}>
              <input type="tel" className={inputCls} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </Field>
            <Field label={t('admin.role')}>
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
                className={selectCls}
              >
                {(['member', 'training_admin', 'group_admin', 'superadmin'] as Role[]).map((r) => (
                  <option key={r} value={r}>
                    {t(`roles.${r}`)}
                  </option>
                ))}
              </select>
            </Field>
            {/* Pflicht: jede Person gehört mindestens einer Gruppe an —
                Gruppen steuern Chat-Zugang und Instructor-Info-Sichtbarkeit */}
            <Field label={t('admin.userGroups') + ' *'}>
              <ChipMultiSelect
                options={sortedGroups.map((g) => ({ id: g.id, label: g.name }))}
                selected={form.groupIds}
                onChange={(groupIds) => setForm({ ...form, groupIds })}
              />
              <p className="mt-1.5 text-[11.5px] leading-relaxed text-dim">{t('admin.userGroupsHint')}</p>
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowNew(false)}>
                {t('common.cancel')}
              </Button>
              <Button
                disabled={
                  !form.name.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()) || form.groupIds.length === 0 || emailTaken
                }
                onClick={() => {
                  addUser(form)
                  setShowNew(false)
                  setForm({ name: '', email: '', phone: '', role: 'member', groupIds: [] })
                }}
              >
                {t('common.save')}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

/**
 * Rechte-Matrix: Zeilen = Fähigkeiten, Spalten = konfigurierbare Rollen.
 * Der Superadmin darf immer alles; Mitglieder werden über die Flags am
 * Nutzer gesteuert (Darf bewerten, Darf „Who to call" bearbeiten).
 */
function PermissionsTab() {
  const { t } = useTranslation()
  const { state, setPermission } = useStore()
  const roles: ConfigurableRole[] = ['group_admin', 'training_admin']

  return (
    <div className="space-y-3">
      <p className="rounded-xl border border-line/10 bg-surface/60 p-3.5 text-[13px] leading-relaxed text-dim">
        {t('admin.permMatrixHint')}
      </p>
      <Card className="overflow-x-auto p-4">
        <table className="w-full min-w-105 text-[13.5px]">
          <thead>
            <tr className="border-b border-line/15 text-left text-[12px] uppercase tracking-wide text-dim">
              <th className="pb-2 pr-3 font-semibold">{t('admin.permCapability')}</th>
              {roles.map((r) => (
                <th key={r} className="pb-2 pr-3 text-center font-semibold">
                  {t(`roles.${r}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERM_KEYS.map((key) => (
              <tr key={key} className="border-b border-line/[0.06] last:border-0">
                <td className="py-2.5 pr-3">{t(`admin.perm.${key}`)}</td>
                {roles.map((r) => (
                  <td key={r} className="py-2.5 pr-3 text-center">
                    <input
                      type="checkbox"
                      checked={state.settings.permissions[r]?.[key] ?? false}
                      onChange={(e) => setPermission(r, key, e.target.checked)}
                      className="h-4 w-4 accent-accent"
                      aria-label={`${t(`roles.${r}`)}: ${t(`admin.perm.${key}`)}`}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  )
}

function GroupsTab() {
  const { t } = useTranslation()
  const { state, currentUser, addGroup, renameGroup, deleteGroup, groupDeleteBlockers, setGroupAdmins, setGroupMembers, setGroupRetention, setGroupAircraft } =
    useStore()
  const [showNew, setShowNew] = useState(false)
  // aufgeklappte Gruppe (kompakte Liste bei vielen Gruppen)
  const [openId, setOpenId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [purpose, setPurpose] = useState('')
  const [newAircraft, setNewAircraft] = useState('')
  // Doppelte Gruppennamen wären im Chat nicht auseinanderzuhalten
  const nameTaken = !!name.trim() && state.groups.some((g) => g.name.trim().toLowerCase() === name.trim().toLowerCase())

  // Gruppen nach Muster sortiert: erst je Aircraft Type, dann die
  // musterübergreifenden — die Chat-Themen unterscheiden sich je Typ.
  // Ein Gruppenadmin verwaltet nur die Gruppen, in denen er als Admin
  // eingetragen ist — fremde Gruppen sind hier weder sicht- noch änderbar.
  const groups = state.groups
    .filter((g) => currentUser!.role === 'superadmin' || g.adminIds.includes(currentUser!.id))
    .sort((a, b) => (a.aircraftType || 'zzz').localeCompare(b.aircraftType || 'zzz') || a.name.localeCompare(b.name))
  const activeUsers = state.users.filter((u) => u.active).sort((a, b) => a.name.localeCompare(b.name))
  const aircraftTypes = [...state.settings.aircraftTypes].sort((a, b) => a.localeCompare(b))
  // Zwischenüberschrift, sobald ein neues Muster beginnt
  const headingFor = (i: number) => {
    const cur = groups[i].aircraftType || ''
    const prev = i > 0 ? groups[i - 1].aircraftType || '' : null
    return prev === cur ? null : cur || t('admin.groupNoAircraft')
  }

  return (
    <div className="space-y-3">
      <Button onClick={() => setShowNew(true)} className="flex items-center gap-1.5">
        <Plus size={15} /> {t('admin.addGroup')}
      </Button>
      {groups.map((g, i) => (
        <div key={g.id}>
        {headingFor(i) && (
          <p className="mb-1.5 mt-2 px-1 text-[12px] font-semibold uppercase tracking-wide text-dim">{headingFor(i)}</p>
        )}
        <Card className="space-y-3 p-3">
          {/* Kompakte Kopfzeile: Name und Mitgliederzahl, Details auf Klick */}
          <div className="flex items-center gap-3">
            <Avatar name={g.name} size={34} />
            <button onClick={() => setOpenId(openId === g.id ? null : g.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
              <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">{g.name}</span>
              {g.aircraftType && (
                <span className="shrink-0 rounded-full bg-raised px-2 py-0.5 text-[11.5px] font-medium text-accent">{g.aircraftType}</span>
              )}
              <span className="shrink-0 text-[12px] text-dim">{t('chatInfo.members', { count: g.memberIds.length })}</span>
              <ChevronDown size={16} className={`shrink-0 text-dim transition ${openId === g.id ? 'rotate-180' : ''}`} />
            </button>
            {/* Blockiert das Löschen, weil jemand ohne Gruppe zurückbliebe,
                nennt der Knopf den Grund — vorher verpuffte der Klick. */}
            <button
              onClick={() => {
                const blockers = groupDeleteBlockers(g.id)
                if (blockers.length > 0) {
                  window.alert(t('chatInfo.deleteBlocked', { names: blockers.map((u) => u.name).join(', ') }))
                  return
                }
                if (window.confirm(t('admin.confirmDeleteGroup'))) deleteGroup(g.id)
              }}
              aria-label={t('chatInfo.deleteGroup')}
              title={t('chatInfo.deleteGroup')}
              className="flex h-11 w-11 items-center justify-center rounded-full text-dim hover:text-danger"
            >
              <Trash2 size={16} />
            </button>
          </div>
          <div className={openId === g.id ? 'space-y-3' : 'hidden'}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('admin.groupName')}>
              <input value={g.name} onChange={(e) => renameGroup(g.id, e.target.value)} className={inputCls} />
            </Field>
            {/* Muster der Gruppe — leer = musterübergreifend */}
            <Field label={t('admin.groupAircraft')}>
              <select
                value={g.aircraftType ?? ''}
                onChange={(e) => setGroupAircraft(g.id, e.target.value)}
                className="w-full rounded-xl border border-line/10 bg-bg/60 px-3 py-2 text-[13.5px]"
              >
                <option value="">{t('admin.groupNoAircraft')}</option>
                {aircraftTypes.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('chatInfo.retentionOverride')}>
              <select
                value={g.retention ?? 'default'}
                onChange={(e) => setGroupRetention(g.id, e.target.value === 'default' ? null : (e.target.value as RetentionKey))}
                className="w-full rounded-xl border border-line/10 bg-bg/60 px-3 py-2 text-[13.5px]"
              >
                <option value="default">
                  {t('retention.default', { value: t(`retention.${state.settings.defaultRetention}`) })}
                </option>
                {RETENTION_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {t(`retention.${k}`)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('admin.groupAdmins')} group>
              <div className="flex flex-wrap gap-1.5">
                {activeUsers.map((u) => {
                  const isAdmin = g.adminIds.includes(u.id)
                  return (
                    <button
                      key={u.id}
                      aria-pressed={isAdmin}
                      onClick={() =>
                        setGroupAdmins(g.id, isAdmin ? g.adminIds.filter((id) => id !== u.id) : [...g.adminIds, u.id])
                      }
                      className={`min-h-11 rounded-full border px-2.5 py-1 text-[12px] transition ${
                        isAdmin ? 'border-accent bg-accent/15 font-semibold text-accent' : 'border-line/12 text-dim'
                      }`}
                    >
                      {u.name}
                    </button>
                  )
                })}
              </div>
            </Field>
          </div>
          <Field label={`${t('admin.membersManage')} (${g.memberIds.length})`} group>
            <div className="flex flex-wrap gap-1.5">
              {activeUsers.map((u) => {
                const isMember = g.memberIds.includes(u.id)
                return (
                  <button
                    key={u.id}
                    aria-pressed={isMember}
                    onClick={() =>
                      setGroupMembers(g.id, isMember ? g.memberIds.filter((id) => id !== u.id) : [...g.memberIds, u.id])
                    }
                    className={`min-h-11 rounded-full border px-2.5 py-1 text-[12px] transition ${
                      isMember ? 'border-warm/60 bg-warm/10 font-medium text-warm' : 'border-line/12 text-dim'
                    }`}
                  >
                    {u.name}
                  </button>
                )
              })}
            </div>
          </Field>
          </div>
        </Card>
        </div>
      ))}
      {showNew && (
        <Modal
          title={t('admin.addGroup')}
          onClose={() => setShowNew(false)}
          confirmDiscard={name.trim() || purpose.trim() || newAircraft ? t('common.discardConfirm') : undefined}
        >
          <div className="space-y-3.5">
            <Field label={t('admin.groupName')}>
              <input
                className={`${inputCls} ${nameTaken ? 'border-danger/60' : ''}`}
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
              {nameTaken && <p className="mt-1.5 text-[11.5px] leading-relaxed text-danger">{t('admin.groupNameTaken')}</p>}
            </Field>
            <Field label={t('admin.purpose')}>
              <input className={inputCls} value={purpose} onChange={(e) => setPurpose(e.target.value)} />
            </Field>
            <Field label={t('admin.groupAircraft')}>
              <select
                value={newAircraft}
                onChange={(e) => setNewAircraft(e.target.value)}
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
                disabled={!name.trim() || nameTaken}
                onClick={() => {
                  addGroup(name.trim(), purpose.trim(), newAircraft || undefined)
                  setShowNew(false)
                  setName('')
                  setPurpose('')
                  setNewAircraft('')
                }}
              >
                {t('common.save')}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

/** Eine Feedback-Karte mit Bearbeitet-Status (Tickbox), Bearbeiter, Zeit
 *  und optionaler Follow-up-Notiz. Bearbeitete bleiben erhalten und werden
 *  in der Liste unter die offenen sortiert. */
function FeedbackCard({
  f,
  userName,
  onDelete,
  onResolve,
  onReopen,
}: {
  f: FeedbackEntry
  userName: (id: string) => string
  onDelete: (id: string) => void
  onResolve: (id: string, note: string) => void
  onReopen: (id: string) => void
}) {
  const { t } = useTranslation()
  const done = !!f.resolvedBy
  const [note, setNote] = useState(f.resolutionNote ?? '')
  const [editNote, setEditNote] = useState(false)

  return (
    <Card className={`p-4 ${done ? 'opacity-80' : ''}`}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[14.5px] font-semibold">{userName(f.authorId)}</p>
            <Badge tone="dim">{f.category}</Badge>
            <Badge tone={f.aircraftType ? 'warm' : 'dim'}>{f.aircraftType || t('feedback.scopeGeneral')}</Badge>
            {f.urgent && (
              <span className="inline-flex items-center gap-1 rounded-full bg-danger/15 px-2.5 py-0.5 text-[11px] font-semibold text-danger">
                <AlertTriangle size={11} /> {t('feedback.urgent')}
              </span>
            )}
            {done && (
              <span className="inline-flex items-center gap-1 rounded-full bg-ok/15 px-2.5 py-0.5 text-[11px] font-semibold text-ok">
                <CheckCircle2 size={11} /> {t('admin.feedbackDone')}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[12px] text-dim">
            {formatDateTime(f.createdAt)} · {t('feedback.recipient')}: {f.recipient}
          </p>
          <p className="mt-2 whitespace-pre-wrap text-[13.5px] leading-relaxed">{f.message}</p>
          {f.attachment && (
            <p className="mt-2 flex items-center gap-1.5 text-[12.5px] text-dim">
              <Paperclip size={13} /> {f.attachment.name} · {f.attachment.sizeMB} MB
            </p>
          )}

          {/* Bearbeitet-Block: Wer, wann, und was getan wurde */}
          {done && (
            <div className="mt-3 rounded-xl border border-ok/25 bg-ok/[0.06] p-3">
              <p className="text-[12.5px] font-medium text-dim">
                {t('admin.feedbackResolvedBy', { name: userName(f.resolvedBy!), date: formatDateTime(f.resolvedAt!) })}
              </p>
              {f.resolutionNote && !editNote && (
                <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed">{f.resolutionNote}</p>
              )}
              {editNote ? (
                <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                  <input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder={t('admin.feedbackNotePlaceholder')}
                    aria-label={t('admin.feedbackNoteLabel')}
                    className={inputCls}
                  />
                  <Button
                    onClick={() => {
                      onResolve(f.id, note)
                      setEditNote(false)
                    }}
                    className="shrink-0"
                  >
                    {t('common.save')}
                  </Button>
                </div>
              ) : (
                <button onClick={() => setEditNote(true)} className="mt-1.5 text-[12px] font-medium text-accent hover:underline">
                  {f.resolutionNote ? t('admin.feedbackEditNote') : t('admin.feedbackAddNote')}
                </button>
              )}
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          {/* Tickbox „Erledigt" — schaltet Bearbeitet-Status um */}
          <label className="flex cursor-pointer items-center gap-1.5 text-[12.5px] font-medium text-dim">
            <input
              type="checkbox"
              checked={done}
              onChange={(e) => (e.target.checked ? onResolve(f.id, note) : onReopen(f.id))}
              className="h-5 w-5 shrink-0 accent-ok"
            />
            {t('admin.feedbackDone')}
          </label>
          <button
            onClick={() => window.confirm(t('admin.confirmDeleteFeedback')) && onDelete(f.id)}
            aria-label={t('common.delete')}
            className="flex h-11 w-11 items-center justify-center rounded-full text-dim hover:text-danger"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
    </Card>
  )
}

/** Eingegangenes Feedback: bleibt gespeichert, kann hier bei Bedarf gelöscht werden */
function FeedbackTab() {
  const { t } = useTranslation()
  const { state, currentUser, deleteFeedback, resolveFeedback, reopenFeedback } = useStore()
  // Filter: Kategorie, Empfänger, nur Dringendes
  const [fCat, setFCat] = useState('')
  const [fRec, setFRec] = useState('')
  const [fScope, setFScope] = useState('')
  const [onlyUrgent, setOnlyUrgent] = useState(false)
  // Ein Gruppenadmin sieht nur Rückmeldungen aus seinen eigenen Gruppen —
  // vorher lag ihm auch das offen, was an HR gerichtet war.
  const myMemberIds = new Set(
    state.groups.filter((g) => g.adminIds.includes(currentUser!.id)).flatMap((g) => g.memberIds),
  )
  const all = [...state.feedbackEntries]
    .filter((f) => currentUser!.role === 'superadmin' || myMemberIds.has(f.authorId))
    .sort((a, b) => b.createdAt - a.createdAt)
  const entries = all.filter((f) => {
    if (fCat && f.category !== fCat) return false
    if (fRec && f.recipient !== fRec) return false
    if (fScope === 'general' && f.aircraftType) return false
    if (fScope && fScope !== 'general' && f.aircraftType !== fScope) return false
    if (onlyUrgent && !f.urgent) return false
    return true
  })
  // Offen zuerst (neueste oben), Bearbeitete darunter (zuletzt bearbeitete oben)
  const open = entries.filter((f) => !f.resolvedBy)
  const resolved = entries
    .filter((f) => f.resolvedBy)
    .sort((a, b) => (b.resolvedAt ?? 0) - (a.resolvedAt ?? 0))
  const userName = (id: string) => state.users.find((u) => u.id === id)?.name ?? '—'
  const cats = [...new Set(all.map((f) => f.category))].sort()
  const recs = [...new Set(all.map((f) => f.recipient))].sort()
  const scopeTypes = [...new Set(all.map((f) => f.aircraftType).filter(Boolean) as string[])].sort()

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select value={fCat} onChange={(e) => setFCat(e.target.value)} className="rounded-xl border border-line/10 bg-bg/60 px-3 py-2 text-[13px]">
          <option value="">{t('admin.allCategories')}</option>
          {cats.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select value={fRec} onChange={(e) => setFRec(e.target.value)} className="rounded-xl border border-line/10 bg-bg/60 px-3 py-2 text-[13px]">
          <option value="">{t('admin.allRecipients')}</option>
          {recs.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <select value={fScope} onChange={(e) => setFScope(e.target.value)} className="rounded-xl border border-line/10 bg-bg/60 px-3 py-2 text-[13px]">
          <option value="">{t('admin.allScopes')}</option>
          <option value="general">{t('feedback.scopeGeneral')}</option>
          {scopeTypes.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <button
          onClick={() => setOnlyUrgent(!onlyUrgent)}
          className={`min-h-11 rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition ${
            onlyUrgent ? 'border-danger bg-danger/15 text-danger' : 'border-line/15 text-dim'
          }`}
        >
          {t('admin.onlyUrgent')}
        </button>
        <span className="ml-auto shrink-0 text-[12.5px] text-dim">
          {entries.length}/{all.length}
        </span>
      </div>
      {entries.length === 0 && <p className="pt-6 text-center text-sm text-dim">{t('admin.feedbackEmpty')}</p>}
      {/* Offene zuerst, dann — abgesetzt — die bereits bearbeiteten. */}
      {open.map((f) => (
        <FeedbackCard key={f.id} f={f} userName={userName} onDelete={deleteFeedback} onResolve={resolveFeedback} onReopen={reopenFeedback} />
      ))}
      {resolved.length > 0 && (
        <div className="flex items-center gap-2 pt-3 text-[12px] font-semibold uppercase tracking-wide text-dim">
          <CheckCircle2 size={14} className="text-ok" />
          {t('admin.feedbackResolvedSection', { count: resolved.length })}
        </div>
      )}
      {resolved.map((f) => (
        <FeedbackCard key={f.id} f={f} userName={userName} onDelete={deleteFeedback} onResolve={resolveFeedback} onReopen={reopenFeedback} />
      ))}
    </div>
  )
}

/** Bytes menschenlesbar — die Zahlen reichen von KB (Seed) bis GB (Quota). */
function fmtBytes(n: number): string {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MB`
  return `${Math.max(1, Math.round(n / 1024))} KB`
}

/**
 * Füllstand der Ablage. localStorage lief bei echtem Betrieb nach 40–80
 * Formularen voll — stillschweigend. Nach dem Umzug auf IndexedDB ist die
 * Grenze weit weg, aber sie existiert; hier sieht der Admin sie, bevor der
 * Warnstreifen erscheint.
 */
function StorageCard() {
  const { t } = useTranslation()
  const [info, setInfo] = useState<StorageInfo | null | 'loading'>('loading')
  useEffect(() => {
    let stop = false
    storageInfo().then((i) => {
      if (!stop) setInfo(i)
    })
    return () => {
      stop = true
    }
  }, [])
  if (info === 'loading') return null
  const share = info && info.quota > 0 ? info.usage / info.quota : null
  return (
    <Card className="space-y-3 p-4">
      <p className="text-[13px] font-semibold uppercase tracking-wide text-dim">{t('admin.storage')}</p>
      {info === null || share === null ? (
        <p className="text-[13px] text-dim">{t('admin.storageUnknown')}</p>
      ) : (
        <>
          <div className="flex items-baseline justify-between text-[13.5px]">
            <span>
              {t('admin.storageUsed')}: <strong>{fmtBytes(info.usage)}</strong>{' '}
              <span className="text-dim">{t('admin.storageQuota', { quota: fmtBytes(info.quota) })}</span>
            </span>
            <span className={share > 0.85 ? 'font-semibold text-danger' : 'text-dim'}>{Math.round(share * 100)} %</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-raised" role="presentation">
            <div
              className={`h-full rounded-full ${share > 0.85 ? 'bg-danger' : share > 0.7 ? 'bg-wait' : 'bg-ok'}`}
              style={{ width: `${Math.max(2, Math.min(100, share * 100))}%` }}
            />
          </div>
          <p className="text-[12.5px] text-dim">
            {t('admin.storageState')}: {fmtBytes(info.stateBytes)}
          </p>
        </>
      )}
      <p className="text-[12px] leading-relaxed text-dim">{t('admin.storageHint')}</p>
    </Card>
  )
}

function SettingsTab() {
  const { t } = useTranslation()
  const { state, updateSettings } = useStore()
  const s = state.settings

  return (
    <div className="space-y-5">
      <Card className="space-y-4 p-4">
        <Field label={t('admin.defaultRetention')}>
          <select
            value={s.defaultRetention}
            onChange={(e) => updateSettings({ defaultRetention: e.target.value as RetentionKey })}
            className={selectCls}
          >
            {RETENTION_KEYS.map((k) => (
              <option key={k} value={k}>
                {t(`retention.${k}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('admin.maxUpload')}>
          <input
            type="number"
            min={1}
            value={s.maxUploadMB}
            onChange={(e) => updateSettings({ maxUploadMB: Math.max(1, Number(e.target.value) || 1) })}
            className={inputCls}
          />
        </Field>
        {/* Diese Musterliste erscheint in ALLEN Grading-Formularen und in den
            Lesson Plans — eine Pflegestelle für die ganze App. */}
        <StringListEditor
          label={t('admin.aircraftTypesGlobal')}
          values={s.aircraftTypes}
          onChange={(aircraftTypes) => updateSettings({ aircraftTypes })}
        />
      </Card>
      <Card className="p-4">
        {/* Kategorien der Instructor-Info-Einträge: löschen/hinzufügen — Filter passt sich an */}
        <StringListEditor label={t('admin.infoCategories')} values={s.infoCategories} onChange={(v) => updateSettings({ infoCategories: v })} />
      </Card>
      <Card className="p-4">
        <StringListEditor label={t('admin.categories')} values={s.feedbackCategories} onChange={(v) => updateSettings({ feedbackCategories: v })} />
      </Card>
      <Card className="p-4">
        <StringListEditor label={t('admin.feedbackRecipients')} values={s.feedbackRecipients} onChange={(v) => updateSettings({ feedbackRecipients: v })} />
      </Card>
      <Card className="p-4">
        <StringListEditor label={t('admin.ccList')} values={s.feedbackCC} onChange={(v) => updateSettings({ feedbackCC: v })} />
      </Card>
      <Card className="p-4">
        <StringListEditor label={t('admin.domains')} values={s.allowedDomains} onChange={(v) => updateSettings({ allowedDomains: v })} />
      </Card>
      <StorageCard />
      {/* Herkunftsangaben des Ausdrucks — ohne sie ist ein ausgedrucktes
          Formular keiner Organisation und keinem Formularstand zuzuordnen. */}
      <Card className="space-y-3 p-4">
        <p className="text-[13px] font-semibold uppercase tracking-wide text-dim">{t('admin.documentHeader')}</p>
        {(
          [
            ['atoName', t('admin.atoName')],
            ['approvalNumber', t('admin.approvalNumber')],
            ['approvalNumberUK', t('admin.approvalNumberUK')],
            ['formRevision', t('admin.formRevision')],
          ] as const
        ).map(([key, label]) => (
          <Field key={key} label={label}>
            <input
              className={inputCls}
              value={s.documentHeader?.[key] ?? ''}
              onChange={(e) =>
                updateSettings({
                  documentHeader: { ...{ atoName: '', approvalNumber: '', approvalNumberUK: '', formRevision: '' }, ...s.documentHeader, [key]: e.target.value },
                })
              }
            />
          </Field>
        ))}
        <p className="text-[12px] leading-relaxed text-dim">{t('admin.documentHeaderHint')}</p>
      </Card>
    </div>
  )
}

function ImprintTab() {
  const { t } = useTranslation()
  const { state, updateSettings } = useStore()
  const [de, setDe] = useState(state.settings.imprint.de)
  const [en, setEn] = useState(state.settings.imprint.en)

  const dirty = de !== state.settings.imprint.de || en !== state.settings.imprint.en

  // Automatisch speichern wie überall im Admin Panel — kurz nach der
  // letzten Eingabe, damit nicht bei jedem Tastendruck geschrieben wird.
  useEffect(() => {
    if (!dirty) return
    const tm = setTimeout(() => updateSettings({ imprint: { de, en } }), 600)
    return () => clearTimeout(tm)
  }, [de, en, dirty, updateSettings])

  return (
    <div className="space-y-4">
      <p className="text-[13px] leading-relaxed text-dim">{t('admin.imprintHint')}</p>
      <Card className="space-y-4 p-4">
        <Field label={t('admin.imprintDe')}>
          <textarea
            value={de}
            onChange={(e) => setDe(e.target.value)}
            spellCheck={false}
            className={`${inputCls} min-h-72 font-mono text-[12.5px] leading-relaxed`}
          />
        </Field>
        <Field label={t('admin.imprintEn')}>
          <textarea
            value={en}
            onChange={(e) => setEn(e.target.value)}
            spellCheck={false}
            className={`${inputCls} min-h-72 font-mono text-[12.5px] leading-relaxed`}
          />
        </Field>
        <p className="text-right text-[12.5px] text-dim">
          {dirty ? t('admin.autoSaving') : t('admin.imprintSaved')}
        </p>
      </Card>
    </div>
  )
}

function ChangelogTab() {
  const { t } = useTranslation()
  const { state } = useStore()
  return (
    <div className="space-y-3">
      <Card className="flex items-center justify-between p-4">
        <span className="text-[14px] text-dim">{t('admin.currentVersion')}</span>
        <span className="text-lg font-bold text-accent">v{APP_VERSION}</span>
      </Card>
      {state.changelog.map((entry) => (
        <Card key={entry.version} className="p-4">
          <div className="mb-1 flex items-center gap-2">
            <Badge>v{entry.version}</Badge>
            <span className="text-[12px] text-dim">{entry.date}</span>
          </div>
          <p className="text-[13.5px] leading-relaxed">{entry.changes}</p>
        </Card>
      ))}
    </div>
  )
}

/* Icons der Admin-Kacheln — gleiche Optik wie die Dashboard-Kacheln */
const TAB_ICONS: Record<Tab, typeof Users> = {
  users: Users,
  permissions: ShieldCheck,
  grading: ClipboardList,
  groups: UsersRound,
  feedback: MessageSquareText,
  settings: Settings,
  imprint: ScrollText,
  changelog: History,
}

/**
 * Die Bereiche sind Adressen, keine Komponenten-Zustände: #/admin zeigt die
 * Kachelübersicht, #/admin/users den Benutzer-Bereich. Vorher stand die
 * Adresse immer auf #/admin — ein Bereich ließ sich niemandem schicken, die
 * Zurück-Taste sprang aus dem Panel heraus statt eine Ebene hoch, und ein
 * erneuter Aufruf von #/admin führte nicht zurück in die Übersicht.
 *
 * @param sub Pfad hinter „/admin/" — erstes Segment ist der Bereich, ein
 *            zweites reicht die Grading-Ablage an ihre Unterbereiche weiter.
 */
export function Admin({ sub = '' }: { sub?: string }) {
  const { t } = useTranslation()
  const { currentUser } = useStore()
  const [tabSeg, sectionSeg] = sub.split('/')
  const tab = (TAB_ICONS as Record<string, unknown>)[tabSeg] ? (tabSeg as Tab) : null

  // Wechselt die Identität (Sandbox-Leiste) oder die Rolle, darf ein bereits
  // geöffneter Bereich nicht stehen bleiben — sonst bedient die neue Identität
  // weiter eine Ansicht, die ihr gar nicht zusteht.
  const identity = `${currentUser?.id ?? ''}:${currentUser?.role ?? ''}`
  const lastIdentity = useRef(identity)
  useEffect(() => {
    if (lastIdentity.current !== identity) {
      lastIdentity.current = identity
      if (tab) navigate('/admin', true)
    }
  }, [identity, tab])

  const isSuper = currentUser!.role === 'superadmin'
  // Maßgeblich ist die Freigabeliste: ein Bereich, den die aktuelle Rolle
  // nicht öffnen darf, wird gar nicht erst gerendert.
  const tabs: Tab[] = isSuper
    ? ['users', 'permissions', 'grading', 'groups', 'feedback', 'settings', 'imprint', 'changelog']
    : ['groups', 'feedback']
  const openTab = tab && tabs.includes(tab) ? tab : null

  // Eine Adresse, die dieser Rolle nicht offensteht (oder es gar nicht gibt),
  // darf nicht stehen bleiben, während die Übersicht gezeigt wird — sonst
  // behauptet die Adresszeile einen Bereich, der nicht offen ist. Der Sprung
  // ersetzt den Verlaufseintrag, damit die Zurück-Taste nicht dorthin
  // zurückspringt.
  useEffect(() => {
    if (sub && !openTab) navigate('/admin', true)
  }, [sub, openTab])

  // Serverseitig gilt RLS; hier zusätzlich die Client-Absicherung.
  // Admins bekommen ein kleines Panel (Gruppen + Feedback), alles
  // Weitere bleibt dem Superadmin vorbehalten.
  if (currentUser!.role !== 'superadmin' && currentUser!.role !== 'group_admin') {
    return (
      <>
        <TopBar title={t('admin.title')} back="/" />
        <Page>
          <p className="pt-10 text-center text-sm text-dim">{t('admin.noAccess')}</p>
        </Page>
      </>
    )
  }


  return (
    <>
      <TopBar title={openTab ? `${t('admin.title')} · ${t(`admin.${openTab}`)}` : t('admin.title')} back="/" />
      {/* Am Handy ist das Panel zu unübersichtlich — dort steht der Hinweis
          statt des Inhalts. Die Entscheidung fällt in CSS, nicht in JS: beim
          Drucken ist die Seite schmaler als 1024px, der Ausdruck bestand
          sonst nur aus diesem Hinweis. */}
      <div className="admin-narrow-note mx-auto w-full max-w-3xl px-4 pb-24 pt-4">
        <div className="flex flex-col items-center gap-3 pt-16 text-center">
          <Monitor size={44} className="text-accent" />
          <p className="max-w-xs text-[14px] leading-relaxed text-dim">{t('admin.desktopOnly')}</p>
        </div>
      </div>
      <Page className="admin-panel">
        {openTab === null ? (
          <>
            {/* Kachel-Übersicht wie am Dashboard — leichter zu finden und zu ändern */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {tabs.map((tb) => {
                const Icon = TAB_ICONS[tb]
                return (
                  <button
                    key={tb}
                    onClick={() => navigate(`/admin/${tb}`)}
                    className="group flex aspect-square flex-col items-center justify-center gap-3 rounded-3xl border border-line/[0.07] bg-surface shadow-tile transition hover:-translate-y-0.5 hover:border-accent/40 hover:bg-raised"
                  >
                    <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-raised text-accent transition group-hover:bg-accent group-hover:text-bg">
                      <Icon size={28} />
                    </span>
                    <span className="px-2 text-center text-[14px] font-semibold leading-tight">{t(`admin.${tb}`)}</span>
                  </button>
                )
              })}
            </div>
            <p className="mt-5 text-center text-[12px] text-dim">{t('admin.autoSaveHint')}</p>
          </>
        ) : (
          <>
            <button
              onClick={() => navigate('/admin')}
              className="mb-4 flex items-center gap-1.5 text-[13px] font-medium text-dim transition hover:text-ink"
            >
              <ArrowLeft size={15} /> {t('admin.backToOverview')}
            </button>
            {openTab === 'users' && <UsersTab />}
            {openTab === 'permissions' && <PermissionsTab />}
            {openTab === 'grading' && <GradingAdmin section={sectionSeg} />}
            {openTab === 'groups' && <GroupsTab />}
            {openTab === 'feedback' && <FeedbackTab />}
            {openTab === 'settings' && <SettingsTab />}
            {openTab === 'imprint' && <ImprintTab />}
            {openTab === 'changelog' && <ChangelogTab />}
          </>
        )}
      </Page>
    </>
  )
}
