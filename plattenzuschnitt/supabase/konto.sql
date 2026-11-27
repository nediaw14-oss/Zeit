-- SchnittWundeR – Konto-Backend (Profil, Profilbild, Konto löschen)
-- Läuft im Supabase-Projekt „plattenzuschnitt“ (SQL-Editor oder Migration).

-- 1) Profile: eine Zeile pro Nutzer
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text check (char_length(display_name) <= 60),
  company text check (char_length(company) <= 80),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

drop policy if exists "eigenes Profil lesen" on public.profiles;
drop policy if exists "eigenes Profil anlegen" on public.profiles;
drop policy if exists "eigenes Profil ändern" on public.profiles;
create policy "eigenes Profil lesen" on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy "eigenes Profil anlegen" on public.profiles for insert to authenticated with check ((select auth.uid()) = id);
create policy "eigenes Profil ändern" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- Profil automatisch anlegen, wenn sich jemand registriert
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- vorhandene Nutzer nachtragen
insert into public.profiles (id) select id from auth.users on conflict (id) do nothing;

-- 2) Projekte verschwinden mit dem Konto
alter table public.projects drop constraint if exists projects_user_id_fkey;
alter table public.projects add constraint projects_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;

-- 3) Profilbilder: Ordner pro Nutzer (avatars/<user-id>/…), max. 2 MB, nur Bilder
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Avatar hochladen" on storage.objects;
drop policy if exists "Avatar ändern" on storage.objects;
drop policy if exists "Avatar löschen" on storage.objects;
drop policy if exists "Avatar auflisten" on storage.objects;
create policy "Avatar hochladen" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Avatar ändern" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Avatar löschen" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Avatar auflisten" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- 4) Konto löschen: nur das eigene, nur angemeldet
create or replace function public.delete_account()
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'nicht angemeldet'; end if;
  delete from public.projects where user_id = uid;
  delete from public.profiles where id = uid;
  delete from auth.users where id = uid;
end $$;
revoke all on function public.delete_account() from public, anon;
grant execute on function public.delete_account() to authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
