import audioManager, { isIOSWebBrowser } from './AudioManager';

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

const originalNavigatorDescriptors = {
  maxTouchPoints: Object.getOwnPropertyDescriptor(navigator, 'maxTouchPoints'),
  platform: Object.getOwnPropertyDescriptor(navigator, 'platform'),
  userActivation: Object.getOwnPropertyDescriptor(navigator, 'userActivation'),
  userAgent: Object.getOwnPropertyDescriptor(navigator, 'userAgent'),
};
const originalAudioContext = window.AudioContext;

const setNavigatorValue = (property, value) => {
  Object.defineProperty(navigator, property, {
    configurable: true,
    value,
  });
};

const setIOSBrowser = ({
  userActivation = true,
  userAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',
} = {}) => {
  setNavigatorValue(
    'userAgent',
    userAgent
  );
  setNavigatorValue('platform', 'iPhone');
  setNavigatorValue('maxTouchPoints', 5);
  setNavigatorValue('userActivation', { isActive: userActivation });
};

const restoreNavigator = () => {
  Object.entries(originalNavigatorDescriptors).forEach(([property, descriptor]) => {
    if (descriptor) {
      Object.defineProperty(navigator, property, descriptor);
    } else {
      delete navigator[property];
    }
  });
};

const createIOSAudioContext = ({ resumeError = null } = {}) => {
  const source = {
    addEventListener: jest.fn(),
    connect: jest.fn(),
    disconnect: jest.fn(),
    start: jest.fn(),
  };
  const context = {
    createBuffer: jest.fn(() => ({})),
    createBufferSource: jest.fn(() => source),
    destination: {},
    resume: jest.fn(() => {
      if (resumeError) return Promise.reject(resumeError);
      context.state = 'running';
      return Promise.resolve();
    }),
    sampleRate: 44_100,
    state: 'suspended',
  };

  return { context, source };
};

describe('AudioManager - alarme de novo pedido', () => {
  beforeEach(() => {
    audioManager.stopAlarmSound();
    audioManager.unlocked = true;
    audioManager.pendingPlay = false;
    audioManager.alarmStartPromise = null;
    audioManager.audioCtx = null;
    audioManager.iosSessionUnlocked = false;
    audioManager.webUnlockPromise = null;
    window.AudioContext = originalAudioContext;
    localStorage.clear();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    audioManager.stopAlarmSound();
    restoreNavigator();
    window.AudioContext = originalAudioContext;
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

  test('no iOS não confunde preferência salva com autorização técnica da sessão', async () => {
    setIOSBrowser();
    localStorage.setItem('audioUnlocked', 'true');
    const AudioContextConstructor = jest.fn();
    window.AudioContext = AudioContextConstructor;

    await audioManager.init();

    expect(AudioContextConstructor).not.toHaveBeenCalled();
    expect(audioManager.unlocked).toBe(false);
    expect(audioManager.iosSessionUnlocked).toBe(false);
  });

  test('aplica a mesma proteção WebKit ao Chrome no iPhone', () => {
    setIOSBrowser({
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/130.0 Mobile/15E148 Safari/604.1',
    });

    expect(isIOSWebBrowser()).toBe(true);
  });

  test('cria e desbloqueia um único AudioContext dentro do gesto real no iOS', async () => {
    setIOSBrowser();
    const { context, source } = createIOSAudioContext();
    const AudioContextConstructor = jest.fn(() => context);
    window.AudioContext = AudioContextConstructor;
    const retryPending = jest.spyOn(audioManager, 'retryPending').mockResolvedValue(true);
    audioManager.pendingPlay = true;

    await expect(audioManager.userUnlock({ userGesture: true })).resolves.toBe(true);

    expect(AudioContextConstructor).toHaveBeenCalledTimes(1);
    expect(context.resume).toHaveBeenCalledTimes(1);
    expect(context.createBuffer).toHaveBeenCalledWith(1, 1, 44_100);
    expect(source.connect).toHaveBeenCalledWith(context.destination);
    expect(source.start).toHaveBeenCalledWith(0);
    expect(retryPending).toHaveBeenCalledTimes(1);
    expect(audioManager.iosSessionUnlocked).toBe(true);
    expect(audioManager.unlocked).toBe(true);
  });

  test('não tenta resume no iOS sem ativação real do usuário', async () => {
    setIOSBrowser({ userActivation: false });
    const { context } = createIOSAudioContext();
    const AudioContextConstructor = jest.fn(() => context);
    window.AudioContext = AudioContextConstructor;
    audioManager.pendingPlay = true;

    await expect(audioManager.userUnlock({ userGesture: true })).resolves.toBe(false);

    expect(AudioContextConstructor).not.toHaveBeenCalled();
    expect(context.resume).not.toHaveBeenCalled();
    expect(audioManager.pendingPlay).toBe(true);
    expect(audioManager.unlocked).toBe(false);
  });

  test('preserva o alarme pendente e registra o erro real quando o WebKit rejeita resume', async () => {
    setIOSBrowser();
    const rejection = Object.assign(new Error('The request is not allowed by the user agent.'), {
      name: 'NotAllowedError',
    });
    const { context } = createIOSAudioContext({ resumeError: rejection });
    window.AudioContext = jest.fn(() => context);
    audioManager.pendingPlay = true;
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(audioManager.userUnlock({ userGesture: true })).resolves.toBe(false);

    expect(audioManager.pendingPlay).toBe(true);
    expect(audioManager.unlocked).toBe(false);
    expect(consoleError).toHaveBeenCalledWith(
      '[ORDER-ALARM][iOS] unlock rejected',
      expect.objectContaining({
        name: 'NotAllowedError',
        message: 'The request is not allowed by the user agent.',
      })
    );
  });

  test('abandona um resume travado do WebKit e permite tentar novamente no próximo gesto', async () => {
    jest.useFakeTimers();
    setIOSBrowser();
    const { context } = createIOSAudioContext();
    context.resume = jest.fn(() => new Promise(() => {}));
    context.close = jest.fn(() => Promise.resolve());
    window.AudioContext = jest.fn(() => context);
    audioManager.pendingPlay = true;
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const unlockPromise = audioManager.userUnlock({ userGesture: true });
    jest.advanceTimersByTime(2_500);

    await expect(unlockPromise).resolves.toBe(false);
    expect(context.close).toHaveBeenCalledTimes(1);
    expect(audioManager.audioCtx).toBeNull();
    expect(audioManager.webUnlockPromise).toBeNull();
    expect(audioManager.pendingPlay).toBe(true);
    jest.useRealTimers();
  });

  test('ao sair da página no iOS interrompe o player sem esquecer que ainda deve tocar', () => {
    setIOSBrowser();
    const stopPlayer = jest.fn();
    audioManager.alarmStopFn = stopPlayer;
    audioManager.iosSessionUnlocked = true;
    audioManager.unlocked = true;

    audioManager._handlePageHide();

    expect(stopPlayer).toHaveBeenCalledTimes(1);
    expect(audioManager.alarmStopFn).toBeNull();
    expect(audioManager.pendingPlay).toBe(true);
    expect(audioManager.iosSessionUnlocked).toBe(false);
    expect(audioManager.unlocked).toBe(false);
  });
});
