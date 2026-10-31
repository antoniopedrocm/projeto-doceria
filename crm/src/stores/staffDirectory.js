// Stable access signature excludes unrelated Customer/schedule/notification data.
import {storeMenuUrl} from '../storefront/storeRoutes.mjs';
export function storeFriendlyName(storeId,data={}) {
  const candidate=data.nomePublico || data.nome || data.legalName;
  const registered=typeof candidate==='string'?candidate.trim():'';
  if(!registered || registered===storeId)return 'Loja sem nome cadastrado';
  if(data.nomePublico)return registered;
  const path=data.publicSlug?'/'+data.publicSlug:storeMenuUrl(storeId);
  const unit=/^\/cardapio-([a-z0-9-]+)$/.exec(path || '')?.[1];
  const label=unit?.split('-').map(w=>w.charAt(0).toUpperCase()+w.slice(1)).join(' ');
  return label && !registered.toLowerCase().includes(label.toLowerCase())?registered+' — '+label:registered;
}
// The values come from the server-validated Staff profile, never public-list.
// A store ID is a navigation preference, not authority. Keep it per canonical
// Staff UID so gate cleanup can still discard every shared/private Staff draft.
export const staffStoreSelectionKey=uid=>uid?`staff-store-selection-v1:${uid}`:'selectedStoreId';
export function staffDirectoryKey(user) {
  if(!user?.auth?.uid)return null;
  return JSON.stringify({uid:user.auth.uid,role:user.role,all:user.canAccessAllStores===true,
    ids:user.lojaIds?.length?user.lojaIds:user.lojaId?[user.lojaId]:[],primary:user.lojaId || null});
}
export function reconcileStoreSelection(previous,ids,{role,primary},allKey) {
  if(role==='dono' && previous===allKey)return allKey;
  if(previous && ids.includes(previous))return previous;
  if(role==='dono')return allKey;
  return ids.includes(primary)?primary:ids[0] || null;
}
