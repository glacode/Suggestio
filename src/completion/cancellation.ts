// completion/cancellation.ts
import { ICancellationToken, IInlineCompletionList, IEventBus } from '../types.js';
import { COMPLETION_LOGS } from '../constants/messages.js';

export function handleCancellation(
  token: ICancellationToken | undefined,
  resolve: (items: IInlineCompletionList) => void,
  stage: 'before' | 'after',
  eventBus: IEventBus
): boolean {
  if (token?.isCancellationRequested) {
    eventBus.emit('log', { level: 'info', message: COMPLETION_LOGS.CANCELLED(stage) });
    resolve({ items: [] });
    return true;
  }
  return false;
}
