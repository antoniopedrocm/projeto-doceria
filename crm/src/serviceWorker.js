export function register() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      const swUrl = `${process.env.PUBLIC_URL}/service-worker.js`;

      navigator.serviceWorker
        .register(swUrl)
        .then((registration) => {
          console.log('✅ Service Worker registrado com sucesso:', registration);

          // Atualiza automaticamente quando há uma nova versão
          registration.onupdatefound = () => {
            const installingWorker = registration.installing;
            if (installingWorker) {
              installingWorker.onstatechange = () => {
                if (installingWorker.state === 'installed') {
                  if (navigator.serviceWorker.controller) {
                    console.log('🔄 Nova versão disponível! Atualizando...');
                    window.location.reload();
                  } else {
                    console.log('🎉 Conteúdo armazenado para uso offline.');
                  }
                }
              };
            }
          };
        })
        .catch((error) => {
          console.error('❌ Falha ao registrar o Service Worker:', error);
        });
    });
  }
}

export function unregister() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready.then((registration) => {
      registration.unregister();
    });
  }
}
