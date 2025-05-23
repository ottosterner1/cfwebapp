// client/src/entry/invoices.tsx

import React from 'react';
import { createRoot } from 'react-dom/client';
import Invoices from '../components/invoices/Invoices';
import '../index.css';

const InvoicesApp: React.FC = () => {
  return <Invoices />;
};

const container = document.getElementById('invoices-root');
if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <InvoicesApp />
    </React.StrictMode>
  );
}

export default InvoicesApp;