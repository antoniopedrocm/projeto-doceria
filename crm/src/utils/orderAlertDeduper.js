const STORAGE_PREFIX = 'new-order-alerts:v1';
const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_MAX_ENTRIES = 200;

const memoryStorage = new Map();

const normalizeId = (value) => String(value || '').trim();

export const getOrderAlertStorageKey = (uid, storeId) => {
  const normalizedUid = normalizeId(uid);
  const normalizedStoreId = normalizeId(storeId);
  if (!normalizedUid || !normalizedStoreId) return null;
  return `${STORAGE_PREFIX}:${encodeURIComponent(normalizedUid)}:${encodeURIComponent(normalizedStoreId)}`;
};

const getDefaultStorage = () => {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage || null;
  } catch {
    return null;
  }
};

const readEntries = (key, storage) => {
  try {
    if (!storage) return memoryStorage.get(key) || {};
    const rawValue = storage.getItem(key);
    if (!rawValue) return {};
    const parsedValue = JSON.parse(rawValue);
    return parsedValue && typeof parsedValue === 'object' && !Array.isArray(parsedValue)
      ? parsedValue
      : {};
  } catch {
    return memoryStorage.get(key) || {};
  }
};

const writeEntries = (key, entries, storage) => {
  memoryStorage.set(key, entries);
  try {
    storage?.setItem(key, JSON.stringify(entries));
  } catch {
    // O fallback em memória ainda evita duplicidade durante a sessão atual.
  }
};

export const claimOrderAlert = ({
  uid,
  storeId,
  orderId,
  now = Date.now(),
  ttlMs = DEFAULT_TTL_MS,
  maxEntries = DEFAULT_MAX_ENTRIES,
  storage = getDefaultStorage(),
} = {}) => {
  const key = getOrderAlertStorageKey(uid, storeId);
  const normalizedOrderId = normalizeId(orderId);
  if (!key || !normalizedOrderId) return false;

  const minimumTimestamp = now - Math.max(Number(ttlMs) || 0, 0);
  const entries = Object.entries(readEntries(key, storage))
    .filter(([, timestamp]) => Number.isFinite(Number(timestamp)) && Number(timestamp) >= minimumTimestamp)
    .sort((left, right) => Number(right[1]) - Number(left[1]));

  if (entries.some(([storedOrderId]) => storedOrderId === normalizedOrderId)) {
    writeEntries(key, Object.fromEntries(entries.slice(0, maxEntries)), storage);
    return false;
  }

  const nextEntries = [
    [normalizedOrderId, now],
    ...entries,
  ].slice(0, Math.max(Number(maxEntries) || DEFAULT_MAX_ENTRIES, 1));
  writeEntries(key, Object.fromEntries(nextEntries), storage);
  return true;
};

export const clearOrderAlertClaims = ({ uid, storeId, storage = getDefaultStorage() } = {}) => {
  const key = getOrderAlertStorageKey(uid, storeId);
  if (!key) return;
  memoryStorage.delete(key);
  try {
    storage?.removeItem(key);
  } catch {
    // Nada adicional a limpar quando o armazenamento persistente está indisponível.
  }
};
