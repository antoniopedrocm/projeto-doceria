export const ALARM_PAUSE_STORAGE_PREFIX = 'orderAlarmPause';

const normalizeIdentifier = (value) => String(value || '').trim();

const resolveStorage = (storage) => {
  if (storage) return storage;
  if (typeof window === 'undefined') return null;
  return window.localStorage;
};

export const getAlarmPauseStorageKey = (uid, storeId) => {
  const normalizedUid = normalizeIdentifier(uid);
  const normalizedStoreId = normalizeIdentifier(storeId);
  if (!normalizedUid || !normalizedStoreId) return null;

  return `${ALARM_PAUSE_STORAGE_PREFIX}:${encodeURIComponent(normalizedUid)}:${encodeURIComponent(normalizedStoreId)}`;
};

export const readAlarmPauseUntil = ({ uid, storeId, storage, now = Date.now() }) => {
  const key = getAlarmPauseStorageKey(uid, storeId);
  const targetStorage = resolveStorage(storage);
  if (!key || !targetStorage) return null;

  try {
    const rawValue = targetStorage.getItem(key);
    if (!rawValue) return null;

    let parsedValue;
    try {
      const parsed = JSON.parse(rawValue);
      parsedValue = typeof parsed === 'object' && parsed !== null ? parsed.pausedUntil : parsed;
    } catch (error) {
      parsedValue = rawValue;
    }

    const pausedUntil = Number(parsedValue);
    return Number.isFinite(pausedUntil) && pausedUntil > now ? pausedUntil : null;
  } catch (error) {
    console.warn('[alarmPauseStorage] Não foi possível ler a pausa do alarme:', error);
    return null;
  }
};

export const saveAlarmPauseUntil = ({ uid, storeId, pausedUntil, storage }) => {
  const key = getAlarmPauseStorageKey(uid, storeId);
  const targetStorage = resolveStorage(storage);
  const normalizedPausedUntil = Number(pausedUntil);
  if (!key || !targetStorage || !Number.isFinite(normalizedPausedUntil)) return false;

  try {
    targetStorage.setItem(key, JSON.stringify({ pausedUntil: normalizedPausedUntil }));
    return true;
  } catch (error) {
    console.warn('[alarmPauseStorage] Não foi possível salvar a pausa do alarme:', error);
    return false;
  }
};

export const clearAlarmPause = ({ uid, storeId, storage }) => {
  const key = getAlarmPauseStorageKey(uid, storeId);
  const targetStorage = resolveStorage(storage);
  if (!key || !targetStorage) return false;

  try {
    targetStorage.removeItem(key);
    return true;
  } catch (error) {
    console.warn('[alarmPauseStorage] Não foi possível remover a pausa do alarme:', error);
    return false;
  }
};

export const isAlarmPausedForContext = (options) => readAlarmPauseUntil(options) !== null;
