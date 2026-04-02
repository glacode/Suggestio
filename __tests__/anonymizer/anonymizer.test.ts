import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { SimpleWordAnonymizer } from '../../src/anonymizer/simpleWordAnonymizer.js';
import { getAnonymizer } from '../../src/anonymizer/anonymizer.js';
import { EventBus } from '../../src/utils/eventBus.js';
import { createDefaultConfig } from '../testUtils.js';

describe('getAnonymizer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns SimpleWordAnonymizer instance even when anonymizer is disabled (it handles the flag internally)', () => {
    const config = createDefaultConfig({ anonymizer: { enabled: false, words: [] } });
    const eventBus = new EventBus();
    const result = getAnonymizer(config, eventBus);
    expect(result).toBeInstanceOf(SimpleWordAnonymizer);
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

  it('the returned anonymizer instance respects the enabled flag', () => {
    const config = createDefaultConfig({
      anonymizer: {
        enabled: false,
        words: ['secret']
      }
    });
    const eventBus = new EventBus();
    const anonymizer = getAnonymizer(config, eventBus);

    const input = 'This is a secret';
    expect(anonymizer.anonymize(input)).toBe(input);

    // Enable it live
    config.anonymizer.enabled = true;
    expect(anonymizer.anonymize(input)).toBe('This is a ANON_0');
  });
});
