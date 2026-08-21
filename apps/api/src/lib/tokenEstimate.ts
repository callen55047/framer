/** Cheap token estimate for context budget checks (chars / 4). */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

export function estimateMessagesTokens(messages: { content: string; toolArgs?: unknown; toolResult?: unknown }[]): number {
  return messages.reduce((sum, message) => {
    let total = sum + estimateTokens(message.content);
    if (message.toolArgs !== undefined && message.toolArgs !== null) {
      total += estimateTokens(JSON.stringify(message.toolArgs));
    }
    if (message.toolResult !== undefined && message.toolResult !== null) {
      total += estimateTokens(JSON.stringify(message.toolResult));
    }
    return total;
  }, 0);
}
