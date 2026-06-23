import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// En desarrollo, desregistrar SWs y limpiar caches para evitar
// conflictos entre builds de dev y prod anteriores.
if (import.meta.env.DEV && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations()
    .then(registrations => registrations.forEach(r => r.unregister()));
  if ('caches' in window) {
    caches.keys().then(keys => keys.forEach(key => caches.delete(key)));
  }
}

// En produccion, registrar el SW con auto-actualizacion: cuando se detecta
// una version nueva, recarga sola en lugar de quedarse con el bundle viejo
// cacheado indefinidamente (afecta sobre todo a la PWA instalada en celular).
if (import.meta.env.PROD) {
  import('virtual:pwa-register').then(({ registerSW }) => {
    registerSW({ immediate: true });
  });
}
