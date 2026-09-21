// Local checkout never falls back to a live Firebase project.
export const localCheckout = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
export const checkoutProjectId = localCheckout ? 'demo-doceria-checkout' : 'crmdoceria-9959e';
export const apiBaseUrl = localCheckout
  ? `http://127.0.0.1:5001/${checkoutProjectId}/us-central1/api`
  : `https://us-central1-${checkoutProjectId}.cloudfunctions.net/api`;
export async function getCheckoutFirebaseConfig() {
  if (localCheckout) return {
    apiKey: 'demo-api-key', authDomain: 'demo-doceria-checkout.firebaseapp.com',
    projectId: checkoutProjectId, appId: 'demo-doceria-checkout',
    storageBucket: 'demo-doceria-checkout.appspot.com',
  };
  // Firebase Hosting supplies public configuration for its actual project.
  const response = await fetch('/__/firebase/init.json', {cache: 'no-store'});
  if (!response.ok) throw new Error('Configuração do ambiente indisponível.');
  const config = await response.json();
  if (config.projectId !== checkoutProjectId) throw new Error('Este checkout deve ser homologado no ambiente DEV.');
  return config;
}
