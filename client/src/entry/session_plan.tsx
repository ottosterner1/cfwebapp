// client/src/entry/session_plan.tsx - Clean version (use this after confirming it works)

import React from 'react';
import { createRoot } from 'react-dom/client';
import SessionPlan from '../components/session-plan/SessionPlan';
import '../index.css';

const SessionPlanApp: React.FC = () => {
  return <SessionPlan />;
};

// Function to initialize the React app
const initializeApp = () => {
  const container = document.getElementById('session-planning-root');
  
  if (container) {
    const root = createRoot(container);
    root.render(
      <React.StrictMode>
        <SessionPlanApp />
      </React.StrictMode>
    );
  } else {
    console.error('session-planning-root container not found!');
  }
};

// Wait for DOM to be ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}

export default SessionPlanApp;