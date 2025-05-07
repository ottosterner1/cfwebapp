// client/src/entry/registers.tsx

import React from 'react';
import { createRoot } from 'react-dom/client';
import Registers from '../components/registers/Registers';
import '../index.css';

const RegistersApp: React.FC = () => {
  return <Registers />;
};

const container = document.getElementById('registers-root');
if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <RegistersApp />
    </React.StrictMode>
  );
}

export default RegistersApp;