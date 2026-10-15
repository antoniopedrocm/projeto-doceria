export const validStoreId = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,150}$/.test(value);
export function storeMenuUrl(storeId, channelId = null) {
  if (!validStoreId(storeId) || (channelId !== null && !validStoreId(channelId))) return null;
  return `/cardapio?store=${encodeURIComponent(storeId)}${channelId ? `&channel=${encodeURIComponent(channelId)}` : ''}`;
}
