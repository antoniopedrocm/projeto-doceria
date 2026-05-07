// Lightweight shim for the Capacitor core API used in the web build.
// Provides only the minimal surface needed by the application.

const getNativeCapacitor = () => {
  if (typeof window === 'undefined') return null;
  return window.Capacitor || null;
};

const isNativePlatform = () => {
  const nativeCapacitor = getNativeCapacitor();
  if (!nativeCapacitor) return false;

  if (typeof nativeCapacitor.isNativePlatform === 'function') {
    return nativeCapacitor.isNativePlatform();
  }

  const platform = typeof nativeCapacitor.getPlatform === 'function'
    ? nativeCapacitor.getPlatform()
    : 'web';
  return platform === 'android' || platform === 'ios';
};

const detectPlatform = () => {
  if (!isNativePlatform()) return 'web';

  const nativeCapacitor = getNativeCapacitor();
  if (!nativeCapacitor || typeof nativeCapacitor.getPlatform !== 'function') {
    return 'web';
  }

  return nativeCapacitor.getPlatform();
};

export const Capacitor = {
  getPlatform: () => detectPlatform(),
  isNativePlatform: () => isNativePlatform()
};
