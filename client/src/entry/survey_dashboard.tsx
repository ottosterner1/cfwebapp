import React from 'react';
import ReactDOM from 'react-dom/client';
import SurveyDashboard from '../components/surveys/SurveyDashboard';
import '../index.css';

const App: React.FC = () => {
  const rootElement = document.getElementById('survey-dashboard-root');
  const clubData = rootElement ? {
    id: parseInt(rootElement.dataset.clubId || '0'),
    name: rootElement.dataset.clubName || ''
  } : null;

  if (!clubData || !clubData.id) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-2">Configuration Error</h1>
          <p className="text-gray-600">Club data not found. Please contact support.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <SurveyDashboard 
        clubId={clubData.id} 
        clubName={clubData.name}
      />
    </div>
  );
};

// Mount the app
const container = document.getElementById('survey-dashboard-root');
if (container) {
  const root = ReactDOM.createRoot(container);
  root.render(<App />);
} else {
  console.error('Survey dashboard root element not found');
}