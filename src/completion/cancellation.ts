// completion/cancellation.ts
import { ICancellationToken, IInlineCompletionList, IEventBus } from '../types.js';

export function handleCancellation(
  token: ICancellationToken | undefined,
  resolve: (items: IInlineCompletionList) => void,
  stage: 'before' | 'after',
  eventBus: IEventBus
): boolean {
  if (token?.isCancellationRequested) {
    eventBus.emit('log', { level: 'info', message: `❌ Suggestio: Request cancelled ${stage} LLM call` });
    resolve({ items: [] });
    return true;
  }
  return false;
}
