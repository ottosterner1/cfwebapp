// client/src/entry/create_register.tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import CreateRegister from '../components/registers/CreateRegister';
import '../index.css';

const CreateRegisterApp: React.FC = () => {
  // Navigation handler
  const navigateTo = (path: string) => {
    window.location.href = path;
  };

  // Success handler
  const handleCreateSuccess = (registerId: string) => {
    window.location.href = `/registers/${registerId}`;
  };

  return (
    <CreateRegister 
      onNavigate={navigateTo} 
      onCreateSuccess={handleCreateSuccess} 
    />
  );
};

const container = document.getElementById('create-register-root');
if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <CreateRegisterApp />
    </React.StrictMode>
  );
}

export default CreateRegisterApp;