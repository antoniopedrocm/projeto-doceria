import { Capacitor, registerPlugin } from '@capacitor/core';

const AlarmPause = registerPlugin('AlarmPause');

export const syncNativeAlarmPause = async ({ uid, storeId, pausedUntil }) => {
  if (Capacitor.getPlatform() !== 'android') return;

  try {
    await AlarmPause.syncContext({
      uid: String(uid || ''),
      storeId: String(storeId || ''),
      pausedUntil: Number(pausedUntil) || 0,
    });
  } catch (error) {
    console.warn('[AlarmPause] Não foi possível sincronizar a pausa com o Android:', error);
  }
};

export const clearNativeAlarmContext = async () => {
  if (Capacitor.getPlatform() !== 'android') return;

  try {
    await AlarmPause.clearCurrentContext();
  } catch (error) {
    console.warn('[AlarmPause] Não foi possível limpar o contexto do Android:', error);
  }
};
