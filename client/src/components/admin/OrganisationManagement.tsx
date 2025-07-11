import React, { useState, useEffect } from 'react';
import { 
  Building, Plus, Edit2, Mail, CheckCircle, 
  AlertCircle, Clock, RefreshCw, Save, X, ChevronDown, ChevronUp
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
  clubs: TennisClub[];
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

interface Notification {
  type: 'success' | 'error' | 'warning';
  message: string;
}

interface OrganisationManagementProps {
  onNotification: (notification: Notification) => void;
}

const OrganisationManagement: React.FC<OrganisationManagementProps> = ({ onNotification }) => {
  const [organisations, setOrganisations] = useState<Organisation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isActionLoading, setIsActionLoading] = useState(false);
  
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

  // Fetch organisations
  const fetchOrganisations = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/organisations/', {
        credentials: 'include',
        headers: {
          'Accept': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        }
      });
      
      if (response.ok) {
        const data = await response.json() as Organisation[];
        setOrganisations(Array.isArray(data) ? data : []);
        
        // Fetch email statuses for organizations with sender emails
        const statusPromises = data
          .filter(org => org.sender_email)
          .map(org => fetchEmailStatus(org.id));
        
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

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
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
  const handleSendVerification = async (orgId: number) => {
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
  const startEditing = (org: Organisation) => {
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
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 p-4 lg:p-6 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-lg">
        <h2 className="text-lg lg:text-xl font-semibold flex items-center">
          <Building className="h-5 w-5 lg:h-6 lg:w-6 mr-2 lg:mr-3 text-indigo-600 flex-shrink-0" />
          Organisation Management
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

      {/* Create/Edit Form */}
      {showCreateForm && (
        <div className="bg-white p-4 lg:p-6 rounded-lg border shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium text-lg">
              {editingOrg ? 'Edit Organisation' : 'Create New Organisation'}
            </h3>
            <button
              onClick={resetForm}
              className="p-2 text-gray-400 hover:text-gray-600 lg:hidden"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Form fields stack on mobile */}
            <div className="space-y-4 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Organisation Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  className="w-full rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-base"
                  placeholder="e.g., Ace Tennis Academy"
                  required
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
                  className="w-full rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-base"
                  placeholder="e.g., ace-tennis-academy"
                  required
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
                className="w-full rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-base"
                placeholder="e.g., reports@acetennisacademy.com"
              />
              <p className="text-xs text-gray-500 mt-2">
                Optional: Custom email address for sending report emails. If not set, default system email will be used.
              </p>
            </div>
            
            {/* Action buttons */}
            <div className="flex flex-col sm:flex-row justify-end gap-3 pt-4 border-t">
              <button
                type="button"
                onClick={resetForm}
                className="w-full sm:w-auto px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 font-medium touch-manipulation transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isActionLoading}
                className="w-full sm:w-auto px-4 py-2 text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:bg-indigo-400 flex items-center justify-center font-medium touch-manipulation transition-colors"
              >
                <Save className="h-4 w-4 mr-1" />
                {isActionLoading ? 'Saving...' : (editingOrg ? 'Update' : 'Create')}
              </button>
            </div>
          </form>
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
                    </div>
                    
                    {/* Stats - Mobile optimized */}
                    <div className="grid grid-cols-3 gap-4 sm:flex sm:items-center sm:space-x-6 mb-4 text-sm text-gray-600">
                      <div className="text-center sm:text-left">
                        <div className="font-medium text-gray-900">{org.club_count}</div>
                        <div className="text-xs">Clubs</div>
                      </div>
                      <div className="text-center sm:text-left">
                        <div className="font-medium text-gray-900">{org.admin_count}</div>
                        <div className="text-xs">Admins</div>
                      </div>
                      <div className="text-center sm:text-left">
                        <div className="font-medium text-gray-900">{org.template_count}</div>
                        <div className="text-xs">Templates</div>
                      </div>
                    </div>
                    
                    {/* Email Status - Mobile optimized */}
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
                            onClick={() => handleSendVerification(org.id)}
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
                  <div className="flex flex-row sm:flex-col lg:flex-row gap-2 lg:gap-2">
                    <button
                      onClick={() => setExpandedOrg(expandedOrg === org.id ? null : org.id)}
                      className="flex-1 sm:flex-none px-3 py-2 text-sm text-gray-600 hover:text-gray-800 bg-gray-50 hover:bg-gray-100 rounded-lg flex items-center justify-center touch-manipulation transition-colors"
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
                      onClick={() => startEditing(org)}
                      className="flex-1 sm:flex-none p-2 text-gray-400 hover:text-gray-600 bg-gray-50 hover:bg-gray-100 rounded-lg touch-manipulation transition-colors"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
              
              {/* Expanded Details */}
              {expandedOrg === org.id && (
                <div className="border-t border-gray-200 p-4 lg:p-6 bg-gray-50">
                  <div className="space-y-6 lg:grid lg:grid-cols-2 lg:gap-6 lg:space-y-0">
                    {/* Clubs */}
                    <div>
                      <h4 className="font-medium text-gray-900 mb-3">Clubs ({org.clubs.length})</h4>
                      {org.clubs.length > 0 ? (
                        <div className="space-y-2">
                          {org.clubs.map(club => (
                            <div key={club.id} className="p-3 bg-white rounded-lg border">
                              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2">
                                <div className="min-w-0 flex-1">
                                  <div className="font-medium text-sm truncate">{club.name}</div>
                                  <div className="text-xs text-gray-500 break-all">{club.subdomain}</div>
                                </div>
                                <div className="text-xs text-gray-500 flex-shrink-0">
                                  {club.user_count} users
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500 italic">No clubs assigned</p>
                      )}
                    </div>
                    
                    {/* Email Configuration Details */}
                    <div>
                      <h4 className="font-medium text-gray-900 mb-3">Email Configuration</h4>
                      {org.sender_email ? (
                        <div className="space-y-2">
                          <div className="p-3 bg-white rounded-lg border">
                            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2">
                              <span className="text-sm font-medium">Sender Email:</span>
                              <span className="text-sm break-all">{org.sender_email}</span>
                            </div>
                          </div>
                          
                          {emailStatuses[org.id] && (
                            <div className="space-y-2">
                              <div className="p-3 bg-white rounded-lg border">
                                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2">
                                  <span className="text-sm font-medium">Status:</span>
                                  <span className="text-sm">{emailStatuses[org.id].status}</span>
                                </div>
                              </div>
                              
                              <div className="p-3 bg-white rounded-lg border">
                                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2">
                                  <span className="text-sm font-medium">Verified:</span>
                                  <span className="text-sm">
                                    {emailStatuses[org.id].is_verified ? 'Yes' : 'No'}
                                  </span>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="p-3 bg-white rounded-lg border">
                          <p className="text-sm text-gray-500 italic">
                            No custom email configured. Reports will be sent from the default system email.
                          </p>
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
    </div>
  );
};

export default OrganisationManagement;