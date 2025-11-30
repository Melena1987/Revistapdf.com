import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Robust polyfill for process.env in browser environments
if (typeof window !== 'undefined') {
  const win = window as any;
  if (!win.process) win.process = { env: {} };
  if (!win.process.env) win.process.env = {};
  
  // Prioritize existing process.env.API_KEY, fallback to Vite/Meta env vars
  if (!win.process.env.API_KEY) {
    win.process.env.API_KEY = (import.meta as any).env?.VITE_API_KEY || (import.meta as any).env?.API_KEY || '';
  }
  
  // Default NODE_ENV
  if (!win.process.env.NODE_ENV) {
    win.process.env.NODE_ENV = 'production';
  }
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);