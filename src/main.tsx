import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  void navigator.serviceWorker.register('/service-worker.js', {
    scope: '/',
    updateViaCache: 'none',
  }).catch(() => {
    // The application remains usable online if the browser blocks PWA setup.
  });
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
