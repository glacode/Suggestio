import { IAnonymizationNotifier } from "../types.js";
import { IEventBus } from "../utils/eventBus.js";

export const ANONYMIZATION_EVENT = 'anonymization';

export interface AnonymizationEventPayload {
    original: string;
    placeholder: string;
    type: 'word' | 'entropy';
}

export class EventBusAnonymizationNotifier implements IAnonymizationNotifier {
    constructor(private eventBus: IEventBus) {}

    notifyAnonymization(original: string, placeholder: string, type: 'word' | 'entropy'): void {
        const payload: AnonymizationEventPayload = { original, placeholder, type };
        this.eventBus.emit(ANONYMIZATION_EVENT, payload);
    }
}
