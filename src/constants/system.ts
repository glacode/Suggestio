/**
 * Internal system constants that are not user-configurable.
 */
export const SYSTEM_CONFIG = {
    /** Maximum number of listeners allowed for the EventBus to avoid memory leak warnings. */
    EVENT_BUS_MAX_LISTENERS: 20,
} as const;
