import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
// Importa o service worker
import * as serviceWorkerRegistration from './serviceWorker';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Habilita o service worker para notificações, cache offline e PWA
serviceWorkerRegistration.register();
