import React from 'react';
import { createRoot } from 'react-dom/client';
import ProgrammeManagement from '../components/programme/ProgrammeManagement';
import '../index.css';

const container = document.getElementById('react-root');
if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <ProgrammeManagement />
    </React.StrictMode>
  );
}