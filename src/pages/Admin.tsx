import { Monitor, Plus, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Avatar, Badge, Button, Card, Field, inputCls, Modal, Page, TopBar } from '../components/ui'
import { useStore } from '../store'
import { useIsDesktop } from '../useIsDesktop'
import { APP_VERSION, type RetentionKey, type Role } from '../types'

const RETENTION_KEYS: RetentionKey[] = ['24h', '7d', '30d', '90d', 'never']
type Tab = 'users' | 'groups' | 'settings' | 'imprint' | 'changelog'

function StringListEditor({ label, values, onChange }: { label: string; values: string[]; onChange: (v: string[]) => void }) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState('')
  const add = () => {
    const v = draft.trim()
    if (v && !values.includes(v)) onChange([...values, v])
    setDraft('')
  }
  return (
    <Field label={label}>
      <div className="mb-2 flex flex-wrap gap-2">
        {values.map((v) => (
          <span key={v} className="flex items-center gap-1.5 rounded-full bg-raised px-3 py-1.5 text-[13px]">
            {v}
            <button onClick={() => onChange(values.filter((x) => x !== v))} className="text-dim hover:text-danger">
              <X size={13} />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          className={inputCls}
          value={draft}
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
  const { state, updateUser, deleteUser, addUser } = useStore()
  const [showNew, setShowNew] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', phone: '', role: 'member' as Role })

  const users = [...state.users].sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div className="space-y-3">
      <Button onClick={() => setShowNew(true)} className="flex items-center gap-1.5">
        <Plus size={15} /> {t('admin.addUser')}
      </Button>
      {users.map((u) => (
        <Card key={u.id} className={`p-4 ${u.active ? '' : 'opacity-55'}`}>
          <div className="flex items-center gap-3">
            <Avatar name={u.name} size={38} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14.5px] font-semibold">{u.name}</p>
              <p className="truncate text-[12.5px] text-dim">
                {u.email} · {u.phone}
              </p>
            </div>
            <Badge tone={u.active ? 'accent' : 'dim'}>{u.active ? t('admin.active') : t('admin.inactive')}</Badge>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px]">
            <select
              value={u.role}
              onChange={(e) => updateUser(u.id, { role: e.target.value as Role })}
              className="rounded-lg border border-line/10 bg-bg/60 px-2 py-1.5"
            >
              {(['member', 'group_admin', 'superadmin'] as Role[]).map((r) => (
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
                className="accent-accent"
              />
              {t('admin.canEditDirectory')}
            </label>
            <span className="ml-auto flex gap-2">
              <button onClick={() => updateUser(u.id, { active: !u.active })} className="text-dim hover:text-ink">
                {u.active ? t('admin.deactivate') : t('admin.activate')}
              </button>
              <button
                onClick={() => window.confirm(t('admin.confirmDeleteUser')) && deleteUser(u.id)}
                className="text-danger/80 hover:text-danger"
              >
                {t('common.delete')}
              </button>
            </span>
          </div>
        </Card>
      ))}
      {showNew && (
        <Modal title={t('admin.addUser')} onClose={() => setShowNew(false)}>
          <div className="space-y-3.5">
            <Field label={t('contacts.name')}>
              <input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
            </Field>
            <Field label={t('contacts.email')}>
              <input className={inputCls} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Field>
            <Field label={t('contacts.phone')}>
              <input className={inputCls} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </Field>
            <Field label={t('admin.role')}>
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
                className="w-full rounded-xl border border-line/10 bg-bg/60 px-3 py-2.5 text-[14px]"
              >
                {(['member', 'group_admin', 'superadmin'] as Role[]).map((r) => (
                  <option key={r} value={r}>
                    {t(`roles.${r}`)}
                  </option>
                ))}
              </select>
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowNew(false)}>
                {t('common.cancel')}
              </Button>
              <Button
                disabled={!form.name.trim() || (!form.email.trim() && !form.phone.trim())}
                onClick={() => {
                  addUser(form)
                  setShowNew(false)
                  setForm({ name: '', email: '', phone: '', role: 'member' })
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

function GroupsTab() {
  const { t } = useTranslation()
  const { state, addGroup, renameGroup, deleteGroup, setGroupAdmins, setGroupMembers, setGroupRetention } = useStore()
  const [showNew, setShowNew] = useState(false)
  const [name, setName] = useState('')
  const [purpose, setPurpose] = useState('')

  const groups = [...state.groups].sort((a, b) => a.name.localeCompare(b.name))
  const activeUsers = state.users.filter((u) => u.active).sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div className="space-y-3">
      <Button onClick={() => setShowNew(true)} className="flex items-center gap-1.5">
        <Plus size={15} /> {t('admin.addGroup')}
      </Button>
      {groups.map((g) => (
        <Card key={g.id} className="space-y-3 p-4">
          <div className="flex items-center gap-3">
            <Avatar name={g.name} size={38} />
            <input
              value={g.name}
              onChange={(e) => renameGroup(g.id, e.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1 text-[15px] font-semibold outline-none transition focus:border-line/15 focus:bg-bg/50"
            />
            <button
              onClick={() => window.confirm(t('admin.confirmDeleteGroup')) && deleteGroup(g.id)}
              className="rounded-full p-2 text-dim hover:text-danger"
            >
              <Trash2 size={16} />
            </button>
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
            <Field label={t('admin.groupAdmins')}>
              <div className="flex flex-wrap gap-1.5">
                {activeUsers.map((u) => {
                  const isAdmin = g.adminIds.includes(u.id)
                  return (
                    <button
                      key={u.id}
                      onClick={() =>
                        setGroupAdmins(g.id, isAdmin ? g.adminIds.filter((id) => id !== u.id) : [...g.adminIds, u.id])
                      }
                      className={`rounded-full border px-2.5 py-1 text-[12px] transition ${
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
          <Field label={`${t('admin.membersManage')} (${g.memberIds.length})`}>
            <div className="flex flex-wrap gap-1.5">
              {activeUsers.map((u) => {
                const isMember = g.memberIds.includes(u.id)
                return (
                  <button
                    key={u.id}
                    onClick={() =>
                      setGroupMembers(g.id, isMember ? g.memberIds.filter((id) => id !== u.id) : [...g.memberIds, u.id])
                    }
                    className={`rounded-full border px-2.5 py-1 text-[12px] transition ${
                      isMember ? 'border-warm/60 bg-warm/10 font-medium text-warm' : 'border-line/12 text-dim'
                    }`}
                  >
                    {u.name}
                  </button>
                )
              })}
            </div>
          </Field>
        </Card>
      ))}
      {showNew && (
        <Modal title={t('admin.addGroup')} onClose={() => setShowNew(false)}>
          <div className="space-y-3.5">
            <Field label={t('admin.groupName')}>
              <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            </Field>
            <Field label={t('admin.purpose')}>
              <input className={inputCls} value={purpose} onChange={(e) => setPurpose(e.target.value)} />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowNew(false)}>
                {t('common.cancel')}
              </Button>
              <Button
                disabled={!name.trim()}
                onClick={() => {
                  addGroup(name.trim(), purpose.trim())
                  setShowNew(false)
                  setName('')
                  setPurpose('')
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
            className="w-full rounded-xl border border-line/10 bg-bg/60 px-3 py-2.5 text-[14px]"
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
      </Card>
      <Card className="p-4">
        <StringListEditor label={t('admin.categories')} values={s.feedbackCategories} onChange={(v) => updateSettings({ feedbackCategories: v })} />
      </Card>
      <Card className="p-4">
        <StringListEditor label={t('admin.ccList')} values={s.feedbackCC} onChange={(v) => updateSettings({ feedbackCC: v })} />
      </Card>
      <Card className="p-4">
        <StringListEditor label={t('admin.domains')} values={s.allowedDomains} onChange={(v) => updateSettings({ allowedDomains: v })} />
      </Card>
    </div>
  )
}

function ImprintTab() {
  const { t } = useTranslation()
  const { state, updateSettings } = useStore()
  const [de, setDe] = useState(state.settings.imprint.de)
  const [en, setEn] = useState(state.settings.imprint.en)
  const [saved, setSaved] = useState(false)

  const dirty = de !== state.settings.imprint.de || en !== state.settings.imprint.en

  return (
    <div className="space-y-4">
      <p className="text-[13px] leading-relaxed text-dim">{t('admin.imprintHint')}</p>
      <Card className="space-y-4 p-4">
        <Field label={t('admin.imprintDe')}>
          <textarea
            value={de}
            onChange={(e) => {
              setDe(e.target.value)
              setSaved(false)
            }}
            spellCheck={false}
            className={`${inputCls} min-h-72 font-mono text-[12.5px] leading-relaxed`}
          />
        </Field>
        <Field label={t('admin.imprintEn')}>
          <textarea
            value={en}
            onChange={(e) => {
              setEn(e.target.value)
              setSaved(false)
            }}
            spellCheck={false}
            className={`${inputCls} min-h-72 font-mono text-[12.5px] leading-relaxed`}
          />
        </Field>
        <div className="flex items-center justify-end gap-3">
          {saved && !dirty && <span className="text-[13px] text-accent">{t('admin.imprintSaved')}</span>}
          <Button
            disabled={!dirty}
            onClick={() => {
              updateSettings({ imprint: { de, en } })
              setSaved(true)
            }}
          >
            {t('common.save')}
          </Button>
        </div>
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

export function Admin() {
  const { t } = useTranslation()
  const { currentUser } = useStore()
  const isDesktop = useIsDesktop()
  const [tab, setTab] = useState<Tab>('users')

  // Am Tablet/Handy ist das Panel zu unübersichtlich — Hinweis statt Inhalt.
  if (!isDesktop) {
    return (
      <>
        <TopBar title={t('admin.title')} back="/" />
        <Page>
          <div className="flex flex-col items-center gap-3 pt-16 text-center">
            <Monitor size={44} className="text-accent" />
            <p className="max-w-xs text-[14px] leading-relaxed text-dim">{t('admin.desktopOnly')}</p>
          </div>
        </Page>
      </>
    )
  }

  // Serverseitig gilt RLS; hier zusätzlich die Client-Absicherung.
  if (currentUser!.role !== 'superadmin') {
    return (
      <>
        <TopBar title={t('admin.title')} back="/" />
        <Page>
          <p className="pt-10 text-center text-sm text-dim">—</p>
        </Page>
      </>
    )
  }

  const tabs: Tab[] = ['users', 'groups', 'settings', 'imprint', 'changelog']

  return (
    <>
      <TopBar title={t('admin.title')} back="/" />
      <Page>
        <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
          {tabs.map((tb) => (
            <button
              key={tb}
              onClick={() => setTab(tb)}
              className={`shrink-0 rounded-full border px-4 py-2 text-[13.5px] transition ${
                tab === tb ? 'border-accent bg-accent/15 font-semibold text-accent' : 'border-line/15 text-dim'
              }`}
            >
              {t(`admin.${tb}`)}
            </button>
          ))}
        </div>
        {tab === 'users' && <UsersTab />}
        {tab === 'groups' && <GroupsTab />}
        {tab === 'settings' && <SettingsTab />}
        {tab === 'imprint' && <ImprintTab />}
        {tab === 'changelog' && <ChangelogTab />}
      </Page>
    </>
  )
}
