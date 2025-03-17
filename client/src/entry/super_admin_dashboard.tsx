import React from 'react';
import { createRoot } from 'react-dom/client';
import SuperAdminDashboard from '../components/admin/SuperAdminDashboard';
import '../index.css';

const container = document.getElementById('super-admin-root');
if (!container) throw new Error('Failed to find the super-admin-root element');

const root = createRoot(container);
root.render(
  <React.StrictMode>
    <SuperAdminDashboard />
  </React.StrictMode>
);