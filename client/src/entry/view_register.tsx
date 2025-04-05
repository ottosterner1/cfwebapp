import React from 'react';
import { createRoot } from 'react-dom/client';
import RegisterDetail from '../components/registers/RegisterDetail';
import '../index.css';

const ViewRegisterApp: React.FC = () => {
  // Get register ID from data attribute
  const rootElement = document.getElementById('view-register-root');
  const registerId = rootElement?.dataset.registerId;

  // Navigation handler
  const navigateTo = (path: string) => {
    window.location.href = path;
  };

  // Edit handler
  const handleEdit = () => {
    if (registerId) {
      window.location.href = `/registers/${registerId}/edit`;
    }
  };

  if (!registerId) {
    return <div className="p-4 text-red-500">Register ID not provided</div>;
  }

  return (
    <RegisterDetail 
      registerId={registerId} 
      onNavigate={navigateTo} 
      onEdit={handleEdit} 
    />
  );
};

const container = document.getElementById('view-register-root');
if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <ViewRegisterApp />
    </React.StrictMode>
  );
}

export default ViewRegisterApp;