import React, { useState, useEffect } from 'react';
import { Shield, ArrowUpCircle, ArrowDownCircle, Users } from 'lucide-react';

interface User {
  id: number;
  name: string;
  email: string;
  role: string;
}

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

interface Notification {
  type: 'success' | 'error' | 'warning';
  message: string;
}

interface UserManagementProps {
  selectedClub: TennisClub;
  onNotification: (notification: Notification) => void;
}

const UserManagement: React.FC<UserManagementProps> = ({ selectedClub, onNotification }) => {
  const [clubUsers, setClubUsers] = useState<User[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [updateInProgress, setUpdateInProgress] = useState<number | null>(null);

  // Function to fetch users for the selected club
  const fetchClubUsers = async () => {
    setIsLoadingUsers(true);
    try {
      const response = await fetch(`/clubs/api/clubs/${selectedClub.id}/users`, {
        credentials: 'include',
        headers: {
          'Accept': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        }
      });
      
      if (response.ok) {
        const userData = await response.json() as User[];
        setClubUsers(Array.isArray(userData) ? userData : []);
      } else {
        console.error('Failed to fetch club users');
        setClubUsers([]);
        onNotification({
          type: 'error',
          message: 'Failed to fetch club users'
        });
      }
    } catch (error) {
      console.error('Error fetching club users:', error);
      setClubUsers([]);
      onNotification({
        type: 'error',
        message: 'Network error while fetching club users'
      });
    } finally {
      setIsLoadingUsers(false);
    }
  };

  // Function to directly update a user's role
  const handleDirectRoleChange = async (userId: number, newRole: string) => {
    setUpdateInProgress(userId);
    
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
        
        onNotification({
          type: 'success',
          message: data.message || 'User role updated successfully'
        });
      } else {
        const errorData = await response.json();
        onNotification({
          type: 'error',
          message: errorData.error || 'Failed to update user role'
        });
      }
    } catch (error) {
      console.error('Error updating user role:', error);
      onNotification({
        type: 'error',
        message: 'Network error while updating user role'
      });
    } finally {
      setUpdateInProgress(null);
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

  // Fetch users when selected club changes
  useEffect(() => {
    if (selectedClub) {
      fetchClubUsers();
    }
  }, [selectedClub]);

  return (
    <div className="border rounded-lg p-6 bg-gradient-to-r from-red-50 to-pink-50">
      <h2 className="text-xl font-semibold mb-4 flex items-center">
        <Shield className="h-6 w-6 mr-3 text-red-600" />
        User Role Management for {selectedClub.name}
      </h2>
      
      {isLoadingUsers ? (
        <div className="flex justify-center p-4">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-red-600"></div>
        </div>
      ) : (
        <>
          {clubUsers.length === 0 ? (
            <div className="text-center py-8 text-gray-500 bg-white rounded-md border">
              <Users className="h-12 w-12 mx-auto text-gray-300 mb-4" />
              <p>No users found in this club</p>
            </div>
          ) : (
            <div className="bg-white rounded-lg border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Name
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Email
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Current Role
                      </th>
                      <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
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
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900">{user.name}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-500">{user.email}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getRoleBadgeClasses(user.role)}`}>
                              {user.role}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium">
                            {isSuperAdmin ? (
                              <span className="text-gray-400 text-sm">Cannot modify</span>
                            ) : (
                              <div className="flex justify-center space-x-2">
                                {isCoach && (
                                  <button 
                                    type="button"
                                    onClick={() => handleDirectRoleChange(user.id, 'ADMIN')}
                                    disabled={updateInProgress === user.id}
                                    className="inline-flex items-center px-3 py-1 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-indigo-400"
                                  >
                                    {updateInProgress === user.id ? (
                                      <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white mr-1"></div>
                                    ) : (
                                      <ArrowUpCircle className="h-4 w-4 mr-1" />
                                    )}
                                    Promote to Admin
                                  </button>
                                )}
                                {isAdmin && (
                                  <button 
                                    type="button"
                                    onClick={() => handleDirectRoleChange(user.id, 'COACH')}
                                    disabled={updateInProgress === user.id}
                                    className="inline-flex items-center px-3 py-1 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-yellow-600 hover:bg-yellow-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500 disabled:bg-yellow-400"
                                  >
                                    {updateInProgress === user.id ? (
                                      <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white mr-1"></div>
                                    ) : (
                                      <ArrowDownCircle className="h-4 w-4 mr-1" />
                                    )}
                                    Demote to Coach
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
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default UserManagement;