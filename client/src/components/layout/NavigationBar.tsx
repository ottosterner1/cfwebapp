import React, { useEffect, useState } from 'react';
import { 
  ChevronDown, 
  LogOut, 
  Check, 
  Building, 
  Home, 
  Menu, 
  X,
  Settings,
  User
} from 'lucide-react';
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
  current_club_id?: number;
}

interface NavigationBarProps {
  currentUser: User;
  onClubSwitch?: (clubId: number) => void;
}

const NavigationBar: React.FC<NavigationBarProps> = ({ currentUser, onClubSwitch }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  const isAdmin = currentUser.is_admin || currentUser.is_super_admin;
  const clubName = currentUser.tennis_club?.name || 'No Club Assigned';
  
  const currentClubId = currentUser.tennis_club?.id || currentUser.tennis_club_id;
  
  const accessibleClubs = currentUser.accessible_clubs || (currentUser.tennis_club ? [
    {
      id: currentUser.tennis_club.id,
      name: currentUser.tennis_club.name,
      subdomain: currentUser.tennis_club.subdomain || ''
    }
  ] : []);
  
  // CHANGED: Allow both admins and coaches to switch clubs if they have multiple accessible clubs
  const isMultiTenant = accessibleClubs.length > 1;
  const currentClub = accessibleClubs.find(club => club.id === currentClubId) || currentUser.tennis_club;
  const displayClubName = currentClub?.name || clubName;
  const organizationName = currentUser.tennis_club?.organisation?.name;

  useEffect(() => {
    console.log('Current User Data:', currentUser);
    console.log('Is Admin:', isAdmin);
    console.log('Is Multi-tenant:', isMultiTenant);
    console.log('Current Club ID:', currentClubId);
    console.log('Accessible Clubs:', accessibleClubs);
    console.log('Current Club Object:', currentClub);
  }, [currentUser]);

  const showSettings = isAdmin && currentClubId;

  // Close mobile menu when clicking outside or on a link
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) {
        setIsMobileMenuOpen(false);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleHomeClick = () => {
    setIsMobileMenuOpen(false);
    window.location.href = '/home';
  };

  const handleClubSwitch = async (newClubId: number) => {
    if (newClubId === currentClubId || isLoading) return;
    
    console.log(`Switching from club ${currentClubId} to club ${newClubId}`);
    
    setIsLoading(true);
    setNotification(null);
    setIsMobileMenuOpen(false);
    
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
        setNotification(`Switching to ${data.club.name}...`);
        
        if (onClubSwitch) {
          onClubSwitch(newClubId);
        }
        
        // CHANGED: Navigate to /home instead of reloading the page
        setTimeout(() => {
          window.location.href = '/home';
        }, 500);
      } else {
        const errorData = await response.json();
        console.error('Club switch error:', errorData);
        setNotification(`Failed to switch club: ${errorData.error}`);
        // Clear error notification after 3 seconds
        setTimeout(() => {
          setNotification(null);
        }, 3000);
      }
    } catch (error) {
      console.error('Error switching club:', error);
      setNotification('Error switching club. Please try again.');
      // Clear error notification after 3 seconds
      setTimeout(() => {
        setNotification(null);
      }, 3000);
    } finally {
      setIsLoading(false);
    }
  };

  const ClubSwitcher = ({ isMobile = false }: { isMobile?: boolean }) => {
    if (!isMultiTenant) {
      return (
        <button 
          onClick={handleHomeClick}
          className={`text-lg font-bold text-blue-600 hover:text-blue-700 ${
            isMobile ? 'text-left' : ''
          }`}
        >
          {displayClubName}
        </button>
      );
    }

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button 
            className={`flex items-center font-bold text-blue-600 hover:text-blue-700 focus:outline-none ${
              isMobile ? 'text-lg py-2' : 'text-xl'
            }`}
            disabled={isLoading}
          >
            {isLoading ? (
              <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-blue-600 mr-2"></div>
            ) : (
              <Building className={`mr-2 ${isMobile ? 'h-5 w-5' : 'h-5 w-5'}`} />
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
                Current: {displayClubName}
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
              disabled={isLoading}
            >
              <div className="flex items-center justify-between w-full">
                <div className="flex flex-col">
                  <span className="font-medium">{club.name}</span>
                  <span className="text-xs text-gray-500">{club.subdomain}</span>
                </div>
                {club.id === currentClubId && (
                  <Check className="h-4 w-4 text-blue-600" />
                )}
              </div>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  const AdminLinks = ({ isMobile = false }: { isMobile?: boolean }) => {
    if (!showSettings) return null;

    const linkClass = isMobile 
      ? "block w-full text-left py-3 px-0 text-gray-700 hover:text-blue-600 transition-colors"
      : "";

    const links = [
      { href: `/clubs/manage/${currentClubId}/club`, label: 'Club' },
      { href: `/clubs/manage/${currentClubId}/teaching-periods`, label: 'Terms' },
      { href: `/clubs/manage/${currentClubId}/groups`, label: 'Groups' },
      { href: `/clubs/manage/${currentClubId}/coaches`, label: 'Coaches' },
      { href: `/clubs/manage/${currentClubId}/report-templates`, label: 'Report Templates' },
    ];

    if (currentUser.is_super_admin) {
      links.push({ href: '/clubs/super-admin', label: 'Super Admin Dashboard' });
    }

    if (isMobile) {
      return (
        <div className="space-y-1">
          <div className="text-sm font-medium text-gray-500 mb-2">Admin Management</div>
          {links.map((link, index) => (
            <a
              key={index}
              href={link.href}
              className={`${linkClass} ${link.label === 'Super Admin Dashboard' ? 'text-purple-600 font-medium' : ''}`}
              onClick={() => setIsMobileMenuOpen(false)}
            >
              {link.label}
            </a>
          ))}
        </div>
      );
    }

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center px-3 py-2 text-sm font-medium text-gray-600 hover:text-blue-600 focus:outline-none">
            <Settings className="w-4 h-4 mr-1" />
            Manage
            <ChevronDown className="w-4 h-4 ml-1" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>Admin Management</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {links.map((link, index) => (
            <DropdownMenuItem key={index}>
              <a 
                href={link.href}
                className={`flex items-center w-full ${
                  link.label === 'Super Admin Dashboard' ? 'text-purple-600 font-medium' : ''
                }`}
              >
                {link.label}
              </a>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  return (
    <>
      {notification && (
        <div className={`border-b px-4 py-2 ${
          notification.includes('Failed') || notification.includes('Error') 
            ? 'bg-red-50 border-red-200' 
            : 'bg-blue-50 border-blue-200'
        }`}>
          <div className="max-w-7xl mx-auto">
            <p className={`text-sm ${
              notification.includes('Failed') || notification.includes('Error')
                ? 'text-red-800'
                : 'text-blue-800'
            }`}>
              {notification}
            </p>
          </div>
        </div>
      )}
      
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Mobile: Left side - Hamburger Menu */}
            <div className="flex items-center md:hidden">
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="p-2 rounded-md text-gray-600 hover:text-blue-600 hover:bg-gray-100 focus:outline-none"
                aria-label="Toggle menu"
              >
                {isMobileMenuOpen ? (
                  <X className="h-6 w-6" />
                ) : (
                  <Menu className="h-6 w-6" />
                )}
              </button>
            </div>

            {/* Mobile: Center - Club Name (clickable) */}
            <div className="flex-1 flex justify-center md:hidden">
              <button
                onClick={handleHomeClick}
                className="flex items-center hover:bg-gray-100 rounded-md px-2 py-1 transition-colors"
              >
                <Building className="h-5 w-5 mr-2 text-blue-600" />
                <span className="text-lg font-bold text-blue-600 truncate max-w-40">
                  {displayClubName}
                </span>
              </button>
            </div>

            {/* Desktop: Left side - Home Button, Club Info */}
            <div className="hidden md:flex items-center space-x-4">
              <button
                onClick={handleHomeClick}
                className="flex items-center space-x-2 px-3 py-2 rounded-md text-gray-700 hover:text-blue-600 hover:bg-gray-100 transition-colors duration-200"
                title="Go to Dashboard"
              >
                <Home className="h-5 w-5" />
                <span className="font-medium">Home</span>
              </button>

              <div className="h-6 w-px bg-gray-300"></div>

              <div className="flex-shrink-0 flex items-center">
                <ClubSwitcher />
              </div>
              
              <div className="flex items-center ml-6">
                <div className="px-3 py-1 bg-gray-100 rounded-full flex items-center">
                  <span className="text-sm text-gray-600">Coach Portal</span>
                </div>
              </div>
            </div>

            {/* Right side - User Profile (always visible) */}
            <div className="flex items-center space-x-2">
              {/* Desktop: Admin Settings */}
              <div className="hidden md:block">
                <AdminLinks />
              </div>

              {/* User Profile - Always visible */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center p-2 rounded-md hover:bg-gray-100">
                    <div className="h-8 w-8 rounded-full bg-blue-600 flex items-center justify-center text-white font-medium">
                      {currentUser.name.split(' ')
                        .slice(0, 2)
                        .map(part => part.charAt(0))
                        .join('')}
                    </div>
                    <span className="hidden sm:block ml-2 text-sm font-medium text-gray-700">
                      {currentUser.name.split(' ')[0]}
                    </span>
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
                          disabled={isLoading}
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
                      <User className="w-4 h-4 mr-2" />
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

          {/* Mobile Menu Overlay */}
          {isMobileMenuOpen && (
            <div className="md:hidden bg-white border-t border-gray-200">
              <div className="px-2 pt-4 pb-3 space-y-4">
                {/* Home Button */}
                <button
                  onClick={handleHomeClick}
                  className="flex items-center w-full text-left py-3 px-2 text-gray-700 hover:text-blue-600 hover:bg-gray-100 rounded-md transition-colors"
                >
                  <Home className="h-5 w-5 mr-3" />
                  <span className="font-medium">Home</span>
                </button>

                {/* Club Switcher */}
                <div className="py-2 px-2">
                  <div className="text-sm font-medium text-gray-500 mb-2">Current Club</div>
                  <ClubSwitcher isMobile />
                  
                  {/* Coach Portal Badge */}
                  <div className="mt-3">
                    <div className="inline-flex px-3 py-1 bg-gray-100 rounded-full">
                      <span className="text-sm text-gray-600">Coach Portal</span>
                    </div>
                  </div>
                </div>

                {/* Admin Links */}
                {showSettings && (
                  <div className="py-2 px-2 border-t border-gray-100">
                    <AdminLinks isMobile />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </nav>
    </>
  );
};

export default NavigationBar;