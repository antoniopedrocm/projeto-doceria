// Identity transition only. Neither the route nor this state grants authorization.
export const CART_OWNER_KEY = 'doceria-auth-cart-owner';
export const STAFF_PUSH_KEY = 'doceria-staff-push-device';
export function syncPrivateCart(storage, uid, {force = false} = {}) {
  if (!storage) return;
  const prior = storage.getItem(CART_OWNER_KEY);
  let reorderOwner = null;
  try { reorderOwner = JSON.parse(storage.getItem('checkoutState_v1') || '{}').reorderOwnerUid; } catch {}
  if (force || (prior && prior !== uid) || (reorderOwner && reorderOwner !== uid)) {
    storage.removeItem('checkoutState_v1');
    storage.removeItem('doceria-payment-pending');
  }
  if (uid) storage.setItem(CART_OWNER_KEY, uid);
  else storage.removeItem(CART_OWNER_KEY);
}
export function rememberStaffDevice(storage, uid, token) {
  if (storage && uid && token) storage.setItem(STAFF_PUSH_KEY, JSON.stringify({uid, token}));
}
export function staffDevice(storage, uid) {
  try { const record = JSON.parse(storage?.getItem(STAFF_PUSH_KEY) || 'null'); return record?.uid === uid ? record.token : null; }
  catch { return null; }
}
export async function retireLegacySession({auth, legacyAuth, signOut, beforeConflict = async () => {}}) {
  await Promise.all([auth.authStateReady(), legacyAuth?.authStateReady()]);
  const legacy = legacyAuth?.currentUser;
  if (!legacy) return 'READY';
  if (legacy.isAnonymous) { await signOut(legacyAuth); return 'READY'; }
  const current = auth.currentUser?.isAnonymous ? null : auth.currentUser;
  if (current && current.uid !== legacy.uid) {
    await beforeConflict(current.uid);
    await Promise.all([signOut(auth), signOut(legacyAuth)]);
    return 'CONFLICT';
  }
  await signOut(legacyAuth);
  return current ? 'READY' : 'REENTRY_REQUIRED';
}
export function createCanonicalLogout({auth, legacyAuth, signOut, storage, beforeSignOut = async () => {}}) {
  let flight = null;
  return () => {
    if (flight) return flight;
    flight = (async () => {
      const uid = auth.currentUser?.uid;
      // Cleanup is attempted before ending Auth, while the existing Rules apply.
      try { if (uid) await beforeSignOut(uid, staffDevice(storage, uid)); }
      finally {
        syncPrivateCart(storage, null);
        storage?.removeItem(STAFF_PUSH_KEY);
        await Promise.all([...new Set([auth, legacyAuth].filter(Boolean))].map(signOut));
      }
    })().finally(() => { flight = null; });
    return flight;
  };
}

// Also clear the live cart when Auth changes before Customer profile loading finishes.
export function createCartOwnerObserver({initialUid=null,onClear,onOwner}) {
  let previous=initialUid;
  return user=>{
    const uid=user && !user.isAnonymous ? user.uid : null;
    if(uid===previous) return;
    if(previous) onClear();
    previous=uid;
    onOwner(uid);
  };
}
