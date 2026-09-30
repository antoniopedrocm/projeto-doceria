const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]']);

export const shouldUseFirebaseEmulators = ({ hostname = '', isNativePlatform = false } = {}) =>
  !isNativePlatform && LOOPBACK_HOSTNAMES.has(String(hostname).toLowerCase());
