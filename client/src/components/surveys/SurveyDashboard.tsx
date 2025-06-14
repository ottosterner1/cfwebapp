import React, { useState, useEffect } from 'react';
import { Alert, AlertDescription } from '../ui/alert';
import ComplianceSetup from './ComplianceSetup';
import TemplateManager from './TemplateManager';
import TemplateEditor from './TemplateEditor';
import CampaignManager from './CampaignManager';
import SurveyResults from './SurveyResults';

interface DashboardStats {
  surveys_enabled: boolean;
  compliance_status?: number;
  pending_compliance?: boolean;
  stats?: {
    total_templates: number;
    total_campaigns: number;
    active_campaigns: number;
    recent_responses: number;
    total_responses: number;
    opt_out_count: number;
  };
  recent_campaigns?: Array<{
    id: number;
    name: string;
    status: string;
    template_name: string;
    total_recipients: number;
    responses_received: number;
    response_rate: number;
    created_at: string;
    actual_send_date?: string;
  }>;
}

interface SurveyDashboardProps {
  clubId: number;
  clubName: string;
}

const SurveyDashboard: React.FC<SurveyDashboardProps> = ({ clubId, clubName }) => {
  const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<'dashboard' | 'compliance' | 'templates' | 'template-editor' | 'campaigns' | 'results'>('dashboard');
  const [editingTemplate, setEditingTemplate] = useState<number | null>(null);
  const [viewingCampaign, setViewingCampaign] = useState<number | null>(null);

  useEffect(() => {
    checkComplianceAndFetchData();
  }, [clubId]);

  const checkComplianceAndFetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // First check compliance status
      const complianceResponse = await fetch(`/api/clubs/${clubId}/compliance/status`);
      
      if (complianceResponse.ok) {
        const complianceData = await complianceResponse.json();
        
        if (!complianceData.compliance.surveys_enabled) {
          // Surveys not enabled - show compliance setup
          setDashboardStats({
            surveys_enabled: false,
            compliance_status: complianceData.compliance.compliance_percentage,
            pending_compliance: true
          });
          setCurrentView('compliance');
          setLoading(false);
          return;
        }
        
        // Surveys are enabled - fetch dashboard stats
        await fetchDashboardStats();
      } else {
        throw new Error('Failed to check compliance status');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setLoading(false);
    }
  };

  const fetchDashboardStats = async () => {
    try {
      // Try to get dashboard stats from the clubs route (which might exist)
      const response = await fetch(`/api/clubs/${clubId}/survey-dashboard`);
      
      if (response.ok) {
        const data = await response.json();
        setDashboardStats(data);
      } else if (response.status === 404) {
        // Route doesn't exist - create basic enabled stats
        setDashboardStats({
          surveys_enabled: true,
          stats: {
            total_templates: 0,
            total_campaigns: 0,
            active_campaigns: 0,
            recent_responses: 0,
            total_responses: 0,
            opt_out_count: 0
          },
          recent_campaigns: []
        });
      } else {
        throw new Error('Failed to fetch dashboard stats');
      }
    } catch (err) {
      // If dashboard stats fail, still show enabled state with zero stats
      console.warn('Dashboard stats failed, showing basic enabled state:', err);
      setDashboardStats({
        surveys_enabled: true,
        stats: {
          total_templates: 0,
          total_campaigns: 0,
          active_campaigns: 0,
          recent_responses: 0,
          total_responses: 0,
          opt_out_count: 0
        },
        recent_campaigns: []
      });
    } finally {
      setLoading(false);
    }
  };

  const handleComplianceComplete = () => {
    // Refresh data when compliance is completed
    checkComplianceAndFetchData();
    setCurrentView('dashboard');
  };

  const handleCreateTemplate = () => {
    setEditingTemplate(null);
    setCurrentView('template-editor');
  };

  const handleEditTemplate = (templateId: number) => {
    setEditingTemplate(templateId);
    setCurrentView('template-editor');
  };

  const handleTemplateSaved = () => {
    setCurrentView('templates');
    setEditingTemplate(null);
    checkComplianceAndFetchData(); // Refresh stats
  };

  const handleCreateCampaign = () => {
    setCurrentView('campaigns');
  };

  const handleViewCampaign = (campaignId: number) => {
    setViewingCampaign(campaignId);
    setCurrentView('results');
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'draft': return 'bg-gray-100 text-gray-800';
      case 'active': return 'bg-blue-100 text-blue-800';
      case 'completed': return 'bg-green-100 text-green-800';
      case 'paused': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // Show compliance setup if surveys not enabled
  if (!dashboardStats?.surveys_enabled && currentView === 'compliance') {
    return (
      <ComplianceSetup 
        clubId={clubId} 
        clubName={clubName}
        onComplete={handleComplianceComplete}
      />
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      {/* Navigation - Only show if surveys are enabled */}
      {dashboardStats?.surveys_enabled && (
        <div className="mb-8">
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-8">
              {[
                { key: 'dashboard', label: 'Overview', icon: '📊' },
                { key: 'templates', label: 'Templates', icon: '📝' },
                { key: 'campaigns', label: 'Campaigns', icon: '📤' },
                { key: 'results', label: 'Results', icon: '📈' }
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setCurrentView(tab.key as typeof currentView)}
                  className={`py-2 px-1 border-b-2 font-medium text-sm ${
                    currentView === tab.key
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <span className="mr-2">{tab.icon}</span>
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>
        </div>
      )}

      {error && (
        <Alert className="mb-6 border-red-200 bg-red-50">
          <AlertDescription className="text-red-700">
            {error}
          </AlertDescription>
        </Alert>
      )}

      {/* Content */}
      {currentView === 'dashboard' && dashboardStats && dashboardStats.surveys_enabled && (
        <div className="space-y-8">
          {/* Header */}
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Survey Dashboard</h1>
            <p className="text-gray-600 mt-2">Manage feedback surveys for {clubName}</p>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <svg className="h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div className="ml-4">
                  <h3 className="text-lg font-semibold text-gray-900">
                    {dashboardStats.stats?.total_templates || 0}
                  </h3>
                  <p className="text-sm text-gray-600">Templates</p>
                </div>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                </div>
                <div className="ml-4">
                  <h3 className="text-lg font-semibold text-gray-900">
                    {dashboardStats.stats?.total_campaigns || 0}
                  </h3>
                  <p className="text-sm text-gray-600">Campaigns</p>
                </div>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <svg className="h-8 w-8 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                <div className="ml-4">
                  <h3 className="text-lg font-semibold text-gray-900">
                    {dashboardStats.stats?.recent_responses || 0}
                  </h3>
                  <p className="text-sm text-gray-600">Recent Responses</p>
                  <p className="text-xs text-gray-500">Last 30 days</p>
                </div>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <svg className="h-8 w-8 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="ml-4">
                  <h3 className="text-lg font-semibold text-gray-900">
                    {dashboardStats.stats?.active_campaigns || 0}
                  </h3>
                  <p className="text-sm text-gray-600">Active Campaigns</p>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <button
                onClick={() => setCurrentView('template-editor')}
                className="p-4 border border-gray-300 rounded-lg hover:bg-gray-50 text-left"
              >
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <svg className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <h4 className="font-medium text-gray-900">Create Template</h4>
                    <p className="text-sm text-gray-600">Build a new survey template</p>
                  </div>
                </div>
              </button>

              <button
                onClick={() => setCurrentView('campaigns')}
                className="p-4 border border-gray-300 rounded-lg hover:bg-gray-50 text-left"
              >
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <h4 className="font-medium text-gray-900">Send Survey</h4>
                    <p className="text-sm text-gray-600">Create and send a campaign</p>
                  </div>
                </div>
              </button>

              <button
                onClick={() => setCurrentView('results')}
                className="p-4 border border-gray-300 rounded-lg hover:bg-gray-50 text-left"
              >
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <svg className="h-6 w-6 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <h4 className="font-medium text-gray-900">View Results</h4>
                    <p className="text-sm text-gray-600">Analyze survey responses</p>
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Recent Campaigns */}
          {dashboardStats.recent_campaigns && dashboardStats.recent_campaigns.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-lg">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">Recent Campaigns</h3>
              </div>
              <div className="p-6">
                <div className="space-y-4">
                  {dashboardStats.recent_campaigns.slice(0, 5).map((campaign) => (
                    <div key={campaign.id} className="flex justify-between items-center p-4 border border-gray-200 rounded-lg">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3 mb-1">
                          <h4 className="font-medium text-gray-900">{campaign.name}</h4>
                          <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(campaign.status)}`}>
                            {campaign.status}
                          </span>
                        </div>
                        <div className="text-sm text-gray-600">
                          {campaign.template_name} • {campaign.responses_received}/{campaign.total_recipients} responses ({campaign.response_rate}%)
                        </div>
                        <div className="text-xs text-gray-500">
                          Created {formatDate(campaign.created_at)}
                          {campaign.actual_send_date && ` • Sent ${formatDate(campaign.actual_send_date)}`}
                        </div>
                      </div>
                      <button
                        onClick={() => handleViewCampaign(campaign.id)}
                        className="px-3 py-1 text-sm border border-gray-300 rounded text-gray-700 hover:bg-gray-50"
                      >
                        View
                      </button>
                    </div>
                  ))}
                </div>
                {dashboardStats.recent_campaigns.length > 5 && (
                  <div className="mt-4 text-center">
                    <button
                      onClick={() => setCurrentView('campaigns')}
                      className="text-sm text-blue-600 hover:text-blue-800"
                    >
                      View all campaigns →
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Compliance Status */}
          <div className="bg-green-50 border border-green-200 rounded-lg p-6">
            <div className="flex items-center">
              <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-green-800">GDPR Compliant</h3>
                <p className="text-sm text-green-700">
                  Survey feature is fully compliant and ready to use.
                </p>
              </div>
              <div className="ml-auto">
                <button
                  onClick={() => setCurrentView('compliance')}
                  className="text-sm text-green-600 hover:text-green-800"
                >
                  Review Settings
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {currentView === 'compliance' && (
        <ComplianceSetup 
          clubId={clubId} 
          clubName={clubName}
          onComplete={handleComplianceComplete}
        />
      )}

      {currentView === 'templates' && dashboardStats?.surveys_enabled && (
        <TemplateManager
          clubId={clubId}
          onEditTemplate={handleEditTemplate}
          onCreateTemplate={handleCreateTemplate}
        />
      )}

      {currentView === 'template-editor' && dashboardStats?.surveys_enabled && (
        <TemplateEditor
          clubId={clubId}
          templateId={editingTemplate || undefined}
          onSave={handleTemplateSaved}
          onCancel={() => setCurrentView('templates')}
        />
      )}

      {currentView === 'campaigns' && dashboardStats?.surveys_enabled && (
        <CampaignManager
          clubId={clubId}
          onCreateCampaign={handleCreateCampaign}
          onViewCampaign={handleViewCampaign}
        />
      )}

      {currentView === 'results' && dashboardStats?.surveys_enabled && (
        <SurveyResults
          clubId={clubId}
          campaignId={viewingCampaign || undefined}
        />
      )}
    </div>
  );
};

export default SurveyDashboard;