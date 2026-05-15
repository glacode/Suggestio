import { IAnonymizer, IAnonymizerConfigHolder } from "../types.js";
import { SimpleWordAnonymizer } from "./simpleWordAnonymizer.js";
import { EventBusAnonymizationNotifier } from "./anonymizationNotifier.js";
import { IEventBus } from "../utils/eventBus.js";
import { ShannonEntropyCalculator } from "../utils/shannonEntropyCalculator.js";


export function getAnonymizer(config: IAnonymizerConfigHolder, eventBus: IEventBus): IAnonymizer {
  const notifier = new EventBusAnonymizationNotifier(eventBus);
  const entropyCalculator = new ShannonEntropyCalculator();
  return new SimpleWordAnonymizer({
    config,
    entropyCalculator,
    notifier,
    eventBus
  });
}