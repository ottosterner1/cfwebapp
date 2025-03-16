import React, { useState, useEffect } from 'react';
import { AlertCircle, CheckCircle, Mail, Users, Calendar, Settings, Shield, ArrowUpCircle, ArrowDownCircle } from 'lucide-react';

// Define type interfaces
interface TennisClub {
  id: number;
  name: string;
  subdomain: string;
}

interface User {
  id: number;
  name: string;
  email: string;
  role: string;
}

interface Notification {
  type: 'success' | 'error';
  message: string;
}

const SuperAdminDashboard: React.FC = () => {
  const [allClubs, setAllClubs] = useState<TennisClub[]>([]);
  const [selectedClubId, setSelectedClubId] = useState<number | null>(null);
  const [selectedClub, setSelectedClub] = useState<TennisClub | null>(null);
  const [currentClub, setCurrentClub] = useState<TennisClub | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isActionLoading, setIsActionLoading] = useState<boolean>(false);
  const [notification, setNotification] = useState<Notification | null>(null);
  const [inviteEmail, setInviteEmail] = useState<string>('');
  
  // User management state
  const [clubUsers, setClubUsers] = useState<User[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState<boolean>(false);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [newUserRole, setNewUserRole] = useState<string>('');
  const [updateInProgress, setUpdateInProgress] = useState<number | null>(null);

  // Fetch all clubs on component mount
  useEffect(() => {
    const fetchClubs = async (): Promise<void> => {
      setIsLoading(true);
      setNotification(null);
      
      try {
        const response = await fetch('/clubs/api/clubs', {
          credentials: 'include',
          headers: {
            'Accept': 'application/json',
            'X-Requested-With': 'XMLHttpRequest'
          }
        });
        
        if (response.ok) {
          const clubsData = await response.json() as TennisClub[];
          setAllClubs(clubsData);
          
          // Fetch current user info
          try {
            const userResponse = await fetch('/api/current-user', {
              credentials: 'include',
              headers: {
                'Accept': 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
              }
            });
            
            if (userResponse.ok) {
              const userData = await userResponse.json();
              const clubId = userData.tennis_club?.id || userData.tennis_club_id;
              if (clubId) {
                const currentUserClub = clubsData.find((club) => club.id === clubId);
                if (currentUserClub) {
                  setCurrentClub(currentUserClub);
                  setSelectedClubId(currentUserClub.id);
                }
              }
            }
          } catch (userError) {
            console.error('Error fetching user data:', userError);
          }
        } else {
          setNotification({
            type: 'error',
            message: 'Failed to load tennis clubs. Please check your permissions.'
          });
        }
      } catch (error) {
        console.error('Error fetching clubs:', error);
        setNotification({
          type: 'error',
          message: 'Network error while loading tennis clubs.'
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchClubs();
  }, []);

  // Update selected club when selectedClubId changes
  useEffect(() => {
    if (selectedClubId) {
      const club = allClubs.find(c => c.id === selectedClubId) || null;
      setSelectedClub(club);
      
      // Fetch club users when a club is selected
      if (club) {
        fetchClubUsers(club.id);
      }
    } else {
      setSelectedClub(null);
      setClubUsers([]);
    }
  }, [selectedClubId, allClubs]);

  // Function to fetch users for a specific club
  const fetchClubUsers = async (clubId: number): Promise<void> => {
    setIsLoadingUsers(true);
    try {
      const response = await fetch(`/clubs/api/clubs/${clubId}/users`, {
        credentials: 'include',
        headers: {
          'Accept': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        }
      });
      
      if (response.ok) {
        const userData = await response.json() as User[];
        console.log('Fetched users:', userData); // Debug log
        setClubUsers(userData);
      } else {
        console.error('Failed to fetch club users');
      }
    } catch (error) {
      console.error('Error fetching club users:', error);
    } finally {
      setIsLoadingUsers(false);
    }
  };

  const handleClubChange = (e: React.ChangeEvent<HTMLSelectElement>): void => {
    const id = parseInt(e.target.value);
    setSelectedClubId(isNaN(id) ? null : id);
  };

  const handleSwitchClub = async (): Promise<void> => {
    if (!selectedClubId) return;
    
    setIsActionLoading(true);
    setNotification(null);
    
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
        setNotification({
          type: 'success',
          message: data.message || 'Successfully switched club view'
        });
        
        // Update current club
        const newCurrentClub = allClubs.find(c => c.id === selectedClubId) || null;
        setCurrentClub(newCurrentClub);
        
        // Reload the page after a short delay to update navigation
        setTimeout(() => {
          window.location.href = '/home';
        }, 1500);
      } else {
        let errorMessage = 'Failed to switch club';
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch (e) {
          // If can't parse JSON, try to get text content
          const textError = await response.text();
          console.error('Error response:', textError.substring(0, 200));
        }
        
        setNotification({
          type: 'error',
          message: errorMessage
        });
      }
    } catch (error) {
      console.error('Error switching club:', error);
      setNotification({
        type: 'error',
        message: error instanceof Error ? error.message : 'An error occurred while switching club'
      });
    } finally {
      setIsActionLoading(false);
    }
  };
  
  const handleLoadData = async (dataType: string): Promise<void> => {
    if (!selectedClubId) return;
    
    setIsActionLoading(true);
    setNotification(null);
    
    try {
      const response = await fetch('/clubs/api/super-admin/load-data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: JSON.stringify({ 
          club_id: selectedClubId,
          data_type: dataType
        }),
        credentials: 'include'
      });
      
      if (response.ok) {
        const data = await response.json();
        setNotification({
          type: 'success',
          message: data.message || `Successfully loaded ${dataType}`
        });
      } else {
        let errorMessage = `Failed to load ${dataType}`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch (e) {
          // If can't parse JSON, try to get text content
          const textError = await response.text();
          console.error('Error response:', textError.substring(0, 200));
        }
        
        setNotification({
          type: 'error',
          message: errorMessage
        });
      }
    } catch (error) {
      console.error(`Error loading ${dataType}:`, error);
      setNotification({
        type: 'error',
        message: error instanceof Error ? error.message : `An error occurred while loading ${dataType}`
      });
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleSendInvitation = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    
    if (!inviteEmail || !inviteEmail.includes('@')) {
      setNotification({
        type: 'error',
        message: 'Please enter a valid email address'
      });
      return;
    }
    
    setIsActionLoading(true);
    setNotification(null);
    
    try {
      const response = await fetch('/clubs/api/super-admin/invite-club', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: JSON.stringify({ 
          email: inviteEmail
        }),
        credentials: 'include'
      });
      
      if (response.ok) {
        const data = await response.json();
        setNotification({
          type: 'success',
          message: data.message || `Invitation sent successfully to ${inviteEmail}`
        });
        setInviteEmail(''); // Clear the input field
      } else {
        let errorMessage = `Failed to send invitation`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch (e) {
          const textError = await response.text();
          console.error('Error response:', textError.substring(0, 200));
        }
        
        setNotification({
          type: 'error',
          message: errorMessage
        });
      }
    } catch (error) {
      console.error(`Error sending invitation:`, error);
      setNotification({
        type: 'error',
        message: error instanceof Error ? error.message : `An error occurred while sending invitation`
      });
    } finally {
      setIsActionLoading(false);
    }
  };

  // Function to directly update a user's role
  const handleDirectRoleChange = async (userId: number, newRole: string): Promise<void> => {
    setUpdateInProgress(userId);
    setNotification(null);
    
    try {
      const response = await fetch('/clubs/api/super-admin/update-user-role', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: JSON.stringify({ 
          user_id: userId,
          role: newRole
        }),
        credentials: 'include'
      });
      
      if (response.ok) {
        const data = await response.json();
        
        // Update the user in the local state
        setClubUsers(prevUsers => 
          prevUsers.map(user => 
            user.id === userId 
              ? { ...user, role: newRole } 
              : user
          )
        );
        
        setNotification({
          type: 'success',
          message: data.message || `User role updated successfully`
        });
      } else {
        let errorMessage = `Failed to update user role`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch (e) {
          const textError = await response.text();
          console.error('Error response:', textError.substring(0, 200));
        }
        
        setNotification({
          type: 'error',
          message: errorMessage
        });
      }
    } catch (error) {
      console.error(`Error updating user role:`, error);
      setNotification({
        type: 'error',
        message: error instanceof Error ? error.message : `An error occurred while updating user role`
      });
    } finally {
      setUpdateInProgress(null);
    }
  };

  // Function to update a user's role through the form
  const handleUpdateUserRole = async (): Promise<void> => {
    if (!selectedUserId || !newUserRole) {
      setNotification({
        type: 'error',
        message: 'Please select a user and role'
      });
      return;
    }
    
    setIsActionLoading(true);
    setNotification(null);
    
    try {
      const response = await fetch('/clubs/api/super-admin/update-user-role', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: JSON.stringify({ 
          user_id: selectedUserId,
          role: newUserRole
        }),
        credentials: 'include'
      });
      
      if (response.ok) {
        const data = await response.json();
        
        // Update the user in the local state
        setClubUsers(prevUsers => 
          prevUsers.map(user => 
            user.id === selectedUserId 
              ? { ...user, role: newUserRole } 
              : user
          )
        );
        
        setNotification({
          type: 'success',
          message: data.message || `User role updated successfully`
        });
        
        // Reset selection
        setSelectedUserId(null);
        setNewUserRole('');
      } else {
        let errorMessage = `Failed to update user role`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch (e) {
          const textError = await response.text();
          console.error('Error response:', textError.substring(0, 200));
        }
        
        setNotification({
          type: 'error',
          message: errorMessage
        });
      }
    } catch (error) {
      console.error(`Error updating user role:`, error);
      setNotification({
        type: 'error',
        message: error instanceof Error ? error.message : `An error occurred while updating user role`
      });
    } finally {
      setIsActionLoading(false);
    }
  };

  // Get role badge styles based on role
  const getRoleBadgeClasses = (role: string): string => {
    const normRole = role.toUpperCase();
    
    switch(normRole) {
      case 'ADMIN':
        return 'bg-purple-100 text-purple-800';
      case 'COACH':
        return 'bg-blue-100 text-blue-800';
      case 'SUPER_ADMIN':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6">
      {notification && (
        <div className={`mb-6 p-4 rounded-md border ${notification.type === 'success' ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
          <div className="flex items-center">
            {notification.type === 'success' ? 
              <CheckCircle className="h-5 w-5 mr-2 text-green-600" /> : 
              <AlertCircle className="h-5 w-5 mr-2 text-red-600" />
            }
            <p>{notification.message}</p>
          </div>
        </div>
      )}
      
      <div className="bg-white shadow-lg rounded-lg mb-8">
        <div className="px-6 py-4 border-b border-gray-200 flex flex-row items-center justify-between">
          <h1 className="text-2xl font-bold">Super Admin Dashboard</h1>
          {currentClub && (
            <div className="bg-purple-100 text-purple-800 py-1 px-3 rounded-full text-sm font-medium">
              Current Club: {currentClub.name}
            </div>
          )}
        </div>
        
        <div className="p-6">
          {/* Club Switch Section */}
          <div className="border rounded-md p-4 mb-6">
            <h3 className="font-medium mb-4">Switch Tennis Club</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Select Tennis Club</label>
                <select 
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  value={selectedClubId?.toString() || ''}
                  onChange={handleClubChange}
                >
                  <option value="">-- Select a club --</option>
                  {allClubs.map(club => (
                    <option key={club.id} value={club.id.toString()}>
                      {club.name} ({club.subdomain})
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-end">
                <button 
                  className={`w-full py-2 px-4 rounded-md text-white ${isActionLoading ? 'bg-blue-400' : 'bg-blue-600 hover:bg-blue-700'}`}
                  onClick={handleSwitchClub}
                  disabled={!selectedClubId || isActionLoading}
                >
                  {isActionLoading ? 'Processing...' : 'Switch Club View'}
                </button>
              </div>
            </div>
          </div>
          
          {/* Invite Tennis Club Section */}
          <div className="border rounded-md p-4 mb-6">
            <h3 className="font-medium mb-4">Invite New Tennis Club</h3>
            <form onSubmit={handleSendInvitation} className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                <input 
                  type="email" 
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="club-admin@example.com"
                  required
                />
              </div>
              <div className="flex items-end">
                <button 
                  type="submit"
                  className={`w-full py-2 px-4 rounded-md text-white ${isActionLoading ? 'bg-green-400' : 'bg-green-600 hover:bg-green-700'} flex items-center justify-center`}
                  disabled={isActionLoading}
                >
                  <Mail className="h-4 w-4 mr-2" />
                  {isActionLoading ? 'Sending...' : 'Send Invitation'}
                </button>
              </div>
            </form>
          </div>
          
          {/* Selected Club Info and Actions */}
          {selectedClub && (
            <>
              <div id="selected-club-info" className="bg-gray-50 p-4 rounded-md mb-6">
                <h3 className="font-medium mb-2">Selected Club: {selectedClub.name}</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-600">Subdomain: <span className="font-medium">{selectedClub.subdomain}</span></p>
                    <p className="text-sm text-gray-600">ID: <span className="font-medium">{selectedClub.id}</span></p>
                  </div>
                  <div className="flex justify-end">
                    <button 
                      className={`py-2 px-4 rounded-md text-white ${isActionLoading ? 'bg-blue-400' : 'bg-blue-600 hover:bg-blue-700'}`}
                      onClick={handleSwitchClub}
                      disabled={isActionLoading}
                    >
                      Switch to This Club
                    </button>
                  </div>
                </div>
              </div>
              
              {/* User Role Management Section - IMPROVED */}
              <div className="border rounded-md p-4 mb-6">
                <h3 className="font-medium mb-4 flex items-center text-lg">
                  <Shield className="h-5 w-5 mr-2 text-indigo-500" />
                  User Role Management
                </h3>
                
                {isLoadingUsers ? (
                  <div className="flex justify-center p-4">
                    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-600"></div>
                  </div>
                ) : (
                  <>
                    {clubUsers.length === 0 ? (
                      <p className="text-gray-500 text-center py-4">No users found in this club</p>
                    ) : (
                      <>
                        <div className="overflow-x-auto">
                          <table className="min-w-full divide-y divide-gray-200 mb-4">
                            <thead className="bg-gray-50">
                              <tr>
                                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                                <th scope="col" className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                              </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                              {clubUsers.map(user => {
                                const normalizedRole = user.role.toUpperCase();
                                const isCoach = normalizedRole === 'COACH';
                                const isAdmin = normalizedRole === 'ADMIN';
                                const isSuperAdmin = normalizedRole === 'SUPER_ADMIN';
                                
                                return (
                                  <tr key={user.id} className="hover:bg-gray-50">
                                    <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">{user.name}</td>
                                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{user.email}</td>
                                    <td className="px-4 py-3 whitespace-nowrap text-sm">
                                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getRoleBadgeClasses(user.role)}`}>
                                        {user.role}
                                      </span>
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap text-center text-sm font-medium">
                                      {isSuperAdmin ? (
                                        <span className="text-gray-400">Cannot modify</span>
                                      ) : (
                                        <div className="flex justify-center space-x-2">
                                          {isCoach ? (
                                            <button 
                                              onClick={() => handleDirectRoleChange(user.id, 'ADMIN')}
                                              disabled={updateInProgress === user.id}
                                              className="inline-flex items-center px-3 py-1 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                                            >
                                              {updateInProgress === user.id ? (
                                                <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white mr-1"></div>
                                              ) : (
                                                <ArrowUpCircle className="h-4 w-4 mr-1" />
                                              )}
                                              Promote to Admin
                                            </button>
                                          ) : isAdmin && (
                                            <button 
                                              onClick={() => handleDirectRoleChange(user.id, 'COACH')}
                                              disabled={updateInProgress === user.id}
                                              className="inline-flex items-center px-3 py-1 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-yellow-600 hover:bg-yellow-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500"
                                            >
                                              {updateInProgress === user.id ? (
                                                <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white mr-1"></div>
                                              ) : (
                                                <ArrowDownCircle className="h-4 w-4 mr-1" />
                                              )}
                                              Change to Coach
                                            </button>
                                          )}
                                        </div>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )}
                  </>
                )}
              </div>
              
              {/* Data Loading Section */}
              <div className="border rounded-md p-4 mb-6">
                <h3 className="font-medium mb-4">Load Club Data</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <button 
                      className={`w-full py-2 px-4 rounded-md text-white ${isActionLoading ? 'bg-green-400' : 'bg-green-600 hover:bg-green-700'}`}
                      onClick={() => handleLoadData('default_groups')}
                      disabled={isActionLoading}
                    >
                      Load Default Groups
                    </button>
                  </div>
                  <div>
                    <button 
                      className={`w-full py-2 px-4 rounded-md text-white ${isActionLoading ? 'bg-green-400' : 'bg-green-600 hover:bg-green-700'}`}
                      onClick={() => handleLoadData('initial_period')}
                      disabled={isActionLoading}
                    >
                      Create Initial Teaching Period
                    </button>
                  </div>
                </div>
              </div>
              
              {/* Management Links */}
              <div className="border rounded-md p-4">
                <h3 className="font-medium mb-4">Club Management</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <a 
                    href={`/clubs/manage/${selectedClub.id}/club`}
                    className="bg-indigo-600 text-white py-2 px-4 rounded-md hover:bg-indigo-700 text-center flex items-center justify-center"
                  >
                    <Settings className="h-4 w-4 mr-2" />
                    Club Settings
                  </a>
                  <a 
                    href={`/clubs/manage/${selectedClub.id}/coaches`}
                    className="bg-indigo-600 text-white py-2 px-4 rounded-md hover:bg-indigo-700 text-center flex items-center justify-center"
                  >
                    <Users className="h-4 w-4 mr-2" />
                    Coaches
                  </a>
                  <a 
                    href={`/clubs/manage/${selectedClub.id}/groups`}
                    className="bg-indigo-600 text-white py-2 px-4 rounded-md hover:bg-indigo-700 text-center flex items-center justify-center"
                  >
                    <Users className="h-4 w-4 mr-2" />
                    Groups
                  </a>
                  <a 
                    href={`/clubs/manage/${selectedClub.id}/teaching-periods`}
                    className="bg-indigo-600 text-white py-2 px-4 rounded-md hover:bg-indigo-700 text-center flex items-center justify-center"
                  >
                    <Calendar className="h-4 w-4 mr-2" />
                    Teaching Periods
                  </a>
                  <a 
                    href={`/clubs/manage/${selectedClub.id}/players`}
                    className="bg-indigo-600 text-white py-2 px-4 rounded-md hover:bg-indigo-700 text-center flex items-center justify-center"
                  >
                    <Users className="h-4 w-4 mr-2" />
                    Players
                  </a>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default SuperAdminDashboard;