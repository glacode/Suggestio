// completion/cancellation.ts
import { ICancellationToken, IInlineCompletionList } from '../types.js';
import { log } from '../logger.js';

export function handleCancellation(
  token: ICancellationToken | undefined,
  resolve: (items: IInlineCompletionList) => void,
  stage: 'before' | 'after'
): boolean {
  if (token?.isCancellationRequested) {
    log(`❌ Suggestio: Request cancelled ${stage} LLM call`);
    resolve({ items: [] });
    return true;
  }
  return false;
}
