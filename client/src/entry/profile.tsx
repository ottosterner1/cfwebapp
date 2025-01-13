import React from 'react';
import { createRoot } from 'react-dom/client';
import Profile from '../components/profile/Profile';
import '../index.css';

document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('root');
  if (container) {
    const root = createRoot(container);
    root.render(
      <React.StrictMode>
        <Profile />
      </React.StrictMode>
    );
  }
});