import React from 'react';
import ReactDOM from 'react-dom/client';
import Index from '../components/landing/Index';
import '../index.css';

// Mount the React application to the root element
ReactDOM.createRoot(document.getElementById('react-root')!).render(
  <React.StrictMode>
    <Index />
  </React.StrictMode>
);