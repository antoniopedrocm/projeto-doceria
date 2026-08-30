const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(projectRoot, ...parts));
const readText = (...parts) => read(...parts).toString('utf8');
const sha256 = (contents) => crypto.createHash('sha256').update(contents).digest('hex');

test('web e Android empacotam exatamente o mesmo áudio oficial', () => {
  const officialHash = sha256(read('crm', 'public', 'audio', 'alarm.mp3'));
  const androidHash = sha256(read('crm', 'android', 'app', 'src', 'main', 'res', 'raw', 'alarm.mp3'));
  const legacyAndroidHash = sha256(read(
      'crm',
      'android',
      'app',
      'src',
      'main',
      'res',
      'raw',
      'mixkit_vintage_warning_alarm_990.mp3',
  ));

  assert.equal(androidHash, officialHash);
  assert.equal(legacyAndroidHash, officialHash);
});

test('Service Worker possui uma única fonte de push e usa o áudio oficial como contrato', () => {
  const serviceWorker = readText('crm', 'public', 'firebase-messaging-sw.js');

  assert.match(serviceWorker, /DEFAULT_AUDIO_URL = '\/audio\/alarm\.mp3'/);
  assert.equal((serviceWorker.match(/onBackgroundMessage/g) || []).length, 1);
  assert.doesNotMatch(serviceWorker, /addEventListener\(['"]push['"]/);
  assert.doesNotMatch(serviceWorker, /PLAY_ORDER_SOUND/);
});

test('Android usa dedupe, pausa por usuário e loja e um único player sonoro', () => {
  const messagingService = readText(
      'crm',
      'android',
      'app',
      'src',
      'main',
      'java',
      'br',
      'com',
      'anaguimaraes',
      'doceria',
      'DoceriaFirebaseMessagingService.java',
  );
  const playbackService = readText(
      'crm',
      'android',
      'app',
      'src',
      'main',
      'java',
      'br',
      'com',
      'anaguimaraes',
      'doceria',
      'MediaPlaybackService.java',
  );

  assert.match(messagingService, /OrderAlertDedupeStore\.claim/);
  assert.match(messagingService, /AlarmPausePlugin\.getPausedUntil/);
  assert.match(messagingService, /CURRENT_UID_KEY/);
  assert.match(messagingService, /CURRENT_STORE_KEY/);
  assert.match(playbackService, /MediaPlayer\.create\(this, R\.raw\.alarm\)/);
  assert.match(playbackService, /channel\.setSound\(null, null\)/);
});
