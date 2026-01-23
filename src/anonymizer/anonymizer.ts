import { IAnonymizer } from "../types.js";
import { Config } from "../types.js";
import { SimpleWordAnonymizer } from "./simpleWordAnonymizer.js";
import { EventBusAnonymizationNotifier } from "./anonymizationNotifier.js";
import { IEventBus } from "../utils/eventBus.js";


export function getAnonymizer(config: Config, eventBus: IEventBus): IAnonymizer | undefined {
  if (config.anonymizer?.enabled) {
    const notifier = new EventBusAnonymizationNotifier(eventBus);
    return new SimpleWordAnonymizer(
      config.anonymizer.words,
      config.anonymizer.sensitiveData?.allowedEntropy,
      config.anonymizer.sensitiveData?.minLength,
      notifier
    );
  }
  return undefined;
}