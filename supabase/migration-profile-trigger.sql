-- Run in Supabase SQL editor after schema.sql (safe to re-run).
-- Installs handle_new_user trigger and backfills profiles for existing auth users.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base_username text;
  final_username text;
  suffix int := 0;
begin
  base_username := lower(regexp_replace(
    coalesce(
      nullif(trim(new.raw_user_meta_data->>'username'), ''),
      nullif(trim(split_part(coalesce(new.email, ''), '@', 1)), ''),
      'friend'
    ),
    '[^a-z0-9_]', '', 'g'
  ));
  if length(base_username) < 3 then
    base_username := 'friend';
  end if;
  base_username := left(base_username, 20);

  final_username := base_username;
  while exists (select 1 from public.profiles where username = final_username) loop
    suffix := suffix + 1;
    final_username :=
      left(base_username, greatest(3, 20 - length(suffix::text) - 1)) || '_' || suffix;
  end loop;

  insert into public.profiles (
    user_id,
    email,
    display_name,
    username,
    avatar_config,
    avatar_created,
    bio,
    last_active_at
  ) values (
    new.id,
    coalesce(new.email, ''),
    coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'), ''), final_username),
    final_username,
    '{}'::jsonb,
    false,
    '',
    (extract(epoch from now()) * 1000)::bigint
  )
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill profiles for auth users created before the trigger existed.
insert into public.profiles (
  user_id,
  email,
  display_name,
  username,
  avatar_config,
  avatar_created,
  bio,
  last_active_at
)
select
  u.id,
  coalesce(u.email, ''),
  coalesce(
    nullif(trim(u.raw_user_meta_data->>'display_name'), ''),
    nullif(trim(u.raw_user_meta_data->>'username'), ''),
    nullif(trim(split_part(coalesce(u.email, ''), '@', 1)), ''),
    'friend'
  ),
  left(
    lower(regexp_replace(
      coalesce(
        nullif(trim(u.raw_user_meta_data->>'username'), ''),
        nullif(trim(split_part(coalesce(u.email, ''), '@', 1)), ''),
        'friend'
      ),
      '[^a-z0-9_]', '', 'g'
    )),
    14
  ) || '_' || substr(replace(u.id::text, '-', ''), 1, 5),
  '{}'::jsonb,
  false,
  '',
  (extract(epoch from now()) * 1000)::bigint
from auth.users u
where not exists (select 1 from public.profiles p where p.user_id = u.id)
on conflict (user_id) do nothing;
