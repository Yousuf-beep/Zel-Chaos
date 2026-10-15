-- Sakhi schema on Supabase Postgres.
-- All tables live in a private `sakhi` schema that the Supabase Data API does not expose, and every table has RLS on
-- with no policies, so the publishable/anon key can never read them. Only the backend (direct Postgres connection as
-- the `postgres` role) reads and writes this data.

create schema if not exists sakhi;
revoke all on schema sakhi from public, anon, authenticated;

-- Accounts: a display name, a login handle (email or 10-digit phone) and a scrypt password hash. Nothing medical.
create table if not exists sakhi.users (
  id          text primary key,
  name        text not null check (char_length(name) between 1 and 60),
  handle      text not null unique,
  pw_hash     bytea not null,
  salt        bytea not null,
  created_at  timestamptz not null default now()
);

-- Login sessions. Only the SHA-256 of the cookie token is stored.
create table if not exists sakhi.auth_tokens (
  token_hash  text primary key,
  user_id     text not null references sakhi.users(id) on delete cascade,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);
create index if not exists auth_tokens_user_idx on sakhi.auth_tokens (user_id);
create index if not exists auth_tokens_expiry_idx on sakhi.auth_tokens (expires_at);

-- Cycle tracking: her own estimate of cycle and period length.
create table if not exists sakhi.cycle_profiles (
  user_id        text primary key references sakhi.users(id) on delete cascade,
  cycle_length   smallint not null check (cycle_length between 15 and 90),
  period_length  smallint not null check (period_length between 1 and 15),
  updated_at     timestamptz not null default now()
);

-- Every period start she logs; averages are computed from the gaps.
create table if not exists sakhi.period_starts (
  user_id     text not null references sakhi.users(id) on delete cascade,
  start_date  date not null,
  created_at  timestamptz not null default now(),
  primary key (user_id, start_date)
);

-- Companion chat history. meta holds sentiment, distress, red-flag ids, alert level, and the structured reply.
create table if not exists sakhi.chat_messages (
  id          bigint generated always as identity primary key,
  user_id     text not null references sakhi.users(id) on delete cascade,
  role        text not null check (role in ('user', 'assistant')),
  text        text not null,
  meta        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists chat_messages_user_idx on sakhi.chat_messages (user_id, id desc);
create index if not exists chat_messages_created_idx on sakhi.chat_messages (created_at);

-- The companion's rolling notes about each user, refreshed every few messages.
create table if not exists sakhi.companion_notes (
  user_id        text primary key references sakhi.users(id) on delete cascade,
  notes          text not null default '',
  since_refresh  integer not null default 0,
  updated_at     timestamptz not null default now()
);

alter table sakhi.users            enable row level security;
alter table sakhi.auth_tokens      enable row level security;
alter table sakhi.cycle_profiles   enable row level security;
alter table sakhi.period_starts    enable row level security;
alter table sakhi.chat_messages    enable row level security;
alter table sakhi.companion_notes  enable row level security;

revoke all on all tables in schema sakhi from public, anon, authenticated;
revoke all on all sequences in schema sakhi from public, anon, authenticated;
alter default privileges in schema sakhi revoke all on tables from public, anon, authenticated;
alter default privileges in schema sakhi revoke all on sequences from public, anon, authenticated;
