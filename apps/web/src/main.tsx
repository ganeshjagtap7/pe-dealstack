import React from 'react';
import ReactDOM from 'react-dom/client';
import { VDRApp } from './vdr';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <VDRApp />
  </React.StrictMode>
);
