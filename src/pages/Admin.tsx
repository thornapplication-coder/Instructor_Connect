import { AlertTriangle, ArrowLeft, BookMarked, CheckCircle2, ChevronDown, Clock, ClipboardList, Download, History, MessageSquareText, MessagesSquare, Monitor, Paperclip, Plus, ScrollText, Settings, ShieldCheck, Trash2, Upload, Users, X } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Avatar, Badge, Button, Card, CardHeading, ChipListe, ChipMultiSelect, Field, inputCls, Modal, Page, SectionHeading, selectCls, TopBar } from '../components/ui'
import { navigate } from '../router'
import { adminStatus } from '../adminStatus'
import { planBulk, type BulkAktion } from '../bulkUsers'
import { einzelAenderung } from '../benutzerRegeln'
import { domainErlaubt, domainSperre, neuAusgesperrt, normalisiereDomain } from '../domains'
import { gruppenPflicht, gruppenTauglich, musterBelegt, musterInVerwendung, musterPflicht, musterZurAuswahl, nachMuster, verliertLetzteGruppe } from '../aircraftScope'
import { festeEintraege, MAX_UPLOAD_MB, uploadGrenze } from '../einstellungen'
import { adminKandidaten, gruppenAenderungFehler, gruppenName, gruppenNameFehler, type GruppenNameFehler } from '../gruppen'
import { rasterKlasse } from '../kachelRaster'
import { adminTabsFuer, istSperre, PERSON_PERMS, personenRechtWirkt, personenRechtWirksam, rechteLink, suchAusQuery } from '../adminAccess'
import { toast } from '../components/Toast'
import { storageInfo, type StorageInfo } from '../persist'
import { downloadCsv } from '../csv'
import { buildImportTemplate, EMAIL, importOhneGruppe, isImportable, istBeispielZeile, istTabellenDatei, parseUserImport, VORLAGE_CSV, VORLAGE_XLSX, type ImportResult, type ImportRow } from '../userImport'
import { useStore } from '../store'
import { useAutoSave } from '../useAutoSave'
import { GradingAdmin } from './admin/GradingAdmin'
import { LogbookAdmin } from './admin/LogbookAdmin'
import { formatDateTime } from '../datum'
import { APP_VERSION, type FeedbackEntry, type Group, type User, PERM_KEYS, type ConfigurableRole, type RetentionKey, type Role } from '../types'

const RETENTION_KEYS: RetentionKey[] = ['24h', '7d', '30d', '90d', 'never']
type Tab = 'users' | 'permissions' | 'grading' | 'logbook' | 'groups' | 'feedback' | 'settings' | 'imprint' | 'changelog'

/**
 * Nutzer aus einer Tabelle anlegen.
 *
 * Drei Schritte, bewusst in dieser Reihenfolge: Vorlage holen, Datei waehlen,
 * VORSCHAU pruefen. Erst danach wird angelegt. Ein Massenimport, der ohne
 * Vorschau schreibt, legt beim ersten Tippfehler hundertfuenfzig halbe Nutzer
 * an — und die wieder einzeln aufzuraeumen dauert laenger als das Anlegen.
 */
function UserImportModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const { state, importUsers } = useStore()
  const [result, setResult] = useState<ImportResult | null>(null)
  const [fileName, setFileName] = useState('')
  const [done, setDone] = useState<number | null>(null)
  // Excel statt CSV gewaehlt: eigene Meldung statt „Kopfzeile passt nicht —
  // bitte die Vorlage verwenden" fuer genau diese Vorlage (VERW-19).
  const [tabelle, setTabelle] = useState(false)
  // Zielgruppen fuer alle Zeilen: Der Import legte Konten ganz ohne Gruppe
  // an, waehrend der Dialog „Benutzer anlegen" genau das verweigert
  // (Audit 11/2026, VERW-07). Jede Zeile kommt in die gewaehlten Gruppen,
  // die sie betreten kann — die Vorschau sagt, wenn keine passt.
  const [groupIds, setGroupIds] = useState<string[]>([])
  const gruppen = [...state.groups].sort((a, b) => a.name.localeCompare(b.name))

  const ohneGruppe = (r: ImportRow) => importOhneGruppe(state.settings, r, state.groups, groupIds)
  const uebernehmbar = (result?.rows ?? []).filter((r) => isImportable(r) && !ohneGruppe(r))
  // Beispielzeilen der Vorlage zaehlen nicht mit — weder als „kann angelegt
  // werden" noch als Zeile, die durchfaellt (VERW-06).
  const gezaehlt = (result?.rows ?? []).filter((r) => !istBeispielZeile(r))

  const problemText = (r: ImportRow) =>
    [
      ...r.problems.map((p) => (p === 'aircraft' ? t('admin.import.pAircraft', { list: r.unknownAircraft.join(', ') }) : t(`admin.import.p_${p}`))),
      ...(ohneGruppe(r) ? [t('admin.import.p_group')] : []),
    ].join(' · ')

  return (
    <Modal title={t('admin.import.title')} onClose={onClose}>
      <div className="space-y-stack">
        <p className="text-small leading-relaxed text-dim">{t('admin.import.intro')}</p>

        {/* Zwei Wege zur selben Vorlage: Die Excel-Datei bringt Anleitung und
            Auswahllisten mit, die CSV-Fassung entsteht aus den tatsaechlich
            eingerichteten Mustern und der ersten freigegebenen Domain. */}
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" className="flex items-center gap-1.5" onClick={() => window.open(`${import.meta.env.BASE_URL}${VORLAGE_XLSX}`, '_blank')}>
            <Download size={15} /> {t('admin.import.templateXlsx')}
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              downloadCsv(VORLAGE_CSV, buildImportTemplate(state.settings.aircraftTypes))
              toast(t('toast.downloaded'))
            }}
            className="flex items-center gap-1.5"
          >
            <Download size={15} /> {t('admin.import.template')}
          </Button>
        </div>

        <Field label={t('admin.import.file')}>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={async (e) => {
              const datei = e.target.files?.[0]
              if (!datei) return
              setFileName(datei.name)
              setDone(null)
              const ist = istTabellenDatei(datei.name, new Uint8Array(await datei.slice(0, 4).arrayBuffer()))
              setTabelle(ist)
              if (ist) {
                setResult(null)
                return
              }
              setResult(
                parseUserImport(await datei.text(), {
                  existing: state.users,
                  allowedDomains: state.settings.allowedDomains,
                  aircraftTypes: state.settings.aircraftTypes,
                }),
              )
            }}
            className="w-full rounded-xl border border-dashed border-line/25 px-3 py-2.5 text-small text-dim file:mr-3 file:rounded-lg file:border-0 file:bg-raised file:px-3 file:py-1.5 file:text-small file:text-accent"
          />
          {fileName && <p className="mt-1.5 text-micro text-dim">{fileName}</p>}
        </Field>

        <Field label={t('admin.import.groups')} group>
          <ChipMultiSelect options={gruppen.map((g) => ({ id: g.id, label: g.name }))} selected={groupIds} onChange={setGroupIds} />
          <p className="mt-1.5 text-micro leading-relaxed text-dim">{t('admin.import.groupsHint')}</p>
        </Field>

        {tabelle && (
          <p role="alert" className="rounded-xl bg-danger/10 p-3 text-small leading-relaxed text-danger">
            {t('admin.import.xlsxHint')}
          </p>
        )}

        {result?.headerError && (
          <p role="alert" className="rounded-xl bg-danger/10 p-3 text-small leading-relaxed text-danger">
            {t('admin.import.headerError')}
          </p>
        )}

        {result && !result.headerError && (
          <>
            <p className="text-small font-medium">
              {t('admin.import.summary', { ok: uebernehmbar.length, total: gezaehlt.length })}
              {gezaehlt.length < result.rows.length && ` ${t('admin.import.examplesSkipped', { count: result.rows.length - gezaehlt.length })}`}
            </p>
            {/* Vorschau als echte Tabelle: Jede Zeile zeigt, ob sie durchgeht
                und woran es sonst liegt — mit der Zeilennummer aus Excel.
                Kopf „Zeile" und Rolle bleiben ganze Woerter (`zusammen`):
                Mit `overflow-wrap: anywhere` gab die Tabelle die schmale
                Breite des Dialogs an sie weiter, und es stand „Zeil/e",
                „Mitgli/ed" da. Brechen darf die E-Mail-Adresse. */}
            <div className="max-h-72 overflow-auto rounded-xl border border-line/15">
              <table className="w-full border-collapse text-micro">
                <thead className="sticky top-0 bg-surface">
                  <tr className="border-b border-line/15 text-left text-dim">
                    <th scope="col" className="zusammen px-2 py-1.5 font-semibold">{t('admin.import.line')}</th>
                    <th scope="col" className="px-2 py-1.5 font-semibold">{t('contacts.name')}</th>
                    <th scope="col" className="zusammen px-2 py-1.5 font-semibold">{t('admin.role')}</th>
                    <th scope="col" className="px-2 py-1.5 font-semibold">{t('admin.import.status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((r) => {
                    const ok = isImportable(r) && !ohneGruppe(r)
                    // Beispielzeile: grau und benannt, weder gruen noch rot —
                    // sie ist kein Fehler, sie wird nur nicht angelegt.
                    const beispiel = istBeispielZeile(r)
                    return (
                      <tr key={r.line} className="border-b border-line/[0.06] last:border-0 align-top">
                        <td className="px-2 py-1.5 tabular-nums text-dim">{r.line}</td>
                        <td className="px-2 py-1.5">
                          <span className={beispiel ? 'text-dim' : 'font-medium'}>{r.name || '—'}</span>
                          <span className="block text-dim">{r.email || '—'}</span>
                        </td>
                        <td className={`zusammen px-2 py-1.5 ${beispiel ? 'text-dim' : ''}`}>{r.role ? t(`roles.${r.role}`) : '—'}</td>
                        <td className={`px-2 py-1.5 ${beispiel ? 'text-dim' : ok ? 'text-ok' : 'text-danger'}`}>
                          {beispiel ? t('admin.import.p_example') : r.problems.length === 0 && ok ? t('admin.import.ok') : problemText(r)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {done !== null && (
          <p role="status" className="rounded-xl bg-ok/10 p-3 text-small text-ok">
            {t('admin.import.created', { count: done })}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>
            {t('common.close')}
          </Button>
          <Button
            disabled={uebernehmbar.length === 0 || done !== null}
            onClick={() => {
              const ergebnis = importUsers(
                uebernehmbar.map((r) => ({
                  name: r.name,
                  email: r.email,
                  phone: r.phone,
                  role: r.role!,
                  aircraftTypes: r.aircraftTypes,
                  canGrade: r.canGrade,
                  isTrainee: r.isTrainee,
                  canEditDirectory: r.canEditDirectory,
                  active: r.active,
                })),
                groupIds,
              )
              setDone(ergebnis)
              toast(t('toast.usersImported', { count: ergebnis }), ergebnis ? 'ok' : 'wait')
            }}
          >
            {t('admin.import.run', { count: uebernehmbar.length })}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

/** Die Schalter der Sammelbearbeitung — bewusst ohne Rolle (siehe bulkUsers.ts). */
const BULK_SCHALTER: { key: string; aktion: BulkAktion }[] = [
  { key: 'activate', aktion: { art: 'active', wert: true } },
  { key: 'deactivate', aktion: { art: 'active', wert: false } },
  { key: 'canGradeOn', aktion: { art: 'canGrade', wert: true } },
  { key: 'canGradeOff', aktion: { art: 'canGrade', wert: false } },
  { key: 'isTraineeOn', aktion: { art: 'isTrainee', wert: true } },
  { key: 'isTraineeOff', aktion: { art: 'isTrainee', wert: false } },
  { key: 'directoryOn', aktion: { art: 'canEditDirectory', wert: true } },
  { key: 'directoryOff', aktion: { art: 'canEditDirectory', wert: false } },
  { key: 'chatBlockOn', aktion: { art: 'chatBlocked', wert: true } },
  { key: 'chatBlockOff', aktion: { art: 'chatBlocked', wert: false } },
]

function UsersTab() {
  const { t } = useTranslation()
  const { state, currentUser, updateUser, addUser, setGroupMembers } = useStore()
  const [showNew, setShowNew] = useState(false)
  const [showImport, setShowImport] = useState(false)
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
  const [form, setForm] = useState({ name: '', email: '', phone: '', role: 'member' as Role, groupIds: [] as string[], aircraftTypes: [] as string[] })
  /* Sammelbearbeitung: Bei rund 130 Instruktoren war jede wiederkehrende
     Aenderung Handarbeit — ein neues Muster in der Flotte hiess, es bei
     zwanzig Leuten einzeln anzuhaken. */
  const [gewaehlt, setGewaehlt] = useState<string[]>([])
  const [bulkMuster, setBulkMuster] = useState('')
  const emailTaken =
    !!form.email.trim() && state.users.some((u) => u.email.trim().toLowerCase() === form.email.trim().toLowerCase())
  // Dasselbe Adressmuster wie der Import (EMAIL aus userImport.ts) und
  // dieselbe Domainregel wie Anmeldung und Import (domains.ts). Der Dialog
  // hatte ein eigenes Muster und kannte die Domainliste gar nicht — er legte
  // Konten an, die sich nie anmelden konnten (Audit 11/2026, VERW-12).
  const emailGueltig = EMAIL.test(form.email.trim())
  const domainFalsch = emailGueltig && !domainErlaubt(form.email, state.settings.allowedDomains)
  // Gruppen nur zur Auswahl, die die neue Person betreten kann; Pflicht nur
  // mit Chat-Modul (KERN-07/VERW-16). Neue Konten haben keine Personenrechte.
  const neuePerson = { role: form.role, aircraftTypes: form.aircraftTypes, canGrade: false, canEditDirectory: false }
  const gruppenNoetig = gruppenPflicht(state.settings, neuePerson)

  const sortedGroups = [...state.groups].sort((a, b) => a.name.localeCompare(b.name))
  const gruppenZurWahl = sortedGroups.filter((g) => gruppenTauglich(state.settings, neuePerson, g))
  // Wechselt Rolle oder Muster, faellt eine nicht mehr passende Gruppe aus
  // der Auswahl — gespeichert wird nur, was die Person betreten kann.
  const gewaehlteGruppen = form.groupIds.filter((id) => gruppenZurWahl.some((g) => g.id === id))
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

  /**
   * Eine Aenderung an EINER Person — mit Grund, wenn sie nicht geht.
   *
   * Der Store liess Verbotenes still fallen, die Zeile rief ihn ohne
   * Rueckgabe auf: Ein Klick, der nicht ankam, sah aus wie einer, der
   * ankam (Audit 11/2026, VERW-10). Gefragt wird dieselbe Funktion, die der
   * Store anwendet (benutzerRegeln.ts) — die Meldung kann ihm also nicht
   * widersprechen.
   */
  const aendern = (u: User, aenderung: Partial<User>, quittung: string): boolean => {
    const erg = einzelAenderung(state.users, u, aenderung, currentUser!.id, { groups: state.groups, settings: state.settings })
    if (erg.abgelehnt.length > 0) {
      toast(erg.abgelehnt.map((grund) => t(`admin.einzel.${grund}`, { name: u.name })).join(' '), 'wait')
      return false
    }
    updateUser(u.id, aenderung)
    if (erg.gruppeFehlt) toast(`${quittung} ${t('admin.einzel.gruppeFehlt', { name: u.name })}`, 'wait')
    else toast(quittung)
    return true
  }

  /** Rollenwechsel: Rechteaenderung, deshalb mit Rueckfrage (VERW-01). */
  const rolleAendern = (u: User, rolle: Role) => {
    const probe = einzelAenderung(state.users, u, { role: rolle }, currentUser!.id, { groups: state.groups, settings: state.settings })
    // Was ohnehin abgelehnt wird, braucht keine Rueckfrage — nur den Grund.
    if (probe.abgelehnt.length === 0 && !window.confirm(t('admin.roleConfirm', { name: u.name, from: t(`roles.${u.role}`), to: t(`roles.${rolle}`) }))) return
    aendern(u, { role: rolle }, t('toast.roleChanged', { name: u.name, role: t(`roles.${rolle}`) }))
  }

  /**
   * Eine Sammelaktion ausfuehren.
   *
   * Geplant wird in src/bulkUsers.ts, damit zwei Zusagen pruefbar sind: Der
   * gemeldete Zaehler nennt, was sich WIRKLICH aendert (nicht die Groesse der
   * Auswahl), und niemand kann sich selbst oder den letzten aktiven
   * Superadmin aussperren. Was uebersprungen wurde, wird benannt — stilles
   * Verweigern waere so schlecht wie stilles Ausfuehren.
   */
  const bulkAusfuehren = (bezeichnung: string, aktion: BulkAktion) => {
    const plan = planBulk(state.users, users, gewaehlt, aktion, currentUser!.id, { groups: state.groups, settings: state.settings })
    if (plan.patches.length === 0 && plan.uebersprungen.length === 0) {
      toast(t('admin.bulk.noChange'), 'wait')
      return
    }
    if (plan.patches.length > 0 && !window.confirm(t('admin.bulk.confirm', { action: bezeichnung, count: plan.patches.length }))) return
    plan.patches.forEach(({ id, patch }) => updateUser(id, patch))
    if (plan.uebersprungen.some((x) => x.grund === 'selbst')) window.alert(t('admin.bulk.skippedSelf'))
    if (plan.uebersprungen.some((x) => x.grund === 'letzterSuperadmin')) window.alert(t('admin.bulk.skippedLastSuper'))
    // Sollte durch die Bereinigung unten nie eintreten — wenn doch, dann laut.
    const unsichtbar = plan.uebersprungen.filter((x) => x.grund === 'nichtSichtbar').length
    if (unsichtbar) window.alert(t('admin.bulk.skippedHidden', { count: unsichtbar }))
    // „CL30 faellt aus der Flotte" traf sonst auch die, die nur CL30 hatten.
    const letztes = plan.uebersprungen.filter((x) => x.grund === 'letztesMuster').length
    if (letztes) window.alert(t('admin.bulk.skippedLastAircraft', { count: letztes }))
    // Bewerten/Verzeichnis bei Admin, Training Admin, Superadmin: Dort
    // entscheidet die Rolle, das Flag haette nichts bewirkt (VERW-02).
    const ueberRolle = plan.uebersprungen.filter((x) => x.grund === 'ueberRolle').length
    if (ueberRolle) window.alert(t('admin.bulk.skippedViaRole', { count: ueberRolle }))
    const letzteGruppe = plan.uebersprungen.filter((x) => x.grund === 'letzteGruppe').length
    if (letzteGruppe) window.alert(t('admin.bulk.skippedLastGroup', { count: letzteGruppe }))
    if (plan.patches.length > 0) toast(t('toast.bulkApplied', { count: plan.patches.length }))
    setGewaehlt([])
  }

  /*
   * Die Auswahl gilt nur fuer das, was auf dem Bildschirm steht.
   *
   * Sie ist eine Liste von Kennungen und ueberlebte bisher jeden Wechsel von
   * Filter, Suche und Sortierung: Wer 100 Member auswaehlte, dann auf
   * „Superadmin" filterte und „Deaktivieren" drueckte, sperrte 100
   * Instruktoren aus, von denen in dem Moment keiner sichtbar war. Die
   * Rueckfrage nannte nur eine Zahl.
   *
   * Deshalb faellt beim Wechsel der sichtbaren Menge alles aus der Auswahl,
   * was nicht mehr dazugehoert. Der Vergleich laeuft ueber die verketteten
   * Kennungen, damit der Effekt nicht bei jedem Render feuert.
   */
  const sichtbareIds = users.map((u) => u.id).join(',')
  useEffect(() => {
    const bleibt = new Set(sichtbareIds ? sichtbareIds.split(',') : [])
    setGewaehlt((alt) => (alt.every((id) => bleibt.has(id)) ? alt : alt.filter((id) => bleibt.has(id))))
  }, [sichtbareIds])

  return (
    <div className="space-y-stack">
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => setShowNew(true)} className="flex items-center gap-1.5">
          <Plus size={15} /> {t('admin.addUser')}
        </Button>
        {/* Massenanlage: bei einer ganzen ATO legt niemand einzeln an. */}
        <Button variant="ghost" onClick={() => setShowImport(true)} className="flex items-center gap-1.5">
          <Upload size={15} /> {t('admin.import.button')}
        </Button>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('admin.searchUsers')}
          // Der Platzhalter verschwindet beim Tippen und gilt manchen
          // Sprachausgaben nicht als Name — der Zweck gehoert ans Feld.
          aria-label={t('admin.searchUsers')}
          className={`${inputCls} min-w-48 flex-1`}
        />
        <select value={fRole} onChange={(e) => setFRole(e.target.value)} aria-label={t('admin.allRoles')} className="rounded-xl border border-field bg-bg/60 px-3 py-2 text-small">
          <option value="">{t('admin.allRoles')}</option>
          {(['member', 'training_admin', 'group_admin', 'superadmin'] as Role[]).map((r) => (
            <option key={r} value={r}>
              {t(`roles.${r}`)}
            </option>
          ))}
        </select>
        <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} aria-label={t('admin.allStatus')} className="rounded-xl border border-field bg-bg/60 px-3 py-2 text-small">
          <option value="">{t('admin.allStatus')}</option>
          <option value="active">{t('admin.active')}</option>
          <option value="inactive">{t('admin.inactive')}</option>
        </select>
        <select value={fGroup} onChange={(e) => setFGroup(e.target.value)} aria-label={t('admin.allGroups')} className="rounded-xl border border-field bg-bg/60 px-3 py-2 text-small">
          <option value="">{t('admin.allGroups')}</option>
          {sortedGroups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
        <select value={sortMode} onChange={(e) => setSortMode(e.target.value as 'name' | 'role')} aria-label={t('admin.sortBy')} className="rounded-xl border border-field bg-bg/60 px-3 py-2 text-small">
          <option value="name">{t('admin.sortByName')}</option>
          <option value="role">{t('admin.sortByRole')}</option>
        </select>
        <span className="shrink-0 text-micro text-dim">
          {users.length}/{allUsers.length}
        </span>
      </div>
      <p className="px-1 text-micro leading-relaxed text-dim">{t('admin.deactivateHint')}</p>

      {/* Auswahl und Sammelaktionen. Die Leiste erscheint erst mit der ersten
          Auswahl — solange nichts gewaehlt ist, waere sie eine Reihe toter
          Knoepfe ueber der Liste. */}
      <div className="flex flex-wrap items-center gap-3 px-1">
        <label className="flex min-h-11 items-center gap-2 text-small text-dim">
          <input
            type="checkbox"
            checked={users.length > 0 && users.every((u) => gewaehlt.includes(u.id))}
            // Teilauswahl sichtbar machen: „einige" ist ein eigener Zustand,
            // sonst behauptet ein leeres Kaestchen „nichts gewaehlt".
            ref={(el) => {
              if (el) el.indeterminate = gewaehlt.length > 0 && !users.every((u) => gewaehlt.includes(u.id))
            }}
            onChange={(e) => setGewaehlt(e.target.checked ? users.map((u) => u.id) : [])}
            className="h-6 w-6 shrink-0 accent-accent"
          />
          {t('admin.bulk.selectAll')}
        </label>
        {gewaehlt.length > 0 && (
          <>
            <Badge tone="accent">{t('admin.bulk.selected', { count: gewaehlt.length })}</Badge>
            <button onClick={() => setGewaehlt([])} className="min-h-11 text-small text-dim underline-offset-2 hover:text-ink hover:underline">
              {t('admin.bulk.clear')}
            </button>
          </>
        )}
      </div>

      {gewaehlt.length > 0 && (
        <Card className="space-y-stack border-accent/30 p-3.5">
          <div className="flex flex-wrap gap-2">
            {BULK_SCHALTER.map(({ key, aktion }) => (
              <Button key={key} variant="ghost" onClick={() => bulkAusfuehren(t(`admin.bulk.${key}`), aktion)} className="text-small">
                {t(`admin.bulk.${key}`)}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={bulkMuster}
              onChange={(e) => setBulkMuster(e.target.value)}
              aria-label={t('admin.bulk.aircraftPick')}
              className="rounded-xl border border-field bg-bg/60 px-3 py-2 text-small"
            >
              <option value="">{t('admin.bulk.aircraftPick')}</option>
              {[...state.settings.aircraftTypes].sort((a, b) => a.localeCompare(b)).map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
            <Button
              variant="ghost"
              disabled={!bulkMuster}
              onClick={() => bulkAusfuehren(`${t('admin.bulk.aircraftAdd')} (${bulkMuster})`, { art: 'aircraft', wert: 'add', typ: bulkMuster })}
              className="text-small"
            >
              {t('admin.bulk.aircraftAdd')}
            </Button>
            <Button
              variant="ghost"
              disabled={!bulkMuster}
              onClick={() => bulkAusfuehren(`${t('admin.bulk.aircraftRemove')} (${bulkMuster})`, { art: 'aircraft', wert: 'remove', typ: bulkMuster })}
              className="text-small"
            >
              {t('admin.bulk.aircraftRemove')}
            </Button>
          </div>
          {/* Warum die Rolle fehlt, steht dort, wo man sie suchen wuerde. */}
          <p className="text-micro leading-relaxed text-dim">{t('admin.bulk.roleNote')}</p>
        </Card>
      )}
      {users.length === 0 && <p className="pt-4 text-center text-body text-dim">{t('admin.noUsersMatch')}</p>}
      {users.map((u, i) => (
        <div key={u.id}>
        {sortMode === 'role' && (i === 0 || users[i - 1].role !== u.role) && (
          <SectionHeading className="mb-2 mt-4 px-1 first:mt-0">{t(`roles.${u.role}`)}</SectionHeading>
        )}
        {/* Deaktiviert zeigt das Badge und ein gestrichelter Rand — nicht
            gedaempfte Deckkraft: Die drueckte die E-Mail-Zeile auf 2,7:1,
            und die Karte bleibt bedienbar (Audit 11/2026, VERW-17). Der
            Rand braucht eine eigene Farbe: Der Kartenrand liegt bei 6 %
            Deckkraft, gestrichelt war er im Build nicht zu sehen. */}
        <Card className={`p-3 ${u.active ? '' : 'border-dashed !border-line/30'}`}>
          {/* Kopfzeile: immer sichtbar, ganze Zeile klappt auf.
              Das Auswahlkaestchen steht NEBEN dem aufklappenden Knopf, nicht
              darin — ein Kaestchen in einem Knopf laesst sich weder
              zuverlaessig antippen noch per Tastatur getrennt erreichen. */}
          <div className="flex items-center gap-3">
          {/* Das Kaestchen bleibt 24 px gross, die Trefferflaeche wird 44 —
              das Label traegt sie, damit auch der Rand daneben zieht. */}
          <label className="flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center">
          <input
            type="checkbox"
            checked={gewaehlt.includes(u.id)}
            onChange={(e) => setGewaehlt((alt) => (e.target.checked ? [...alt, u.id] : alt.filter((x) => x !== u.id)))}
            aria-label={`${t('admin.bulk.select')}: ${u.name}`}
            className="h-6 w-6 shrink-0 accent-accent"
          />
          </label>
          {/* aria-expanded/-controls: Die Zeile klappte ohne Zustandsangabe
              auf — eine Sprachausgabe sagte nur „Schaltflaeche" (VERW-21). */}
          <button
            onClick={() => setOpenId(openId === u.id ? null : u.id)}
            aria-expanded={openId === u.id}
            aria-controls={`nutzer-details-${u.id}`}
            className="flex min-h-11 min-w-0 flex-1 items-center gap-3 text-left"
          >
            <Avatar name={u.name} size={34} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-body font-semibold">{u.name}</p>
              <p className="truncate text-micro text-dim">{u.email}</p>
            </div>
            <span className="shrink-0 text-micro text-dim">{t(`roles.${u.role}`)}</span>
            {!u.active && <Badge tone="dim">{t('admin.inactive')}</Badge>}
            <ChevronDown size={16} className={`shrink-0 text-dim transition ${openId === u.id ? 'rotate-180' : ''}`} />
          </button>
          </div>
          <div id={`nutzer-details-${u.id}`} className={openId === u.id ? '' : 'hidden'}>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-small">
            {/* Die eigene Rolle ist gesperrt — wie in der Datenbank
                (profiles_guard, IC-SELF). Ein Klick machte den Superadmin
                sonst zum Mitglied, und er stand vor „kein Zugriff" (VERW-01).
                Jeder andere Wechsel fragt nach und quittiert. */}
            {/* Name der Auswahl mit der Person: In der Liste stehen bis zu
                130 davon, „Rolle" allein sagt nicht, wessen (VERW-21). */}
            <select
              value={u.role}
              aria-label={`${t('admin.role')}: ${u.name}`}
              disabled={u.id === currentUser!.id}
              aria-describedby={u.id === currentUser!.id ? `eigene-rolle-${u.id}` : undefined}
              onChange={(e) => rolleAendern(u, e.target.value as Role)}
              className="min-h-11 rounded-lg border border-field bg-bg/60 px-2 py-1.5 disabled:cursor-not-allowed"
            >
              {(['member', 'training_admin', 'group_admin', 'superadmin'] as Role[]).map((r) => (
                <option key={r} value={r}>
                  {t(`roles.${r}`)}
                </option>
              ))}
            </select>
            {u.id === currentUser!.id && (
              <span id={`eigene-rolle-${u.id}`} className="text-micro text-dim">
                {t('admin.ownRoleLocked')}
              </span>
            )}
            {/* Die vier Rechte an der Person (bewerten, Trainee, Verzeichnis
                pflegen, Chat gesperrt) standen hier als Kaestchen — und
                dieselben vier noch einmal als Schalter der Sammelbearbeitung,
                und die Rollen-Matrix daneben in einem eigenen Bereich. Wer
                wissen wollte, was jemand darf, musste an drei Stellen
                nachsehen. Sie stehen jetzt zusammen unter Berechtigungen; hier
                bleibt nur der Weg dorthin. Was hier bleibt, gehoert zur
                Identitaet des Nutzers: Rolle, Muster, Gruppen, aktiv. */}
            <button
              onClick={() => navigate(rechteLink(u.email))}
              className="min-h-11 flex items-center gap-1.5 rounded-lg px-2 py-1 text-accent transition hover:bg-accent/10"
            >
              <ShieldCheck size={14} /> {t('admin.toPermissions')}
            </button>
            {/* Konten werden deaktiviert, nicht gelöscht — sonst stünde auf
                unterschriebenen Formularen und in Chats ein Verweis ins
                Leere, und die Historie verlöre ihren Urheber. */}
            <span className="ml-auto flex gap-2">
              {/* Das eigene Konto: kein Knopf, der still verpufft, sondern
                  der Grund an seiner Stelle (VERW-10). */}
              {u.id === currentUser!.id ? (
                <span className="flex min-h-11 items-center px-2 text-micro text-dim">{t('admin.ownAccountLocked')}</span>
              ) : (
                <button
                  onClick={() =>
                    aendern(u, { active: !u.active }, t(u.active ? 'toast.userDeactivated' : 'toast.userActivated', { name: u.name }))
                  }
                  className="min-h-11 rounded-lg px-2 py-1 text-dim hover:bg-line/5 hover:text-ink"
                >
                  {u.active ? t('admin.deactivate') : t('admin.activate')}
                </button>
              )}
            </span>
          </div>
          {/* Gruppenzugehörigkeit direkt am Nutzer pflegbar — steuert
              Chat-Zugang und Instructor-Info-Sichtbarkeit */}
          <div className="mt-2.5">
            <p className="mb-1.5 text-micro text-dim">{t('admin.userGroups')}</p>
            {/* Angeboten wird, was die Person betreten kann; eine
                bestehende Mitgliedschaft ohne Zugang bleibt sichtbar (und
                entfernbar) und sagt es dazu (KERN-07/VERW-16). */}
            <ChipMultiSelect
              options={sortedGroups
                .filter((g) => g.memberIds.includes(u.id) || gruppenTauglich(state.settings, u, g))
                .map((g) => ({
                  id: g.id,
                  label: gruppenTauglich(state.settings, u, g) ? g.name : `${g.name} (${t('chatInfo.noAccess')})`,
                }))}
              selected={sortedGroups.filter((g) => g.memberIds.includes(u.id)).map((g) => g.id)}
              onChange={(ids) => {
                // Dieselbe Invariante wie beim Anlegen: Wer den Chat hat,
                // behaelt mindestens eine Gruppe, die er betreten kann.
                const nachher = state.groups.map((g) => ({
                  ...g,
                  memberIds: ids.includes(g.id) ? [...new Set([...g.memberIds, u.id])] : g.memberIds.filter((x) => x !== u.id),
                }))
                if (verliertLetzteGruppe(state.settings, u, state.groups, nachher)) {
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
          {/* Zugewiesene Muster steuern Lesson Plans, Instructor Info und Chats.
              Dieselbe Mehrfachauswahl wie darueber — vorher stand hier eine
              handgebaute Variante, die sich in Abstand, Rahmen und Schriftschnitt
              unterschied und die Zustandsansage nicht mitbrachte. */}
          <div className="mt-2.5">
            <Field label={t('admin.aircraftTypes')} group>
              <ChipMultiSelect
                options={[...state.settings.aircraftTypes].sort((a, b) => a.localeCompare(b)).map((a) => ({ id: a, label: a }))}
                selected={u.aircraftTypes}
                onChange={(aircraftTypes) => {
                  // Das letzte Muster abzuwaehlen macht den Nutzer blind. Der
                  // Store weist das ab; ohne Meldung sahe es hier aus wie ein
                  // Klick, der nicht ankommt. Direkt darueber, bei den Gruppen,
                  // gibt es diesen Riegel seit jeher.
                  // Seit die Gruppenpflicht nur erreichbare Gruppen zaehlt,
                  // kann auch der Verlust eines Musters jemanden aus seiner
                  // letzten Gruppe nehmen — dieselbe Pruefung wie im Store.
                  aendern(u, { aircraftTypes }, t('toast.userChanged', { name: u.name }))
                }}
              />
            </Field>
          </div>
          </div>
        </Card>
        </div>
      ))}
      {showImport && <UserImportModal onClose={() => setShowImport(false)} />}
      {showNew && (
        <Modal
          title={t('admin.addUser')}
          onClose={() => setShowNew(false)}
          confirmDiscard={
            form.name.trim() || form.email.trim() || form.phone.trim() || form.groupIds.length > 0 || form.aircraftTypes.length > 0
              ? t('common.discardConfirm')
              : undefined
          }
        >
          <div className="space-y-stack">
            <Field label={t('contacts.name')}>
              <input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
            </Field>
            {/* Die E-Mail ist die einzige Anmeldekennung — Pflichtfeld */}
            <Field label={t('contacts.email') + ' *'}>
              <input
                type="email"
                className={`${inputCls} ${emailTaken || domainFalsch ? 'border-danger/60' : ''}`}
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
              {/* Die Adresse muss eindeutig bleiben — sonst hätten zwei Konten
                  denselben Login. Direkt am Feld, nicht erst beim Speichern.
                  Ebenso die Domain: Ohne Freigabe kaeme die Person nie hinein. */}
              {emailTaken ? (
                <p className="mt-1.5 text-micro leading-relaxed text-danger">{t('admin.emailTaken')}</p>
              ) : domainFalsch ? (
                <p className="mt-1.5 text-micro leading-relaxed text-danger">
                  {t('admin.emailDomainNotAllowed', { list: state.settings.allowedDomains.join(', ') })}
                </p>
              ) : (
                <p className="mt-1.5 text-micro leading-relaxed text-dim">{t('admin.emailLoginHint')}</p>
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
            {/* Pflicht dort, wo die Zuordnung etwas bewirkt: bei Mitglied und
                Admin. Superadmin und Training Admin sehen ohnehin alles — ein
                Pflichtfeld ohne Wirkung waere schlimmer als keines, weil der
                naechste daraus eine Zustaendigkeit liest, die es nicht gibt.
                Zuweisen kann man ihnen trotzdem etwas; es steht dann fuer die
                fachliche Zustaendigkeit, nicht fuer die Sicht. */}
            <Field label={t('admin.aircraftTypes') + (musterPflicht(form.role) ? ' *' : '')} group>
              <ChipMultiSelect
                options={[...state.settings.aircraftTypes].sort((a, b) => a.localeCompare(b)).map((a) => ({ id: a, label: a }))}
                selected={form.aircraftTypes}
                onChange={(aircraftTypes) => setForm({ ...form, aircraftTypes })}
              />
              <p className="mt-1.5 text-micro leading-relaxed text-dim">
                {musterPflicht(form.role) ? t('admin.aircraftTypesHint') : t('admin.aircraftTypesFree')}
              </p>
            </Field>
            {/* Pflicht: Wer den Chat hat, gehört mindestens einer Gruppe an,
                die er auch betreten kann — deshalb NACH den Mustern: Sie
                entscheiden, welche Gruppen in Frage kommen. Der Training
                Admin hat keinen Chat; für ihn entfällt das Feld. */}
            {gruppenNoetig ? (
              <Field label={t('admin.userGroups') + ' *'} group>
                <ChipMultiSelect
                  options={gruppenZurWahl.map((g) => ({ id: g.id, label: g.name }))}
                  selected={gewaehlteGruppen}
                  onChange={(groupIds) => setForm({ ...form, groupIds })}
                />
                <p className="mt-1.5 text-micro leading-relaxed text-dim">
                  {gruppenZurWahl.length === 0 ? t('admin.userGroupsNoneReachable') : t('admin.userGroupsHint')}
                </p>
              </Field>
            ) : (
              <p className="text-micro leading-relaxed text-dim">{t('admin.userGroupsNotNeeded')}</p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowNew(false)}>
                {t('common.cancel')}
              </Button>
              <Button
                disabled={
                  !form.name.trim() ||
                  !emailGueltig ||
                  domainFalsch ||
                  (gruppenNoetig && gewaehlteGruppen.length === 0) ||
                  (musterPflicht(form.role) && form.aircraftTypes.length === 0) ||
                  emailTaken
                }
                onClick={() => {
                  // Der Store kann trotz aller Sperren ablehnen: Zwischen dem
                  // Rendern des Dialogs und dem Klick kann ein zweiter Tab
                  // dieselbe Adresse vergeben haben. Vorher schloss der Dialog
                  // auch dann und leerte das Formular — der Anwender hatte
                  // einen Nutzer angelegt, den es nicht gab.
                  const ok = addUser({ ...form, groupIds: gewaehlteGruppen })
                  if (!ok) {
                    toast(t('toast.userSaveFailed'), 'bad')
                    return
                  }
                  setShowNew(false)
                  setForm({ name: '', email: '', phone: '', role: 'member', groupIds: [], aircraftTypes: [] })
                  toast(t('toast.userSaved'))
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
 * Berechtigungen — die eine Stelle, an der Rechte vergeben werden.
 *
 * Vorher waren es drei: die Rollen-Matrix hier, vier Kaestchen in der
 * aufgeklappten Nutzerzeile, und dieselben vier noch einmal als Schalter der
 * Sammelbearbeitung. Wer wissen wollte, was eine Person darf, musste an drei
 * Stellen nachsehen und die Antworten selbst zusammenlegen — und wer etwas
 * aendern wollte, musste raten, welche der drei Stellen die richtige ist.
 *
 * Die Seite hat deshalb zwei Tabellen und einen Verweis:
 *
 *  1. **Rollen** — was eine Rolle grundsaetzlich darf. Gilt fuer alle, die
 *     sie tragen.
 *  2. **Personen** — was an der einzelnen Person haengt, unabhaengig von der
 *     Rolle. Dieselben vier Rechte, dieselbe Reihenfolge, fuer jeden Nutzer.
 *  3. **Was bewusst woanders steht** — Rolle und Muster gehoeren zur
 *     Identitaet eines Nutzers, die Chat-Administration zur jeweiligen
 *     Gruppe. Beides hierher zu holen hiesse, es zweimal zu fuehren.
 */
function PermissionsTab() {
  const { t } = useTranslation()
  const { state, setPermission, updateUser, setDocCheckRights } = useStore()
  const roles: ConfigurableRole[] = ['group_admin', 'training_admin']
  // Vorbelegt aus „Rechte dieser Person" (?q=E-Mail), sonst leer (VERW-22).
  const [suche, setSuche] = useState(() => suchAusQuery(window.location.hash))

  // Dieselbe Sortierung wie die Benutzerliste: alphabetisch. Eine
  // Rechtetabelle, in der man jemanden suchen muss, wird nicht gelesen.
  const personen = [...state.users]
    .filter((u) => !suche.trim() || `${u.name} ${u.email}`.toLowerCase().includes(suche.trim().toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div className="space-y-section">
      <div className="space-y-stack">
        <SectionHeading>{t('admin.permRoles')}</SectionHeading>
        <p className="rounded-xl border border-line/10 bg-surface/60 p-3.5 text-small leading-relaxed text-dim">
          {t('admin.permMatrixHint')}
        </p>
        <Card className="overflow-x-auto p-4">
          <table className="w-full min-w-[26rem] text-small">
            <thead>
              <tr className="border-b border-line/15 text-left text-micro uppercase tracking-wide text-dim">
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
                      <label className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center">
                      <input
                        type="checkbox"
                        checked={state.settings.permissions[r]?.[key] ?? false}
                        onChange={(e) => setPermission(r, key, e.target.checked)}
                        className="h-6 w-6 accent-accent"
                        aria-label={`${t(`roles.${r}`)}: ${t(`admin.perm.${key}`)}`}
                      />
                      </label>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      <div className="space-y-stack">
        <SectionHeading>{t('admin.permPeople')}</SectionHeading>
        <p className="rounded-xl border border-line/10 bg-surface/60 p-3.5 text-small leading-relaxed text-dim">
          {t('admin.permPeopleHint')}
        </p>
        <Field label={t('admin.searchUsers')}>
          <input className={inputCls} value={suche} onChange={(e) => setSuche(e.target.value)} />
        </Field>
        <Card className="overflow-x-auto p-4">
          <table className="w-full min-w-[34rem] text-small">
            <thead>
              <tr className="border-b border-line/15 text-left text-micro uppercase tracking-wide text-dim">
                <th className="pb-2 pr-3 font-semibold">{t('contacts.name')}</th>
                {PERSON_PERMS.map((perm) => (
                  <th key={perm} className="pb-2 pr-3 text-center font-semibold">
                    {t(`admin.${perm}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {personen.map((u) => (
                <tr key={u.id} className="border-b border-line/[0.06] last:border-0">
                  <td className="py-2.5 pr-3">
                    <span className={u.active ? '' : 'text-dim line-through'}>{u.name}</span>
                    <span className="block text-micro text-dim">{t(`roles.${u.role}`)}</span>
                  </td>
                  {PERSON_PERMS.map((perm) =>
                    personenRechtWirkt(u.role, perm) ? (
                      <td key={perm} className="py-2.5 pr-3 text-center">
                        {/* 44 px Trefferflaeche ueber das Label, wie in der
                            Matrix darueber (VERW-21). */}
                        <label className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center">
                        <input
                          type="checkbox"
                          checked={!!u[perm]}
                          onChange={(e) => updateUser(u.id, { [perm]: e.target.checked })}
                          /* Die Sperre ist das einzige umgekehrt gemeinte Recht:
                             Ein Haken nimmt etwas weg. Sie bekommt deshalb die
                             Warnfarbe statt der Akzentfarbe — sonst liest sich
                             die Zeile falsch herum. Als Token, nicht als
                             Farbwert: der folgt dem Theme (VERW-21). */
                          className={`h-6 w-6 ${istSperre(perm) ? 'accent-danger' : 'accent-accent'}`}
                          aria-label={`${u.name}: ${t(`admin.${perm}`)}`}
                        />
                        </label>
                      </td>
                    ) : (
                      /* Bei dieser Rolle entscheidet die Matrix oben (bzw. beim
                         Superadmin gar nichts) — ein bedienbares Kaestchen
                         speicherte ein Flag ohne Folgen, und wer einem Admin
                         das Bewerten „entzog", liess ihn weiter bewerten
                         (Audit 11/2026, VERW-02). Gezeigt wird deshalb der
                         WIRKSAME Wert, gesperrt und mit Herkunft. */
                      <td key={perm} className="py-2.5 pr-3 text-center">
                        <span className="inline-flex flex-col items-center gap-0.5">
                          <input
                            type="checkbox"
                            checked={personenRechtWirksam(state.settings, u, perm)}
                            disabled
                            readOnly
                            className="h-6 w-6 accent-accent"
                            aria-label={`${u.name}: ${t(`admin.${perm}`)} — ${t('admin.viaRoleHint')}`}
                          />
                          <span className="text-micro text-dim">{t('admin.viaRole')}</span>
                        </span>
                      </td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {personen.length === 0 && <p className="py-4 text-center text-small text-dim">{t('admin.noUsersFound')}</p>}
        </Card>
      </div>

      {/* DocCheck-Rechte stehen HIER und nicht in einer eigenen Verwaltung
          des Moduls: Rechte werden an einer Stelle vergeben (CLAUDE.md).
          Eigene Tabelle statt zwei weiterer PERSON_PERMS-Spalten, weil sie
          anders funktionieren: nur der Superadmin, mit Protokoll, und der
          Superadmin selbst hat sie automatisch. */}
      <div className="space-y-stack">
        <SectionHeading>{t('admin.docCheckHeading')}</SectionHeading>
        <p className="rounded-xl border border-line/10 bg-surface/60 p-3.5 text-small leading-relaxed text-dim">
          {t('admin.docCheckHint')}
        </p>
        <Card className="overflow-x-auto p-4">
          <table className="w-full min-w-[26rem] text-small">
            <thead>
              <tr className="border-b border-line/15 text-left text-micro uppercase tracking-wide text-dim">
                <th className="pb-2 pr-3 font-semibold">{t('contacts.name')}</th>
                <th className="pb-2 pr-3 text-center font-semibold">{t('admin.docCheckAccess')}</th>
                <th className="pb-2 pr-3 text-center font-semibold">{t('admin.docCheckAdmin')}</th>
              </tr>
            </thead>
            <tbody>
              {personen.map((u) => (
                <tr key={u.id} className="border-b border-line/[0.06] last:border-0">
                  <td className="py-2.5 pr-3">
                    <span className={u.active ? '' : 'text-dim line-through'}>{u.name}</span>
                    <span className="block text-micro text-dim">{t(`roles.${u.role}`)}</span>
                  </td>
                  {u.role === 'superadmin' ? (
                    <td colSpan={2} className="py-2.5 pr-3 text-center text-micro text-dim">
                      {t('admin.docCheckAuto')}
                    </td>
                  ) : (
                    (['docCheckAccess', 'docCheckAdmin'] as const).map((f) => (
                      <td key={f} className="py-2.5 pr-3 text-center">
                        <label className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center">
                        <input
                          type="checkbox"
                          checked={!!u[f]}
                          onChange={(e) => setDocCheckRights(u.id, { [f]: e.target.checked })}
                          className="h-6 w-6 accent-accent"
                          aria-label={`${u.name}: ${t(`admin.${f}`)}`}
                        />
                        </label>
                      </td>
                    ))
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      <div className="space-y-stack">
        <SectionHeading>{t('admin.permElsewhere')}</SectionHeading>
        <Card className="space-y-tight p-4 text-small">
          <p className="text-dim">{t('admin.permElsewhereHint')}</p>
          <button
            onClick={() => navigate('/admin/users')}
            className="min-h-11 flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-line/5"
          >
            <span>{t('admin.permElsewhereUsers')}</span>
            <span className="shrink-0 text-accent">{t('admin.users')} →</span>
          </button>
          <button
            onClick={() => navigate('/admin/groups')}
            className="min-h-11 flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-line/5"
          >
            <span>{t('admin.permElsewhereGroups')}</span>
            <span className="shrink-0 text-accent">{t('admin.groups')} →</span>
          </button>
        </Card>
      </div>
    </div>
  )
}

/**
 * Name einer Gruppe — mit Entwurf, gespeichert erst am Ende der Eingabe.
 *
 * Das Feld schrieb bei jedem Tastendruck in den Store, und der Store
 * beschnitt den Namen und verwarf leere: Ein Leerzeichen am Wortende
 * verschwand, bevor das naechste Wort kam („Ground TrainingViennaBase"),
 * und das Feld liess sich nicht leeren, um neu zu tippen. Ein doppelter
 * Name als Zwischenstand schluckte Tastendruecke (Audit 11/2026, VERW-04).
 *
 * Jetzt wird beim Verlassen oder mit Enter geprueft (gruppen.ts, dieselbe
 * Regel wie im Store). Geht der Name nicht, nennt das Feld den Grund und
 * steht wieder auf dem alten Namen; Escape verwirft den Entwurf.
 */
export function GroupNameField({ group }: { group: Group }) {
  const { t } = useTranslation()
  const { state, renameGroup } = useStore()
  const [entwurf, setEntwurf] = useState(group.name)
  const [fehler, setFehler] = useState<GruppenNameFehler | null>(null)
  const [tippt, setTippt] = useState(false)
  const meldungId = useId()
  // Aendert sich der Name anderswo (zweiter Tab), folgt das Feld — aber nie
  // mitten in der Eingabe.
  useEffect(() => {
    if (!tippt) setEntwurf(group.name)
  }, [group.name, tippt])
  const uebernehmen = () => {
    setTippt(false)
    const grund = gruppenNameFehler(state.groups, group.id, entwurf)
    setFehler(grund)
    if (grund) {
      setEntwurf(group.name)
      return
    }
    renameGroup(group.id, entwurf)
    setEntwurf(gruppenName(entwurf))
  }
  // Die Meldung steht AUSSERHALB des Labels: darin wuerde sie Teil des
  // Feldnamens, und eine Sprachausgabe laese bei jedem Fokus den Fehler mit.
  return (
    <div>
      <Field label={t('admin.groupName')}>
        <input
          value={entwurf}
          onFocus={() => setTippt(true)}
          onChange={(e) => {
            setEntwurf(e.target.value)
            setFehler(null)
          }}
          onBlur={uebernehmen}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
            if (e.key === 'Escape') {
              setEntwurf(group.name)
              setFehler(null)
            }
          }}
          aria-invalid={fehler !== null}
          aria-describedby={fehler ? meldungId : undefined}
          className={`${inputCls} ${fehler ? 'border-danger/60' : ''}`}
        />
      </Field>
      {fehler && (
        <p id={meldungId} role="alert" className="mt-1.5 text-micro leading-relaxed text-danger">
          {t(fehler === 'leer' ? 'admin.groupNameEmpty' : 'admin.groupNameTaken')} {t('admin.groupNameKept')}
        </p>
      )}
    </div>
  )
}

function GroupsTab() {
  const { t } = useTranslation()
  const { state, currentUser, addGroup, deleteGroup, groupDeleteBlockers, setGroupAdmins, setGroupMembers, setGroupRetention, setGroupAircraft } =
    useStore()
  const [showNew, setShowNew] = useState(false)
  // aufgeklappte Gruppe (kompakte Liste bei vielen Gruppen)
  const [openId, setOpenId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [purpose, setPurpose] = useState('')
  const [newAircraft, setNewAircraft] = useState('')
  // Doppelte Gruppennamen wären im Chat nicht auseinanderzuhalten — dieselbe
  // Regel wie im Store (gruppen.ts). Ein leeres Feld ist hier noch kein
  // Fehler, nur ein nicht aktiver Speichern-Knopf.
  const nameFehler = gruppenNameFehler(state.groups, null, name)
  const nameTaken = nameFehler === 'vergeben'

  // Gruppen nach Muster sortiert: erst je Aircraft Type, dann die
  // musterübergreifenden — die Chat-Themen unterscheiden sich je Typ.
  // Ein Gruppenadmin verwaltet nur die Gruppen, in denen er als Admin
  // eingetragen ist — fremde Gruppen sind hier weder sicht- noch änderbar.
  const groups = state.groups
    .filter((g) => currentUser!.role === 'superadmin' || g.adminIds.includes(currentUser!.id))
    .sort((a, b) => (a.aircraftType || 'zzz').localeCompare(b.aircraftType || 'zzz') || a.name.localeCompare(b.name))
  const activeUsers = state.users.filter((u) => u.active).sort((a, b) => a.name.localeCompare(b.name))
  const istSuper = currentUser!.role === 'superadmin'
  // Die eigene Person ist fuer den Gruppenadmin fest — wie in ChatInfo, wo
  // die eigene Zeile keinen Entfernen-Knopf hat. Im Panel genuegte ein
  // Fehlklick, und er verlor die Gruppe aus seiner Verwaltung (VERW-09).
  const chip = (u: User, ohneZugang = false) => {
    const selbst = u.id === currentUser!.id
    const zusatz = [selbst ? t('admin.youMarker') : '', ohneZugang ? t('chatInfo.noAccess') : ''].filter(Boolean).join(', ')
    return { id: u.id, label: zusatz ? `${u.name} (${zusatz})` : u.name, fest: selbst && !istSuper }
  }
  // Dieselbe Regel wie im Store (gruppen.ts): sich selbst herausnehmen geht
  // nicht, den letzten Admin entfernen nur nach Rueckfrage.
  const pruefe = (g: Group, memberIds: string[], adminIds: string[]) => {
    const fehler = gruppenAenderungFehler(currentUser, g, memberIds, adminIds)
    if (fehler === 'selbstEntfernt') {
      window.alert(t('admin.groupSelfLocked'))
      return false
    }
    if (fehler === 'ohneAdmin') return window.confirm(t('admin.groupNoAdminConfirm', { name: g.name }))
    return true
  }
  // Nur die eigenen Muster: Eine Gruppe fremden Musters koennte der
  // Anleger anschliessend selbst nicht betreten (maySeeGroup).
  const aircraftTypes = musterZurAuswahl(currentUser, [...state.settings.aircraftTypes].sort((a, b) => a.localeCompare(b)))
  // Zwischenüberschrift, sobald ein neues Muster beginnt
  const headingFor = (i: number) => {
    const cur = groups[i].aircraftType || ''
    const prev = i > 0 ? groups[i - 1].aircraftType || '' : null
    return prev === cur ? null : cur || t('admin.groupNoAircraft')
  }

  return (
    <div className="space-y-stack">
      <Button onClick={() => setShowNew(true)} className="flex items-center gap-1.5">
        <Plus size={15} /> {t('admin.addGroup')}
      </Button>
      {groups.map((g, i) => (
        <div key={g.id}>
        {headingFor(i) && (
          <SectionHeading className="mb-2 mt-4 px-1 first:mt-0">{headingFor(i)}</SectionHeading>
        )}
        <Card className="space-y-stack p-3">
          {/* Kompakte Kopfzeile: Name und Mitgliederzahl, Details auf Klick */}
          <div className="flex items-center gap-3">
            <Avatar name={g.name} size={34} />
            <button
              onClick={() => setOpenId(openId === g.id ? null : g.id)}
              aria-expanded={openId === g.id}
              aria-controls={`gruppe-details-${g.id}`}
              className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left"
            >
              <span className="min-w-0 flex-1 truncate text-body font-semibold">{g.name}</span>
              {g.aircraftType && (
                <span className="shrink-0"><Badge tone="accent">{g.aircraftType}</Badge></span>
              )}
              <span className="shrink-0 text-micro text-dim">{t('chatInfo.members', { count: g.memberIds.length })}</span>
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
          <div id={`gruppe-details-${g.id}`} className={openId === g.id ? 'space-y-stack' : 'hidden'}>
          <div className="grid gap-3 sm:grid-cols-2">
            <GroupNameField group={g} />
            {/* Muster der Gruppe — leer = musterübergreifend */}
            <Field label={t('admin.groupAircraft')}>
              <select
                value={g.aircraftType ?? ''}
                onChange={(e) => setGroupAircraft(g.id, e.target.value)}
                className="w-full rounded-xl border border-field bg-bg/60 px-3 py-2 text-small"
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
                className="w-full rounded-xl border border-field bg-bg/60 px-3 py-2 text-small"
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
              {/* Angeboten werden nur aktive Mitglieder: Bei allen anderen
                  nahm der Store den Klick nicht an, und der Chip blieb ohne
                  Meldung, wie er war (VERW-11). */}
              <ChipMultiSelect
                options={adminKandidaten(g, activeUsers).map((u) => chip(u))}
                selected={g.adminIds}
                onChange={(ids) => {
                  if (pruefe(g, g.memberIds, ids)) setGroupAdmins(g.id, ids)
                }}
              />
            </Field>
          </div>
          <Field label={`${t('admin.membersManage')} (${g.memberIds.length})`} group>
            {/* Angeboten wird nur, wer die Gruppe betreten kann — ein
                Mitglied fremden Musters zaehlte sonst als Mitglied und sah
                doch keinen Chat (KERN-07/VERW-16). Bestehende
                Mitgliedschaften ohne Zugang bleiben sichtbar und benannt.
                Dieselbe Mehrfachauswahl wie bei den Admins — vorher zwei
                handgebaute Reihen in verschiedenen Farben. */}
            <ChipMultiSelect
              options={activeUsers
                .filter((u) => g.memberIds.includes(u.id) || gruppenTauglich(state.settings, u, g))
                .map((u) => chip(u, g.memberIds.includes(u.id) && !gruppenTauglich(state.settings, u, g)))}
              selected={g.memberIds}
              onChange={(ids) => {
                if (!pruefe(g, ids, g.adminIds)) return
                // Wer hier seine letzte erreichbare Gruppe verlöre, bleibt
                // drin — der Store weist das ab; ohne Meldung sähe es aus wie
                // ein Klick, der nicht ankommt.
                const nachher = state.groups.map((x) => (x.id === g.id ? { ...x, memberIds: ids } : x))
                const verliert = g.memberIds
                  .filter((m) => !ids.includes(m))
                  .map((m) => state.users.find((u) => u.id === m))
                  .filter((u): u is User => !!u && verliertLetzteGruppe(state.settings, u, state.groups, nachher))
                if (verliert.length > 0) {
                  window.alert(t('chatInfo.deleteBlocked', { names: verliert.map((u) => u.name).join(', ') }))
                  return
                }
                setGroupMembers(g.id, ids)
              }}
            />
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
          <div className="space-y-stack">
            <Field label={t('admin.groupName')}>
              <input
                className={`${inputCls} ${nameTaken ? 'border-danger/60' : ''}`}
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
              {nameTaken && <p className="mt-1.5 text-micro leading-relaxed text-danger">{t('admin.groupNameTaken')}</p>}
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
                disabled={nameFehler !== null}
                onClick={() => {
                  addGroup(name, purpose.trim(), newAircraft || undefined)
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
  onUmgeschaltet,
}: {
  f: FeedbackEntry
  userName: (id: string) => string
  onDelete: (id: string) => void
  onResolve: (id: string, note: string) => void
  onReopen: (id: string) => void
  /** Meldet das Umschalten von „Erledigt" — die Liste holt danach den Fokus zurueck. */
  onUmgeschaltet?: (id: string) => void
}) {
  const { t } = useTranslation()
  const done = !!f.resolvedBy
  const [note, setNote] = useState(f.resolutionNote ?? '')
  const [editNote, setEditNote] = useState(false)

  return (
    // Erledigt steht im eigenen Abschnitt und traegt das Badge — die Karte
    // wird nicht per Deckkraft gedaempft (3,1:1 fuer „Erledigt", VERW-17).
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-body font-semibold">{userName(f.authorId)}</p>
            <Badge tone="dim">{f.category}</Badge>
            <Badge tone={f.aircraftType ? 'accent' : 'dim'}>{f.aircraftType || t('feedback.scopeGeneral')}</Badge>
            {/* Statusmarken aus Badge, nicht von Hand (CLAUDE.md): Die
                Handpille „Erledigt" lag in Gruen auf eigener Flaeche bei
                4,3:1, gedaempft bei 3,1:1 (VERW-17/A11Y-06). */}
            {f.urgent && (
              <Badge tone="bad">
                <AlertTriangle size={11} className="mr-1" /> {t('feedback.urgent')}
              </Badge>
            )}
            {done && (
              <Badge tone="ok">
                <CheckCircle2 size={11} className="mr-1" /> {t('admin.feedbackDone')}
              </Badge>
            )}
          </div>
          <p className="mt-0.5 text-micro text-dim">
            {formatDateTime(f.createdAt)} · {t('feedback.recipient')}: {f.recipient}
          </p>
          <p className="mt-2 whitespace-pre-wrap text-small leading-relaxed">{f.message}</p>
          {f.attachment && (
            <p className="mt-2 flex items-center gap-1.5 text-micro text-dim">
              <Paperclip size={13} /> {f.attachment.name} · {f.attachment.sizeMB} MB
            </p>
          )}

          {/* Bearbeitet-Block: Wer, wann, und was getan wurde */}
          {done && (
            <div className="mt-3 rounded-xl border border-ok/25 bg-ok/[0.06] p-3">
              <p className="text-micro font-medium text-dim">
                {t('admin.feedbackResolvedBy', { name: userName(f.resolvedBy!), date: formatDateTime(f.resolvedAt!) })}
              </p>
              {f.resolutionNote && !editNote && (
                <p className="mt-1 whitespace-pre-wrap text-small leading-relaxed">{f.resolutionNote}</p>
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
                      toast(t('toast.feedbackResolved'))
                      setEditNote(false)
                    }}
                    className="shrink-0"
                  >
                    {t('common.save')}
                  </Button>
                </div>
              ) : (
                <button onClick={() => setEditNote(true)} className="mt-1.5 text-micro font-medium text-accent hover:underline">
                  {f.resolutionNote ? t('admin.feedbackEditNote') : t('admin.feedbackAddNote')}
                </button>
              )}
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          {/* Tickbox „Erledigt" — schaltet Bearbeitet-Status um */}
          <label className="flex min-h-11 cursor-pointer items-center gap-1.5 text-micro font-medium text-dim">
            <input
              type="checkbox"
              checked={done}
              onChange={(e) => {
                onUmgeschaltet?.(f.id)
                if (e.target.checked) {
                  onResolve(f.id, note)
                  toast(t('toast.feedbackResolved'))
                } else {
                  onReopen(f.id)
                  toast(t('toast.feedbackReopened'), 'wait')
                }
              }}
              className="h-5 w-5 shrink-0 accent-ok"
            />
            {t('admin.feedbackDone')}
          </label>
          <button
            onClick={() => {
              if (!window.confirm(t('admin.confirmDeleteFeedback'))) return
              onDelete(f.id)
              toast(t('toast.feedbackDeleted'))
            }}
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
export function FeedbackTab() {
  const { t } = useTranslation()
  const { state, currentUser, visibleFeedback, deleteFeedback, resolveFeedback, reopenFeedback } = useStore()
  /*
   * Fokus nach „Erledigt": Offene und erledigte Eintraege stehen in zwei
   * Listen, die Karte wird beim Umschalten ab- und neu eingehaengt — der
   * Fokus fiel auf <body>, und wer per Tastatur arbeitete, stand wieder oben
   * auf der Seite (Audit 11/2026, A11Y-04). Die Liste merkt sich die Karte
   * und setzt den Fokus nach dem Neuzeichnen auf deren Kaestchen.
   */
  const listeRef = useRef<HTMLDivElement>(null)
  const umgeschaltet = useRef<string | null>(null)
  useEffect(() => {
    const id = umgeschaltet.current
    if (!id) return
    umgeschaltet.current = null
    // Nur zurueckholen, was verloren ging.
    if (document.activeElement && document.activeElement !== document.body) return
    const karte = [...(listeRef.current?.querySelectorAll<HTMLElement>('[data-feedback-id]') ?? [])].find((k) => k.dataset.feedbackId === id)
    karte?.querySelector<HTMLInputElement>('input[type="checkbox"]')?.focus()
  }, [visibleFeedback])
  const merken = (id: string) => {
    umgeschaltet.current = id
  }
  // Filter: Kategorie, Empfänger, nur Dringendes
  const [fCat, setFCat] = useState('')
  const [fRec, setFRec] = useState('')
  const [fScope, setFScope] = useState('')
  const [onlyUrgent, setOnlyUrgent] = useState(false)
  /*
   * Die Sicht kommt aus dem Store (visibleFeedback) — Gruppe UND Muster.
   * Sie stand hier von Hand, und die Statuszeile rechnete daneben mit dem
   * ganzen Bestand: Sie versprach einem Gruppenadmin mehr, als hinter ihrem
   * Sprung stand.
   */
  const all = [...visibleFeedback].sort((a, b) => b.createdAt - a.createdAt)
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
    <div ref={listeRef} className="space-y-stack">
      <div className="flex flex-wrap items-center gap-2">
        <select value={fCat} onChange={(e) => setFCat(e.target.value)} aria-label={t('admin.allCategories')} className="rounded-xl border border-field bg-bg/60 px-3 py-2 text-small">
          <option value="">{t('admin.allCategories')}</option>
          {cats.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select value={fRec} onChange={(e) => setFRec(e.target.value)} aria-label={t('admin.allRecipients')} className="rounded-xl border border-field bg-bg/60 px-3 py-2 text-small">
          <option value="">{t('admin.allRecipients')}</option>
          {recs.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <select value={fScope} onChange={(e) => setFScope(e.target.value)} aria-label={t('admin.allScopes')} className="rounded-xl border border-field bg-bg/60 px-3 py-2 text-small">
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
          className={`min-h-11 rounded-full border px-3 py-1.5 text-micro font-semibold transition ${
            // Aktiver Umschalter wie ChipMultiSelect: Farbe in Rand und
            // Flaeche, Schrift ink — Rot auf eigener Rotflaeche blieb unter
            // 4,5:1 (VERW-17).
            onlyUrgent ? 'border-danger bg-danger/15 text-ink' : 'border-line/15 text-dim'
          }`}
        >
          {t('admin.onlyUrgent')}
        </button>
        <span className="ml-auto shrink-0 text-micro text-dim">
          {entries.length}/{all.length}
        </span>
      </div>
      {entries.length === 0 && <p className="pt-6 text-center text-body text-dim">{t('admin.feedbackEmpty')}</p>}
      {/* Offene zuerst, dann — abgesetzt — die bereits bearbeiteten. */}
      {open.map((f) => (
        <div key={f.id} data-feedback-id={f.id}>
          <FeedbackCard f={f} userName={userName} onDelete={deleteFeedback} onResolve={resolveFeedback} onReopen={reopenFeedback} onUmgeschaltet={merken} />
        </div>
      ))}
      {resolved.length > 0 && (
        <SectionHeading className="mt-4" icon={<CheckCircle2 size={14} className="shrink-0 text-ok" />}>
          {t('admin.feedbackResolvedSection', { count: resolved.length })}
        </SectionHeading>
      )}
      {resolved.map((f) => (
        <div key={f.id} data-feedback-id={f.id}>
          <FeedbackCard f={f} userName={userName} onDelete={deleteFeedback} onResolve={resolveFeedback} onReopen={reopenFeedback} onUmgeschaltet={merken} />
        </div>
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
    <Card className="space-y-stack p-4">
      <CardHeading>{t('admin.storage')}</CardHeading>
      {info === null || share === null ? (
        <p className="text-small text-dim">{t('admin.storageUnknown')}</p>
      ) : (
        <>
          <div className="flex items-baseline justify-between text-small">
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
          <p className="text-micro text-dim">
            {t('admin.storageState')}: {fmtBytes(info.stateBytes)}
          </p>
        </>
      )}
      <p className="text-micro leading-relaxed text-dim">{t('admin.storageHint')}</p>
    </Card>
  )
}

/**
 * „Maximale Upload-Groesse" mit Entwurf: Das Feld rechnete bei jedem
 * Tastendruck auf mindestens 1 — Leeren ergab „1", danach „25" getippt
 * ergab 125, gespeichert ohne Obergrenze (Audit 11/2026, VERW-20). Jetzt
 * darf das Feld zwischendurch leer sein; geprueft und gespeichert wird beim
 * Verlassen oder mit Enter (uploadGrenze, einstellungen.ts).
 */
export function UploadGrenzeFeld() {
  const { t } = useTranslation()
  const { state, updateSettings } = useStore()
  const gespeichert = state.settings.maxUploadMB
  const [entwurf, setEntwurf] = useState(String(gespeichert))
  const [tippt, setTippt] = useState(false)
  const hinweisId = useId()
  // Aendert sich der Wert anderswo (zweiter Tab), folgt das Feld — nie
  // mitten in der Eingabe.
  useEffect(() => {
    if (!tippt) setEntwurf(String(gespeichert))
  }, [gespeichert, tippt])
  const uebernehmen = () => {
    setTippt(false)
    const wert = uploadGrenze(entwurf, gespeichert)
    setEntwurf(String(wert))
    if (wert !== gespeichert) {
      updateSettings({ maxUploadMB: wert })
      toast(t('toast.maxUploadSaved', { max: wert }))
    }
  }
  return (
    <div>
      <Field label={t('admin.maxUpload')}>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={MAX_UPLOAD_MB}
          value={entwurf}
          aria-describedby={hinweisId}
          onFocus={() => setTippt(true)}
          onChange={(e) => setEntwurf(e.target.value)}
          onBlur={uebernehmen}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
            if (e.key === 'Escape') setEntwurf(String(gespeichert))
          }}
          className={inputCls}
        />
      </Field>
      <p id={hinweisId} className="mt-1.5 text-micro leading-relaxed text-dim">
        {t('admin.maxUploadHint', { max: MAX_UPLOAD_MB })}
      </p>
    </div>
  )
}

function SettingsTab() {
  const { t } = useTranslation()
  const { state, currentUser, updateSettings } = useStore()
  const s = state.settings
  // Warum ein Muster nicht geloescht werden kann — mit Zahlen, wie das
  // Gruppenloeschen seine Blocker nennt (VERW-18).
  const musterGrund = (typ: string): string | null => {
    const v = musterInVerwendung(state, typ)
    if (!musterBelegt(v)) return null
    const teile = (Object.keys(v) as (keyof typeof v)[]).filter((k) => v[k] > 0).map((k) => t(`admin.inUse.${k}`, { count: v[k] }))
    return t('admin.aircraftInUse', { typ, teile: teile.join(', ') })
  }

  return (
    <div className="space-y-section">
      <Card className="space-y-section p-4">
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
        <UploadGrenzeFeld />
        {/* Diese Musterliste erscheint in ALLEN Grading-Formularen und in den
            Lesson Plans — eine Pflegestelle für die ganze App. */}
        <ChipListe
          label={t('admin.aircraftTypesGlobal')}
          values={s.aircraftTypes}
          pruefeEntfernen={musterGrund}
          onChange={(aircraftTypes) => updateSettings({ aircraftTypes })}
        />
      </Card>
      {/* Pflichteintraege ohne Loeschknopf: migrateState stellt „General"
          und eine leere Schulungsarten-Liste beim naechsten Start wieder her
          — ein Loeschen dort machte sich still selbst rueckgaengig (TEC-09). */}
      <Card className="p-4">
        {/* Kategorien der Instructor-Info-Einträge: löschen/hinzufügen — Filter passt sich an */}
        <ChipListe
          label={t('admin.infoCategories')}
          values={s.infoCategories}
          fest={festeEintraege('infoCategories', s.infoCategories)}
          festHinweis={t('admin.fixedGeneral')}
          onChange={(v) => updateSettings({ infoCategories: v })}
        />
      </Card>
      <Card className="p-4">
        {/* Schulungsarten der Lesson Plans — sie gliedern die Liste innerhalb
            eines Musters und füllen das Auswahlfeld beim Hochladen. */}
        <ChipListe
          label={t('admin.lessonCategories')}
          values={s.lessonCategories ?? []}
          fest={festeEintraege('lessonCategories', s.lessonCategories ?? [])}
          festHinweis={t('admin.fixedLastLesson')}
          onChange={(v) => updateSettings({ lessonCategories: v })}
        />
      </Card>
      {/* Die Vorlage liegt zusaetzlich hier, nicht nur im Import-Dialog:
          Wer sie an die Personalabteilung schickt, will sie holen koennen,
          ohne einen Import zu beginnen. */}
      <Card className="space-y-stack p-4">
        <CardHeading>{t('admin.import.templateSection')}</CardHeading>
        <p className="text-small leading-relaxed text-dim">{t('admin.import.templateHint')}</p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="ghost"
            className="flex items-center gap-1.5"
            onClick={() => window.open(`${import.meta.env.BASE_URL}${VORLAGE_XLSX}`, '_blank')}
          >
            <Download size={15} /> {t('admin.import.templateXlsx')}
          </Button>
          <Button
            variant="ghost"
            className="flex items-center gap-1.5"
            onClick={() => {
              downloadCsv(VORLAGE_CSV, buildImportTemplate(s.aircraftTypes))
              toast(t('toast.downloaded'))
            }}
          >
            <Download size={15} /> {t('admin.import.template')}
          </Button>
        </div>
      </Card>
      <Card className="p-4">
        <ChipListe
          label={t('admin.categories')}
          values={s.feedbackCategories}
          fest={festeEintraege('feedbackCategories', s.feedbackCategories)}
          festHinweis={t('admin.fixedGeneral')}
          onChange={(v) => updateSettings({ feedbackCategories: v })}
        />
      </Card>
      <Card className="p-4">
        <ChipListe label={t('admin.feedbackRecipients')} values={s.feedbackRecipients} onChange={(v) => updateSettings({ feedbackRecipients: v })} />
      </Card>
      <Card className="p-4">
        <ChipListe label={t('admin.ccList')} values={s.feedbackCC} onChange={(v) => updateSettings({ feedbackCC: v })} />
      </Card>
      <Card className="p-4">
        {/* Die Login-Domains entscheiden, wer sich ueberhaupt anmelden kann.
            Ein Tippfehler oder ein Tipp aufs × sperrte vorher die ganze ATO
            aus, ohne Rueckfrage (VERW-05, MOB-05). Jetzt: normalisiert,
            Ungueltiges abgewiesen, Entfernen mit Rueckfrage samt Zahl der
            betroffenen Konten, und nie eine Liste, mit der man selbst oder
            kein Superadmin mehr hineinkaeme (dieselbe Regel im Store). */}
        <ChipListe
          label={t('admin.domains')}
          values={s.allowedDomains}
          normalisiere={normalisiereDomain}
          ungueltig={t('admin.domainInvalid')}
          vorAenderung={(neu, entfernt) => {
            const sperre = domainSperre(state.users, neu, currentUser?.email)
            if (sperre) {
              window.alert(t(sperre === 'selbst' ? 'admin.domainLocksOutSelf' : 'admin.domainLocksOutSuper'))
              return false
            }
            const count = neuAusgesperrt(state.users, s.allowedDomains, neu).length
            if (entfernt !== undefined) {
              const frage = neu.length === 0 ? t('admin.domainRemoveLast', { domain: entfernt }) : t('admin.domainRemoveConfirm', { domain: entfernt, count })
              return window.confirm(frage)
            }
            return count === 0 || window.confirm(t('admin.domainAddConfirm', { count }))
          }}
          onChange={(v) => {
            updateSettings({ allowedDomains: v })
            toast(t('toast.domainsSaved'))
          }}
        />
      </Card>
      <StorageCard />
      {/* Herkunftsangaben des Ausdrucks — ohne sie ist ein ausgedrucktes
          Formular keiner Organisation und keinem Formularstand zuzuordnen. */}
      <Card className="space-y-stack p-4">
        <CardHeading>{t('admin.documentHeader')}</CardHeading>
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
        <p className="text-micro leading-relaxed text-dim">{t('admin.documentHeaderHint')}</p>
      </Card>
    </div>
  )
}

function ImprintTab() {
  const { t } = useTranslation()
  const { state, updateSettings } = useStore()
  const [de, setDe] = useState(state.settings.imprint.de)
  const [en, setEn] = useState(state.settings.imprint.en)

  // Automatisch speichern wie überall im Admin Panel — kurz nach der
  // letzten Eingabe, damit nicht bei jedem Tastendruck geschrieben wird;
  // beim Verlassen des Feldes und der Ansicht sofort. Vorher verwarf das
  // Verlassen innerhalb von 600 ms die letzte Eingabe (VERW-14).
  const { offen: dirty, jetzt } = useAutoSave(
    { de, en },
    // Feld für Feld, nicht das gespeicherte Objekt selbst: verglichen wird
    // über JSON, und eine andere Schlüsselreihenfolge zählte sonst als Änderung.
    { de: state.settings.imprint.de, en: state.settings.imprint.en },
    (imprint) => updateSettings({ imprint }),
  )

  return (
    <div className="space-y-section">
      <p className="text-small leading-relaxed text-dim">{t('admin.imprintHint')}</p>
      <Card className="space-y-section p-4">
        <Field label={t('admin.imprintDe')}>
          <textarea
            value={de}
            onChange={(e) => setDe(e.target.value)}
            onBlur={jetzt}
            spellCheck={false}
            className={`${inputCls} min-h-72 font-mono text-micro leading-relaxed`}
          />
        </Field>
        <Field label={t('admin.imprintEn')}>
          <textarea
            value={en}
            onChange={(e) => setEn(e.target.value)}
            onBlur={jetzt}
            spellCheck={false}
            className={`${inputCls} min-h-72 font-mono text-micro leading-relaxed`}
          />
        </Field>
        <p className="text-right text-micro text-dim">
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
    <div className="space-y-stack">
      <Card className="flex items-center justify-between p-4">
        <span className="text-body text-dim">{t('admin.currentVersion')}</span>
        <span className="text-head font-bold text-accent">v{APP_VERSION}</span>
      </Card>
      {state.changelog.map((entry) => (
        <Card key={`${entry.version}-${entry.at}`} className="p-4">
          <div className="mb-1 flex items-center gap-2">
            <Badge>v{entry.version}</Badge>
            <span className="text-micro text-dim">{formatDateTime(entry.at)}</span>
          </div>
          <p className="text-small leading-relaxed">{entry.changes}</p>
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
  logbook: BookMarked,
  // Dasselbe Symbol wie die Chat-Kachel der Startseite. UsersRound stand
  // neben Users fuer „Benutzer“ und war davon kaum zu unterscheiden (UID-18).
  groups: MessagesSquare,
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
/**
 * Die Statuszeile ueber den Kacheln.
 *
 * `role="status"` statt eines stummen Streifens: Wer mit Sprachausgabe
 * arbeitet, bekam vom Wechsel „drei offene Punkte" auf „nichts offen" sonst
 * nichts mit. Gezaehlt wird in src/adminStatus.ts — dieselbe Rechnung wie im
 * Dashboard des Grading Tools, nur an einer Stelle definiert.
 */
function StatusZeile() {
  const { t } = useTranslation()
  const { state, currentUser, visibleFeedback } = useStore()
  // Aus derselben Freigabeliste wie die Reiter: Ein Punkt, der in einen
  // gesperrten Bereich fuehrt, ist schlimmer als kein Punkt.
  const offen = adminTabsFuer(state.settings, currentUser)
  const punkte = adminStatus({
    gradingRecords: state.gradingRecords,
    feedbackEntries: visibleFeedback,
    darfGrading: offen.includes('grading'),
    darfFeedback: offen.includes('feedback'),
  })
  return (
    <div role="status" className="mb-section">
      {punkte.length === 0 ? (
        <p className="flex items-center justify-center gap-2 text-small text-dim">
          <CheckCircle2 size={15} className="text-ok" /> {t('admin.status.clear')}
        </p>
      ) : (
        <div className="flex flex-wrap items-center justify-center gap-2">
          <span className="text-small font-semibold text-dim">{t('admin.status.title')}:</span>
          {punkte.map((p) => (
            <button
              key={p.key}
              onClick={() => navigate(p.to)}
              className="min-h-11 rounded-full transition hover:brightness-95"
            >
              <Badge tone={p.tone} strong>
                {p.tone === 'bad' ? <AlertTriangle size={12} className="mr-1" /> : <Clock size={12} className="mr-1" />}
                {t(`admin.status.${p.key}`, { count: p.count })}
              </Badge>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function Admin({ sub = '' }: { sub?: string }) {
  const { t } = useTranslation()
  const { state, currentUser } = useStore()
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
  // nicht öffnen darf, wird gar nicht erst gerendert. Sie steht in
  // adminAccess.ts (adminTabsFuer, mit den Rechten aus der Matrix) und nicht
  // hier, damit die Startseite dieselbe Antwort bekommt wie das Panel —
  // sonst zeigt die eine Seite eine Kachel, hinter der die andere nichts hat.
  const tabs = adminTabsFuer(state.settings, currentUser) as Tab[]
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
  // Weitere bleibt dem Superadmin vorbehalten. Massgeblich ist dieselbe
  // Freigabeliste wie oben: Wer keinen einzigen Bereich hat, hat kein Panel.
  // Die Rolle hier ein zweites Mal aufzuzaehlen war der Grund, warum der
  // Training Admin die Kachel bekam und dahinter eine Absage fand.
  if (tabs.length === 0) {
    return (
      <>
        <TopBar title={t('admin.title')} back="/" />
        <Page>
          <p className="pt-10 text-center text-body text-dim">{t('admin.noAccess')}</p>
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
          <p className="max-w-xs text-body leading-relaxed text-dim">{t('admin.desktopOnly')}</p>
        </div>
      </div>
      <Page className="admin-panel">
        {openTab === null ? (
          <>
            {/* Was gerade wartet — vor den Kacheln, nicht hinter ihnen.
                Das Panel zeigte acht gleich aussehende Kacheln und sonst
                nichts; ob irgendwo etwas liegt, stand hinter zwei bis drei
                Klicks. Ein fehlgeschlagener Versand eines
                Schulungsnachweises ist genau das, was nicht liegen bleiben
                darf (ORA.GEN.220). Jeder Punkt fuehrt dorthin, wo er zu
                erledigen ist. */}
            <StatusZeile />

            {/* Kachel-Übersicht wie am Dashboard — leichter zu finden und zu ändern.
                Spaltenzahl aus der Kachelzahl (kachelRaster.ts): Vier feste
                Spalten liessen bei neun Bereichen „Changelog" allein in der
                dritten Reihe stehen. Feste Hoehe statt quadratisch — bei drei
                Spalten waeren die Kacheln ueber 350 px hoch, und die letzte
                Reihe laege unter der Falz (UID-09). Am Handy steht statt des
                Panels ein Hinweis; mit Maus traegt auch ein schmales Fenster
                drei Spalten. */}
            <div className={`grid gap-4 ${rasterKlasse(tabs.length)}`}>
              {tabs.map((tb) => {
                const Icon = TAB_ICONS[tb]
                return (
                  <button
                    key={tb}
                    onClick={() => navigate(`/admin/${tb}`)}
                    className="group flex h-40 flex-col items-center justify-center gap-3 rounded-3xl border border-line/[0.07] bg-surface shadow-tile transition hover:-translate-y-0.5 hover:border-accent/40 hover:bg-raised"
                  >
                    <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-raised text-accent transition group-hover:bg-accent group-hover:text-bg">
                      <Icon size={28} />
                    </span>
                    <span className="px-2 text-center text-body font-semibold leading-tight">{t(`admin.${tb}`)}</span>
                  </button>
                )
              })}
            </div>
            <p className="mt-5 text-center text-micro text-dim">{t('admin.autoSaveHint')}</p>
          </>
        ) : (
          <>
            {/* Ein Rückweg je Ebene: In einem Grading-Unterbereich führt
                „← Grading Tool" (GradingAdmin) eine Ebene hinauf. Vorher
                standen beide Links übereinander, dazu der Pfeil der
                Kopfleiste — drei Rückwege, und welcher wohin ging, war nicht
                zu erkennen (Audit 11/2026, UID-13). */}
            {!(openTab === 'grading' && sectionSeg) && (
              <button
                onClick={() => navigate('/admin')}
                className="mb-4 flex min-h-11 items-center gap-1.5 text-small font-medium text-dim transition hover:text-ink"
              >
                <ArrowLeft size={15} /> {t('admin.backToOverview')}
              </button>
            )}
            {openTab === 'users' && <UsersTab />}
            {openTab === 'permissions' && <PermissionsTab />}
            {openTab === 'grading' && <GradingAdmin section={sectionSeg} />}
            {openTab === 'logbook' && <LogbookAdmin />}
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
