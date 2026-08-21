/**
 * SQL fragments for Session Summary freshness. The summarize sweep and the session
 * read path share these so the badge shown in the UI always agrees with what the
 * sweep will actually enqueue. `alias` is always a caller-supplied literal.
 */

export function unsummarizedMessagesExistsSql(alias: string): string {
  return `exists (
      select 1 from chat_messages cm
      where cm.session_id = ${alias}.id
        and (
          ${alias}.summary_through_message_id is null
          or cm.created_at > (
            select created_at from chat_messages where id = ${alias}.summary_through_message_id
          )
        )
    )`;
}

export function summaryStatusSql(alias: string): string {
  return `case
      when ${alias}.summary is null then 'none'
      when ${unsummarizedMessagesExistsSql(alias)} then 'stale'
      else 'current'
    end`;
}
