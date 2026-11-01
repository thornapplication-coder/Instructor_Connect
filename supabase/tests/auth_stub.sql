-- Nur für Tests ohne Supabase (PGlite, lokales Postgres): das, was Supabase
-- mitbringt — Rollen, Schema auth, auth.users, auth.uid(). In einem echten
-- Projekt existiert das schon; diese Datei wird dort NICHT ausgeführt.
create role anon nologin;
create role authenticated nologin;
create schema auth;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
-- Wie bei Supabase: die Nutzer-ID kommt aus dem JWT der Anfrage
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to authenticated, anon;
grant usage on schema public to authenticated, anon;

-- Wie bei Supabase: neue Objekte in public bekommen ALLE Rechte für anon
-- und authenticated (Default Privileges). Ohne diese Nachbildung prüfte der
-- Rollentest gegen eine strengere Datenbank als die echte — die
-- Sicherheitsprüfung vom 01.11.2026 hat genau so eine Lücke gefunden.
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;
