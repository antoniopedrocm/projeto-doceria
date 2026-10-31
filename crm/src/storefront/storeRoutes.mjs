export const validStoreId = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,150}$/.test(value) && !/\s/.test(value);
// Public navigation mapping only. The public-config projection still validates
// the store/channel and its availability before any catalogue is loaded.
export const PUBLIC_MENU_ROUTES = Object.freeze({
  'cardapio-matriz': Object.freeze({storeId:'ana-guimaraes-doceria-matriz',channelId:null}),
  'cardapio-garavelo': Object.freeze({storeId:'ana-guimaraes-doceria-garavelo',channelId:null}),
  'cardapio-festa': Object.freeze({storeId:'ana-guimaraes-doceria-matriz',channelId:'festas'}),
  'cardapio-apfood': Object.freeze({storeId:'apfood',channelId:null}),
});
export const validMenuSlug=value=>typeof value==='string' && /^cardapio-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && value.length<=100;
export function storeMenuUrl(storeId, channelId = null, publicSlug = null) {
  if (!validStoreId(storeId) || (channelId !== null && !validStoreId(channelId))) return null;
  if(!channelId && validMenuSlug(publicSlug))return '/'+publicSlug;
  const route = Object.entries(PUBLIC_MENU_ROUTES).find(([,entry]) => entry.storeId === storeId && entry.channelId === channelId);
  if (route) return '/' + route[0];
  const base = Object.entries(PUBLIC_MENU_ROUTES).find(([,entry]) => entry.storeId === storeId && entry.channelId === null);
  if (base && channelId) return `/${base[0]}?channel=${encodeURIComponent(channelId)}`;
  // A future store without an approved slug retains the compatible public route.
  return `/cardapio?store=${encodeURIComponent(storeId)}${channelId ? `&channel=${encodeURIComponent(channelId)}` : ''}`;
}

export function resolvePublicMenuRoute({pathname = '', search = ''} = {}) {
  const path = pathname.replace(/\.html$/, ''), query = new URLSearchParams(search);
  const store = query.get('store'), channel = query.get('channel');
  const missing = {kind:'not-found'};
  if (query.getAll('store').length > 1 || query.getAll('channel').length > 1
    || (query.has('store') && !validStoreId(store)) || (query.has('channel') && !validStoreId(channel))) return missing;
  if (path === '/cardapio') {
    if (!store) return channel ? missing : {kind:'directory',canonicalPath:'/cardapio'};
    return {kind:'menu',storeId:store,channelId:channel,canonicalPath:storeMenuUrl(store,channel)};
  }
  const slug = path.slice(1);
  if (!path.startsWith('/') || !Object.hasOwn(PUBLIC_MENU_ROUTES,slug)) return validMenuSlug(slug) && !store && !channel?{kind:'alias',alias:slug,canonicalPath:'/'+slug}:missing;
  const route = PUBLIC_MENU_ROUTES[slug];
  if ((store && store !== route.storeId) || (route.channelId && channel && channel !== route.channelId)) return missing;
  const channelId = route.channelId || channel;
  return {kind:'menu',storeId:route.storeId,channelId,canonicalPath:storeMenuUrl(route.storeId,channelId)};
}

export const CUSTOMER_RETURN_PATH_KEY = 'customer-public-return-v1';
const safeId = validStoreId;

// Public navigation only: never an Auth callback, identity or authorization source.
export function safeCustomerReturnPath(value) {
  if (typeof value !== 'string' || value.length > 1024 || /[\u0000-\u0020\u007f\\#]/.test(value)) return null;
  const [pathname, search, extra] = value.split('?');
  if (extra !== undefined) return null;
  const params = new URLSearchParams(search || '');
  if ([...params.keys()].some(key => !['store', 'channel'].includes(key)) || params.getAll('store').length > 1 || params.getAll('channel').length > 1) return null;
  const route = resolvePublicMenuRoute({pathname,search});
  return ['menu','alias'].includes(route.kind) ? route.canonicalPath : null;
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
    if (origin) {try {if (origin !== stored) storage.setItem(CUSTOMER_RETURN_PATH_KEY,origin);} catch {} return origin;}
    if (stored) storage.removeItem(CUSTOMER_RETURN_PATH_KEY);
    const context = JSON.parse(storage?.getItem('checkoutState_v1') || '{}');
    if (safeId(context?.storeId)) return storeMenuUrl(context.storeId);
  } catch { /* Storage is optional; the public home is always a safe fallback. */ }
  return '/';
}
