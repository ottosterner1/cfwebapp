import React, { useState } from 'react';
import { Mail, Move, Plus, Building, ArrowRight } from 'lucide-react';

interface TennisClub {
  id: number;
  name: string;
  subdomain: string;
  organisation?: {
    id: number;
    name: string;
    slug: string;
  };
  user_count: number;
  group_count: number;
}

interface Organisation {
  id: number;
  name: string;
  slug: string;
  club_count: number;
  user_count: number;
  template_count: number;
}

interface Notification {
  type: 'success' | 'error' | 'warning';
  message: string;
}

interface ClubManagementProps {
  allClubs: TennisClub[];
  organisations: Organisation[];
  currentClub: TennisClub | null;
  onNotification: (notification: Notification) => void;
  onRefreshClubs: () => void;
  onRefreshOrganisations: () => void;
}

const ClubManagement: React.FC<ClubManagementProps> = ({
  allClubs,
  organisations,
  onNotification,
  onRefreshClubs,
  onRefreshOrganisations
}) => {
  const [selectedClubId, setSelectedClubId] = useState<number | null>(null);
  const [isActionLoading, setIsActionLoading] = useState(false);
  
  // Invite functionality
  const [inviteEmail, setInviteEmail] = useState('');
  
  // Create club state
  const [showCreateClubForm, setShowCreateClubForm] = useState(false);
  const [newClubName, setNewClubName] = useState('');
  const [newClubSubdomain, setNewClubSubdomain] = useState('');
  const [newClubOrgId, setNewClubOrgId] = useState<number | null>(null);
  
  // Club assignment
  const [assignClubMode, setAssignClubMode] = useState<{ clubId: number; currentOrgId?: number } | null>(null);
  const [targetOrgId, setTargetOrgId] = useState<number | null>(null);

  // Send invitation
  const handleSendInvitation = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!inviteEmail || !inviteEmail.includes('@')) {
      onNotification({
        type: 'error',
        message: 'Please enter a valid email address'
      });
      return;
    }
    
    setIsActionLoading(true);
    
    try {
      const response = await fetch('/clubs/api/super-admin/invite-club', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: JSON.stringify({ email: inviteEmail }),
        credentials: 'include'
      });
      
      if (response.ok) {
        const data = await response.json();
        onNotification({
          type: 'success',
          message: data.message || `Invitation sent successfully to ${inviteEmail}`
        });
        setInviteEmail('');
      } else {
        const errorData = await response.json();
        onNotification({
          type: 'error',
          message: errorData.error || 'Failed to send invitation'
        });
      }
    } catch (error) {
      console.error('Error sending invitation:', error);
      onNotification({
        type: 'error',
        message: 'Network error while sending invitation'
      });
    } finally {
      setIsActionLoading(false);
    }
  };

  // Create club
  const handleCreateClub = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newClubName.trim() || !newClubSubdomain.trim() || !newClubOrgId) {
      onNotification({
        type: 'error',
        message: 'Club name, subdomain, and organization are required'
      });
      return;
    }
    
    setIsActionLoading(true);
    try {
      const response = await fetch('/clubs/api/super-admin/create-club', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: JSON.stringify({
          name: newClubName,
          subdomain: newClubSubdomain,
          organisation_id: newClubOrgId
        }),
        credentials: 'include'
      });
      
      if (response.ok) {
        const data = await response.json();
        onNotification({
          type: 'success',
          message: data.message || 'Tennis club created successfully'
        });
        setNewClubName('');
        setNewClubSubdomain('');
        setNewClubOrgId(null);
        setShowCreateClubForm(false);
        onRefreshClubs();
        onRefreshOrganisations();
      } else {
        const errorData = await response.json();
        onNotification({
          type: 'error',
          message: errorData.error || 'Failed to create tennis club'
        });
      }
    } catch (error) {
      console.error('Error creating tennis club:', error);
      onNotification({
        type: 'error',
        message: 'Network error while creating tennis club'
      });
    } finally {
      setIsActionLoading(false);
    }
  };

  // Assign club to organization
  const handleAssignClub = async () => {
    if (!assignClubMode || !targetOrgId) return;
    
    setIsActionLoading(true);
    try {
      const response = await fetch(`/clubs/api/super-admin/clubs/${assignClubMode.clubId}/assign-organization`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: JSON.stringify({
          organisation_id: targetOrgId
        }),
        credentials: 'include'
      });
      
      if (response.ok) {
        const data = await response.json();
        onNotification({
          type: 'success',
          message: data.message || 'Club assigned successfully'
        });
        setAssignClubMode(null);
        setTargetOrgId(null);
        onRefreshClubs();
        onRefreshOrganisations();
      } else {
        const errorData = await response.json();
        onNotification({
          type: 'error',
          message: errorData.error || 'Failed to assign club'
        });
      }
    } catch (error) {
      console.error('Error assigning club:', error);
      onNotification({
        type: 'error',
        message: 'Network error while assigning club'
      });
    } finally {
      setIsActionLoading(false);
    }
  };

  // Switch club
  const handleSwitchClub = async (e: React.MouseEvent) => {
    e.preventDefault();
    
    if (!selectedClubId) return;
    
    setIsActionLoading(true);
    
    try {
      const response = await fetch('/clubs/api/super-admin/switch-club', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: JSON.stringify({ club_id: selectedClubId }),
        credentials: 'include'
      });
      
      if (response.ok) {
        const data = await response.json();
        onNotification({
          type: 'success',
          message: data.message || 'Successfully switched club view'
        });
        
        setTimeout(() => {
          window.location.href = '/dashboard';
        }, 1500);
      } else {
        const errorData = await response.json();
        onNotification({
          type: 'error',
          message: errorData.error || 'Failed to switch club'
        });
      }
    } catch (error) {
      console.error('Error switching club:', error);
      onNotification({
        type: 'error',
        message: 'Network error while switching club'
      });
    } finally {
      setIsActionLoading(false);
    }
  };

  // Handle club change
  const handleClubChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = parseInt(e.target.value, 10);
    setSelectedClubId(isNaN(id) ? null : id);
  };

  // Get selected club
  const selectedClub = selectedClubId ? allClubs.find(c => c.id === selectedClubId) : null;

  // Get unassigned clubs
  const unassignedClubs = allClubs.filter(club => !club.organisation);

  return (
    <div className="space-y-8">
      {/* 1. INVITE NEW CLUB */}
      <div className="border rounded-lg p-6 bg-gradient-to-r from-green-50 to-blue-50">
        <h2 className="text-xl font-semibold mb-4 flex items-center">
          <Mail className="h-6 w-6 mr-3 text-green-600" />
          1. Invite New Tennis Club
        </h2>
        <p className="text-gray-600 mb-4">
          Send an invitation to create a completely new tennis club organization.
        </p>
        <form onSubmit={handleSendInvitation} className="flex gap-4">
          <div className="flex-1">
            <input 
              type="email" 
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="club-admin@example.com"
              required
            />
          </div>
          <button 
            type="submit"
            className={`px-6 py-2 rounded-md text-white ${isActionLoading ? 'bg-green-400' : 'bg-green-600 hover:bg-green-700'} flex items-center`}
            disabled={isActionLoading}
          >
            <Mail className="h-4 w-4 mr-2" />
            {isActionLoading ? 'Sending...' : 'Send Invitation'}
          </button>
        </form>
      </div>

      {/* 2. CREATE NEW CLUB */}
      <div className="border rounded-lg p-6 bg-gradient-to-r from-indigo-50 to-purple-50">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold flex items-center">
            <Building className="h-6 w-6 mr-3 text-indigo-600" />
            2. Create New Club
          </h2>
          <button
            type="button"
            onClick={() => setShowCreateClubForm(!showCreateClubForm)}
            className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 text-sm"
          >
            <Plus className="h-4 w-4 inline mr-1" />
            Create Club
          </button>
        </div>
        
        {showCreateClubForm && (
          <form onSubmit={handleCreateClub} className="bg-white p-4 rounded-md border">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Club Name
                </label>
                <input
                  type="text"
                  value={newClubName}
                  onChange={(e) => {
                    setNewClubName(e.target.value);
                    const subdomain = e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
                    setNewClubSubdomain(subdomain);
                  }}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                  placeholder="e.g., Ace Tennis North"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Subdomain
                </label>
                <input
                  type="text"
                  value={newClubSubdomain}
                  onChange={(e) => setNewClubSubdomain(e.target.value)}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                  placeholder="e.g., ace-tennis-north"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Organization
                </label>
                <select
                  value={newClubOrgId || ''}
                  onChange={(e) => setNewClubOrgId(e.target.value ? parseInt(e.target.value) : null)}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                  required
                >
                  <option value="">-- Select organization --</option>
                  {organisations.map(org => (
                    <option key={org.id} value={org.id}>
                      {org.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex justify-end space-x-2 mt-4">
              <button
                type="button"
                onClick={() => {
                  setShowCreateClubForm(false);
                  setNewClubName('');
                  setNewClubSubdomain('');
                  setNewClubOrgId(null);
                }}
                className="px-3 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isActionLoading}
                className="px-3 py-2 text-sm text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:bg-indigo-400"
              >
                {isActionLoading ? 'Creating...' : 'Create Club'}
              </button>
            </div>
          </form>
        )}

        {/* Unassigned Clubs */}
        <div className="mt-6">
          <h3 className="font-medium mb-3">Clubs Without Organization</h3>
          {unassignedClubs.length === 0 ? (
            <div className="text-center py-4 text-gray-500 bg-white rounded-md border">
              All clubs are assigned to organizations
            </div>
          ) : (
            <div className="bg-white rounded-md border overflow-hidden">
              <table className="min-w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Club</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Subdomain</th>
                    <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {unassignedClubs.map(club => (
                    <tr key={club.id}>
                      <td className="px-4 py-2 text-sm font-medium text-gray-900">{club.name}</td>
                      <td className="px-4 py-2 text-sm text-gray-500">{club.subdomain}</td>
                      <td className="px-4 py-2 text-center">
                        <button
                          type="button"
                          onClick={() => setAssignClubMode({ clubId: club.id })}
                          className="px-3 py-1 bg-indigo-600 text-white text-sm rounded-md hover:bg-indigo-700"
                        >
                          Assign to Org
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Assignment form */}
        {assignClubMode && (
          <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-md">
            <h4 className="font-medium text-blue-900 mb-3">
              Assign Club to Organization
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Club</label>
                <div className="px-3 py-2 bg-gray-100 rounded-md text-sm">
                  {(() => {
                    const club = allClubs.find(c => c.id === assignClubMode.clubId);
                    return club ? club.name : 'Unknown Club';
                  })()}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Organization</label>
                <select
                  value={targetOrgId || ''}
                  onChange={(e) => setTargetOrgId(e.target.value ? parseInt(e.target.value) : null)}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                >
                  <option value="">-- Select organization --</option>
                  {organisations.map(org => (
                    <option key={org.id} value={org.id}>{org.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-end space-x-2">
                <button
                  type="button"
                  onClick={handleAssignClub}
                  disabled={!targetOrgId || isActionLoading}
                  className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-blue-400 text-sm"
                >
                  Assign
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAssignClubMode(null);
                    setTargetOrgId(null);
                  }}
                  className="px-3 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 3. SWITCH TENNIS CLUB */}
      <div className="border rounded-lg p-6 bg-gradient-to-r from-blue-50 to-indigo-50">
        <h2 className="text-xl font-semibold mb-4 flex items-center">
          <Move className="h-6 w-6 mr-3 text-blue-600" />
          3. Switch Tennis Club
        </h2>
        <p className="text-gray-600 mb-4">
          Change your current club view to manage different clubs.
        </p>
        <div className="flex gap-4">
          <div className="flex-1">
            <select 
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              value={selectedClubId?.toString() || ''}
              onChange={handleClubChange}
            >
              <option value="">-- Select a club --</option>
              {Object.entries(allClubs.reduce((acc, club) => {
                const orgName = club.organisation?.name || 'No Organization';
                if (!acc[orgName]) acc[orgName] = [];
                acc[orgName].push(club);
                return acc;
              }, {} as Record<string, TennisClub[]>)).map(([orgName, clubs]) => (
                <optgroup key={orgName} label={orgName}>
                  {clubs.map(club => (
                    <option key={club.id} value={club.id.toString()}>
                      {club.name} ({club.subdomain})
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <button 
            type="button" 
            className={`px-6 py-2 rounded-md text-white ${isActionLoading ? 'bg-blue-400' : 'bg-blue-600 hover:bg-blue-700'} flex items-center`}
            onClick={handleSwitchClub}
            disabled={!selectedClubId || isActionLoading}
          >
            <ArrowRight className="h-4 w-4 mr-2" />
            {isActionLoading ? 'Processing...' : 'Switch Club View'}
          </button>
        </div>

        {selectedClub && (
          <div className="mt-4 p-3 bg-white rounded-md border">
            <div className="flex justify-between items-center">
              <div>
                <span className="text-sm text-gray-600">Selected: </span>
                <span className="font-medium">{selectedClub.name}</span>
                <span className="text-sm text-gray-500 ml-2">
                  ({selectedClub.organisation?.name || 'No Organization'})
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ClubManagement;