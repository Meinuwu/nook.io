-- Nook shared backend schema (run in Supabase SQL editor)
-- Disable email confirmation in Auth → Providers → Email for instant signup.
-- Auth → URL Configuration → add redirect: https://nook-io.vercel.app/reset-password
--   (and http://localhost:1420/reset-password for local dev)

create table if not exists profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null,
  username text unique not null,
  avatar_config jsonb not null default '{}',
  avatar_created boolean not null default false,
  profile_photo_url text,
  bio text default '',
  online_status text not null default 'auto',
  last_active_at bigint,
  pending_inviter_user_id uuid references profiles(user_id),
  show_stats boolean not null default true,
  show_achievements boolean not null default true,
  show_friends boolean not null default true,
  auto_accept_friends boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists rooms (
  id text primary key,
  code text unique not null,
  name text not null,
  created_by uuid not null references profiles(user_id) on delete cascade,
  capacity int not null,
  created_at bigint not null
);

create table if not exists room_members (
  room_id text not null references rooms(id) on delete cascade,
  user_id uuid not null references profiles(user_id) on delete cascade,
  display_name text not null,
  avatar_config jsonb not null default '{}',
  desk_slot int not null default -1,
  status text not null default 'idle',
  timer_ends_at bigint,
  focus_started_at bigint,
  focus_session_id text,
  updated_at bigint not null,
  primary key (room_id, user_id)
);

create table if not exists friendships (
  id text primary key,
  from_user_id uuid not null references profiles(user_id) on delete cascade,
  to_user_id uuid not null references profiles(user_id) on delete cascade,
  status text not null check (status in ('pending', 'accepted')),
  created_at bigint not null
);

create unique index if not exists friendships_pair_idx on friendships (
  least(from_user_id, to_user_id),
  greatest(from_user_id, to_user_id)
);

create table if not exists chat_messages (
  id text primary key,
  room_id text not null references rooms(id) on delete cascade,
  user_id uuid not null references profiles(user_id) on delete cascade,
  display_name text not null,
  text text not null,
  created_at bigint not null
);

create index if not exists chat_messages_room_idx on chat_messages (room_id, created_at);

create table if not exists direct_messages (
  id text primary key,
  from_user_id uuid not null references profiles(user_id) on delete cascade,
  to_user_id uuid not null references profiles(user_id) on delete cascade,
  text text not null,
  created_at bigint not null
);

create index if not exists direct_messages_pair_idx on direct_messages (from_user_id, to_user_id, created_at);

create table if not exists study_sessions (
  id text primary key,
  user_id uuid not null references profiles(user_id) on delete cascade,
  room_id text references rooms(id) on delete set null,
  duration_seconds int not null default 0,
  duration_minutes int not null default 0,
  completed_at bigint not null
);

create index if not exists study_sessions_room_idx on study_sessions (room_id, completed_at);
create index if not exists study_sessions_user_idx on study_sessions (user_id, completed_at);

create table if not exists user_room_meta (
  user_id uuid not null references profiles(user_id) on delete cascade,
  room_id text not null,
  hidden boolean not null default false,
  last_desk_slot int,
  primary key (user_id, room_id)
);

alter table profiles enable row level security;
alter table rooms enable row level security;
alter table room_members enable row level security;
alter table friendships enable row level security;
alter table chat_messages enable row level security;
alter table direct_messages enable row level security;
alter table study_sessions enable row level security;
alter table user_room_meta enable row level security;

create policy "profiles_select" on profiles for select to authenticated using (true);
create policy "profiles_insert" on profiles for insert to authenticated with check (auth.uid() = user_id);
create policy "profiles_update" on profiles for update to authenticated using (auth.uid() = user_id);

create policy "rooms_select" on rooms for select to authenticated using (true);
create policy "rooms_insert" on rooms for insert to authenticated with check (auth.uid() = created_by);
create policy "rooms_update" on rooms for update to authenticated using (auth.uid() = created_by);
create policy "rooms_delete" on rooms for delete to authenticated using (auth.uid() = created_by);

create policy "room_members_select" on room_members for select to authenticated using (true);
create policy "room_members_insert" on room_members for insert to authenticated with check (auth.uid() = user_id);
create policy "room_members_update" on room_members for update to authenticated using (auth.uid() = user_id);
create policy "room_members_delete" on room_members for delete to authenticated using (auth.uid() = user_id);

create policy "friendships_select" on friendships for select to authenticated
  using (auth.uid() = from_user_id or auth.uid() = to_user_id);
create policy "friendships_insert" on friendships for insert to authenticated
  with check (auth.uid() = from_user_id);
create policy "friendships_update" on friendships for update to authenticated
  using (auth.uid() = from_user_id or auth.uid() = to_user_id);
create policy "friendships_delete" on friendships for delete to authenticated
  using (auth.uid() = from_user_id or auth.uid() = to_user_id);

create policy "chat_select" on chat_messages for select to authenticated using (true);
create policy "chat_insert" on chat_messages for insert to authenticated with check (auth.uid() = user_id);

create policy "dm_select" on direct_messages for select to authenticated
  using (auth.uid() = from_user_id or auth.uid() = to_user_id);
create policy "dm_insert" on direct_messages for insert to authenticated with check (auth.uid() = from_user_id);

create policy "study_sessions_select" on study_sessions for select to authenticated using (true);
create policy "study_sessions_insert" on study_sessions for insert to authenticated with check (auth.uid() = user_id);
create policy "study_sessions_update" on study_sessions for update to authenticated using (auth.uid() = user_id);

create policy "user_room_meta_select" on user_room_meta for select to authenticated using (auth.uid() = user_id);
create policy "user_room_meta_insert" on user_room_meta for insert to authenticated with check (auth.uid() = user_id);
create policy "user_room_meta_update" on user_room_meta for update to authenticated using (auth.uid() = user_id);
create policy "user_room_meta_delete" on user_room_meta for delete to authenticated using (auth.uid() = user_id);

alter publication supabase_realtime add table room_members;
alter publication supabase_realtime add table chat_messages;
alter publication supabase_realtime add table friendships;
