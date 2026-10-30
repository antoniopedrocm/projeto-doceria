export const validStoreId = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,150}$/.test(value);
export function storeMenuUrl(storeId, channelId = null) {
  if (!validStoreId(storeId) || (channelId !== null && !validStoreId(channelId))) return null;
  return `/cardapio?store=${encodeURIComponent(storeId)}${channelId ? `&channel=${encodeURIComponent(channelId)}` : ''}`;
}

export const CUSTOMER_RETURN_PATH_KEY = 'customer-public-return-v1';
const menuPath = /^\/cardapio(?:-(?:matriz|garavelo|festa))?(?:\.html)?$/;
const safeId = value => validStoreId(value) && !/\s/.test(value);

// Public navigation only: never an Auth callback, identity or authorization source.
export function safeCustomerReturnPath(value) {
  if (typeof value !== 'string' || value.length > 1024 || /[\u0000-\u0020\u007f\\#]/.test(value)) return null;
  const [pathname, search, extra] = value.split('?');
  if (!menuPath.test(pathname) || extra !== undefined) return null;
  const params = new URLSearchParams(search || '');
  if ([...params.keys()].some(key => !['store', 'channel'].includes(key)) || params.getAll('store').length > 1 || params.getAll('channel').length > 1) return null;
  const store = params.get('store'), channel = params.get('channel');
  if ((params.has('store') && !safeId(store)) || (params.has('channel') && (!store || !safeId(channel)))) return null;
  // The generic directory is compatible, but not a useful known menu origin.
  if (!store && /^\/cardapio(?:\.html)?$/.test(pathname)) return null;
  const query = new URLSearchParams();
  if (store) query.set('store', store);
  if (channel) query.set('channel', channel);
  return pathname + (query.toString() ? '?' + query.toString() : '');
}

export function customerAreaEntryPath(location) {
  const params = new URLSearchParams(location?.search || '');
  // Drop unrelated query data, including login/debug parameters, at the source.
  for (const key of [...params.keys()]) if (!['store', 'channel'].includes(key)) params.delete(key);
  const origin = safeCustomerReturnPath((location?.pathname || '') + (params.toString() ? '?' + params.toString() : ''));
  return '/area-cliente' + (origin ? '?returnTo=' + encodeURIComponent(origin) : '');
}

export function customerMenuDestination(storage, search = '') {
  const params = new URLSearchParams(typeof search === 'string' ? search : '');
  const values = params.getAll('returnTo');
  const incoming = values.length === 1 ? safeCustomerReturnPath(values[0]) : null;
  if (incoming) {try {storage?.setItem(CUSTOMER_RETURN_PATH_KEY, incoming);} catch {} return incoming;}
  try {
    const stored = storage?.getItem(CUSTOMER_RETURN_PATH_KEY);
    const origin = safeCustomerReturnPath(stored);
    if (origin) return origin;
    if (stored) storage.removeItem(CUSTOMER_RETURN_PATH_KEY);
    const context = JSON.parse(storage?.getItem('checkoutState_v1') || '{}');
    if (safeId(context?.storeId)) return storeMenuUrl(context.storeId);
  } catch { /* Storage is optional; the public home is always a safe fallback. */ }
  return '/';
}
