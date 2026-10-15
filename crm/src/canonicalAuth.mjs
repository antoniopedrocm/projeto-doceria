// Source of truth. scripts/sync-canonical-auth.cjs generates the public copy.
// Configure persistence before the SDK restores a user or observers are added.
const instances = new WeakMap();

export function getCanonicalAuth(app, sdk) {
  if (instances.has(app)) return instances.get(app);
  const {initializeAuth, indexedDBLocalPersistence, browserLocalPersistence,
    browserPopupRedirectResolver} = sdk;
  const auth = initializeAuth(app, {
    persistence: [indexedDBLocalPersistence, browserLocalPersistence],
    popupRedirectResolver: browserPopupRedirectResolver,
  });
  // initializeAuth rejects an incompatible prior initialization. Do not silently
  // accept getAuth's defaults or migrate persistence later based on the shell.
  instances.set(app, auth);
  return auth;
}
