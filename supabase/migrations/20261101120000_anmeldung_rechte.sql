-- Phase 1b, Etappe 1: Anmeldung und Rechte.
--
-- Die Rechte stehen HIER durchgesetzt (Row Level Security), nicht in der
-- Oberfläche. Die Oberfläche fragt dieselben Regeln nur ab, damit sie keine
-- Knöpfe zeigt, die die Datenbank ablehnen würde.
--
-- Vorlage: src/modules/doccheck/access.ts (Matrix aus Spez. Kap. 5.1) und
-- die Schutzregeln aus src/bulkUsers.ts. Der Rollentest
-- (src/backend/rls.test.ts) prüft jede Matrixzeile mit jeder Rolle gegen
-- die TypeScript-Fassung — die beiden können nicht auseinanderlaufen.

create schema if not exists doccheck;

/* ------------------------------- Profile -------------------------------- */

create type public.app_role as enum ('superadmin', 'group_admin', 'training_admin', 'member');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null default '',
  email text not null unique,
  phone text not null default '',
  role public.app_role not null default 'member',
  active boolean not null default true,
  aircraft_types text[] not null default '{}',
  can_grade boolean not null default false,
  is_trainee boolean not null default false,
  can_edit_directory boolean not null default false,
  chat_blocked boolean not null default false,
  -- Nur über doccheck.set_rights (Superadmin, mit Audit-Zeile) — nie per UPDATE
  doccheck_access boolean not null default false,
  doccheck_admin boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Hilfsfunktionen als SECURITY DEFINER: Sie lesen profiles, ohne selbst an
-- dessen Policies zu hängen (sonst ruft die Policy sich selbst auf).
create function public.is_active_user() returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active)
$$;

create function public.is_superadmin() returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active and role = 'superadmin')
$$;

-- Aktive Nutzer sehen aktive Nutzer (Verzeichnis, Chats); deaktivierte
-- Konten sieht nur der Superadmin. Deaktivierte Nutzer sehen gar nichts.
create policy profiles_select on public.profiles for select to authenticated
  using (public.is_active_user() and (active or public.is_superadmin()));

-- Eigene Kontaktdaten darf jeder ändern — Spaltenrechte begrenzen auf Name und Telefon.
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid() and public.is_active_user())
  with check (id = auth.uid());

-- Der Superadmin pflegt Nutzer (ohne DocCheck-Rechte, siehe Spaltenrechte).
create policy profiles_update_super on public.profiles for update to authenticated
  using (public.is_superadmin())
  with check (public.is_superadmin());

grant select on public.profiles to authenticated;
grant update (name, phone) on public.profiles to authenticated;
-- Spalten, die nur der Superadmin ändert — die Policy profiles_update_super
-- greift, für alle anderen fehlt die Zeile. DocCheck-Rechte fehlen hier bewusst.
grant update (role, active, aircraft_types, can_grade, is_trainee, can_edit_directory, chat_blocked, email) on public.profiles to authenticated;

/*
 * Schutzregeln als Trigger — sie gelten für JEDEN Weg in die Tabelle,
 * auch für spätere Funktionen und den Import:
 * - Rolle, Aktiv-Flag und Rechte ändert nur der Superadmin; die
 *   Spaltenrechte allein reichen nicht, weil profiles_update_own sonst
 *   die eigene Zeile für alle erlaubten Spalten öffnet.
 * - Niemand ändert die EIGENE Rolle oder deaktiviert sich selbst.
 * - Der letzte aktive Superadmin bleibt (src/bulkUsers.ts).
 */
create function public.profiles_guard() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  -- Läuft die Änderung außerhalb einer Nutzersitzung (Migration, Dienst), gelten nur die Superadmin-Regeln.
  if auth.uid() is not null then
    if (new.role, new.active, new.aircraft_types, new.can_grade, new.is_trainee, new.can_edit_directory, new.chat_blocked, new.email)
       is distinct from (old.role, old.active, old.aircraft_types, old.can_grade, old.is_trainee, old.can_edit_directory, old.chat_blocked, old.email)
       and not public.is_superadmin() then
      raise exception 'IC-RIGHTS: only the superadmin changes role, status and rights' using errcode = '42501';
    end if;
    if new.id = auth.uid() and (new.role is distinct from old.role or new.active is distinct from old.active) then
      raise exception 'IC-SELF: you cannot change your own role or deactivate yourself' using errcode = '42501';
    end if;
    if (new.doccheck_access, new.doccheck_admin) is distinct from (old.doccheck_access, old.doccheck_admin)
       and current_setting('doccheck.rights_call', true) is distinct from 'on' then
      raise exception 'IC-DOCCHECK: DocCheck rights only via doccheck.set_rights' using errcode = '42501';
    end if;
  end if;
  if old.role = 'superadmin' and old.active and not (new.role = 'superadmin' and new.active)
     and not exists (select 1 from public.profiles where role = 'superadmin' and active and id <> old.id) then
    raise exception 'IC-LAST-SUPERADMIN: the last active superadmin cannot be removed' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger profiles_guard before update on public.profiles
  for each row execute function public.profiles_guard();

-- Neues Konto (Einladung durch den Superadmin) → Profil. Rolle und Rechte
-- starten minimal; der Superadmin setzt sie danach.
create function public.handle_new_user() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, name) values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'name', ''));
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

/* ------------------------------- DocCheck ------------------------------- */

-- Spez. Kap. 5.1 Zeile für Zeile — gleich src/modules/doccheck/access.ts (MATRIX).
create table doccheck.permissions (
  action text not null,
  role text not null check (role in ('nutzer', 'admin', 'superadmin')),
  primary key (action, role)
);

insert into doccheck.permissions (action, role) values
  ('kachel', 'nutzer'), ('kachel', 'admin'), ('kachel', 'superadmin'),
  ('bibliothekLesen', 'nutzer'), ('bibliothekLesen', 'admin'), ('bibliothekLesen', 'superadmin'),
  ('pdfAnsehen', 'nutzer'), ('pdfAnsehen', 'admin'), ('pdfAnsehen', 'superadmin'),
  ('pdfHerunterladen', 'admin'), ('pdfHerunterladen', 'superadmin'),
  ('pruefen', 'nutzer'), ('pruefen', 'admin'), ('pruefen', 'superadmin'),
  ('bibliothekPflegen', 'admin'), ('bibliothekPflegen', 'superadmin'),
  ('endgueltigLoeschen', 'superadmin'),
  ('erinnerungBestaetigen', 'admin'), ('erinnerungBestaetigen', 'superadmin'),
  ('konfigurieren', 'superadmin'),
  ('protokolleLesen', 'superadmin');

alter table doccheck.permissions enable row level security;
create policy permissions_read on doccheck.permissions for select to authenticated using (true);

-- docCheckRolle(): Superadmin von Instructor Connect ist immer DocCheck-Superadmin (Spez. 3.4).
create function doccheck.role() returns text
  language sql stable security definer set search_path = public as $$
  select coalesce((
    select case
      when not p.active then 'keine'
      when p.role = 'superadmin' then 'superadmin'
      when not p.doccheck_access then 'keine'
      when p.doccheck_admin then 'admin'
      else 'nutzer'
    end
    from public.profiles p where p.id = auth.uid()
  ), 'keine')
$$;

create function doccheck.can(p_action text) returns boolean
  language sql stable security definer set search_path = doccheck, public as $$
  select exists (select 1 from doccheck.permissions where action = p_action and role = doccheck.role())
$$;

create table doccheck.audit (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor uuid not null references public.profiles (id),
  action text not null check (action in ('zugang', 'admin', 'feature', 'einstellung', 'standBestaetigt', 'recheckBestaetigt')),
  target text not null,
  value text not null
);
alter table doccheck.audit enable row level security;
create policy audit_read on doccheck.audit for select to authenticated using (doccheck.can('protokolleLesen'));
-- Kein INSERT-Recht: Audit-Zeilen schreiben nur die Funktionen unten, mit dem Aufrufer als Akteur.

create table doccheck.settings (
  id int primary key default 1 check (id = 1),
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
insert into doccheck.settings (id) values (1);
alter table doccheck.settings enable row level security;
create policy settings_read on doccheck.settings for select to authenticated using (doccheck.can('kachel'));
create policy settings_write on doccheck.settings for update to authenticated using (doccheck.can('konfigurieren')) with check (doccheck.can('konfigurieren'));

-- Bibliotheks-Metadaten (Inhalte und Speicher folgen mit Phase 3)
create table doccheck.documents (
  id uuid primary key default gen_random_uuid(),
  doc_type text not null,
  title text not null,
  revision text not null,
  collection text not null default '',
  status text not null default 'aktiv' check (status in ('aktiv', 'archiviert')),
  confirmed_at timestamptz,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);
alter table doccheck.documents enable row level security;
create policy documents_read on doccheck.documents for select to authenticated using (doccheck.can('bibliothekLesen'));
create policy documents_insert on doccheck.documents for insert to authenticated with check (doccheck.can('bibliothekPflegen'));
create policy documents_update on doccheck.documents for update to authenticated using (doccheck.can('bibliothekPflegen')) with check (doccheck.can('bibliothekPflegen'));
create policy documents_delete on doccheck.documents for delete to authenticated using (doccheck.can('endgueltigLoeschen'));

grant usage on schema doccheck to authenticated;
grant select on doccheck.permissions, doccheck.audit, doccheck.settings, doccheck.documents to authenticated;
grant update (data) on doccheck.settings to authenticated;
grant insert (doc_type, title, revision, collection, status), update (doc_type, title, revision, collection, status), delete on doccheck.documents to authenticated;

/*
 * DocCheck-Rechte setzen (setDocCheckRights): nur der Superadmin, „admin"
 * setzt „access" voraus, jede tatsächliche Änderung eine Audit-Zeile. Der
 * Superadmin selbst hat DocCheck immer — seine Schalter bleiben unberührt.
 */
create function doccheck.set_rights(p_user uuid, p_access boolean, p_admin boolean) returns void
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
  perform set_config('doccheck.rights_call', 'on', true);
  update public.profiles set doccheck_access = neu_access, doccheck_admin = neu_admin where id = p_user;
  perform set_config('doccheck.rights_call', 'off', true);
  if alt.doccheck_access is distinct from neu_access then
    insert into doccheck.audit (actor, action, target, value) values (auth.uid(), 'zugang', p_user::text, format('%s → %s', alt.doccheck_access::text, neu_access::text));
  end if;
  if alt.doccheck_admin is distinct from neu_admin then
    insert into doccheck.audit (actor, action, target, value) values (auth.uid(), 'admin', p_user::text, format('%s → %s', alt.doccheck_admin::text, neu_admin::text));
  end if;
end $$;

-- „Stand bestätigt" (Revisionserinnerung) — DocCheck-Admin oder Superadmin, mit Audit.
create function doccheck.confirm_revision(p_document uuid) returns void
  language plpgsql security definer set search_path = public, doccheck as $$
begin
  if not doccheck.can('erinnerungBestaetigen') then
    raise exception 'IC-RIGHTS: not allowed to confirm a revision' using errcode = '42501';
  end if;
  update doccheck.documents set confirmed_at = now() where id = p_document;
  if not found then raise exception 'IC-NOT-FOUND' using errcode = 'P0002'; end if;
  insert into doccheck.audit (actor, action, target, value) values (auth.uid(), 'standBestaetigt', p_document::text, 'confirmed');
end $$;

-- Re-Check bestätigt (N3/N11): Liste und Nummern mit Status, nie Befundtext.
create function doccheck.log_recheck(p_list text, p_value text) returns void
  language plpgsql security definer set search_path = public, doccheck as $$
begin
  if not doccheck.can('pruefen') then
    raise exception 'IC-RIGHTS: not allowed to confirm re-check proposals' using errcode = '42501';
  end if;
  insert into doccheck.audit (actor, action, target, value) values (auth.uid(), 'recheckBestaetigt', left(p_list, 200), left(p_value, 300));
end $$;

-- Einstellungen ändern mit Audit je Schlüssel (updateDocCheckSettings).
create function doccheck.update_settings(p_patch jsonb) returns void
  language plpgsql security definer set search_path = public, doccheck as $$
declare
  alt jsonb;
  k text;
begin
  if not doccheck.can('konfigurieren') then
    raise exception 'IC-RIGHTS: only the superadmin configures DocCheck' using errcode = '42501';
  end if;
  select data into alt from doccheck.settings where id = 1;
  for k in select jsonb_object_keys(p_patch) loop
    if k = 'features' then
      insert into doccheck.audit (actor, action, target, value)
        select auth.uid(), 'feature', f.key, format('%s → %s', coalesce(alt -> 'features' ->> f.key, 'default'), f.value)
        from jsonb_each_text(p_patch -> 'features') f
        where (alt -> 'features' ->> f.key) is distinct from f.value;
    elsif (alt -> k) is distinct from (p_patch -> k) then
      insert into doccheck.audit (actor, action, target, value) values (auth.uid(), 'einstellung', k, format('%s → %s', coalesce(alt -> k, 'null'::jsonb), p_patch -> k));
    end if;
  end loop;
  update doccheck.settings
    set data = (data || (p_patch - 'features')) || jsonb_build_object('features', coalesce(data -> 'features', '{}'::jsonb) || coalesce(p_patch -> 'features', '{}'::jsonb)),
        updated_at = now()
    where id = 1;
end $$;

revoke all on function doccheck.set_rights(uuid, boolean, boolean), doccheck.confirm_revision(uuid), doccheck.log_recheck(text, text), doccheck.update_settings(jsonb) from public;
grant execute on function doccheck.set_rights(uuid, boolean, boolean), doccheck.confirm_revision(uuid), doccheck.log_recheck(text, text), doccheck.update_settings(jsonb), doccheck.role(), doccheck.can(text) to authenticated;
grant execute on function public.is_active_user(), public.is_superadmin() to authenticated;
