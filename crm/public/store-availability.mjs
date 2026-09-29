export const STORE_AVAILABILITY = Object.freeze({
    OPEN: 'OPEN',
    CLOSED: 'CLOSED',
    CONFIG_UNAVAILABLE: 'CONFIG_UNAVAILABLE'
});

const parseTimeToMinutes = (value) => {
    if (typeof value !== 'string' || !/^(\d{2}):(\d{2})$/.test(value)) return null;
    const [hours, minutes] = value.split(':').map(Number);
    if (hours > 23 || minutes > 59) return null;
    return (hours * 60) + minutes;
};

export function getStoreAvailability(config, now = new Date()) {
    if (!config || typeof config !== 'object') return STORE_AVAILABILITY.CONFIG_UNAVAILABLE;

    const mode = config.manualOverride?.mode || 'auto';
    if (mode === 'force_open') return STORE_AVAILABILITY.OPEN;
    if (mode === 'force_closed') return STORE_AVAILABILITY.CLOSED;
    if (mode !== 'auto' || typeof config.timezone !== 'string' || !config.timezone.trim() ||
        !config.schedule || typeof config.schedule !== 'object' || Array.isArray(config.schedule)) {
        return STORE_AVAILABILITY.CONFIG_UNAVAILABLE;
    }

    try {
        const parts = new Intl.DateTimeFormat('en-CA', {
            timeZone: config.timezone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
        }).formatToParts(now);
        const weekday = parts.find((part) => part.type === 'weekday')?.value?.toLowerCase().slice(0, 3);
        const hours = Number(parts.find((part) => part.type === 'hour')?.value);
        const minutes = Number(parts.find((part) => part.type === 'minute')?.value);
        const day = config.schedule[weekday];
        if (!day || typeof day.enabled !== 'boolean' || !Number.isInteger(hours) || !Number.isInteger(minutes)) {
            return STORE_AVAILABILITY.CONFIG_UNAVAILABLE;
        }
        if (!day.enabled) return STORE_AVAILABILITY.CLOSED;

        const open = parseTimeToMinutes(day.open);
        const close = parseTimeToMinutes(day.close);
        if (open === null || close === null || close <= open) return STORE_AVAILABILITY.CONFIG_UNAVAILABLE;
        const current = (hours * 60) + minutes;
        return current >= open && current < close ? STORE_AVAILABILITY.OPEN : STORE_AVAILABILITY.CLOSED;
    } catch {
        return STORE_AVAILABILITY.CONFIG_UNAVAILABLE;
    }
}

export function getStoreAvailabilityMessage(availability) {
    return availability === STORE_AVAILABILITY.CONFIG_UNAVAILABLE
        ? 'Não foi possível verificar o horário da loja no momento.'
        : 'A loja está fechada no momento. Volte em nosso horário de atendimento.';
}
