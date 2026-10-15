-- Chat threads, the one-time sign-up questionnaire, and saved doctor-visit reports.
-- Same rules as the base schema: private `sakhi` schema, RLS on with no policies, backend-only access.
-- Text columns marked "sealed" hold AES-256-GCM ciphertext ("enc1:..."), encrypted by the backend before insert.

-- One row per chat. title and report are sealed; report_msg_count tells the backend when a report is stale.
create table if not exists sakhi.conversations (
  id                text primary key,
  user_id           text not null references sakhi.users(id) on delete cascade,
  title             text not null default '',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  report            text,
  report_msg_count  integer not null default 0
);
create index if not exists conversations_user_idx on sakhi.conversations (user_id, updated_at desc);

alter table sakhi.chat_messages
  add column if not exists conversation_id text references sakhi.conversations(id) on delete cascade;

-- Messages from before chats had threads become one "Earlier chats" conversation per user.
insert into sakhi.conversations (id, user_id, title, created_at, updated_at)
select 'legacy-' || user_id, user_id, 'Earlier chats', min(created_at), max(created_at)
from sakhi.chat_messages where conversation_id is null group by user_id
on conflict (id) do nothing;
update sakhi.chat_messages set conversation_id = 'legacy-' || user_id where conversation_id is null;
alter table sakhi.chat_messages alter column conversation_id set not null;
create index if not exists chat_messages_conv_idx on sakhi.chat_messages (conversation_id, id);

-- Onboarding answers (age, regularity, concerns, prior diagnoses, hormonal medicines), sealed as one JSON value.
create table if not exists sakhi.profiles (
  user_id     text primary key references sakhi.users(id) on delete cascade,
  data        text not null,
  updated_at  timestamptz not null default now()
);

alter table sakhi.conversations enable row level security;
alter table sakhi.profiles      enable row level security;
revoke all on sakhi.conversations, sakhi.profiles from public, anon, authenticated;
