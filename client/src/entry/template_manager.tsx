import React from 'react';
import { createRoot } from 'react-dom/client';
import TemplateManager from '../components/templates/TemplateManager';

const container = document.getElementById('template-manager-root');
if (container) {
    const root = createRoot(container);
    root.render(
        <React.StrictMode>
            <TemplateManager />
        </React.StrictMode>
    );
}