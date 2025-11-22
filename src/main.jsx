import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import App from './App.jsx';
import Launch from './pages/Launch.jsx';
import Growth from './pages/Growth.jsx';
import Scale from './pages/Scale.jsx';

function Router() {
  const rawPath = window.location.pathname.toLowerCase();
  const path = rawPath.endsWith('/') && rawPath !== '/' ? rawPath.slice(0, -1) : rawPath;

  if (path === '/launch') return <Launch />;
  if (path === '/growth') return <Growth />;
  if (path === '/scale') return <Scale />;

  // default: homepage
  return <App />;
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Router />
  </React.StrictMode>
);
