// Minimal fallback implementation for the Capacitor Native Audio plugin.
// This allows the web build to succeed even when the native package is
// unavailable. It mimics the most common methods with HTMLAudioElement
// so audio can still play in browsers.

const audioCache = new Map();

const getEntry = (assetId) => audioCache.get(assetId);

const ensureAudio = (assetId, assetPath, isUrl = false) => {
  let entry = getEntry(assetId);
  if (!entry) {
    const audio = new Audio(isUrl ? assetPath : assetPath);
    entry = { audio, assetId };
    audioCache.set(assetId, entry);
  }
  return entry;
};

export const NativeAudio = {
  preload: async ({ assetId, assetPath, isUrl }) => {
    ensureAudio(assetId, assetPath, isUrl);
  },

  play: async ({ assetId }) => {
    const entry = getEntry(assetId);
    if (entry?.audio) {
      entry.audio.loop = false;
      await entry.audio.play();
    }
  },

  loop: async ({ assetId }) => {
    const entry = getEntry(assetId);
    if (entry?.audio) {
      entry.audio.loop = true;
      await entry.audio.play();
    }
  },

  stop: async ({ assetId }) => {
    const entry = getEntry(assetId);
    if (entry?.audio) {
      entry.audio.pause();
      entry.audio.currentTime = 0;
    }
  },

  unload: async ({ assetId }) => {
    audioCache.delete(assetId);
  },

  setVolume: async ({ assetId, volume }) => {
    const entry = getEntry(assetId);
    if (entry?.audio) {
      entry.audio.volume = Math.min(Math.max(volume, 0), 1);
    }
  }
};
