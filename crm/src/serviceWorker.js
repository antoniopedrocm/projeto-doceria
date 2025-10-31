const SW_FILENAME = 'firebase-messaging-sw.js';

function shouldRegisterServiceWorker() {
  if (process.env.REACT_APP_DISABLE_SERVICE_WORKER === 'true') {
    return false;
  }

  if (process.env.NODE_ENV === 'production') {
    return true;
  }

  return process.env.REACT_APP_ENABLE_SERVICE_WORKER === 'true';
}

export function register() {
  if (!shouldRegisterServiceWorker()) {
    console.info('[serviceWorker] Registro desabilitado pelo ambiente.');
    return;
  }

  if ('serviceWorker' in navigator) {
    const publicUrl = (process.env.PUBLIC_URL || '').replace(/\/$/, '');
    const swUrl = publicUrl ? `${publicUrl}/${SW_FILENAME}` : `/${SW_FILENAME}`;
	
    const registerServiceWorker = () => {
      navigator.serviceWorker
        .register(swUrl)
        .then((registration) => {
          console.log('✅ Service Worker registrado com sucesso:', registration);

          if (registration.waiting) {
            registration.waiting.postMessage({ type: 'SKIP_WAITING' });
          }

          registration.addEventListener('updatefound', () => {
            const installingWorker = registration.installing;
            if (!installingWorker) {
              return;
            }

            installingWorker.addEventListener('statechange', () => {
              if (installingWorker.state === 'installed') {
                if (navigator.serviceWorker.controller) {
                  console.log('🔄 Nova versão disponível! Atualizando...');
                  window.location.reload();
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

export function unregister() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready.then((registration) => {
      registration.unregister();
    });
  }
}
