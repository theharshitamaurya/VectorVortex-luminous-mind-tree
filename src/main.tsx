import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App';
import './index.css';

const originalWarn = console.warn.bind(console);
console.warn = (...args: any[]) => {
  const message = args
    .map((arg) => (typeof arg === "string" ? arg : ""))
    .join(" ")
    .trim();
  if (
    message.includes("THREE.THREE.Clock") ||
    (message.includes("THREE.Clock") && message.includes("THREE.Timer"))
  ) {
    return;
  }
  originalWarn(...args);
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
