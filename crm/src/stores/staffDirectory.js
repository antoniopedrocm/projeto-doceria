// Stable access signature excludes unrelated Customer/schedule/notification data.
// The values come from the server-validated Staff profile, never public-list.
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
