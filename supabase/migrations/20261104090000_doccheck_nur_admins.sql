-- Phase 1b, Etappe 1 (Nachtrag): DocCheck nur für Admin-Rollen.
--
-- Entscheidung vom 04.11.2026: Superadmin, Gruppenadmin und Training Admin
-- können DocCheck bekommen, ein Mitglied (Instruktor) nie. Die
-- Spezifikation (3.4) hatte den Zugang von der Rolle getrennt; damit konnte
-- ein Instruktor vertrauliche Herstellerunterlagen sehen, und ein zum
-- Mitglied herabgestufter Admin behielt den Zugang still.
--
-- Gleiche Regel wie in src/modules/doccheck/access.ts (`docCheckMoeglich`,
-- `docCheckRolle`, `docCheckBereinigt`, `rechteErlaubt`);
-- src/backend/rls.test.ts hält beide gegeneinander. Durchgesetzt an drei
-- Stellen, die sich gegenseitig absichern:
-- 1. Prüfregel auf profiles: Ein Mitglied mit DocCheck-Schalter lässt sich
--    gar nicht speichern — auf keinem Weg, auch nicht vom Dienst.
-- 2. set_rights lehnt das Vergeben an ein Mitglied mit Grund ab, statt an
--    der Prüfregel mit einer technischen Meldung zu scheitern.
-- 3. Ein Rollenwechsel auf Mitglied nimmt die Schalter mit (Trigger), damit
--    die Herabstufung nicht an der Prüfregel scheitert und die nächste
--    Beförderung den Zugang nicht still zurückgibt. Die Audit-Zeile schreibt
--    der vorhandene Trigger profiles_rollen_audit ('admin → keine').

-- Bestand bereinigen, bevor die Prüfregel greift. Für ein aktives Mitglied
-- mit Haken ändert sich dabei die wirksame DocCheck-Rolle (doccheck.role()
-- gab bisher 'nutzer' bzw. 'admin' zurück — genau das war die Lücke). Das
-- ist eine Rechteänderung und steht im Audit, ohne Akteur wie jede Wartung
-- durch den Dienst.
insert into doccheck.audit (actor, action, target, value)
  select null, 'rolle', id::text,
         format('%s → keine', case when doccheck_admin then 'admin' else 'nutzer' end)
  from public.profiles
  where role = 'member' and active and doccheck_access;
update public.profiles set doccheck_access = false, doccheck_admin = false
  where role = 'member' and (doccheck_access or doccheck_admin);

alter table public.profiles add constraint profiles_doccheck_nur_admins
  check (role <> 'member' or not (doccheck_access or doccheck_admin));

-- DocCheck-Rolle aus einer Profilzeile: Mitglied → 'keine', auch wenn ein
-- Schalter gesetzt wäre (die Prüfregel verhindert das; die Funktion verlässt
-- sich trotzdem nicht darauf — wie docCheckRolle in access.ts).
create or replace function doccheck.rolle_aus(p_role public.app_role, p_active boolean, p_access boolean, p_admin boolean) returns text
  language sql immutable set search_path = public as $$
  select case
    when not p_active then 'keine'
    when p_role = 'superadmin' then 'superadmin'
    when p_role = 'member' then 'keine'
    when not p_access then 'keine'
    when p_admin then 'admin'
    else 'nutzer'
  end
$$;
revoke all on function doccheck.rolle_aus(public.app_role, boolean, boolean, boolean) from public, anon, authenticated;

-- doccheck.role() rechnet jetzt über rolle_aus — vorher stand dieselbe
-- Fallunterscheidung zweimal, und eine neue Regel hätte nur eine erreicht.
create or replace function doccheck.role() returns text
  language sql stable security definer set search_path = public, doccheck as $$
  select coalesce((
    select doccheck.rolle_aus(p.role, p.active, p.doccheck_access, p.doccheck_admin)
    from public.profiles p where p.id = auth.uid()
  ), 'keine')
$$;

-- set_rights: wie bisher, dazu die Rollenregel. Entfernen geht immer
-- (falsch/falsch); Vergeben an ein Mitglied nie.
create or replace function doccheck.set_rights(p_user uuid, p_access boolean, p_admin boolean) returns void
  language plpgsql security definer set search_path = public, doccheck as $$
declare
  alt public.profiles;
  neu_access boolean := p_access or p_admin;
  neu_admin boolean := p_admin and (p_access or p_admin);
begin
  if not public.is_superadmin() then
    raise exception 'IC-RIGHTS: only the superadmin sets DocCheck rights' using errcode = '42501';
  end if;
  select * into alt from public.profiles where id = p_user;
  if not found then raise exception 'IC-NOT-FOUND' using errcode = 'P0002'; end if;
  if alt.role = 'superadmin' then return; end if;
  if alt.role = 'member' and neu_access then
    raise exception 'IC-DOCCHECK-ROLE: DocCheck is reserved for admin roles' using errcode = '42501';
  end if;
  update public.profiles set doccheck_access = neu_access, doccheck_admin = neu_admin where id = p_user;
  if alt.doccheck_access is distinct from neu_access then
    insert into doccheck.audit (actor, action, target, value) values (auth.uid(), 'zugang', p_user::text, format('%s → %s', alt.doccheck_access::text, neu_access::text));
  end if;
  if alt.doccheck_admin is distinct from neu_admin then
    insert into doccheck.audit (actor, action, target, value) values (auth.uid(), 'admin', p_user::text, format('%s → %s', alt.doccheck_admin::text, neu_admin::text));
  end if;
end $$;
revoke all on function doccheck.set_rights(uuid, boolean, boolean) from public, anon;
grant execute on function doccheck.set_rights(uuid, boolean, boolean) to authenticated;

-- Herabstufen auf Mitglied nimmt die Schalter mit. Als BEFORE-Trigger NACH
-- profiles_guard: Postgres feuert Trigger gleicher Art in alphabetischer
-- Reihenfolge, „profiles_guard" vor „profiles_guard_mitglied". Der Wächter
-- sieht also die Änderung des Superadmins (nur die Rolle) und lässt sie zu;
-- erst danach fallen die Schalter. In umgekehrter Reihenfolge wiese er die
-- Herabstufung ab (IC-DOCCHECK: Rechte nur über set_rights).
create function public.profiles_guard_mitglied() returns trigger
  language plpgsql set search_path = public as $$
begin
  if new.role = 'member' then
    new.doccheck_access := false;
    new.doccheck_admin := false;
  end if;
  return new;
end $$;
revoke all on function public.profiles_guard_mitglied() from public, anon, authenticated;

create trigger profiles_guard_mitglied before update of role on public.profiles
  for each row when (new.role = 'member' and old.role is distinct from new.role)
  execute function public.profiles_guard_mitglied();
