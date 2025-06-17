import React, { useEffect, useState } from 'react';
import { ChevronDown, LogOut, Check, Building, Home, RotateCcw } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';

interface TennisClub {
  id: number;
  name: string;
  subdomain: string;
}

interface Organisation {
  id: number;
  name: string;
  slug: string;
}

interface User {
  name: string;
  tennis_club?: {
    subdomain: string;
    name: string;
    id: number;
    organisation?: Organisation;
  };
  tennis_club_id?: number;
  is_admin: boolean;
  is_super_admin: boolean;
  accessible_clubs?: TennisClub[];
  current_club_id?: number; // This will be ignored for permanent switching
}

interface NavigationBarProps {
  currentUser: User;
  onClubSwitch?: (clubId: number) => void;
}

const NavigationBar: React.FC<NavigationBarProps> = ({ currentUser, onClubSwitch }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [isCycling, setIsCycling] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);
  
  const isAdmin = currentUser.is_admin || currentUser.is_super_admin;
  const clubName = currentUser.tennis_club?.name || 'No Club Assigned';
  
  // FIXED: For permanent club switching, always use tennis_club_id (no session override)
  const currentClubId = currentUser.tennis_club?.id || currentUser.tennis_club_id;
  
  // Get accessible clubs (default to current club if not provided)
  const accessibleClubs = currentUser.accessible_clubs || (currentUser.tennis_club ? [
    {
      id: currentUser.tennis_club.id,
      name: currentUser.tennis_club.name,
      subdomain: currentUser.tennis_club.subdomain || ''
    }
  ] : []);
  
  // Determine if this is a multi-tenant scenario
  const isMultiTenant = isAdmin && accessibleClubs.length > 1;
  
  // FIXED: Get current club name based on actual tennis_club_id
  const currentClub = accessibleClubs.find(club => club.id === currentClubId) || currentUser.tennis_club;
  const displayClubName = currentClub?.name || clubName;
  
  // Get organization name if available
  const organizationName = currentUser.tennis_club?.organisation?.name;

  useEffect(() => {
    console.log('Current User Data:', currentUser);
    console.log('Is Admin:', isAdmin);
    console.log('Is Multi-tenant:', isMultiTenant);
    console.log('Current Club ID:', currentClubId);
    console.log('Accessible Clubs:', accessibleClubs);
    console.log('Current Club Object:', currentClub);
  }, [currentUser]);

  // Show settings if user is admin and we have a club ID
  const showSettings = isAdmin && currentClubId;

  const handleHomeClick = () => {
    window.location.href = '/home';
  };

  const handleClubSwitch = async (newClubId: number) => {
    // FIXED: Compare with actual current club ID
    if (newClubId === currentClubId || isLoading) return;
    
    console.log(`Switching from club ${currentClubId} to club ${newClubId}`);
    
    setIsLoading(true);
    setNotification(null);
    
    try {
      const response = await fetch('/clubs/api/switch-club', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({ club_id: newClubId }),
        credentials: 'include'
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log('Club switch response:', data);
        setNotification(`Switched to ${data.club.name}`);
        
        // Call the callback if provided
        if (onClubSwitch) {
          onClubSwitch(newClubId);
        }
        
        // Reload the page to update all club-specific data
        setTimeout(() => {
          window.location.reload();
        }, 500);
      } else {
        const errorData = await response.json();
        console.error('Club switch error:', errorData);
        setNotification(`Failed to switch club: ${errorData.error}`);
      }
    } catch (error) {
      console.error('Error switching club:', error);
      setNotification('Error switching club. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCycleClubs = async () => {
    if (!isMultiTenant || isCycling) return;
    
    console.log('Cycling clubs...');
    
    setIsCycling(true);
    setNotification(null);
    
    try {
      const response = await fetch('/clubs/api/switch-clubs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        credentials: 'include'
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log('Club cycle response:', data);
        setNotification(`Switched to ${data.club.name}`);
        
        // Reload the page to update all club-specific data
        setTimeout(() => {
          window.location.reload();
        }, 500);
      } else {
        const errorData = await response.json();
        console.error('Club cycle error:', errorData);
        setNotification(`Failed to cycle clubs: ${errorData.error}`);
      }
    } catch (error) {
      console.error('Error cycling clubs:', error);
      setNotification('Error cycling clubs. Please try again.');
    } finally {
      setIsCycling(false);
    }
  };

  return (
    <>
      {notification && (
        <div className="bg-blue-50 border-b border-blue-200 px-4 py-2">
          <div className="max-w-7xl mx-auto">
            <p className="text-sm text-blue-800">{notification}</p>
          </div>
        </div>
      )}
      
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            {/* Left side - Home Button + Brand and Club Info */}
            <div className="flex items-center space-x-4">
              {/* Home Button */}
              <button
                onClick={handleHomeClick}
                className="flex items-center space-x-2 px-3 py-2 rounded-md text-gray-700 hover:text-blue-600 hover:bg-gray-100 transition-colors duration-200"
                title="Go to Dashboard"
              >
                <Home className="h-5 w-5" />
                <span className="font-medium hidden sm:inline">Home</span>
              </button>

              {/* Divider */}
              <div className="h-6 w-px bg-gray-300"></div>

              <div className="flex-shrink-0 flex items-center">
                {isMultiTenant ? (
                  // Multi-tenant: Show club switcher with cycle button
                  <div className="flex items-center space-x-2">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button 
                          className="flex items-center text-xl font-bold text-blue-600 hover:text-blue-700 focus:outline-none"
                          disabled={isLoading}
                        >
                          {isLoading ? (
                            <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-blue-600 mr-2"></div>
                          ) : (
                            <Building className="h-5 w-5 mr-2" />
                          )}
                          {displayClubName}
                          <ChevronDown className="w-4 h-4 ml-1" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-64">
                        <DropdownMenuLabel>
                          <div className="flex flex-col">
                            <span className="font-medium">Switch Club</span>
                            {organizationName && (
                              <span className="text-xs text-gray-500">{organizationName}</span>
                            )}
                            <span className="text-xs text-gray-400 mt-1">
                              Current: {displayClubName} (ID: {currentClubId})
                            </span>
                          </div>
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {accessibleClubs.map(club => (
                          <DropdownMenuItem 
                            key={club.id}
                            onClick={() => {
                              console.log(`Clicked club: ${club.name} (ID: ${club.id})`);
                              handleClubSwitch(club.id);
                            }}
                            className={`cursor-pointer ${club.id === currentClubId ? 'bg-blue-50' : ''}`}
                          >
                            <div className="flex items-center justify-between w-full">
                              <div className="flex flex-col">
                                <span className="font-medium">{club.name}</span>
                                <span className="text-xs text-gray-500">ID: {club.id}</span>
                              </div>
                              {club.id === currentClubId && (
                                <Check className="h-4 w-4 text-blue-600" />
                              )}
                            </div>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>

                    {/* Cycle Button */}
                    <button
                      onClick={handleCycleClubs}
                      disabled={isCycling || accessibleClubs.length <= 1}
                      className="p-2 rounded-md text-gray-600 hover:text-blue-600 hover:bg-gray-100 transition-colors duration-200 disabled:opacity-50"
                      title="Switch to next club"
                    >
                      {isCycling ? (
                        <div className="animate-spin h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full"></div>
                      ) : (
                        <RotateCcw className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                ) : (
                  // Single-tenant: Show regular club name
                  <button 
                    onClick={handleHomeClick}
                    className="text-xl font-bold text-blue-600 hover:text-blue-700"
                  >
                    {displayClubName}
                  </button>
                )}
              </div>
              
              <div className="hidden md:flex md:items-center md:ml-6">
                <div className="px-3 py-1 bg-gray-100 rounded-full flex items-center">
                  <span className="text-sm text-gray-600">
                    Coach Portal
                  </span>
                </div>
              </div>
            </div>

            {/* Right side - User Menu and Settings */}
            <div className="flex items-center space-x-4">
              {/* Settings Dropdown */}
              {showSettings && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="flex items-center px-3 py-2 text-sm font-medium text-gray-600 hover:text-blue-600 focus:outline-none">
                      Manage
                      <ChevronDown className="w-4 h-4 ml-1" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel>Admin Management</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem>
                      <a 
                        href={`/clubs/manage/${currentClubId}/club`}
                        className="flex items-center w-full"
                      >
                        Club
                      </a>
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <a 
                        href={`/clubs/manage/${currentClubId}/teaching-periods`}
                        className="flex items-center w-full"
                      >
                        Terms
                      </a>
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <a 
                        href={`/clubs/manage/${currentClubId}/groups`}
                        className="flex items-center w-full"
                      >
                        Groups
                      </a>
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <a 
                        href={`/clubs/manage/${currentClubId}/coaches`}
                        className="flex items-center w-full"
                      >
                        Coaches
                      </a>
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <a
                        href={`/clubs/manage/${currentClubId}/report-templates`}
                        className="flex items-center w-full"
                      >
                        Report Templates
                      </a>
                    </DropdownMenuItem>
                    {/* Super Admin Dashboard link - only for super admins */}
                    {currentUser.is_super_admin && (
                      <DropdownMenuItem>
                        <a 
                          href="/clubs/super-admin" 
                          className="flex items-center w-full text-purple-600 font-medium"
                        >
                          Super Admin Dashboard
                        </a>
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}

              {/* User Profile */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center">
                    <div className="h-8 w-8 rounded-full bg-blue-600 flex items-center justify-center text-white font-medium">
                      {currentUser.name.split(' ')
                        .slice(0, 2)
                        .map(part => part.charAt(0))
                        .join('')}
                    </div>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>
                    <div className="flex flex-col">
                      <span className="font-medium">{currentUser.name}</span>
                      <span className="text-xs text-gray-500">{displayClubName}</span>
                      {organizationName && (
                        <span className="text-xs text-gray-400">{organizationName}</span>
                      )}
                    </div>
                  </DropdownMenuLabel>
                  
                  {/* Secondary Club Switcher in User Menu */}
                  {isMultiTenant && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel className="text-xs font-medium text-gray-500">
                        Switch Club
                      </DropdownMenuLabel>
                      {accessibleClubs.map(club => (
                        <DropdownMenuItem 
                          key={club.id}
                          onClick={() => handleClubSwitch(club.id)}
                          className={`cursor-pointer ${club.id === currentClubId ? 'bg-blue-50' : ''}`}
                        >
                          <div className="flex items-center justify-between w-full">
                            <span className="text-sm">{club.name}</span>
                            {club.id === currentClubId && (
                              <Check className="h-3 w-3 text-blue-600" />
                            )}
                          </div>
                        </DropdownMenuItem>
                      ))}
                    </>
                  )}
                  
                  <DropdownMenuSeparator />
                  <DropdownMenuItem>
                    <a href="/profile" className="flex items-center w-full">
                      Profile Settings
                    </a>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-red-600">
                    <a href="/logout" className="flex items-center w-full">
                      <LogOut className="w-4 h-4 mr-2" />
                      Logout
                    </a>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </nav>
    </>
  );
};

export default NavigationBar;