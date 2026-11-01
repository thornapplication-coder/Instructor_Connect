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
