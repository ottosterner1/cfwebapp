import React, { useState, useEffect } from 'react';
import { AlertCircle, CheckCircle, Crown, Settings } from 'lucide-react';
import OrganisationManagement from './OrganisationManagement';
import ClubManagement from './ClubManagement';
import UserManagement from './UserManagement';
import FeatureManagement from './FeatureManagement';
import DataImport from './DataImport';

// Interfaces
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

interface Notification {
  type: 'success' | 'error' | 'warning';
  message: string;
}

interface Tab {
  id: string;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
}

const SuperAdminDashboard: React.FC = () => {
  // Core state
  const [allClubs, setAllClubs] = useState<TennisClub[]>([]);
  const [organisations, setOrganisations] = useState<Organisation[]>([]);
  const [currentClub, setCurrentClub] = useState<TennisClub | null>(null);
  const [selectedClubId, setSelectedClubId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notification, setNotification] = useState<Notification | null>(null);
  
  // Tab management
  const [activeTab, setActiveTab] = useState('organisations');

  const tabs: Tab[] = [
    { id: 'organisations', name: 'Organisations', icon: Crown },
    { id: 'clubs', name: 'Club Management', icon: Settings },
    { id: 'users', name: 'User Management', icon: Settings },
    { id: 'features', name: 'Feature Management', icon: Settings },
    { id: 'data', name: 'Data Import', icon: Settings }
  ];

  // Fetch organizations
  const fetchOrganisations = async () => {
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
    }
  };

  // Fetch clubs
  const fetchClubs = async () => {
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

  // Handle notifications
  const handleNotification = (notification: Notification) => {
    setNotification(notification);
  };

  // Clear notification
  const clearNotification = () => {
    setNotification(null);
  };

  // Get selected club
  const selectedClub = selectedClubId ? allClubs.find(c => c.id === selectedClubId) : null;

  // Fetch all data on component mount
  useEffect(() => {
    const fetchInitialData = async () => {
      setIsLoading(true);
      
      try {
        // Fetch clubs first
        await fetchClubs();
        
        // Fetch organizations
        await fetchOrganisations();
        
        // Try to get current user's club
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
              setSelectedClubId(clubId);
              // Note: currentClub will be set when clubs are loaded
            }
          }
        } catch (userError) {
          console.error('Error fetching user data:', userError);
        }
      } catch (error) {
        console.error('Error fetching initial data:', error);
        handleNotification({
          type: 'error',
          message: 'Failed to load initial data. Please refresh the page.'
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchInitialData();
  }, []);

  // Update current club when clubs are loaded or selectedClubId changes
  useEffect(() => {
    if (selectedClubId && allClubs.length > 0) {
      const club = allClubs.find(c => c.id === selectedClubId) || null;
      setCurrentClub(club);
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

  // Render tab content
  const renderTabContent = () => {
    switch (activeTab) {
      case 'organisations':
        return (
          <OrganisationManagement 
            onNotification={handleNotification}
          />
        );
      
      case 'clubs':
        return (
          <ClubManagement
            allClubs={allClubs}
            organisations={organisations}
            currentClub={currentClub}
            onNotification={handleNotification}
            onRefreshClubs={fetchClubs}
            onRefreshOrganisations={fetchOrganisations}
          />
        );
      
      case 'users':
        return selectedClub ? (
          <UserManagement
            selectedClub={selectedClub}
            onNotification={handleNotification}
          />
        ) : (
          <div className="text-center py-8 text-gray-500">
            Please select a club using the Club Management tab first.
          </div>
        );
      
      case 'features':
        return selectedClub ? (
          <FeatureManagement
            selectedClub={selectedClub}
            onNotification={handleNotification}
          />
        ) : (
          <div className="text-center py-8 text-gray-500">
            Please select a club using the Club Management tab first.
          </div>
        );
      
      case 'data':
        return selectedClub ? (
          <DataImport
            selectedClub={selectedClub}
            onNotification={handleNotification}
          />
        ) : (
          <div className="text-center py-8 text-gray-500">
            Please select a club using the Club Management tab first.
          </div>
        );
      
      default:
        return <div>Invalid tab</div>;
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
      {/* Notification */}
      {notification && (
        <div className={`mb-6 p-4 rounded-md border ${
          notification.type === 'success' 
            ? 'bg-green-50 border-green-200 text-green-800' 
            : notification.type === 'warning'
            ? 'bg-yellow-50 border-yellow-200 text-yellow-800'
            : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              {notification.type === 'success' ? (
                <CheckCircle className="h-5 w-5 mr-2 text-green-600" />
              ) : (
                <AlertCircle className="h-5 w-5 mr-2 text-red-600" />
              )}
              <p>{notification.message}</p>
            </div>
            <button
              onClick={clearNotification}
              className="ml-2 text-gray-400 hover:text-gray-600"
            >
              ×
            </button>
          </div>
        </div>
      )}
      
      {/* Header */}
      <div className="bg-white shadow-lg rounded-lg mb-8">
        <div className="px-6 py-4 border-b border-gray-200 flex flex-row items-center justify-between">
          <h1 className="text-2xl font-bold">Super Admin Dashboard</h1>
          {currentClub && (
            <div className="bg-purple-100 text-purple-800 py-1 px-3 rounded-full text-sm font-medium">
              Current Club: {currentClub.name}
            </div>
          )}
        </div>
        
        {/* Tab Navigation */}
        <div className="px-6">
          <nav className="-mb-px flex space-x-8" aria-label="Tabs">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`${
                    isActive
                      ? 'border-indigo-500 text-indigo-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center`}
                >
                  <tab.icon className="h-4 w-4 mr-2" />
                  {tab.name}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Tab Content */}
      <div className="bg-white shadow-lg rounded-lg">
        <div className="p-6">
          {renderTabContent()}
        </div>
      </div>

      {/* Management Links - Only show if club is selected */}
      {selectedClub && (
        <div className="mt-8 bg-white shadow-lg rounded-lg">
          <div className="p-6">
            <h3 className="font-medium mb-4">Quick Access Links for {selectedClub.name}</h3>
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
                <Settings className="h-4 w-4 mr-2" />
                Coaches
              </a>
              <a 
                href={`/clubs/manage/${selectedClub.id}/groups`}
                className="bg-indigo-600 text-white py-3 px-4 rounded-md hover:bg-indigo-700 text-center flex items-center justify-center"
              >
                <Settings className="h-4 w-4 mr-2" />
                Groups
              </a>
              <a 
                href={`/clubs/manage/${selectedClub.id}/teaching-periods`}
                className="bg-indigo-600 text-white py-3 px-4 rounded-md hover:bg-indigo-700 text-center flex items-center justify-center"
              >
                <Settings className="h-4 w-4 mr-2" />
                Teaching Periods
              </a>
              <a 
                href={`/clubs/manage/${selectedClub.id}/players`}
                className="bg-indigo-600 text-white py-3 px-4 rounded-md hover:bg-indigo-700 text-center flex items-center justify-center"
              >
                <Settings className="h-4 w-4 mr-2" />
                Players
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SuperAdminDashboard;