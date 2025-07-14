import React, { useState, useEffect } from 'react';
import { 
  Building, Plus, Edit2, Mail, CheckCircle, 
  AlertCircle, Clock, RefreshCw, Save, X, ChevronDown, ChevronUp,
  Crown, Calendar, Pause, RotateCcw, XCircle,
} from 'lucide-react';

interface Organisation {
  id: number;
  name: string;
  slug: string;
  sender_email?: string;
  email_verified: boolean;
  club_count: number;
  admin_count: number;
  template_count: number;
  created_at?: string;
  clubs?: TennisClub[]; // Make clubs optional since it might not be in the response
  // Subscription fields
  subscription_status: 'TRIAL' | 'ACTIVE' | 'EXPIRED' | 'SUSPENDED';
  access_level: string;
  trial_end_date?: string;
  days_remaining: number;
  user_count: number;
  status_message: string;
  manually_activated_at?: string;
  has_access: boolean;
  admin_notes?: string;
}

interface TennisClub {
  id: number;
  name: string;
  subdomain: string;
  created_at?: string;
  user_count: number;
}

interface EmailStatus {
  status: string;
  is_verified: boolean;
  is_pending: boolean;
  error?: string;
}

interface SubscriptionStats {
  total: number;
  trial: number;
  active: number;
  expired: number;
  suspended: number;
}

interface Notification {
  type: 'success' | 'error' | 'warning';
  message: string;
}

interface OrganisationManagementProps {
  onNotification: (notification: Notification) => void;
}

const OrganisationManagement: React.FC<OrganisationManagementProps> = ({ onNotification }) => {
  const [organisations, setOrganisations] = useState<Organisation[]>([]);
  const [subscriptionStats, setSubscriptionStats] = useState<SubscriptionStats>({
    total: 0, trial: 0, active: 0, expired: 0, suspended: 0
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  
  // Create/Edit organisation state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingOrg, setEditingOrg] = useState<Organisation | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    sender_email: ''
  });
  
  // Email management state
  const [emailStatuses, setEmailStatuses] = useState<Record<number, EmailStatus>>({});
  const [isVerifying, setIsVerifying] = useState<Record<number, boolean>>({});
  const [expandedOrg, setExpandedOrg] = useState<number | null>(null);
  const [expandedOrgDetails, setExpandedOrgDetails] = useState<Record<number, any>>({});

  // Helper to set action loading state
  const setActionLoadingState = (orgId: number, action: string, isLoading: boolean) => {
    setActionLoading(prev => ({
      ...prev,
      [`${orgId}-${action}`]: isLoading
    }));
  };

  // Toggle expanded org details
  const toggleExpandedOrg = async (e: React.MouseEvent, orgId: number) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (expandedOrg === orgId) {
      setExpandedOrg(null);
      return;
    }
    
    setExpandedOrg(orgId);
    
    // Fetch detailed org data if not already loaded
    if (!expandedOrgDetails[orgId]) {
      try {
        const response = await fetch(`/api/organisations/${orgId}`, {
          credentials: 'include',
          headers: {
            'Accept': 'application/json',
            'X-Requested-With': 'XMLHttpRequest'
          }
        });
        
        if (response.ok) {
          const orgDetails = await response.json();
          setExpandedOrgDetails(prev => ({
            ...prev,
            [orgId]: orgDetails
          }));
        }
      } catch (error) {
        console.error('Error fetching org details:', error);
      }
    }
  };

  // Fetch organisations with subscription data
  const fetchOrganisations = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/clubs/api/super-admin/subscriptions', {
        credentials: 'include',
        headers: {
          'Accept': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setOrganisations(Array.isArray(data.organisations) ? data.organisations : []);
        setSubscriptionStats(data.stats || {
          total: 0, trial: 0, active: 0, expired: 0, suspended: 0
        });
        
        // Fetch email statuses for organizations with sender emails
        const statusPromises = data.organisations
          .filter((org: Organisation) => org.sender_email)
          .map((org: Organisation) => fetchEmailStatus(org.id));
        
        await Promise.all(statusPromises);
      } else {
        onNotification({
          type: 'error',
          message: 'Failed to fetch organisations'
        });
      }
    } catch (error) {
      console.error('Error fetching organisations:', error);
      onNotification({
        type: 'error',
        message: 'Network error while loading organisations'
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch email verification status
  const fetchEmailStatus = async (orgId: number) => {
    try {
      const response = await fetch(`/api/organisations/${orgId}/verification-status`, {
        credentials: 'include',
        headers: {
          'Accept': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        }
      });
      
      if (response.ok) {
        const status = await response.json() as EmailStatus;
        setEmailStatuses(prev => ({
          ...prev,
          [orgId]: status
        }));
      }
    } catch (error) {
      console.error(`Error fetching email status for org ${orgId}:`, error);
    }
  };

  // Subscription Management Actions
  const handleActivate = async (e: React.MouseEvent, orgId: number, orgName: string) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!confirm(`Activate subscription for "${orgName}"?`)) return;

    setActionLoadingState(orgId, 'activate', true);
    try {
      const response = await fetch(`/clubs/api/super-admin/organisations/${orgId}/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notes: 'Manually activated by super admin'
        })
      });

      if (response.ok) {
        await fetchOrganisations();
        onNotification({
          type: 'success',
          message: `${orgName} activated successfully!`
        });
      } else {
        const error = await response.json();
        onNotification({
          type: 'error',
          message: error.error || 'Failed to activate organisation'
        });
      }
    } catch (error) {
      onNotification({
        type: 'error',
        message: 'Error activating organisation'
      });
    } finally {
      setActionLoadingState(orgId, 'activate', false);
    }
  };

  const handleExtendTrial = async (e: React.MouseEvent, orgId: number, orgName: string) => {
    e.preventDefault();
    e.stopPropagation();
    
    const days = prompt(`Extend trial for "${orgName}" by how many days?`, '30');
    if (!days || isNaN(Number(days)) || Number(days) <= 0) return;

    setActionLoadingState(orgId, 'extend', true);
    try {
      const response = await fetch(`/clubs/api/super-admin/organisations/${orgId}/extend-trial`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: parseInt(days) })
      });

      if (response.ok) {
        await fetchOrganisations();
        onNotification({
          type: 'success',
          message: `Trial extended by ${days} days!`
        });
      } else {
        const error = await response.json();
        onNotification({
          type: 'error',
          message: error.error || 'Failed to extend trial'
        });
      }
    } catch (error) {
      onNotification({
        type: 'error',
        message: 'Error extending trial'
      });
    } finally {
      setActionLoadingState(orgId, 'extend', false);
    }
  };

  const handleSuspend = async (e: React.MouseEvent, orgId: number, orgName: string) => {
    e.preventDefault();
    e.stopPropagation();
    
    const reason = prompt(`Suspend "${orgName}"? Enter reason:`, 'Administrative action');
    if (!reason) return;

    setActionLoadingState(orgId, 'suspend', true);
    try {
      const response = await fetch(`/clubs/api/super-admin/organisations/${orgId}/suspend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason })
      });

      if (response.ok) {
        await fetchOrganisations();
        onNotification({
          type: 'success',
          message: `${orgName} suspended!`
        });
      } else {
        const error = await response.json();
        onNotification({
          type: 'error',
          message: error.error || 'Failed to suspend organisation'
        });
      }
    } catch (error) {
      onNotification({
        type: 'error',
        message: 'Error suspending organisation'
      });
    } finally {
      setActionLoadingState(orgId, 'suspend', false);
    }
  };

  const handleReactivate = async (e: React.MouseEvent, orgId: number, orgName: string) => {
    e.preventDefault();
    e.stopPropagation();
    
    const reactivateAs = confirm(`Reactivate "${orgName}" as ACTIVE subscription?\n\nOK = Active subscription\nCancel = 30-day trial`) ? 'active' : 'trial';

    setActionLoadingState(orgId, 'reactivate', true);
    try {
      const response = await fetch(`/clubs/api/super-admin/organisations/${orgId}/reactivate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          reactivate_as: reactivateAs,
          trial_days: reactivateAs === 'trial' ? 30 : undefined,
          notes: `Reactivated as ${reactivateAs} by super admin`
        })
      });

      if (response.ok) {
        await fetchOrganisations();
        onNotification({
          type: 'success',
          message: `${orgName} reactivated as ${reactivateAs}!`
        });
      } else {
        const error = await response.json();
        onNotification({
          type: 'error',
          message: error.error || 'Failed to reactivate organisation'
        });
      }
    } catch (error) {
      onNotification({
        type: 'error',
        message: 'Error reactivating organisation'
      });
    } finally {
      setActionLoadingState(orgId, 'reactivate', false);
    }
  };

  // Handle form submission for creating/editing orgs
  const handleSubmit = async () => {
    
    if (!formData.name.trim() || !formData.slug.trim()) {
      onNotification({
        type: 'error',
        message: 'Name and slug are required'
      });
      return;
    }
    
    setIsActionLoading(true);
    
    try {
      const url = editingOrg 
        ? `/api/organisations/${editingOrg.id}` 
        : '/api/organisations/';
      
      const response = await fetch(url, {
        method: editingOrg ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: JSON.stringify({
          name: formData.name,
          slug: formData.slug,
          sender_email: formData.sender_email || null
        }),
        credentials: 'include'
      });
      
      if (response.ok) {
        const data = await response.json();
        onNotification({
          type: 'success',
          message: data.message || `Organisation ${editingOrg ? 'updated' : 'created'} successfully`
        });
        
        resetForm();
        fetchOrganisations();
      } else {
        const errorData = await response.json();
        onNotification({
          type: 'error',
          message: errorData.error || `Failed to ${editingOrg ? 'update' : 'create'} organisation`
        });
      }
    } catch (error) {
      console.error('Error saving organisation:', error);
      onNotification({
        type: 'error',
        message: 'Network error while saving organisation'
      });
    } finally {
      setIsActionLoading(false);
    }
  };

  // Send verification email
  const handleSendVerification = async (e: React.MouseEvent, orgId: number) => {
    e.preventDefault();
    e.stopPropagation();
    
    setIsVerifying(prev => ({ ...prev, [orgId]: true }));
    
    try {
      const response = await fetch(`/api/organisations/${orgId}/send-verification`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Accept': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        onNotification({
          type: 'success',
          message: data.message
        });
        
        // Refresh email status
        fetchEmailStatus(orgId);
      } else {
        const errorData = await response.json();
        onNotification({
          type: 'error',
          message: errorData.error || 'Failed to send verification email'
        });
      }
    } catch (error) {
      console.error('Error sending verification:', error);
      onNotification({
        type: 'error',
        message: 'Network error while sending verification'
      });
    } finally {
      setIsVerifying(prev => ({ ...prev, [orgId]: false }));
    }
  };

  // Reset form
  const resetForm = () => {
    setFormData({ name: '', slug: '', sender_email: '' });
    setShowCreateForm(false);
    setEditingOrg(null);
  };

  // Start editing
  const startEditing = (e: React.MouseEvent, org: Organisation) => {
    e.preventDefault();
    e.stopPropagation();
    
    setEditingOrg(org);
    setFormData({
      name: org.name,
      slug: org.slug,
      sender_email: org.sender_email || ''
    });
    setShowCreateForm(true);
  };

  // Auto-generate slug from name
  const handleNameChange = (name: string) => {
    setFormData(prev => ({
      ...prev,
      name,
      slug: editingOrg ? prev.slug : name.toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
    }));
  };

  // Get subscription status badge
  const getSubscriptionStatusBadge = (org: Organisation) => {
    const statusConfig = {
      TRIAL: { 
        bg: 'bg-blue-100', 
        text: 'text-blue-800', 
        icon: Clock,
        label: 'Trial'
      },
      ACTIVE: { 
        bg: 'bg-green-100', 
        text: 'text-green-800', 
        icon: CheckCircle,
        label: 'Active'
      },
      EXPIRED: { 
        bg: 'bg-red-100', 
        text: 'text-red-800', 
        icon: XCircle,
        label: 'Expired'
      },
      SUSPENDED: { 
        bg: 'bg-gray-100', 
        text: 'text-gray-800', 
        icon: Pause,
        label: 'Suspended'
      }
    };

    const config = statusConfig[org.subscription_status] || statusConfig.EXPIRED;
    const IconComponent = config.icon;

    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.bg} ${config.text}`}>
        <IconComponent className="w-3 h-3 mr-1" />
        {config.label}
        {org.subscription_status === 'TRIAL' && org.days_remaining > 0 && (
          <span className="ml-1">({org.days_remaining}d)</span>
        )}
      </span>
    );
  };

  // Get email status badge
  const getEmailStatusBadge = (orgId: number, senderEmail?: string) => {
    if (!senderEmail) {
      return (
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
          No Email Set
        </span>
      );
    }

    const status = emailStatuses[orgId];
    if (!status) {
      return (
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
          <Clock className="w-3 h-3 mr-1" />
          Checking...
        </span>
      );
    }

    if (status.is_verified) {
      return (
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
          <CheckCircle className="w-3 h-3 mr-1" />
          Verified
        </span>
      );
    }

    if (status.is_pending) {
      return (
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
          <Clock className="w-3 h-3 mr-1" />
          Pending
        </span>
      );
    }

    return (
      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
        <AlertCircle className="w-3 h-3 mr-1" />
        Not Verified
      </span>
    );
  };

  // Get subscription action buttons
  const getSubscriptionActionButtons = (org: Organisation) => {
    const buttons = [];
    const isLoading = (action: string) => actionLoading[`${org.id}-${action}`];

    if (org.subscription_status === 'TRIAL') {
      buttons.push(
        <button
          key="activate"
          type="button"
          onClick={(e) => handleActivate(e, org.id, org.name)}
          disabled={isLoading('activate')}
          className="inline-flex items-center px-2 py-1 border border-transparent text-xs font-medium rounded text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading('activate') ? (
            <>⏳</>
          ) : (
            <>
              <Crown className="w-3 h-3 mr-1" />
              Activate
            </>
          )}
        </button>
      );

      buttons.push(
        <button
          key="extend"
          type="button"
          onClick={(e) => handleExtendTrial(e, org.id, org.name)}
          disabled={isLoading('extend')}
          className="inline-flex items-center px-2 py-1 border border-transparent text-xs font-medium rounded text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading('extend') ? (
            <>⏳</>
          ) : (
            <>
              <Calendar className="w-3 h-3 mr-1" />
              Extend
            </>
          )}
        </button>
      );
    } else if (org.subscription_status === 'ACTIVE') {
      // Active org actions - just suspend
    } else {
      // Expired/Suspended org actions
      buttons.push(
        <button
          key="reactivate"
          type="button"
          onClick={(e) => handleReactivate(e, org.id, org.name)}
          disabled={isLoading('reactivate')}
          className="inline-flex items-center px-2 py-1 border border-transparent text-xs font-medium rounded text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading('reactivate') ? (
            <>⏳</>
          ) : (
            <>
              <RotateCcw className="w-3 h-3 mr-1" />
              Reactivate
            </>
          )}
        </button>
      );
    }

    // Always show suspend for trial/active
    if (org.subscription_status === 'TRIAL' || org.subscription_status === 'ACTIVE') {
      buttons.push(
        <button
          key="suspend"
          type="button"
          onClick={(e) => handleSuspend(e, org.id, org.name)}
          disabled={isLoading('suspend')}
          className="inline-flex items-center px-2 py-1 border border-transparent text-xs font-medium rounded text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading('suspend') ? (
            <>⏳</>
          ) : (
            <>
              <Pause className="w-3 h-3 mr-1" />
              Suspend
            </>
          )}
        </button>
      );
    }

    return buttons;
  };

  useEffect(() => {
    fetchOrganisations();
  }, []);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-32">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4 lg:space-y-6">
      {/* Header with Subscription Stats */}
      <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-lg p-4 lg:p-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <h2 className="text-lg lg:text-xl font-semibold flex items-center">
            <Building className="h-5 w-5 lg:h-6 lg:w-6 mr-2 lg:mr-3 text-indigo-600 flex-shrink-0" />
            Organisation & Subscription Management
          </h2>
          <button
            type="button"
            onClick={() => setShowCreateForm(true)}
            className="w-full sm:w-auto px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium flex items-center justify-center touch-manipulation transition-colors"
          >
            <Plus className="h-4 w-4 mr-1" />
            Create Organisation
          </button>
        </div>

        {/* Subscription Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center">
              <Building className="h-6 w-6 text-gray-400" />
              <div className="ml-3">
                <p className="text-xs font-medium text-gray-500">Total</p>
                <p className="text-lg font-semibold text-gray-900">{subscriptionStats.total}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center">
              <Clock className="h-6 w-6 text-blue-400" />
              <div className="ml-3">
                <p className="text-xs font-medium text-gray-500">Trial</p>
                <p className="text-lg font-semibold text-blue-600">{subscriptionStats.trial}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center">
              <CheckCircle className="h-6 w-6 text-green-400" />
              <div className="ml-3">
                <p className="text-xs font-medium text-gray-500">Active</p>
                <p className="text-lg font-semibold text-green-600">{subscriptionStats.active}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center">
              <XCircle className="h-6 w-6 text-red-400" />
              <div className="ml-3">
                <p className="text-xs font-medium text-gray-500">Expired</p>
                <p className="text-lg font-semibold text-red-600">{subscriptionStats.expired}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center">
              <Pause className="h-6 w-6 text-gray-400" />
              <div className="ml-3">
                <p className="text-xs font-medium text-gray-500">Suspended</p>
                <p className="text-lg font-semibold text-gray-600">{subscriptionStats.suspended}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Create/Edit Form */}
      {showCreateForm && (
        <div className="bg-white p-4 lg:p-6 rounded-lg border shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium text-lg">
              {editingOrg ? 'Edit Organisation' : 'Create New Organisation'}
            </h3>
            <button
              type="button"
              onClick={resetForm}
              className="p-2 text-gray-400 hover:text-gray-600 lg:hidden"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          
          <div className="space-y-4">
            <div className="space-y-4 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Organisation Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSubmit()}
                  className="w-full rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-base"
                  placeholder="e.g., Ace Tennis Academy"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Slug (URL identifier) *
                </label>
                <input
                  type="text"
                  value={formData.slug}
                  onChange={(e) => setFormData(prev => ({ ...prev, slug: e.target.value }))}
                  onKeyPress={(e) => e.key === 'Enter' && handleSubmit()}
                  className="w-full rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-base"
                  placeholder="e.g., ace-tennis-academy"
                />
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Sender Email (for reports)
              </label>
              <input
                type="email"
                value={formData.sender_email}
                onChange={(e) => setFormData(prev => ({ ...prev, sender_email: e.target.value }))}
                onKeyPress={(e) => e.key === 'Enter' && handleSubmit()}
                className="w-full rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-base"
                placeholder="e.g., reports@acetennisacademy.com"
              />
            </div>
            
            <div className="flex flex-col sm:flex-row justify-end gap-3 pt-4 border-t">
              <button
                type="button"
                onClick={resetForm}
                className="w-full sm:w-auto px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 font-medium touch-manipulation transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isActionLoading}
                className="w-full sm:w-auto px-4 py-2 text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:bg-indigo-400 flex items-center justify-center font-medium touch-manipulation transition-colors"
              >
                <Save className="h-4 w-4 mr-1" />
                {isActionLoading ? 'Saving...' : (editingOrg ? 'Update' : 'Create')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Organisations List */}
      <div className="space-y-4">
        {organisations.length === 0 ? (
          <div className="text-center py-12 text-gray-500 bg-white rounded-lg border">
            <Building className="mx-auto h-12 w-12 text-gray-300 mb-4" />
            <p className="text-lg font-medium mb-2">No organisations found</p>
            <p className="text-sm">Create your first organisation above.</p>
          </div>
        ) : (
          organisations.map(org => (
            <div key={org.id} className="bg-white rounded-lg border shadow-sm overflow-hidden">
              {/* Organisation Header */}
              <div className="p-4 lg:p-6">
                <div className="flex flex-col lg:flex-row lg:justify-between lg:items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-3">
                      <h3 className="font-medium text-lg text-gray-900 truncate">{org.name}</h3>
                      <span className="text-sm text-gray-500 flex-shrink-0">({org.slug})</span>
                      {getSubscriptionStatusBadge(org)}
                    </div>
                    
                    {/* Subscription Status Message */}
                    <div className="mb-3">
                      <p className="text-sm text-gray-600">{org.status_message}</p>
                      {org.trial_end_date && org.subscription_status === 'TRIAL' && (
                        <p className="text-xs text-gray-400">Trial ends: {org.trial_end_date}</p>
                      )}
                      {org.manually_activated_at && (
                        <p className="text-xs text-green-600">Activated: {org.manually_activated_at}</p>
                      )}
                    </div>
                    
                    {/* Stats - Mobile optimized */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-4 text-sm text-gray-600">
                      <div className="text-center sm:text-left">
                        <div className="font-medium text-gray-900">{org.club_count || 0}</div>
                        <div className="text-xs">Clubs</div>
                      </div>
                      <div className="text-center sm:text-left">
                        <div className="font-medium text-gray-900">{org.user_count || 0}</div>
                        <div className="text-xs">Users</div>
                      </div>
                      <div className="text-center sm:text-left">
                        <div className="font-medium text-gray-900">{org.admin_count || 0}</div>
                        <div className="text-xs">Admins</div>
                      </div>
                    </div>
                    
                    {/* Email Status */}
                    <div className="space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                        <span className="text-sm font-medium text-gray-700">Email:</span>
                        {org.sender_email ? (
                          <span className="text-sm text-gray-600 break-all">{org.sender_email}</span>
                        ) : (
                          <span className="text-sm text-gray-400">Not configured</span>
                        )}
                      </div>
                      
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                        {getEmailStatusBadge(org.id, org.sender_email)}
                        
                        {org.sender_email && !emailStatuses[org.id]?.is_verified && (
                          <button
                            type="button"
                            onClick={(e) => handleSendVerification(e, org.id)}
                            disabled={isVerifying[org.id]}
                            className="text-sm text-indigo-600 hover:text-indigo-800 flex items-center touch-manipulation"
                          >
                            {isVerifying[org.id] ? (
                              <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                            ) : (
                              <Mail className="h-3 w-3 mr-1" />
                            )}
                            {isVerifying[org.id] ? 'Sending...' : 'Send Verification'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  {/* Action buttons */}
                  <div className="flex flex-col gap-2">
                    {/* Subscription Actions */}
                    <div className="flex flex-wrap gap-1">
                      {getSubscriptionActionButtons(org)}
                    </div>
                    
                    {/* General Actions */}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={(e) => toggleExpandedOrg(e, org.id)}
                        className="px-3 py-2 text-sm text-gray-600 hover:text-gray-800 bg-gray-50 hover:bg-gray-100 rounded-lg flex items-center touch-manipulation transition-colors"
                      >
                        {expandedOrg === org.id ? (
                          <>
                            <ChevronUp className="h-4 w-4 mr-1" />
                            Hide
                          </>
                        ) : (
                          <>
                            <ChevronDown className="h-4 w-4 mr-1" />
                            Details
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => startEditing(e, org)}
                        className="p-2 text-gray-400 hover:text-gray-600 bg-gray-50 hover:bg-gray-100 rounded-lg touch-manipulation transition-colors"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Expanded Details */}
              {expandedOrg === org.id && (
                <div className="border-t border-gray-200 p-4 lg:p-6 bg-gray-50">
                  <div className="space-y-6 lg:grid lg:grid-cols-2 lg:gap-6 lg:space-y-0">
                    {/* Clubs */}
                    <div>
                      <h4 className="font-medium text-gray-900 mb-3">Clubs ({org.club_count || 0})</h4>
                      {expandedOrgDetails[org.id]?.clubs ? (
                        <div className="space-y-2">
                          {expandedOrgDetails[org.id].clubs.map((club: TennisClub) => (
                            <div key={club.id} className="p-3 bg-white rounded-lg border">
                              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2">
                                <div className="min-w-0 flex-1">
                                  <div className="font-medium text-sm truncate">{club.name}</div>
                                  <div className="text-xs text-gray-500 break-all">{club.subdomain}</div>
                                </div>
                                <div className="text-xs text-gray-500 flex-shrink-0">
                                  {club.user_count || 0} users
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="p-3 bg-white rounded-lg border">
                          <p className="text-sm text-gray-500 italic">
                            {org.club_count > 0 ? 'Loading clubs...' : 'No clubs assigned'}
                          </p>
                        </div>
                      )}
                    </div>
                    
                    {/* Admin Notes */}
                    <div>
                      <h4 className="font-medium text-gray-900 mb-3">Admin Notes</h4>
                      {org.admin_notes ? (
                        <div className="p-3 bg-white rounded-lg border">
                          <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans">
                            {org.admin_notes}
                          </pre>
                        </div>
                      ) : (
                        <div className="p-3 bg-white rounded-lg border">
                          <p className="text-sm text-gray-500 italic">No admin notes</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Refresh Button */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={fetchOrganisations}
          disabled={isLoading}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 flex items-center touch-manipulation transition-colors"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </button>
      </div>
    </div>
  );
};

export default OrganisationManagement;