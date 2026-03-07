import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '../../components/App/App.tsx';
import '../../components/App/style.css';
import '../../components/App/App.css';

const rootElement = document.getElementById("root");
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
