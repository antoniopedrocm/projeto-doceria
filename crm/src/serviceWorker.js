// crm/src/serviceWorker.js

/**
 * Arquivo de registro do Service Worker da aplicação.
 *
 * Este módulo unifica as versões divergentes presentes no repositório,
 * removendo marcadores de conflito e combinando o melhor de cada ramo.
 *
 * O Service Worker é responsável por habilitar funcionalidades offline
 * e integrações com Firebase Cloud Messaging (FCM) para notificações.
 * A configuração usa um arquivo customizado (firebase‑messaging‑sw.js)
 * localizado na raiz pública da aplicação. O registro pode ser
 * desabilitado via variável de ambiente nos cenários de desenvolvimento.
 */

// Nome do arquivo do Service Worker responsável pelo FCM.
const SW_FILENAME = 'firebase-messaging-sw.js';

/**
 * Determina se o Service Worker deve ser registrado com base no ambiente
 * e nas variáveis de configuração.
 *
 * - Se REACT_APP_DISABLE_SERVICE_WORKER for 'true', o registro é desabilitado.
 * - Em produção, registra por padrão para habilitar caching e notificações.
 * - Em desenvolvimento, registra somente se REACT_APP_ENABLE_SERVICE_WORKER for 'true'.
 */
function shouldRegisterServiceWorker() {
  if (process.env.REACT_APP_DISABLE_SERVICE_WORKER === 'true') {
    return false;
  }

  if (process.env.NODE_ENV === 'production') {
    return true;
  }

  return process.env.REACT_APP_ENABLE_SERVICE_WORKER === 'true';
}

/**
 * Registra o Service Worker da aplicação.
 *
 * Utiliza o arquivo firebase‑messaging‑sw.js para suportar FCM. Se um
 * service worker pré-existente estiver em espera, envia uma mensagem
 * SKIP_WAITING para que assuma imediatamente. Também adiciona um
 * observador para recarregar a página quando uma nova versão for instalada.
 */
export function register() {
  if (!shouldRegisterServiceWorker()) {
    console.info('[serviceWorker] Registro desabilitado pelo ambiente.');
    return;
  }

  if ('serviceWorker' in navigator) {
    // Remove uma barra no final do PUBLIC_URL (caso exista).
    const publicUrl = (process.env.PUBLIC_URL || '').replace(/\/$/, '');
    const swUrl = publicUrl ? `${publicUrl}/${SW_FILENAME}` : `/${SW_FILENAME}`;

    const registerServiceWorker = () => {
      navigator.serviceWorker
        .register(swUrl)
        .then((registration) => {
          console.log('✅ Service Worker registrado com sucesso:', registration);

          // Se já houver um service worker aguardando ativação, força a ativação
          if (registration.waiting) {
            registration.waiting.postMessage({ type: 'SKIP_WAITING' });
          }

          // Observa atualizações no service worker para recarregar quando necessário
          registration.addEventListener('updatefound', () => {
            const installingWorker = registration.installing;
            if (!installingWorker) {
              return;
            }

            installingWorker.addEventListener('statechange', () => {
              if (installingWorker.state === 'installed') {
                if (navigator.serviceWorker.controller) {
                  console.log('ℹ️ Nova versão disponível. Recarregue manualmente para aplicar.');
                } else {
                  console.log('🎉 Conteúdo armazenado para uso offline.');
                }
              }
            });
          });
        })
        .catch((error) => {
          console.error('❌ Falha ao registrar o Service Worker:', error);
        });
    };

    if (document.readyState === 'complete') {
      registerServiceWorker();
    } else {
      window.addEventListener('load', registerServiceWorker);
    }
  }
}

/**
 * Cancela o registro do service worker.
 *
 * Use esta função para desativar o suporte offline e notificações.
 */
export function unregister() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready.then((registration) => {
      registration.unregister();
    });
  }
}