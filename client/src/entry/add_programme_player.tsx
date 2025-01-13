// src/entry/add_programme_player.tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import AddProgrammePlayer from '../components/programme/AddProgrammePlayer';
import '../index.css';

console.log('Add Programme Player Entry Point Loaded');

const container = document.getElementById('react-root');
if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        <AddProgrammePlayer />
      </div>
    </React.StrictMode>
  );
} else {
  console.error('Could not find react-root element');
}