// completion/cancellation.ts
import { ICancellationToken, IInlineCompletionList } from '../types.js';
import { ILogger } from '../logger.js';

export function handleCancellation(
  token: ICancellationToken | undefined,
  resolve: (items: IInlineCompletionList) => void,
  stage: 'before' | 'after',
  logger: ILogger
): boolean {
  if (token?.isCancellationRequested) {
    logger.info(`❌ Suggestio: Request cancelled ${stage} LLM call`);
    resolve({ items: [] });
    return true;
  }
  return false;
}
