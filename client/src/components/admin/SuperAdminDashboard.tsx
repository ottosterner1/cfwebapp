import React, { useState, useEffect, useRef } from 'react';
import { 
  AlertCircle, CheckCircle, Mail, Users, Calendar, Settings, Shield, 
  ArrowUpCircle, ArrowDownCircle, UploadCloud, FileText, Database,
  Building, Plus, Move
} from 'lucide-react';

// Organization interfaces
interface Organisation {
  id: number;
  name: string;
  slug: string;
  club_count: number;
  user_count: number;
  template_count: number;
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

interface UploadStatus {
  isUploading: boolean;
  progress: number;
  fileName: string;
  result?: {
    groupsCreated: number;
    timeSlotsCreated: number;
    warnings: string[];
    errors: string[];
  };
}

interface Feature {
  name: string;
  display_name: string;
  description: string;
  icon: string;
  is_enabled: boolean;
}

interface ClubFeaturesResponse {
  features: Feature[];
  club: {
    id: number;
    name: string;
    organisation?: {
      id: number;
      name: string;
      slug: string;
    };
  };
}

const SuperAdminDashboard: React.FC = () => {
  const [allClubs, setAllClubs] = useState<TennisClub[]>([]);
  const [selectedClubId, setSelectedClubId] = useState<number | null>(null);
  const [selectedClub, setSelectedClub] = useState<TennisClub | null>(null);
  const [currentClub, setCurrentClub] = useState<TennisClub | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isActionLoading, setIsActionLoading] = useState<boolean>(false);
  const [notification, setNotification] = useState<Notification | null>(null);
  
  // Organization and Club Management
  const [organisations, setOrganisations] = useState<Organisation[]>([]);
  const [isLoadingOrganisations, setIsLoadingOrganisations] = useState<boolean>(false);
  const [showCreateOrgForm, setShowCreateOrgForm] = useState<boolean>(false);
  const [newOrgName, setNewOrgName] = useState<string>('');
  const [newOrgSlug, setNewOrgSlug] = useState<string>('');
  
  // Create club state
  const [showCreateClubForm, setShowCreateClubForm] = useState<boolean>(false);
  const [newClubName, setNewClubName] = useState<string>('');
  const [newClubSubdomain, setNewClubSubdomain] = useState<string>('');
  const [newClubOrgId, setNewClubOrgId] = useState<number | null>(null);
  
  // Club assignment
  const [assignClubMode, setAssignClubMode] = useState<{ clubId: number; currentOrgId?: number } | null>(null);
  const [targetOrgId, setTargetOrgId] = useState<number | null>(null);
  
  // Invite functionality
  const [inviteEmail, setInviteEmail] = useState<string>('');
  
  // User management state
  const [clubUsers, setClubUsers] = useState<User[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState<boolean>(false);
  const [updateInProgress, setUpdateInProgress] = useState<number | null>(null);
  
  // Feature management state
  const [features, setFeatures] = useState<Feature[]>([]);
  const [isLoadingFeatures, setIsLoadingFeatures] = useState<boolean>(false);
  const [isUpdatingFeatures, setIsUpdatingFeatures] = useState<boolean>(false);
  
  // Upload state
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>({
    isUploading: false,
    progress: 0,
    fileName: ''
  });
  
  // File upload ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch organizations
  const fetchOrganisations = async (): Promise<void> => {
    setIsLoadingOrganisations(true);
    try {
      const response = await fetch('/api/organisations/', {
        credentials: 'include',
        headers: {
          'Accept': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        }
      });
      
      if (response.ok) {
        const orgsData = await response.json() as Organisation[];
        setOrganisations(Array.isArray(orgsData) ? orgsData : []);
      } else {
        console.error('Failed to fetch organisations');
        setOrganisations([]);
      }
    } catch (error) {
      console.error('Error fetching organisations:', error);
      setOrganisations([]);
    } finally {
      setIsLoadingOrganisations(false);
    }
  };

  // Helper function to refresh clubs
  const fetchClubs = async (): Promise<void> => {
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
        setAllClubs(Array.isArray(clubsData) ? clubsData : []);
      } else {
        setAllClubs([]);
      }
    } catch (error) {
      console.error('Error fetching clubs:', error);
      setAllClubs([]);
    }
  };

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
        setClubUsers(Array.isArray(userData) ? userData : []);
      } else {
        console.error('Failed to fetch club users');
        setClubUsers([]);
      }
    } catch (error) {
      console.error('Error fetching club users:', error);
      setClubUsers([]);
    } finally {
      setIsLoadingUsers(false);
    }
  };

  // FIXED: Function to fetch features for a specific club
  const fetchClubFeatures = async (clubId: number): Promise<void> => {
    setIsLoadingFeatures(true);
    setNotification(null);
    
    try {
      const response = await fetch(`/clubs/api/super-admin/clubs/${clubId}/features`, {
        credentials: 'include',
        headers: {
          'Accept': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        }
      });
      
      if (response.ok) {
        const data = await response.json() as ClubFeaturesResponse;
        
        // FIXED: Handle the correct response format
        if (data && Array.isArray(data.features)) {
          setFeatures(data.features);
        } else if (Array.isArray(data)) {
          // Fallback in case backend returns direct array
          setFeatures(data as Feature[]);
        } else {
          console.warn('Unexpected response format for features:', data);
          setFeatures([]);
        }
      } else {
        const errorText = await response.text();
        console.error('Failed to fetch club features:', response.status, errorText);
        setFeatures([]);
        
        if (response.status === 403) {
          setNotification({
            type: 'error',
            message: 'Access denied. Super admin privileges required.'
          });
        } else if (response.status === 404) {
          setNotification({
            type: 'error',
            message: 'Club not found or features not configured.'
          });
        } else {
          setNotification({
            type: 'error',
            message: 'Failed to load club features. Please try again.'
          });
        }
      }
    } catch (error) {
      console.error('Error fetching club features:', error);
      setFeatures([]);
      setNotification({
        type: 'error',
        message: 'Network error while loading features.'
      });
    } finally {
      setIsLoadingFeatures(false);
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

  // Create organization
  const handleCreateOrganisation = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    
    if (!newOrgName.trim() || !newOrgSlug.trim()) {
      setNotification({
        type: 'error',
        message: 'Organization name and slug are required'
      });
      return;
    }
    
    setIsActionLoading(true);
    try {
      const response = await fetch('/api/organisations/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: JSON.stringify({
          name: newOrgName,
          slug: newOrgSlug
        }),
        credentials: 'include'
      });
      
      if (response.ok) {
        const data = await response.json();
        setNotification({
          type: 'success',
          message: data.message || 'Organization created successfully'
        });
        setNewOrgName('');
        setNewOrgSlug('');
        setShowCreateOrgForm(false);
        fetchOrganisations();
      } else {
        const errorData = await response.json();
        setNotification({
          type: 'error',
          message: errorData.error || 'Failed to create organization'
        });
      }
    } catch (error) {
      console.error('Error creating organization:', error);
      setNotification({
        type: 'error',
        message: 'Network error while creating organization'
      });
    } finally {
      setIsActionLoading(false);
    }
  };

  // Create club
  const handleCreateClub = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    
    if (!newClubName.trim() || !newClubSubdomain.trim() || !newClubOrgId) {
      setNotification({
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
        setNotification({
          type: 'success',
          message: data.message || 'Tennis club created successfully'
        });
        setNewClubName('');
        setNewClubSubdomain('');
        setNewClubOrgId(null);
        setShowCreateClubForm(false);
        fetchClubs();
        fetchOrganisations();
      } else {
        const errorData = await response.json();
        setNotification({
          type: 'error',
          message: errorData.error || 'Failed to create tennis club'
        });
      }
    } catch (error) {
      console.error('Error creating tennis club:', error);
      setNotification({
        type: 'error',
        message: 'Network error while creating tennis club'
      });
    } finally {
      setIsActionLoading(false);
    }
  };

  // Assign club to organization
  const handleAssignClub = async (): Promise<void> => {
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
        setNotification({
          type: 'success',
          message: data.message || 'Club assigned successfully'
        });
        setAssignClubMode(null);
        setTargetOrgId(null);
        fetchClubs();
        fetchOrganisations();
      } else {
        const errorData = await response.json();
        setNotification({
          type: 'error',
          message: errorData.error || 'Failed to assign club'
        });
      }
    } catch (error) {
      console.error('Error assigning club:', error);
      setNotification({
        type: 'error',
        message: 'Network error while assigning club'
      });
    } finally {
      setIsActionLoading(false);
    }
  };

  // Send invitation
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
        setInviteEmail('');
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

  // Switch club
  const handleSwitchClub = async (e: React.MouseEvent): Promise<void> => {
    e.preventDefault();
    
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
        
        const newCurrentClub = allClubs.find(c => c.id === selectedClubId) || null;
        setCurrentClub(newCurrentClub);
        
        setTimeout(() => {
          window.location.href = '/dashboard';
        }, 1500);
      } else {
        let errorMessage = 'Failed to switch club';
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
      console.error('Error switching club:', error);
      setNotification({
        type: 'error',
        message: error instanceof Error ? error.message : 'An error occurred while switching club'
      });
    } finally {
      setIsActionLoading(false);
    }
  };

  // Handle club change
  const handleClubChange = (e: React.ChangeEvent<HTMLSelectElement>): void => {
    e.preventDefault();
    const id = parseInt(e.target.value, 10);
    setSelectedClubId(isNaN(id) ? null : id);
  };

  // FIXED: Function to handle feature toggle
  const handleToggleFeature = (featureName: string) => {
    setFeatures(prevFeatures => {
      if (!Array.isArray(prevFeatures)) {
        console.warn('Features is not an array, resetting to empty array');
        return [];
      }
      
      return prevFeatures.map(feature => 
        feature.name === featureName 
          ? { ...feature, is_enabled: !feature.is_enabled } 
          : feature
      );
    });
  };

  // FIXED: Function to save feature settings
  const handleSaveFeatures = async () => {
    if (!selectedClubId) return;
    
    setIsUpdatingFeatures(true);
    setNotification(null);
    
    try {
      const response = await fetch(`/clubs/api/super-admin/clubs/${selectedClubId}/features`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: JSON.stringify(features), // Send the features array directly
        credentials: 'include'
      });
      
      if (response.ok) {
        const data = await response.json();
        setNotification({
          type: 'success',
          message: data.message || 'Features updated successfully'
        });
        
        // Refresh features to get the latest state
        if (selectedClubId) {
          fetchClubFeatures(selectedClubId);
        }
      } else {
        let errorMessage = 'Failed to update features';
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch (e) {
          console.error('Error parsing response:', e);
        }
        setNotification({
          type: 'error',
          message: errorMessage
        });
      }
    } catch (error) {
      console.error('Error updating features:', error);
      setNotification({
        type: 'error',
        message: 'Network error while updating features'
      });
    } finally {
      setIsUpdatingFeatures(false);
    }
  };

  // Function to handle file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      setUploadStatus({
        ...uploadStatus,
        fileName: files[0].name
      });
    }
  };

  // Function to handle CSV upload for groups and time slots
  const handleGroupsUpload = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    
    if (!selectedClubId) {
      setNotification({
        type: 'error',
        message: 'Please select a club first'
      });
      return;
    }
    
    const fileInput = fileInputRef.current;
    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
      setNotification({
        type: 'error',
        message: 'Please select a CSV file to upload'
      });
      return;
    }
    
    const file = fileInput.files[0];
    if (!file.name.endsWith('.csv')) {
      setNotification({
        type: 'error',
        message: 'Only CSV files are supported'
      });
      return;
    }
    
    setIsActionLoading(true);
    setUploadStatus({
      isUploading: true,
      progress: 10,
      fileName: file.name
    });
    setNotification(null);
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('club_id', selectedClubId.toString());
      
      const response = await fetch('/clubs/api/super-admin/import-groups', {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });
      
      setUploadStatus(prev => ({...prev, progress: 50}));
      
      if (response.ok) {
        const result = await response.json();
        
        setUploadStatus({
          isUploading: false,
          progress: 100,
          fileName: file.name,
          result: {
            groupsCreated: result.groups_created || 0,
            timeSlotsCreated: result.time_slots_created || 0,
            warnings: result.warnings || [],
            errors: result.errors || []
          }
        });
        
        setNotification({
          type: 'success',
          message: `Successfully imported ${result.groups_created} groups and ${result.time_slots_created} time slots`
        });
        
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      } else {
        let errorMessage = 'Failed to upload file';
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch (e) {
          const textError = await response.text();
          console.error('Error response:', textError.substring(0, 200));
        }
        
        setUploadStatus({
          isUploading: false,
          progress: 0,
          fileName: file.name
        });
        
        setNotification({
          type: 'error',
          message: errorMessage
        });
      }
    } catch (error) {
      console.error('Error uploading file:', error);
      
      setUploadStatus({
        isUploading: false,
        progress: 0,
        fileName: file.name
      });
      
      setNotification({
        type: 'error',
        message: error instanceof Error ? error.message : 'An error occurred while uploading the file'
      });
    } finally {
      setIsActionLoading(false);
    }
  };

  // Function to download the CSV template
  const handleDownloadTemplate = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    try {
      const response = await fetch('/clubs/api/super-admin/groups-template', {
        credentials: 'include'
      });
      
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = 'groups_template.csv';
        
        document.body.appendChild(a);
        a.click();
        
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } else {
        setNotification({
          type: 'error',
          message: 'Failed to download template'
        });
      }
    } catch (error) {
      console.error('Error downloading template:', error);
      setNotification({
        type: 'error',
        message: 'Error downloading template file'
      });
    }
  };

  // Fetch all data on component mount
  useEffect(() => {
    const fetchInitialData = async (): Promise<void> => {
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
          const validClubsData = Array.isArray(clubsData) ? clubsData : [];
          setAllClubs(validClubsData);
          
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
                const currentUserClub = validClubsData.find((club) => club.id === clubId);
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

    const fetchAllData = async () => {
      await Promise.all([
        fetchInitialData(),
        fetchOrganisations()
      ]);
    };

    fetchAllData();
  }, []);

  // Update selected club when selectedClubId changes
  useEffect(() => {
    if (selectedClubId) {
      const club = allClubs.find(c => c.id === selectedClubId) || null;
      setSelectedClub(club);
      
      if (club) {
        fetchClubUsers(club.id);
        fetchClubFeatures(club.id);
      }
    } else {
      setSelectedClub(null);
      setClubUsers([]);
      setFeatures([]);
    }
  }, [selectedClubId, allClubs]);

  // Auto-dismiss notifications after 5 seconds
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => {
        setNotification(null);
      }, 5000);
      
      return () => clearTimeout(timer);
    }
  }, [notification]);

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
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              {notification.type === 'success' ? 
                <CheckCircle className="h-5 w-5 mr-2 text-green-600" /> : 
                <AlertCircle className="h-5 w-5 mr-2 text-red-600" />
              }
              <p>{notification.message}</p>
            </div>
            <button
              onClick={() => setNotification(null)}
              className="ml-2 text-gray-400 hover:text-gray-600"
            >
              ×
            </button>
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
        
        <div className="p-6 space-y-8">
          
          {/* 1. INVITE ORGANISATION / CLUB */}
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

          {/* 2. CREATE CLUB AND ASSIGN TO ORGANISATION */}
          <div className="border rounded-lg p-6 bg-gradient-to-r from-indigo-50 to-purple-50">
            <h2 className="text-xl font-semibold mb-4 flex items-center">
              <Building className="h-6 w-6 mr-3 text-indigo-600" />
              2. Create New Club
            </h2>
            
            {/* Organization Management */}
            <div className="mb-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-medium">Organizations</h3>
                <button
                  type="button"
                  onClick={() => setShowCreateOrgForm(!showCreateOrgForm)}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 text-sm"
                >
                  <Plus className="h-4 w-4 inline mr-1" />
                  Create Organization
                </button>
              </div>
              
              {showCreateOrgForm && (
                <form onSubmit={handleCreateOrganisation} className="bg-white p-4 rounded-md border mb-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Organization Name
                      </label>
                      <input
                        type="text"
                        value={newOrgName}
                        onChange={(e) => {
                          setNewOrgName(e.target.value);
                          const slug = e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
                          setNewOrgSlug(slug);
                        }}
                        className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                        placeholder="e.g., Ace Tennis Academy"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Slug (URL identifier)
                      </label>
                      <input
                        type="text"
                        value={newOrgSlug}
                        onChange={(e) => setNewOrgSlug(e.target.value)}
                        className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                        placeholder="e.g., ace-tennis-academy"
                        required
                      />
                    </div>
                  </div>
                  <div className="flex justify-end space-x-2 mt-4">
                    <button
                      type="button"
                      onClick={() => {
                        setShowCreateOrgForm(false);
                        setNewOrgName('');
                        setNewOrgSlug('');
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
                      {isActionLoading ? 'Creating...' : 'Create Organization'}
                    </button>
                  </div>
                </form>
              )}
              
              {/* Organizations table */}
              {isLoadingOrganisations ? (
                <div className="flex justify-center p-4">
                  <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-indigo-600"></div>
                </div>
              ) : (
                <div className="bg-white rounded-md border overflow-hidden">
                  <table className="min-w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Organization</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Clubs</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Users</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {organisations.map(org => (
                        <tr key={org.id}>
                          <td className="px-4 py-2 text-sm font-medium text-gray-900">{org.name}</td>
                          <td className="px-4 py-2 text-sm text-gray-500">{org.club_count}</td>
                          <td className="px-4 py-2 text-sm text-gray-500">{org.user_count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {organisations.length === 0 && (
                    <div className="text-center py-4 text-gray-500">
                      No organizations found. Create one above.
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Create Club Form */}
            <div>
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-medium">Create New Club</h3>
                <button
                  type="button"
                  onClick={() => setShowCreateClubForm(!showCreateClubForm)}
                  className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm"
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
                        className="w-full rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500"
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
                        className="w-full rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500"
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
                        className="w-full rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500"
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
                      className="px-3 py-2 text-sm text-white bg-green-600 rounded-md hover:bg-green-700 disabled:bg-green-400"
                    >
                      {isActionLoading ? 'Creating...' : 'Create Club'}
                    </button>
                  </div>
                </form>
              )}
            </div>

            {/* Unassigned Clubs */}
            <div className="mt-6">
              <h3 className="font-medium mb-3">Clubs Without Organization</h3>
              {(() => {
                const unassignedClubs = allClubs.filter(club => !club.organisation);
                
                if (unassignedClubs.length === 0) {
                  return (
                    <div className="text-center py-4 text-gray-500 bg-white rounded-md border">
                      All clubs are assigned to organizations
                    </div>
                  );
                }
                
                return (
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
                );
              })()}
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
                className={`px-6 py-2 rounded-md text-white ${isActionLoading ? 'bg-blue-400' : 'bg-blue-600 hover:bg-blue-700'}`}
                onClick={handleSwitchClub}
                disabled={!selectedClubId || isActionLoading}
              >
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

          {/* SECTIONS ONLY SHOWN WHEN CLUB IS SELECTED */}
          {selectedClub && (
            <>
              {/* 4. USER ROLE MANAGEMENT */}
              <div className="border rounded-lg p-6 bg-gradient-to-r from-red-50 to-pink-50">
                <h2 className="text-xl font-semibold mb-4 flex items-center">
                  <Shield className="h-6 w-6 mr-3 text-red-600" />
                  4. User Role Management for {selectedClub.name}
                </h2>
                
                {isLoadingUsers ? (
                  <div className="flex justify-center p-4">
                    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-red-600"></div>
                  </div>
                ) : (
                  <>
                    {clubUsers.length === 0 ? (
                      <p className="text-gray-500 text-center py-4">No users found in this club</p>
                    ) : (
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
                                            type="button"
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
                                            type="button"
                                            onClick={() => handleDirectRoleChange(user.id, 'COACH')}
                                            disabled={updateInProgress === user.id}
                                            className="inline-flex items-center px-3 py-1 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-yellow-600 hover:bg-yellow-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500"
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
                    )}
                  </>
                )}
              </div>

              {/* 5. FEATURE MANAGEMENT - FIXED */}
              <div className="border rounded-lg p-6 bg-gradient-to-r from-purple-50 to-pink-50">
                <h2 className="text-xl font-semibold mb-4 flex items-center">
                  <Settings className="h-6 w-6 mr-3 text-purple-600" />
                  5. Feature Management for {selectedClub.name}
                </h2>
                
                {isLoadingFeatures ? (
                  <div className="flex justify-center p-4">
                    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-purple-600"></div>
                  </div>
                ) : (
                  <>
                    <div className="space-y-3 mb-6">
                      {Array.isArray(features) && features.length > 0 ? (
                        features.map(feature => (
                          <div 
                            key={feature.name} 
                            className="flex items-center justify-between p-4 bg-white rounded-md border"
                          >
                            <div className="flex items-center space-x-3">
                              <div className="text-2xl">{feature.icon || '⚙️'}</div>
                              <div>
                                <h4 className="font-medium text-gray-800">{feature.display_name}</h4>
                                <p className="text-sm text-gray-600">{feature.description}</p>
                              </div>
                            </div>
                            <div className="flex items-center">
                              <button
                                type="button"
                                onClick={() => handleToggleFeature(feature.name)}
                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 ${
                                  feature.is_enabled ? 'bg-purple-600' : 'bg-gray-200'
                                }`}
                              >
                                <span
                                  className={`${
                                    feature.is_enabled ? 'translate-x-6' : 'translate-x-1'
                                  } inline-block h-4 w-4 transform rounded-full bg-white transition-transform`}
                                />
                              </button>
                              <span className="ml-2 text-sm text-gray-600">
                                {feature.is_enabled ? 'Enabled' : 'Disabled'}
                              </span>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="text-center py-8 text-gray-500 bg-white rounded-md border">
                          No features available to configure
                        </div>
                      )}
                    </div>
                    
                    {features.length > 0 && (
                      <div className="flex justify-end">
                        <button 
                          type="button"
                          className={`px-6 py-2 rounded-md text-white ${isUpdatingFeatures ? 'bg-purple-400' : 'bg-purple-600 hover:bg-purple-700'} flex items-center`}
                          onClick={handleSaveFeatures}
                          disabled={isUpdatingFeatures}
                        >
                          <Settings className="h-4 w-4 mr-2" />
                          {isUpdatingFeatures ? 'Saving...' : 'Save Features'}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* 6. IMPORT GROUPS AND TIME SLOTS */}
              <div className="border rounded-lg p-6 bg-gradient-to-r from-orange-50 to-red-50">
                <h2 className="text-xl font-semibold mb-4 flex items-center">
                  <Database className="h-6 w-6 mr-3 text-orange-600" />
                  6. Import Groups & Time Slots for {selectedClub.name}
                </h2>
                <div className="mb-4">
                  <p className="text-gray-600 mb-2">
                    Upload a CSV file containing groups and time slots. The CSV should include group name, description, day of week, start time, and end time.
                  </p>
                  <button
                    type="button"
                    onClick={handleDownloadTemplate} 
                    className="text-orange-600 hover:text-orange-800 text-sm flex items-center"
                  >
                    <FileText className="h-4 w-4 mr-1" />
                    Download Template
                  </button>
                </div>
                
                <form onSubmit={handleGroupsUpload} className="space-y-4">
                  <div className="relative border-2 border-dashed border-gray-300 rounded-md p-6 flex flex-col items-center justify-center bg-white">
                    <UploadCloud className="h-8 w-8 text-gray-400 mb-2" />
                    <p className="text-sm text-gray-600 mb-2">Click to browse or drag and drop</p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv"
                      onChange={handleFileChange}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    {uploadStatus.fileName && (
                      <div className="mt-2 text-sm text-gray-800 flex items-center">
                        <FileText className="h-4 w-4 mr-1" />
                        {uploadStatus.fileName}
                      </div>
                    )}
                  </div>
                  
                  {uploadStatus.isUploading && (
                    <div className="mt-2">
                      <div className="bg-gray-200 rounded-full h-2.5 mb-2">
                        <div 
                          className="bg-orange-600 h-2.5 rounded-full transition-all duration-300" 
                          style={{ width: `${uploadStatus.progress}%` }}
                        ></div>
                      </div>
                      <p className="text-xs text-gray-600 text-right">
                        {uploadStatus.progress}% uploaded
                      </p>
                    </div>
                  )}
                  
                  {uploadStatus.result && (
                    <div className="mt-2 p-3 bg-white rounded-md border text-sm">
                      <div className="flex justify-between text-gray-700 mb-1">
                        <span>Groups created:</span>
                        <span>{uploadStatus.result.groupsCreated}</span>
                      </div>
                      <div className="flex justify-between text-gray-700 mb-1">
                        <span>Time slots created:</span>
                        <span>{uploadStatus.result.timeSlotsCreated}</span>
                      </div>
                      
                      {uploadStatus.result.warnings.length > 0 && (
                        <div className="mt-2">
                          <h4 className="text-yellow-600 font-medium text-xs mb-1">Warnings:</h4>
                          <ul className="text-xs text-yellow-700 pl-4 list-disc">
                            {uploadStatus.result.warnings.slice(0, 3).map((warning, i) => (
                              <li key={i}>{warning}</li>
                            ))}
                            {uploadStatus.result.warnings.length > 3 && (
                              <li>...and {uploadStatus.result.warnings.length - 3} more warnings</li>
                            )}
                          </ul>
                        </div>
                      )}
                      
                      {uploadStatus.result.errors.length > 0 && (
                        <div className="mt-2">
                          <h4 className="text-red-600 font-medium text-xs mb-1">Errors:</h4>
                          <ul className="text-xs text-red-700 pl-4 list-disc">
                            {uploadStatus.result.errors.slice(0, 3).map((error, i) => (
                              <li key={i}>{error}</li>
                            ))}
                            {uploadStatus.result.errors.length > 3 && (
                              <li>...and {uploadStatus.result.errors.length - 3} more errors</li>
                            )}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                  
                  <div className="flex justify-end">
                    <button 
                      type="submit"
                      className={`px-6 py-2 rounded-md text-white flex items-center ${isActionLoading ? 'bg-orange-400' : 'bg-orange-600 hover:bg-orange-700'}`}
                      disabled={isActionLoading || !uploadStatus.fileName}
                    >
                      <UploadCloud className="h-4 w-4 mr-2" />
                      {isActionLoading ? 'Uploading...' : 'Upload File'}
                    </button>
                  </div>
                </form>
              </div>

              {/* Management Links */}
              <div className="border rounded-lg p-6 bg-gray-50">
                <h3 className="font-medium mb-4">Club Management Links</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <a 
                    href={`/clubs/manage/${selectedClub.id}/club`}
                    className="bg-indigo-600 text-white py-3 px-4 rounded-md hover:bg-indigo-700 text-center flex items-center justify-center"
                  >
                    <Settings className="h-4 w-4 mr-2" />
                    Club Settings
                  </a>
                  <a 
                    href={`/clubs/manage/${selectedClub.id}/coaches`}
                    className="bg-indigo-600 text-white py-3 px-4 rounded-md hover:bg-indigo-700 text-center flex items-center justify-center"
                  >
                    <Users className="h-4 w-4 mr-2" />
                    Coaches
                  </a>
                  <a 
                    href={`/clubs/manage/${selectedClub.id}/groups`}
                    className="bg-indigo-600 text-white py-3 px-4 rounded-md hover:bg-indigo-700 text-center flex items-center justify-center"
                  >
                    <Users className="h-4 w-4 mr-2" />
                    Groups
                  </a>
                  <a 
                    href={`/clubs/manage/${selectedClub.id}/teaching-periods`}
                    className="bg-indigo-600 text-white py-3 px-4 rounded-md hover:bg-indigo-700 text-center flex items-center justify-center"
                  >
                    <Calendar className="h-4 w-4 mr-2" />
                    Teaching Periods
                  </a>
                  <a 
                    href={`/clubs/manage/${selectedClub.id}/players`}
                    className="bg-indigo-600 text-white py-3 px-4 rounded-md hover:bg-indigo-700 text-center flex items-center justify-center"
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