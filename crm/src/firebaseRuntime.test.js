import { shouldUseFirebaseEmulators } from './firebaseRuntime';

describe('seleção do runtime Firebase', () => {
  test.each(['localhost', '127.0.0.1', '[::1]'])(
    'usa emuladores no preview web em %s',
    (hostname) => {
      expect(shouldUseFirebaseEmulators({ hostname, isNativePlatform: false })).toBe(true);
    }
  );

  test.each(['localhost', '127.0.0.1', '[::1]'])(
    'mantém Firebase DEV no aplicativo nativo com hostname %s',
    (hostname) => {
      expect(shouldUseFirebaseEmulators({ hostname, isNativePlatform: true })).toBe(false);
    }
  );

  test('mantém Firebase DEV no Hosting', () => {
    expect(shouldUseFirebaseEmulators({
      hostname: 'crmdoceria-9959e.web.app',
      isNativePlatform: false,
    })).toBe(false);
  });
});
