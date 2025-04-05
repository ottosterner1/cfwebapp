import React from 'react';
import { createRoot } from 'react-dom/client';
import RegisterEdit from '../components/registers/RegisterEdit';
import '../index.css';

const EditRegisterApp: React.FC = () => {
  // Get register ID from data attribute
  const rootElement = document.getElementById('edit-register-root');
  const registerId = rootElement?.dataset.registerId;

  // Navigation handler
  const navigateTo = (path: string) => {
    window.location.href = path;
  };

  // Success handler
  const handleSaveSuccess = () => {
    if (registerId) {
      window.location.href = `/registers/${registerId}`;
    } else {
      window.location.href = '/registers';
    }
  };

  if (!registerId) {
    return <div className="p-4 text-red-500">Register ID not provided</div>;
  }

  return (
    <RegisterEdit 
      registerId={registerId} 
      onNavigate={navigateTo} 
      onSaveSuccess={handleSaveSuccess} 
    />
  );
};

const container = document.getElementById('edit-register-root');
if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <EditRegisterApp />
    </React.StrictMode>
  );
}

export default EditRegisterApp;