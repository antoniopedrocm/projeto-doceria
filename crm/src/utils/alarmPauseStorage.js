export const ALARM_PAUSE_STORAGE_PREFIX = 'orderAlarmPause';

const normalizeIdentifier = (value) => String(value || '').trim();

const resolveStorage = (storage) => {
  if (storage) return storage;
  if (typeof window === 'undefined') return null;
  return window.localStorage;
};

const normalizePendingOrderIds = (value) => {
  if (!Array.isArray(value)) return null;
  return [...new Set(value.map(normalizeIdentifier).filter(Boolean))];
};

export const getAlarmPauseStorageKey = (uid, storeId) => {
  const normalizedUid = normalizeIdentifier(uid);
  const normalizedStoreId = normalizeIdentifier(storeId);
  if (!normalizedUid || !normalizedStoreId) return null;

  return `${ALARM_PAUSE_STORAGE_PREFIX}:${encodeURIComponent(normalizedUid)}:${encodeURIComponent(normalizedStoreId)}`;
};

export const readAlarmPause = ({ uid, storeId, storage, now = Date.now() }) => {
  const key = getAlarmPauseStorageKey(uid, storeId);
  const targetStorage = resolveStorage(storage);
  if (!key || !targetStorage) return null;

  try {
    const rawValue = targetStorage.getItem(key);
    if (!rawValue) return null;

    let parsedValue;
    try {
      parsedValue = JSON.parse(rawValue);
    } catch (error) {
      parsedValue = rawValue;
    }

    const pauseData = typeof parsedValue === 'object' && parsedValue !== null
      ? parsedValue
      : { pausedUntil: parsedValue };
    const pausedUntil = Number(pauseData.pausedUntil);
    if (!Number.isFinite(pausedUntil) || pausedUntil <= now) return null;

    return {
      pausedUntil,
      pendingOrderIds: normalizePendingOrderIds(pauseData.pendingOrderIds),
    };
  } catch (error) {
    console.warn('[alarmPauseStorage] Não foi possível ler a pausa do alarme:', error);
    return null;
  }
};

export const readAlarmPauseUntil = (options) => readAlarmPause(options)?.pausedUntil || null;

export const saveAlarmPauseUntil = ({ uid, storeId, pausedUntil, pendingOrderIds, storage }) => {
  const key = getAlarmPauseStorageKey(uid, storeId);
  const targetStorage = resolveStorage(storage);
  const normalizedPausedUntil = Number(pausedUntil);
  if (!key || !targetStorage || !Number.isFinite(normalizedPausedUntil)) return false;

  try {
    const pauseData = { pausedUntil: normalizedPausedUntil };
    const normalizedPendingOrderIds = normalizePendingOrderIds(pendingOrderIds);
    if (normalizedPendingOrderIds !== null) {
      pauseData.pendingOrderIds = normalizedPendingOrderIds;
    }
    targetStorage.setItem(key, JSON.stringify(pauseData));
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
