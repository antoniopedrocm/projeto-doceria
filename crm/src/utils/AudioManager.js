// src/utils/AudioManager.js

import { Capacitor } from '@capacitor/core';
import { NativeAudio } from '@capacitor-community/native-audio';

const NATIVE_ASSET_ID = 'pedido';
const NATIVE_ASSET_PATHS = [
  'public/audio/alarm.mp3',
  'alarm.mp3',
  'audio/alarm.mp3',
  '/audio/alarm.mp3',
];
const unlockEvents = ['touchstart', 'touchend', 'mousedown', 'keydown', 'pointerdown'];

class AudioManager {
  constructor() {
    this.audioCtx = null;
    this.unlocked = false;
    this.cache = new Map();
	this.htmlAudioPlayers = new Set();
    this.pendingPlay = false;
    this.alarmStopFn = null;
    this.alarmStartPromise = null;
    this.alarmGeneration = 0;
    this.alarmStateListeners = new Set();
    this.nativeAudioReady = false;
    this.nativePreloadPromise = null;
    this._visibilityHandler = this._handleVisibilityChange.bind(this);
    this._focusHandler = this._handleVisibilityChange.bind(this);
    this._setupAutoUnlockListener();
  }

  subscribeToAlarmState(listener) {
    if (typeof listener !== 'function') return () => {};
    this.alarmStateListeners.add(listener);
    return () => this.alarmStateListeners.delete(listener);
  }

  _emitAlarmState(status) {
    this.alarmStateListeners.forEach((listener) => {
      try {
        listener({ status });
      } catch (error) {
        console.warn('[AudioManager] Listener de estado do alarme falhou:', error);
      }
    });
  }

  _setupAutoUnlockListener() {
    if (typeof document === 'undefined') return;

    const unlockHandler = async () => {
      try {
        await this.userUnlock({ userGesture: true });
      } finally {
        if (this.unlocked) {
          unlockEvents.forEach((ev) => document.removeEventListener(ev, unlockHandler));
        }
      }
    };
    unlockEvents.forEach((ev) => document.addEventListener(ev, unlockHandler, { passive: true }));

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
    if (Capacitor.isNativePlatform()) {
      try {
        await this._ensureNativePreload();
        this.unlocked = true;
      } catch (error) {
        this.unlocked = false;
        console.error('[AudioManager] Não foi possível preparar o áudio nativo:', error);
      }
      return;
    }

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
      const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextConstructor) {
        this.unlocked = false;
        return;
      }
      this.audioCtx = new AudioContextConstructor();

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
      this.nativePreloadPromise = (async () => {
        let lastError = null;

        for (const assetPath of NATIVE_ASSET_PATHS) {
          try {
            await NativeAudio.preload({
              assetId: NATIVE_ASSET_ID,
              assetPath,
              audioChannelNum: 1,
              isUrl: false,
            });
            return;
          } catch (error) {
            lastError = error;
          }
        }

        throw lastError || new Error('Falha ao pré-carregar asset de áudio nativo.');
      })()
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
          this.nativePreloadPromise = null;
          throw error;
        });
    }

    return this.nativePreloadPromise;
  }
  
  async userUnlock({ userGesture = false } = {}) {
    if (Capacitor.isNativePlatform()) {
      await this.init();
      if (this.unlocked && userGesture) {
        await this._ensureNativePreload();
      }
      await this.retryPending();
      return this.unlocked;
    }

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

        if (userGesture && Capacitor.isNativePlatform()) {
          await this._ensureNativePreload();
        }
      } catch (e) {
        console.error("[AudioManager] failed to unlock:", e);
        this.unlocked = false;
        localStorage.removeItem("audioUnlocked");
      }
    } else {
      this.unlocked = true;
      localStorage.setItem("audioUnlocked", "true");
      console.log("[AudioManager] context already running, confirmed unlock by user");

      if (userGesture && Capacitor.isNativePlatform()) {
        await this._ensureNativePreload();
      }
    }

    await this.retryPending();
    return this.unlocked;
  }

  async playAlarmSound() {
    if (!this.unlocked) {
      this.pendingPlay = true;
      this._emitAlarmState('pending');
      return false;
    }

    if (typeof this.alarmStopFn === 'function') {
      return true;
    }

    if (this.alarmStartPromise) return this.alarmStartPromise;

    const generation = this.alarmGeneration;
    this.alarmStartPromise = (async () => {
      const stopFn = await this.playSound('/audio/alarm.mp3', { loop: true, volume: 0.8 });
      if (typeof stopFn !== 'function') {
        this.pendingPlay = true;
        this._emitAlarmState('pending');
        return false;
      }

      if (generation !== this.alarmGeneration) {
        await stopFn();
        return false;
      }

      this.alarmStopFn = stopFn;
      this.pendingPlay = false;
      this._emitAlarmState('playing');
      return true;
    })();

    try {
      return await this.alarmStartPromise;
    } finally {
      this.alarmStartPromise = null;
    }
  }

  async retryPending() {
    if (!this.pendingPlay || !this.unlocked) {
      return false;
    }

    const started = await this.playAlarmSound();
    if (started) {
      this.pendingPlay = false;
    }
    return started;
  }

  stopAlarmSound() {
    this.alarmGeneration += 1;
    this.pendingPlay = false;
    if (typeof this.alarmStopFn === 'function') {
      this.alarmStopFn();
      this.alarmStopFn = null;
    }
    this._emitAlarmState('stopped');
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
    if (Capacitor.isNativePlatform() && (Capacitor.getPlatform() === 'android' || Capacitor.getPlatform() === 'ios')) {
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
        return this._playUsingHtmlAudio(url, { loop, volume });
      }
    }

    // --- Comportamento padrão (browser) ---
    if (this.audioCtx && this.audioCtx.state === "running") {
      this.unlocked = true;

      try {
        const buffer = await this._fetchAndDecode(url);
        if (!buffer) {
          console.warn('[AudioManager] Buffer indisponível, tentando fallback com HTMLAudio:', url);
          return this._playUsingHtmlAudio(url, { loop, volume });
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
        return null;
      }
    }

    console.warn('[AudioManager] Fallback para HTMLAudio: AudioContext não está em execução. Estado:', this.audioCtx?.state);
    return this._playUsingHtmlAudio(url, { loop, volume });
  }

  async _playUsingHtmlAudio(url, { loop, volume }) {

    try {
      const audioElement = new Audio(url);
      const normalizedUrl = (url || '').toLowerCase();

      if (!normalizedUrl.endsWith('.mp3') && !normalizedUrl.endsWith('.wav') && !normalizedUrl.endsWith('.ogg')) {
        console.warn('[AudioManager] Formato de áudio possivelmente não suportado no fallback HTMLAudio:', url);
      }

      audioElement.loop = loop;
      audioElement.preload = 'auto';
      audioElement.crossOrigin = 'anonymous';
      audioElement.volume = Math.min(Math.max(volume, 0), 1);

      try {
        await audioElement.play();
      } catch (error) {
        console.error('[AudioManager] Falha no fallback de HTMLAudio:', error);
        return null;
      }

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
      return null;
    }
  }
}

export const audioManager = new AudioManager();
export default audioManager;
