-- Session summaries for assistant chat. See CONTEXT.md#Session Summary.

alter table chat_sessions add column summary text;
alter table chat_sessions add column summary_updated_at text;
alter table chat_sessions add column summary_through_message_id text references chat_messages(id) on delete set null;
