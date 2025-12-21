import { IAnonymizer } from "../types.js";
import { Config } from "../config/types.js";
import { SimpleWordAnonymizer } from "./simpleWordAnonymizer.js";
import { EventBusAnonymizationNotifier } from "./anonymizationNotifier.js";
import { EventEmitter } from "events";


export function getAnonymizer(config: Config, eventBus: EventEmitter): IAnonymizer | undefined {
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