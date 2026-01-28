import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { SimpleWordAnonymizer } from '../../src/anonymizer/simpleWordAnonymizer.js';
import { getAnonymizer } from '../../src/anonymizer/anonymizer.js';
import { EventBus } from '../../src/utils/eventBus.js';
import { createDefaultConfig } from '../testUtils.js';

describe('getAnonymizer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns undefined when anonymizer is disabled', () => {
    const config = createDefaultConfig({ anonymizer: { enabled: false, words: [] } });
    const eventBus = new EventBus();
    const result = getAnonymizer(config, eventBus);
    expect(result).toBeUndefined();
  });

  it('returns SimpleWordAnonymizer instance when anonymizer is enabled', () => {
    const testWords = ['word1', 'word2'];
    const config = createDefaultConfig({
      anonymizer: {
        enabled: true,
        words: testWords
      }
    });
    const eventBus = new EventBus();

    const result = getAnonymizer(config, eventBus);

    expect(result).toBeInstanceOf(SimpleWordAnonymizer);
  });

  it('returns undefined when anonymizer property is missing', () => {
    const config = createDefaultConfig();
    const eventBus = new EventBus();

    const result = getAnonymizer(config, eventBus);
    expect(result).toBeUndefined();
  });

  it('returns SimpleWordAnonymizer instance when anonymizer is enabled with empty words', () => {
    const config = createDefaultConfig({
      anonymizer: {
        enabled: true,
        words: []
      }
    });
    const eventBus = new EventBus();

    const result = getAnonymizer(config, eventBus);

    expect(result).toBeInstanceOf(SimpleWordAnonymizer);
  });
});
