-- Assistant chat sessions and messages. See CONTEXT.md#Assistant.

create table if not exists chat_sessions (
  id text primary key,
  owner_id text not null references owners(id) on delete cascade,
  title text not null default 'New chat',
  title_source text not null default 'auto' check (title_source in ('user', 'auto')),
  provider text not null,
  model text not null,
  context_budget_tokens integer not null default 128000,
  token_count integer not null default 0,
  status text not null default 'active' check (status in ('active', 'full')),
  created_at text not null default (datetime('now')),
  updated_at text not null default (datetime('now'))
);
create index if not exists chat_sessions_owner_id_idx on chat_sessions (owner_id, updated_at desc);

create table if not exists chat_messages (
  id text primary key,
  session_id text not null references chat_sessions(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'tool')),
  content text not null default '',
  tool_name text,
  tool_args text,
  tool_result text,
  token_count integer not null default 0,
  created_at text not null default (datetime('now'))
);
create index if not exists chat_messages_session_id_idx on chat_messages (session_id, created_at);
