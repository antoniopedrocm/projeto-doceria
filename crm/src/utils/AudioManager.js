// src/utils/AudioManager.js
import { Capacitor } from '@capacitor/core';
import { NativeAudio } from '@capacitor-community/native-audio';

const NATIVE_ASSET_ID = 'pedido';
const NATIVE_ASSET_PATH = 'mixkit_vintage_warning_alarm_990.wav';
const unlockEvents = ['touchstart', 'touchend', 'mousedown', 'keydown', 'pointerdown'];

class AudioManager {
  constructor() {
    this.audioCtx = null;
    this.unlocked = false;
    this.cache = new Map();
	this.htmlAudioPlayers = new Set();
    this.nativeAudioReady = false;
    this.nativePreloadPromise = null;
    this._visibilityHandler = this._handleVisibilityChange.bind(this);
    this._focusHandler = this._handleVisibilityChange.bind(this);
    this._setupAutoUnlockListener();
  }

  _setupAutoUnlockListener() {

    const unlockHandler = async () => {
      await this.userUnlock();
      unlockEvents.forEach((ev) => document.removeEventListener(ev, unlockHandler));
    };
 unlockEvents.forEach((ev) => document.addEventListener(ev, unlockHandler, { once: true }));

    document.addEventListener('visibilitychange', this._visibilityHandler);
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', this._focusHandler);
    }
  }

  _handleVisibilityChange() {
    if (!this.audioCtx) {
      return;
    }

    if (this.audioCtx.state === 'suspended') {
      this.audioCtx
        .resume()
        .then(() => {
          this.unlocked = true;
          localStorage.setItem('audioUnlocked', 'true');
          console.log('[AudioManager] AudioContext resumed after visibility change.');
        })
        .catch((error) => {
          console.warn('[AudioManager] Não foi possível retomar AudioContext:', error);
        });
    }
  }

  async init() {
    if (this.audioCtx && this.audioCtx.state !== "closed") {
      if (this.audioCtx.state === "suspended") {
        try {
          await this.audioCtx.resume();
          this.unlocked = true;
          localStorage.setItem("audioUnlocked", "true");
          console.log("[AudioManager] audio resumed automatically");
        } catch (e) {
          console.warn("[AudioManager] resume() bloqueado pelo navegador", e);
          this.unlocked = false;
        }
      } else {
        this.unlocked = true;
      }
      return;
    }

    try {
      this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();

      if (this.audioCtx.state === "running") {
        this.unlocked = true;
        localStorage.setItem("audioUnlocked", "true");
        console.log("[AudioManager] Context created in running state.");
      } else {
        console.log("[AudioManager] Context created in suspended state.");
        if (localStorage.getItem("audioUnlocked") === "true") {
          try {
            await this.audioCtx.resume();
            this.unlocked = true;
            console.log("[AudioManager] audio resumed automatically based on localStorage");
          } catch (e) {
            console.warn("[AudioManager] resume() bloqueado mesmo com localStorage flag", e);
            this.unlocked = false;
          }
        } else {
          this.unlocked = false;
        }
      }
    } catch (e) {
      console.error("[AudioManager] AudioContext não é suportado.", e);
      return;
    }
  }
  
async _ensureNativePreload() {
    if (this.nativeAudioReady) {
      return;
    }

    if (!this.nativePreloadPromise) {
      this.nativePreloadPromise = NativeAudio.preload({
        assetId: NATIVE_ASSET_ID,
        assetPath: NATIVE_ASSET_PATH,
        audioChannelNum: 1,
        isUrl: false,
      })
        .then(async () => {
          this.nativeAudioReady = true;
          try {
            if (typeof NativeAudio.setVolume === 'function') {
              await NativeAudio.setVolume({ assetId: NATIVE_ASSET_ID, volume: 1 });
            }
          } catch (error) {
            console.warn('[AudioManager] Não foi possível ajustar volume nativo:', error);
          }
        })
        .catch((error) => {
          this.nativeAudioReady = false;
          throw error;
        });
    }

    return this.nativePreloadPromise;
  }
  
  async userUnlock() {
    if (!this.audioCtx || this.audioCtx.state === "closed") {
      await this.init();
      if (!this.audioCtx) return;
    }

    if (this.audioCtx.state === "suspended") {
      try {
        await this.audioCtx.resume();
        this.unlocked = true;
        localStorage.setItem("audioUnlocked", "true");
        console.log("[AudioManager] unlocked by user");
      } catch (e) {
        console.error("[AudioManager] failed to unlock:", e);
        this.unlocked = false;
        localStorage.removeItem("audioUnlocked");
      }
    } else {
      this.unlocked = true;
      localStorage.setItem("audioUnlocked", "true");
      console.log("[AudioManager] context already running, confirmed unlock by user");
    }
  }

  async _fetchAndDecode(url) {
    if (!this.audioCtx || this.audioCtx.state === "closed") {
      console.error("[AudioManager] AudioContext não inicializado ou fechado.");
      await this.init();
      if (!this.audioCtx || this.audioCtx.state === "closed") return null;
    }

    if (this.cache.has(url)) return this.cache.get(url);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      const arrayBuffer = await res.arrayBuffer();
      if (this.audioCtx.state === "closed") return null;
      const audioBuffer = await this.audioCtx.decodeAudioData(arrayBuffer);
      this.cache.set(url, audioBuffer);
      return audioBuffer;
    } catch (e) {
      console.error("[AudioManager] Falha ao buscar ou decodificar áudio:", url, e);
      return null;
    }
  }

  async playSound(url, { loop = false, volume = 1 } = {}) {
    await this.init();

    // --- Suporte a Capacitor (Android/iOS) ---
    if (Capacitor.getPlatform() === 'android' || Capacitor.getPlatform() === 'ios') {
      try {
        await this._ensureNativePreload();
        if (typeof NativeAudio.setVolume === 'function') {
          await NativeAudio.setVolume({ assetId: NATIVE_ASSET_ID, volume: Math.min(Math.max(volume, 0), 1) });
        }

        if (loop && typeof NativeAudio.loop === 'function') {
          await NativeAudio.loop({ assetId: NATIVE_ASSET_ID });
        } else {
          await NativeAudio.play({ assetId: NATIVE_ASSET_ID });
        }

        console.log('[AudioManager] Som reproduzido via NativeAudio');
        return async () => {
          try {
            await NativeAudio.stop({ assetId: NATIVE_ASSET_ID });
          } catch (stopError) {
            console.warn('[AudioManager] Não foi possível parar NativeAudio:', stopError);
          }
        };
      } catch (err) {
        console.error('[AudioManager] Falha ao tocar via NativeAudio:', err);
      }
    }

    // --- Comportamento padrão (browser) ---
    if (this.audioCtx && this.audioCtx.state === "running") {
      this.unlocked = true;

      try {
        const buffer = await this._fetchAndDecode(url);
        if (!buffer) {
          return () => {};
        }

        const src = this.audioCtx.createBufferSource();
        src.buffer = buffer;

        const gain = this.audioCtx.createGain();
        gain.gain.setValueAtTime(volume, this.audioCtx.currentTime);

        src.connect(gain);
        gain.connect(this.audioCtx.destination);

        src.loop = loop;
        src.start(0);

        console.log('[AudioManager] Sound started:', url);

        return () => {
          try {
            src.stop();
            src.disconnect();
            gain.disconnect();
            console.log('[AudioManager] Sound stopped:', url);
          } catch {
            /* ignora erro de parada duplicada */
          }
        };
      } catch (e) {
        console.error('[AudioManager] Error playing sound:', e);
      }
    }

    console.warn('[AudioManager] Fallback para HTMLAudio: AudioContext não está em execução. Estado:', this.audioCtx?.state);
    return this._playUsingHtmlAudio(url, { loop, volume });
  }

  async _playUsingHtmlAudio(url, { loop, volume }) {

    try {
      const audioElement = new Audio(url);
      audioElement.loop = loop;
      audioElement.preload = 'auto';
      audioElement.crossOrigin = 'anonymous';
      audioElement.volume = Math.min(Math.max(volume, 0), 1);

      await audioElement.play();

      this.htmlAudioPlayers.add(audioElement);
      audioElement.addEventListener(
        'ended',
        () => {
          this.htmlAudioPlayers.delete(audioElement);
        },
        { once: true }
      );

      this.unlocked = true;
      localStorage.setItem('audioUnlocked', 'true');

      console.log("[AudioManager] Sound started:", url);

      return () => {
        try {
          audioElement.pause();
          audioElement.currentTime = 0;
    } catch (error) {
      console.error('[AudioManager] Falha no fallback de HTMLAudio:', error);
        }
        this.htmlAudioPlayers.delete(audioElement);	
      };
    } catch (e) {
      console.error("[AudioManager] Error playing sound:", e);
      return () => {};
    }
  }
}

export const audioManager = new AudioManager();
export default audioManager;
