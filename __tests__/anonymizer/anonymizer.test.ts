import { describe, it, expect, jest } from '@jest/globals';
import { Config } from '../../src/types.js';
import { SimpleWordAnonymizer } from '../../src/anonymizer/simpleWordAnonymizer.js';
import { getAnonymizer } from '../../src/anonymizer/anonymizer.js';
import { EventEmitter } from 'events';

// Mock SimpleWordAnonymizer
jest.mock('../../src/anonymizer/simpleWordAnonymizer.js');

const config: Config = {
  activeProvider: 'test',
  providers: {},
  anonymizer: {
    enabled: false,
    words: []
  }
};

describe('getAnonymizer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns undefined when anonymizer is disabled', () => {
    const eventBus = new EventEmitter();
    const result = getAnonymizer(config, eventBus);
    expect(result).toBeUndefined();
    // expect(SimpleWordAnonymizer).not.toHaveBeenCalled();
  });

  it('returns SimpleWordAnonymizer instance when anonymizer is enabled', () => {
    const testWords = ['word1', 'word2'];
    const config: Config = {
      activeProvider: 'test',
      providers: {},
      anonymizer: {
        enabled: true,
        words: testWords
      }
    };
    const eventBus = new EventEmitter();

    const result = getAnonymizer(config, eventBus);

    expect(result).toBeInstanceOf(SimpleWordAnonymizer);
    // expect(SimpleWordAnonymizer).toHaveBeenCalledWith(testWords);
  });

  it('returns undefined when anonymizer property is missing', () => {
    const config: Config = {} as Config;
    const eventBus = new EventEmitter();

    const result = getAnonymizer(config, eventBus);
    expect(result).toBeUndefined();
    // expect(SimpleWordAnonymizer).not.toHaveBeenCalled();
  });

  it('returns SimpleWordAnonymizer instance when anonymizer is enabled with empty words', () => {

    const config: Config = {
      activeProvider: 'test',
      providers: {},
      anonymizer: {
        enabled: true,
        words: []
      }
    };
    const eventBus = new EventEmitter();

    const result = getAnonymizer(config, eventBus);

    expect(result).toBeInstanceOf(SimpleWordAnonymizer);
    // expect(SimpleWordAnonymizer).toHaveBeenCalledWith([]);
  });
});