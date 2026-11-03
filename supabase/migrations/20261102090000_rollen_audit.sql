-- Phase 1b, Etappe 1 (Nachtrag): Rollenwechsel mit DocCheck-Wirkung im Audit.
--
-- Die DocCheck-Rolle hängt nicht nur an den beiden Schaltern, die
-- doccheck.set_rights setzt und protokolliert: Der Superadmin von Instructor
-- Connect ist automatisch DocCheck-Superadmin, und ein deaktiviertes Konto
-- hat gar keine DocCheck-Rolle (doccheck.role(), Spez. 3.4). Wer jemanden
-- zum Superadmin machte oder deaktivierte, änderte also DocCheck-Rechte —
-- ohne Audit-Zeile. Spez. 3.4: „Jede Änderung einer Berechtigung wird im
-- Audit-Log protokolliert“ (Audit 11/2026, VERW-15).
--
-- Gleiche Regel wie rollenAudit() in src/modules/doccheck/access.ts: eine
-- Zeile (Aktion 'rolle', vorher → nachher), wenn sich die DocCheck-Rolle
-- durch Rolle oder Status ändert. Die Schalter selbst protokolliert weiter
-- set_rights; der Trigger hört nur auf role und active, damit nichts doppelt
-- steht.
--
-- Audit-Zeilen schreibt nur die Datenbank: Der Trigger läuft als Eigentümer
-- (SECURITY DEFINER), Akteur ist der Aufrufer (auth.uid()). Ändert der Dienst
-- selbst (Einladung, Wartung ohne Nutzersitzung), bleibt der Akteur leer —
-- wie bei einer Zeile, deren Konto gelöscht wurde.

-- Supabase-Standardrechte zuerst entziehen, dann gezielt geben (CLAUDE.md,
-- Sicherheitsprüfung 01.11.2026). Am Audit ändert sich nur die Prüfregel;
-- die Rechte stehen hier trotzdem noch einmal ausdrücklich.
revoke all on doccheck.audit from anon, authenticated;
grant select on doccheck.audit to authenticated;

-- Neue Aktion 'rolle'. Die Regel hieß beim Anlegen (ohne eigenen Namen)
-- audit_action_check.
alter table doccheck.audit drop constraint audit_action_check;
alter table doccheck.audit add constraint audit_action_check
  check (action in ('zugang', 'admin', 'rolle', 'feature', 'einstellung', 'standBestaetigt', 'recheckBestaetigt'));

-- DocCheck-Rolle aus den Feldern einer Profilzeile — dieselbe Fallunterscheidung
-- wie doccheck.role() (dort für den Aufrufer, hier für alte und neue Zeile).
create function doccheck.rolle_aus(p_role public.app_role, p_active boolean, p_access boolean, p_admin boolean) returns text
  language sql immutable set search_path = public as $$
  select case
    when not p_active then 'keine'
    when p_role = 'superadmin' then 'superadmin'
    when not p_access then 'keine'
    when p_admin then 'admin'
    else 'nutzer'
  end
$$;
revoke all on function doccheck.rolle_aus(public.app_role, boolean, boolean, boolean) from public, anon, authenticated;

create function doccheck.profiles_rollen_audit() returns trigger
  language plpgsql security definer set search_path = public, doccheck as $$
declare
  vorher text := doccheck.rolle_aus(old.role, old.active, old.doccheck_access, old.doccheck_admin);
  nachher text := doccheck.rolle_aus(new.role, new.active, new.doccheck_access, new.doccheck_admin);
begin
  if vorher is distinct from nachher then
    insert into doccheck.audit (actor, action, target, value)
      values (auth.uid(), 'rolle', new.id::text, format('%s → %s', vorher, nachher));
  end if;
  return null;
end $$;
-- Nur der Trigger ruft sie; aufrufbar ist sie für niemanden.
revoke all on function doccheck.profiles_rollen_audit() from public, anon, authenticated;

-- AFTER: erst wenn profiles_guard (BEFORE) die Änderung zugelassen hat.
create trigger profiles_rollen_audit after update of role, active on public.profiles
  for each row when (old.role is distinct from new.role or old.active is distinct from new.active)
  execute function doccheck.profiles_rollen_audit();
