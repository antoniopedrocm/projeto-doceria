jest.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: () => 'web',
    isNativePlatform: () => false,
  },
}));

jest.mock('@capacitor-community/native-audio', () => ({
  NativeAudio: {
    loop: jest.fn(),
    play: jest.fn(),
    preload: jest.fn(),
    setVolume: jest.fn(),
    stop: jest.fn(),
  },
}));

import audioManager from './AudioManager';

describe('AudioManager - alarme de novo pedido', () => {
  beforeEach(() => {
    audioManager.stopAlarmSound();
    audioManager.unlocked = true;
    audioManager.pendingPlay = false;
    audioManager.alarmStartPromise = null;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    audioManager.stopAlarmSound();
  });

  test('consolida partidas concorrentes em um único player do áudio oficial', async () => {
    const stopPlayer = jest.fn();
    const playSound = jest
      .spyOn(audioManager, 'playSound')
      .mockResolvedValue(stopPlayer);

    const [firstResult, secondResult] = await Promise.all([
      audioManager.playAlarmSound(),
      audioManager.playAlarmSound(),
    ]);

    expect(firstResult).toBe(true);
    expect(secondResult).toBe(true);
    expect(playSound).toHaveBeenCalledTimes(1);
    expect(playSound).toHaveBeenCalledWith('/audio/alarm.mp3', {
      loop: true,
      volume: 0.8,
    });
  });

  test('uma parada durante a partida pendente impede áudio tardio', async () => {
    let resolvePlayer;
    const stopPlayer = jest.fn();
    jest.spyOn(audioManager, 'playSound').mockImplementation(
      () => new Promise((resolve) => {
        resolvePlayer = resolve;
      })
    );

    const startPromise = audioManager.playAlarmSound();
    audioManager.stopAlarmSound();
    resolvePlayer(stopPlayer);

    await expect(startPromise).resolves.toBe(false);
    expect(stopPlayer).toHaveBeenCalledTimes(1);
    expect(audioManager.alarmStopFn).toBeNull();
  });

  test('mantém o pedido pendente quando o navegador ainda bloqueia áudio', async () => {
    audioManager.unlocked = false;
    const playSound = jest.spyOn(audioManager, 'playSound');

    await expect(audioManager.playAlarmSound()).resolves.toBe(false);
    expect(audioManager.pendingPlay).toBe(true);
    expect(playSound).not.toHaveBeenCalled();
  });
});
