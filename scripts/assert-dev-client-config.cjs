const path = require('node:path');
const DEV_PROJECT_ID = 'crmdoceria-9959e';
const required = ['API_KEY', 'AUTH_DOMAIN', 'PROJECT_ID', 'STORAGE_BUCKET', 'MESSAGING_SENDER_ID', 'APP_ID'];

function validateDevClientConfig(env) {
  const errors = [];
  for (const key of required) {
    const value = String(env['REACT_APP_FIREBASE_' + key] || '').trim();
    if (!value || /SUBSTITUA|PLACEHOLDER|YOUR[_-]/i.test(value)) errors.push('REACT_APP_FIREBASE_' + key + ' ausente ou incompleta.');
  }
  if (env.REACT_APP_FIREBASE_PROJECT_ID !== DEV_PROJECT_ID) errors.push('O build deve usar exclusivamente o Firebase DEV ' + DEV_PROJECT_ID + '.');
  if (env.REACT_APP_FIREBASE_AUTH_DOMAIN !== DEV_PROJECT_ID + '.firebaseapp.com') errors.push('Auth Domain não corresponde ao Firebase DEV.');
  const bucket = String(env.REACT_APP_FIREBASE_STORAGE_BUCKET || '').replace(/^gs:\/\//i, '');
  if (![DEV_PROJECT_ID + '.appspot.com', DEV_PROJECT_ID + '.firebasestorage.app'].includes(bucket)) errors.push('Storage Bucket não corresponde ao Firebase DEV.');
  const appId = String(env.REACT_APP_FIREBASE_APP_ID || '');
  if (appId && (appId.split(':')[0] !== '1' || appId.split(':')[1] !== env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID || appId.split(':')[2] !== 'web' || !appId.split(':')[3])) errors.push('App ID Web e Messaging Sender ID incompatíveis.');
  return errors;
}

if (require.main === module) {
  process.env.NODE_ENV = 'production';
  process.chdir(path.resolve(__dirname, '../crm'));
  // Use the same loader and precedence as the actual react-scripts build.
  const env = require('../crm/node_modules/react-scripts/config/env')('').raw;
  const errors = validateDevClientConfig(env);
  if (errors.length) {
    console.error('Build DEV bloqueado. Configure crm/.env.production.local com a configuração Web do Firebase DEV.\n' + errors.join('\n'));
    process.exitCode = 1;
  } else console.log('Configuração Firebase Web DEV validada: ' + DEV_PROJECT_ID);
}
module.exports = {validateDevClientConfig};
