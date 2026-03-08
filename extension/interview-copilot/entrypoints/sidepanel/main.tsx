import React from 'react';
import ReactDOM from 'react-dom/client';

// ── CRITICAL FIX ────────────────────────────────────────────────────────────
// Previously this imported '../../components/App/App.tsx' — the POPUP component
// which has a hardcoded style={{ width: "450px", height: "600px" }}.
// That rendered a tiny fixed box inside the full-height Chrome side panel.
//
// The side panel needs its own layout that fills 100vh.
// sidebar/App.tsx is purpose-built for that.
// ────────────────────────────────────────────────────────────────────────────
import App from '../../components/sidebar/App';
import '../../assets/tailwind.css';

const rootElement = document.getElementById('root');

if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}