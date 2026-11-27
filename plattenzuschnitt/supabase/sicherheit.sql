-- SchnittWundeR – Sicherheits-Härtung (nach konto.sql ausführen)

-- 1) Größenlimits gegen Speicher-Missbrauch
alter table public.projects drop constraint if exists projects_name_len;
alter table public.projects add constraint projects_name_len check (char_length(name) between 1 and 200);
alter table public.projects drop constraint if exists projects_data_size;
alter table public.projects add constraint projects_data_size check (octet_length(data::text) <= 2000000);

-- 2) Profilbild darf nur auf das eigene Bild im Speicher zeigen (keine fremden/Tracking-URLs, kein javascript:)
alter table public.profiles drop constraint if exists profiles_avatar_url_own;
alter table public.profiles add constraint profiles_avatar_url_own check (
  avatar_url is null
  or (avatar_url like 'https://otumisjdoxjzfyyuuklj.supabase.co/storage/v1/object/public/avatars/' || id::text || '/%'
      and char_length(avatar_url) <= 300 and avatar_url !~ '[\s"''<>]'));

-- 3) Minimale Rechte: Gäste (anon) brauchen keine Tabellen; TRUNCATE/TRIGGER/REFERENCES umgehen RLS bzw. braucht niemand
revoke all on public.projects, public.profiles from anon;
revoke truncate, trigger, references on public.projects, public.profiles from authenticated;
alter default privileges in schema public revoke all on tables from anon;
