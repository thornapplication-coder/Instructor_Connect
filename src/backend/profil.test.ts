import { describe, expect, it } from 'vitest'
import { schutzGrund, zuAenderung, zuNutzer, type ProfilZeile } from './profil'

const zeile: ProfilZeile = {
  id: 'u1', name: 'Mika', email: 'm@x.test', phone: '+43', role: 'member', active: true, aircraft_types: ['C560'],
  can_grade: true, is_trainee: false, can_edit_directory: false, chat_blocked: false, doccheck_access: true, doccheck_admin: false,
}

describe('Profil ↔ User', () => {
  it('Zeile → User mit den Feldnamen der App; Muster kopiert', () => {
    const u = zuNutzer(zeile)
    expect(u).toEqual({ id: 'u1', name: 'Mika', email: 'm@x.test', phone: '+43', role: 'member', active: true, aircraftTypes: ['C560'], canGrade: true, isTrainee: false, canEditDirectory: false, chatBlocked: false, docCheckAccess: true, docCheckAdmin: false })
    u.aircraftTypes.push('X')
    expect(zeile.aircraft_types).toEqual(['C560'])
  })

  it('Änderung → Spalten; DocCheck-Rechte und id fallen weg, undefined auch', () => {
    expect(zuAenderung({ name: 'N', aircraftTypes: ['A'], canGrade: false, docCheckAccess: true, docCheckAdmin: true, id: 'x', phone: undefined })).toEqual({ name: 'N', aircraft_types: ['A'], can_grade: false })
  })

  it('Schutzregeln der Datenbank → Gründe', () => {
    expect(schutzGrund('IC-SELF: you cannot …')).toBe('selbst')
    expect(schutzGrund('IC-LAST-SUPERADMIN: …')).toBe('letzterSuperadmin')
    expect(schutzGrund('IC-DOCCHECK: …')).toBe('doccheck')
    expect(schutzGrund('IC-RIGHTS: …')).toBe('rechte')
    expect(schutzGrund('permission denied for table profiles')).toBe('rechte')
    expect(schutzGrund('new row violates row-level security policy')).toBe('rechte')
    expect(schutzGrund('duplicate key')).toBeNull()
  })
})
