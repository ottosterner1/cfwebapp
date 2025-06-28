import React, { useState, useEffect } from 'react';
import { 
  AlertCircle, CheckCircle, Crown, Menu, X, Building, Users, Database, Zap
} from 'lucide-react';
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
  shortName: string; // For mobile display
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
  
  // Mobile navigation state
  const [activeTab, setActiveTab] = useState('organisations');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [, setIsTabDropdownOpen] = useState(false);

  const tabs: Tab[] = [
    { 
      id: 'organisations', 
      name: 'Organisations', 
      shortName: 'Orgs',
      icon: Building 
    },
    { 
      id: 'clubs', 
      name: 'Club Management', 
      shortName: 'Clubs',
      icon: Crown 
    },
    { 
      id: 'users', 
      name: 'User Management', 
      shortName: 'Users',
      icon: Users 
    },
    { 
      id: 'features', 
      name: 'Feature Management', 
      shortName: 'Features',
      icon: Zap 
    },
    { 
      id: 'data', 
      name: 'Data Import', 
      shortName: 'Data',
      icon: Database 
    }
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

  // Handle tab change and close mobile menu
  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId);
    setIsMobileMenuOpen(false);
    setIsTabDropdownOpen(false);
  };

  // Get selected club
  const selectedClub = selectedClubId ? allClubs.find(c => c.id === selectedClubId) : null;

  // Get current tab
  const currentTab = tabs.find(tab => tab.id === activeTab);

  // Fetch all data on component mount
  useEffect(() => {
    const fetchInitialData = async () => {
      setIsLoading(true);
      
      try {
        await fetchClubs();
        await fetchOrganisations();
        
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

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      setIsTabDropdownOpen(false);
      setIsMobileMenuOpen(false);
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

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
          <div className="text-center py-8 text-gray-500 px-4">
            <Building className="mx-auto h-12 w-12 text-gray-300 mb-4" />
            <p className="text-lg font-medium mb-2">No Club Selected</p>
            <p className="text-sm">Please select a club using the Club Management tab first.</p>
          </div>
        );
      
      case 'features':
        return selectedClub ? (
          <FeatureManagement
            selectedClub={selectedClub}
            onNotification={handleNotification}
          />
        ) : (
          <div className="text-center py-8 text-gray-500 px-4">
            <Zap className="mx-auto h-12 w-12 text-gray-300 mb-4" />
            <p className="text-lg font-medium mb-2">No Club Selected</p>
            <p className="text-sm">Please select a club using the Club Management tab first.</p>
          </div>
        );
      
      case 'data':
        return selectedClub ? (
          <DataImport
            selectedClub={selectedClub}
            onNotification={handleNotification}
          />
        ) : (
          <div className="text-center py-8 text-gray-500 px-4">
            <Database className="mx-auto h-12 w-12 text-gray-300 mb-4" />
            <p className="text-lg font-medium mb-2">No Club Selected</p>
            <p className="text-sm">Please select a club using the Club Management tab first.</p>
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
    <div className="min-h-screen bg-gray-50">
      {/* Mobile Header */}
      <div className="lg:hidden bg-white shadow-sm border-b">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-bold text-gray-900 truncate">
              Super Admin
            </h1>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsMobileMenuOpen(!isMobileMenuOpen);
              }}
              className="p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100"
            >
              {isMobileMenuOpen ? (
                <X className="h-6 w-6" />
              ) : (
                <Menu className="h-6 w-6" />
              )}
            </button>
          </div>
          
          {/* Current Club Badge - Mobile */}
          {currentClub && (
            <div className="mt-3">
              <div className="bg-purple-100 text-purple-800 py-2 px-3 rounded-lg text-sm font-medium text-center">
                {currentClub.name}
              </div>
            </div>
          )}
        </div>

        {/* Mobile Navigation Menu */}
        {isMobileMenuOpen && (
          <div className="border-t border-gray-200 bg-white">
            <div className="px-4 py-2 space-y-1">
              {tabs.map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => handleTabChange(tab.id)}
                    className={`${
                      isActive
                        ? 'bg-indigo-50 text-indigo-700 border-indigo-500'
                        : 'text-gray-600 hover:bg-gray-50 border-transparent'
                    } w-full text-left px-3 py-3 rounded-lg border font-medium text-base flex items-center transition-colors`}
                  >
                    <tab.icon className="h-5 w-5 mr-3" />
                    {tab.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Desktop Header */}
      <div className="hidden lg:block">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-white shadow-lg rounded-lg mb-8">
            <div className="px-6 py-4 border-b border-gray-200 flex flex-row items-center justify-between">
              <h1 className="text-2xl font-bold">Super Admin Dashboard</h1>
              {currentClub && (
                <div className="bg-purple-100 text-purple-800 py-1 px-3 rounded-full text-sm font-medium">
                  Current Club: {currentClub.name}
                </div>
              )}
            </div>
            
            {/* Desktop Tab Navigation */}
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
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">
        {/* Notification */}
        {notification && (
          <div className={`mb-4 lg:mb-6 p-4 rounded-md border ${
            notification.type === 'success' 
              ? 'bg-green-50 border-green-200 text-green-800' 
              : notification.type === 'warning'
              ? 'bg-yellow-50 border-yellow-200 text-yellow-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                {notification.type === 'success' ? (
                  <CheckCircle className="h-5 w-5 mr-2 text-green-600 flex-shrink-0" />
                ) : (
                  <AlertCircle className="h-5 w-5 mr-2 text-red-600 flex-shrink-0" />
                )}
                <p className="text-sm lg:text-base">{notification.message}</p>
              </div>
              <button
                onClick={clearNotification}
                className="ml-2 text-gray-400 hover:text-gray-600 flex-shrink-0"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
        )}

        {/* Mobile Tab Indicator */}
        <div className="lg:hidden mb-4">
          <div className="bg-white rounded-lg shadow-sm border p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                {currentTab && (
                  <>
                    <currentTab.icon className="h-5 w-5 text-indigo-600 mr-2" />
                    <span className="font-medium text-gray-900">{currentTab.name}</span>
                  </>
                )}
              </div>
              <div className="text-sm text-gray-500">
                {tabs.findIndex(tab => tab.id === activeTab) + 1} of {tabs.length}
              </div>
            </div>
          </div>
        </div>

        {/* Tab Content */}
        <div className="bg-white shadow-lg rounded-lg">
          <div className="p-4 lg:p-6">
            {renderTabContent()}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SuperAdminDashboard;