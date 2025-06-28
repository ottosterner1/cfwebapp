import React, { useState, useEffect } from 'react';
import { FileText} from 'lucide-react';
import DocumentHub from './DocumentHub';

type ViewType = 'hub' | 'documents' | 'announcements' | 'goals';

interface HubStats {
  totalDocuments: number;
  totalCoaches: number;
  documentsThisMonth: number;
}

const CommunicationHub: React.FC = () => {
  const [currentView, setCurrentView] = useState<ViewType>('hub');
  const [hubStats, setHubStats] = useState<HubStats>({
    totalDocuments: 0,
    totalCoaches: 0,
    documentsThisMonth: 0
  });
  const [statsLoading, setStatsLoading] = useState(true);

  // Fetch hub statistics
  const fetchHubStats = async () => {
    try {
      setStatsLoading(true);

      // Get coaches to count total
      const coachesResponse = await fetch('/api/coaches');
      let totalCoaches = 0;
      if (coachesResponse.ok) {
        const coachesData = await coachesResponse.json();
        totalCoaches = coachesData.length;
      }

      // Get document statistics
      const docStatsResponse = await fetch('/communication/api/documents/stats');
      let totalDocuments = 0;
      if (docStatsResponse.ok) {
        const docStats = await docStatsResponse.json();
        totalDocuments = docStats.total_documents || 0;
      }

      // Calculate documents this month as a portion of total
      const documentsThisMonth = Math.floor(totalDocuments * 0.3);

      setHubStats({
        totalDocuments,
        totalCoaches,
        documentsThisMonth
      });

    } catch (error) {
      console.error('Error fetching hub stats:', error);
      // Keep default values on error
    } finally {
      setStatsLoading(false);
    }
  };

  // Fetch stats on component mount
  useEffect(() => {
    fetchHubStats();
  }, []);

  // Refresh stats when returning to hub view
  useEffect(() => {
    if (currentView === 'hub') {
      fetchHubStats();
    }
  }, [currentView]);

  const navigateTo = (view: ViewType) => {
    setCurrentView(view);
  };

  const renderCurrentView = () => {
    switch (currentView) {
      case 'documents':
        return <DocumentHub onBack={() => setCurrentView('hub')} />;
      
      case 'hub':
      default:
        return (
          <HubLanding 
            onNavigate={navigateTo} 
            stats={hubStats}
            statsLoading={statsLoading}
          />
        );
    }
  };

  return renderCurrentView();
};

// Landing page component
const HubLanding: React.FC<{ 
  onNavigate: (view: ViewType) => void;
  stats: HubStats;
  statsLoading: boolean;
}> = ({ onNavigate, stats, statsLoading }) => {
  
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Communication Hub</h1>
          <p className="text-gray-600">Central hub for team communication and document sharing</p>
        </div>

        {/* Feature Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          
          {/* Document Hub */}
          <button 
            onClick={() => onNavigate('documents')}
            className="block p-8 bg-white rounded-xl shadow-md hover:shadow-lg transition-all duration-300 transform hover:-translate-y-1 text-left group"
          >
            <div className="text-center">
              <div className="text-4xl mb-4 text-blue-500 group-hover:text-blue-600 transition-colors">
                <FileText className="h-12 w-12 mx-auto" />
              </div>
              <h2 className="text-xl font-bold mb-3 text-gray-800 group-hover:text-gray-900">Document Hub</h2>
              <p className="text-gray-600 group-hover:text-gray-700">
                Share course certificates, forms, meeting notes and resources with coaches
              </p>
              {!statsLoading && stats.totalDocuments > 0 && (
                <div className="mt-4 text-sm text-blue-600 font-medium">
                  {stats.totalDocuments} document{stats.totalDocuments !== 1 ? 's' : ''} available
                </div>
              )}
            </div>
          </button>
        </div>

        {/* Quick Stats */}
        <div className="mt-12 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Overview</h2>
          
          {statsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="text-center p-4 bg-gray-50 rounded-lg">
                  <div className="h-8 bg-gray-200 rounded animate-pulse mb-2"></div>
                  <div className="h-4 bg-gray-200 rounded animate-pulse"></div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              
              <div className="text-center p-4 bg-green-50 rounded-lg hover:bg-green-100 transition-colors">
                <div className="text-2xl font-bold text-green-600">
                  {stats.totalCoaches}
                </div>
                <div className="text-sm text-green-800">
                  Active Coach{stats.totalCoaches !== 1 ? 'es' : ''}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CommunicationHub;