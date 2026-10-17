import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import '@fontsource-variable/rubik/wght.css';
import './styles.css';
import App from './App';

registerSW({ immediate: true });

// Ask the browser not to evict our IndexedDB data.
navigator.storage?.persist?.().catch(() => {});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
