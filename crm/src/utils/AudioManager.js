// src/utils/AudioManager.js
import { Capacitor } from '@capacitor/core';
import { NativeAudio } from '@capacitor-community/native-audio';

class AudioManager {
  constructor() {
    this.audioCtx = null;
    this.unlocked = false;
    this.cache = new Map();
    this._setupAutoUnlockListener();
  }

  _setupAutoUnlockListener() {
    // Escuta o primeiro clique, toque ou tecla para desbloquear o áudio
    const unlockEvents = ["click", "touchstart", "keydown"];
    const unlockHandler = async () => {
      await this.userUnlock();
      unlockEvents.forEach(ev => document.removeEventListener(ev, unlockHandler));
    };
    unlockEvents.forEach(ev => document.addEventListener(ev, unlockHandler, { once: true }));
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
        const assetId = 'pedido';
        await NativeAudio.preload({
          assetId,
          assetPath: 'mixkit-vintage-warning-alarm-990.wav',
          audioChannelNum: 1,
          isUrl: false,
        });
        await NativeAudio.play({ assetId });
        console.log('[AudioManager] Som reproduzido via NativeAudio');
        return () => NativeAudio.stop({ assetId });
      } catch (err) {
        console.error('[AudioManager] Falha ao tocar via NativeAudio:', err);
      }
    }

    // --- Comportamento padrão (browser) ---
    if (!this.audioCtx || this.audioCtx.state !== "running") {
      console.warn("[AudioManager] play blocked: AudioContext not running. State:", this.audioCtx?.state);
      this.unlocked = false;
      return () => {};
    }

    this.unlocked = true;

    try {
      const buffer = await this._fetchAndDecode(url);
      if (!buffer) return () => {};

      const src = this.audioCtx.createBufferSource();
      src.buffer = buffer;

      const gain = this.audioCtx.createGain();
      gain.gain.setValueAtTime(volume, this.audioCtx.currentTime);

      src.connect(gain);
      gain.connect(this.audioCtx.destination);

      src.loop = loop;
      src.start(0);

      console.log("[AudioManager] Sound started:", url);

      return () => {
        try {
          src.stop();
          src.disconnect();
          gain.disconnect();
          console.log("[AudioManager] Sound stopped:", url);
        } catch {
          /* ignora erro de parada duplicada */
        }
      };
    } catch (e) {
      console.error("[AudioManager] Error playing sound:", e);
      return () => {};
    }
  }
}

export const audioManager = new AudioManager();
export default audioManager;
