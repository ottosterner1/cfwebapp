import React from 'react';
import { createRoot } from 'react-dom/client';
import AccreditationDashboard from '../components/accreditation/AccreditationDashboard';
import '../index.css';

document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('root');
  if (container) {
    const root = createRoot(container);
    root.render(
      <React.StrictMode>
        <AccreditationDashboard />
      </React.StrictMode>
    );
  }
});