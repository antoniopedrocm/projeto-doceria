import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

// Importa o service worker
import * as serviceWorkerRegistration from './serviceWorker';

if (process.env.NODE_ENV === 'production') {
  const { hostname, protocol, pathname, search, hash } = window.location;

  if (hostname === 'anaguimaraesdoceria.com.br') {
    const redirectURL = `${protocol}//www.${hostname}${pathname}${search}${hash}`;
    window.location.replace(redirectURL);
  }
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// ✅ CORREÇÃO:
// Altera o registro para 'unregister()' para corrigir o erro de
// MIME type no console do navegador.
serviceWorkerRegistration.unregister();