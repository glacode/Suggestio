import { IAnonymizationNotifier } from "../types.js";
import { EventEmitter } from "events";

export const ANONYMIZATION_EVENT = 'anonymization';

export interface AnonymizationEventPayload {
    original: string;
    placeholder: string;
    type: 'word' | 'entropy';
}

export class EventBusAnonymizationNotifier implements IAnonymizationNotifier {
    constructor(private eventBus: EventEmitter) {}

    notifyAnonymization(original: string, placeholder: string, type: 'word' | 'entropy'): void {
        const payload: AnonymizationEventPayload = { original, placeholder, type };
        this.eventBus.emit(ANONYMIZATION_EVENT, payload);
    }
}
