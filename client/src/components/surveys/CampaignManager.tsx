import React, { useState, useEffect } from 'react';
import { Alert, AlertDescription } from '../ui/alert';

interface SurveyTemplate {
  id: number;
  name: string;
  question_count: number;
}

interface TeachingPeriod {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
}

interface TennisGroup {
  id: number;
  name: string;
  description?: string;
}

interface Coach {
  id: number;
  name: string;
  email: string;
}

interface Campaign {
  id: number;
  name: string;
  template_name: string;
  status: string;
  trigger_type: string;
  total_recipients: number;
  emails_sent: number;
  emails_delivered: number;
  responses_received: number;
  response_rate: number;
  scheduled_send_date?: string;
  actual_send_date?: string;
  created_at: string;
  created_by: string;
  teaching_period?: string;
  group?: string;
}

interface RecipientPreview {
  total_eligible: number;
  after_opt_outs: number;
  after_frequency_limits: number;
  final_recipients: number;
  sample_recipients: Array<{
    email: string;
    recipient_name: string;
    student_name: string;
  }>;
  opt_out_count: number;
  frequency_blocked_count: number;
}

interface CampaignManagerProps {
  clubId: number;
  onCreateCampaign: () => void;
  onViewCampaign: (campaignId: number) => void;
}

const CampaignManager: React.FC<CampaignManagerProps> = ({ 
  clubId, 
  onViewCampaign 
}) => {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [templates, setTemplates] = useState<SurveyTemplate[]>([]);
  const [teachingPeriods, setTeachingPeriods] = useState<TeachingPeriod[]>([]);
  const [groups, setGroups] = useState<TennisGroup[]>([]);
  const [coaches, setCoaches] = useState<Coach[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [recipientPreview, setRecipientPreview] = useState<RecipientPreview | null>(null);
  const [sendingCampaign, setSendingCampaign] = useState<number | null>(null);

  // Create campaign form state
  const [newCampaign, setNewCampaign] = useState({
    name: '',
    template_id: '',
    trigger_type: 'manual',
    teaching_period_id: '',
    group_id: '',
    coach_id: '',
    scheduled_send_date: '',
    close_date: ''
  });

  useEffect(() => {
    fetchCampaigns();
    fetchTemplates();
    fetchTeachingPeriods();
    fetchGroups();
    fetchCoaches();
  }, [clubId]);

  const fetchCampaigns = async () => {
    try {
      const response = await fetch(`/api/clubs/${clubId}/survey-campaigns`);
      if (response.ok) {
        const data = await response.json();
        setCampaigns(data.campaigns);
      } else {
        throw new Error('Failed to fetch campaigns');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const fetchTemplates = async () => {
    try {
      const response = await fetch(`/api/clubs/${clubId}/survey-templates`);
      if (response.ok) {
        const data = await response.json();
        setTemplates(data.templates);
      }
    } catch (err) {
      console.error('Failed to fetch templates:', err);
    }
  };

  const fetchTeachingPeriods = async () => {
    try {
      const response = await fetch(`/clubs/api/teaching-periods`);
      if (response.ok) {
        const data = await response.json();
        setTeachingPeriods(data);
      }
    } catch (err) {
      console.error('Failed to fetch teaching periods:', err);
    }
  };

  const fetchGroups = async () => {
    try {
      const response = await fetch(`/clubs/api/groups`);
      if (response.ok) {
        const data = await response.json();
        setGroups(data);
      }
    } catch (err) {
      console.error('Failed to fetch groups:', err);
    }
  };

  const fetchCoaches = async () => {
    try {
      const response = await fetch(`/clubs/api/coaches`);
      if (response.ok) {
        const data = await response.json();
        setCoaches(data);
      }
    } catch (err) {
      console.error('Failed to fetch coaches:', err);
    }
  };

  const previewRecipients = async () => {
    if (!newCampaign.template_id) {
      setError('Please select a template first');
      return;
    }

    try {
      // First create a draft campaign
      const response = await fetch(`/api/clubs/${clubId}/survey-campaigns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newCampaign,
          name: newCampaign.name || 'Preview Campaign',
          generate_recipients: false
        })
      });

      if (response.ok) {
        const data = await response.json();
        const campaignId = data.campaign_id;

        // Now preview recipients
        const previewResponse = await fetch(`/api/survey-campaigns/${campaignId}/preview-recipients`, {
          method: 'POST'
        });

        if (previewResponse.ok) {
          const previewData = await previewResponse.json();
          setRecipientPreview(previewData);
          setShowPreview(true);
        }

        // Clean up the draft campaign
        await fetch(`/api/survey-campaigns/${campaignId}`, {
          method: 'DELETE'
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to preview recipients');
    }
  };

  const createCampaign = async () => {
    if (!newCampaign.name.trim() || !newCampaign.template_id) {
      setError('Campaign name and template are required');
      return;
    }

    setCreating(true);
    try {
      const response = await fetch(`/api/clubs/${clubId}/survey-campaigns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newCampaign,
          generate_recipients: true
        })
      });

      if (response.ok) {
        await fetchCampaigns();
        setShowCreateModal(false);
        setNewCampaign({
          name: '',
          template_id: '',
          trigger_type: 'manual',
          teaching_period_id: '',
          group_id: '',
          coach_id: '',
          scheduled_send_date: '',
          close_date: ''
        });
      } else {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create campaign');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setCreating(false);
    }
  };

  const sendCampaign = async (campaignId: number, immediately: boolean = true) => {
    setSendingCampaign(campaignId);
    try {
      const response = await fetch(`/api/survey-campaigns/${campaignId}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ send_immediately: immediately })
      });

      if (response.ok) {
        await fetchCampaigns();
      } else {
        const data = await response.json();
        throw new Error(data.error || 'Failed to send campaign');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSendingCampaign(null);
    }
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

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="flex justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Survey Campaigns</h2>
          <p className="text-gray-600">Create and manage survey campaigns</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          Create Campaign
        </button>
      </div>

      {error && (
        <Alert className="border-red-200 bg-red-50">
          <AlertDescription className="text-red-700">
            {error}
          </AlertDescription>
        </Alert>
      )}

      {/* Campaigns List */}
      {campaigns.length === 0 ? (
        <div className="text-center py-12">
          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
          <h3 className="mt-2 text-sm font-medium text-gray-900">No campaigns yet</h3>
          <p className="mt-1 text-sm text-gray-500">Create your first survey campaign to start collecting feedback</p>
          <div className="mt-6">
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Create Campaign
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {campaigns.map((campaign) => (
            <div key={campaign.id} className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center space-x-3 mb-2">
                    <h3 className="text-lg font-semibold text-gray-900">{campaign.name}</h3>
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(campaign.status)}`}>
                      {campaign.status}
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-gray-600 mb-4">
                    <div>
                      <span className="font-medium">Template:</span> {campaign.template_name}
                    </div>
                    <div>
                      <span className="font-medium">Recipients:</span> {campaign.total_recipients}
                    </div>
                    <div>
                      <span className="font-medium">Responses:</span> {campaign.responses_received}
                    </div>
                    <div>
                      <span className="font-medium">Response Rate:</span> {campaign.response_rate}%
                    </div>
                  </div>

                  {campaign.teaching_period && (
                    <div className="text-sm text-gray-500 mb-2">
                      Period: {campaign.teaching_period}
                      {campaign.group && ` • Group: ${campaign.group}`}
                    </div>
                  )}

                  <div className="text-sm text-gray-500">
                    Created {formatDate(campaign.created_at)} by {campaign.created_by}
                    {campaign.actual_send_date && (
                      <span> • Sent {formatDate(campaign.actual_send_date)}</span>
                    )}
                  </div>
                </div>

                <div className="flex space-x-2 ml-4">
                  {campaign.status === 'draft' && (
                    <button
                      onClick={() => sendCampaign(campaign.id)}
                      disabled={sendingCampaign === campaign.id}
                      className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700 disabled:bg-gray-400"
                    >
                      {sendingCampaign === campaign.id ? 'Sending...' : 'Send Now'}
                    </button>
                  )}
                  <button
                    onClick={() => onViewCampaign(campaign.id)}
                    className="px-3 py-1 border border-gray-300 text-gray-700 rounded text-sm hover:bg-gray-50"
                  >
                    View Details
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Campaign Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full mx-4 max-h-screen overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-medium text-gray-900">Create Survey Campaign</h3>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Campaign Name *
                </label>
                <input
                  type="text"
                  value={newCampaign.name}
                  onChange={(e) => setNewCampaign(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., Spring 2025 End of Term Feedback"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Survey Template *
                </label>
                <select
                  value={newCampaign.template_id}
                  onChange={(e) => setNewCampaign(prev => ({ ...prev, template_id: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select a template</option>
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name} ({template.question_count} questions)
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Teaching Period (Optional)
                  </label>
                  <select
                    value={newCampaign.teaching_period_id}
                    onChange={(e) => setNewCampaign(prev => ({ ...prev, teaching_period_id: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">All periods</option>
                    {teachingPeriods.map((period) => (
                      <option key={period.id} value={period.id}>
                        {period.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Group (Optional)
                  </label>
                  <select
                    value={newCampaign.group_id}
                    onChange={(e) => setNewCampaign(prev => ({ ...prev, group_id: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">All groups</option>
                    {groups.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Coach (Optional)
                </label>
                <select
                  value={newCampaign.coach_id}
                  onChange={(e) => setNewCampaign(prev => ({ ...prev, coach_id: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All coaches</option>
                  {coaches.map((coach) => (
                    <option key={coach.id} value={coach.id}>
                      {coach.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Scheduled Send Date (Optional)
                  </label>
                  <input
                    type="datetime-local"
                    value={newCampaign.scheduled_send_date}
                    onChange={(e) => setNewCampaign(prev => ({ ...prev, scheduled_send_date: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Close Date (Optional)
                  </label>
                  <input
                    type="datetime-local"
                    value={newCampaign.close_date}
                    onChange={(e) => setNewCampaign(prev => ({ ...prev, close_date: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="flex justify-between pt-4">
                <button
                  onClick={previewRecipients}
                  disabled={!newCampaign.template_id}
                  className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Preview Recipients
                </button>
                
                <div className="flex space-x-3">
                  <button
                    onClick={() => setShowCreateModal(false)}
                    className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={createCampaign}
                    disabled={creating || !newCampaign.name.trim() || !newCampaign.template_id}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400"
                  >
                    {creating ? 'Creating...' : 'Create Campaign'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Recipient Preview Modal */}
      {showPreview && recipientPreview && (
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full mx-4 max-h-screen overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-medium text-gray-900">Recipient Preview</h3>
                <button
                  onClick={() => setShowPreview(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="p-6">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="bg-blue-50 p-3 rounded">
                    <div className="font-medium text-blue-900">Total Eligible</div>
                    <div className="text-blue-800">{recipientPreview.total_eligible}</div>
                  </div>
                  <div className="bg-green-50 p-3 rounded">
                    <div className="font-medium text-green-900">Final Recipients</div>
                    <div className="text-green-800">{recipientPreview.final_recipients}</div>
                  </div>
                  <div className="bg-yellow-50 p-3 rounded">
                    <div className="font-medium text-yellow-900">Opted Out</div>
                    <div className="text-yellow-800">{recipientPreview.opt_out_count}</div>
                  </div>
                  <div className="bg-red-50 p-3 rounded">
                    <div className="font-medium text-red-900">Frequency Limited</div>
                    <div className="text-red-800">{recipientPreview.frequency_blocked_count}</div>
                  </div>
                </div>

                {recipientPreview.sample_recipients.length > 0 && (
                  <div>
                    <h4 className="font-medium text-gray-900 mb-2">Sample Recipients</h4>
                    <div className="bg-gray-50 rounded p-3 text-sm space-y-1">
                      {recipientPreview.sample_recipients.slice(0, 5).map((recipient, index) => (
                        <div key={index} className="flex justify-between">
                          <span>{recipient.recipient_name}</span>
                          <span className="text-gray-500">{recipient.student_name}</span>
                        </div>
                      ))}
                      {recipientPreview.sample_recipients.length > 5 && (
                        <div className="text-gray-500 italic">
                          ...and {recipientPreview.sample_recipients.length - 5} more
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end pt-4">
                <button
                  onClick={() => setShowPreview(false)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CampaignManager;