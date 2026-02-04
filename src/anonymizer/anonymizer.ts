import { IAnonymizer } from "../types.js";
import { Config } from "../types.js";
import { SimpleWordAnonymizer } from "./simpleWordAnonymizer.js";
import { EventBusAnonymizationNotifier } from "./anonymizationNotifier.js";
import { IEventBus } from "../utils/eventBus.js";
import { ShannonEntropyCalculator } from "../utils/shannonEntropyCalculator.js";


export function getAnonymizer(config: Config, eventBus: IEventBus): IAnonymizer | undefined {
  if (config.anonymizer?.enabled) {
    const notifier = new EventBusAnonymizationNotifier(eventBus);
    const entropyCalculator = new ShannonEntropyCalculator();
    return new SimpleWordAnonymizer({
      wordsToAnonymize: config.anonymizer.words,
      entropyCalculator,
      allowedEntropy: config.anonymizer.sensitiveData?.allowedEntropy,
      minLength: config.anonymizer.sensitiveData?.minLength,
      notifier
    });
  }
  return undefined;
}