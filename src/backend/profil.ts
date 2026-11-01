import type { Role, User } from '../types'

/**
 * Profil der Datenbank (public.profiles, supabase/migrations) ↔ User der
 * App. Die Spaltennamen sind englisch (Supabase-Konvention, Nachtrag Kap.
 * 16); die App bleibt bei ihren Feldnamen.
 */

export interface ProfilZeile {
  id: string
  name: string
  email: string
  phone: string
  role: Role
  active: boolean
  aircraft_types: string[]
  can_grade: boolean
  is_trainee: boolean
  can_edit_directory: boolean
  chat_blocked: boolean
  doccheck_access: boolean
  doccheck_admin: boolean
}

export function zuNutzer(z: ProfilZeile): User {
  return {
    id: z.id,
    name: z.name,
    email: z.email,
    phone: z.phone,
    role: z.role,
    active: z.active,
    aircraftTypes: [...z.aircraft_types],
    canGrade: z.can_grade,
    isTrainee: z.is_trainee,
    canEditDirectory: z.can_edit_directory,
    chatBlocked: z.chat_blocked,
    docCheckAccess: z.doccheck_access,
    docCheckAdmin: z.doccheck_admin,
  }
}

/** Spalten, die der Superadmin per UPDATE ändern darf — DocCheck-Rechte NICHT (nur doccheck.set_rights). */
const SPALTEN: Partial<Record<keyof User, keyof ProfilZeile>> = {
  name: 'name',
  phone: 'phone',
  email: 'email',
  role: 'role',
  active: 'active',
  aircraftTypes: 'aircraft_types',
  canGrade: 'can_grade',
  isTrainee: 'is_trainee',
  canEditDirectory: 'can_edit_directory',
  chatBlocked: 'chat_blocked',
}

/**
 * Änderung eines Nutzers → UPDATE-Werte. DocCheck-Rechte fallen weg wie in
 * `updateUser` (CLAUDE.md): Sie laufen über doccheck.set_rights, mit
 * Audit-Zeile. Die Datenbank würde sie ohnehin ablehnen.
 */
export function zuAenderung(patch: Partial<User>): Partial<ProfilZeile> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(patch) as [keyof User, unknown][]) {
    const spalte = SPALTEN[k]
    if (spalte && v !== undefined) out[spalte] = Array.isArray(v) ? [...v] : v
  }
  return out as Partial<ProfilZeile>
}

/** Datenbankfehler der Schutzregeln (IC-…) → Grund für die Oberfläche. */
export function schutzGrund(message: string): 'selbst' | 'letzterSuperadmin' | 'rechte' | 'doccheck' | null {
  if (message.includes('IC-SELF')) return 'selbst'
  if (message.includes('IC-LAST-SUPERADMIN')) return 'letzterSuperadmin'
  if (message.includes('IC-DOCCHECK')) return 'doccheck'
  if (message.includes('IC-RIGHTS') || /permission denied|row-level security/i.test(message)) return 'rechte'
  return null
}
