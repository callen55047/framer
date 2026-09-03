-- Assistant rows record the Tool Calls they issued so history rehydrates with
-- assistant.tool_calls preceding each tool result. JSON array of
-- { id, name, args } where id is the chat_messages.id of the matching tool row.
-- See CONTEXT.md#Assistant.
alter table chat_messages add column tool_calls text;
