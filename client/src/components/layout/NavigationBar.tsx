import React, { useEffect } from 'react';
import { ChevronDown, LogOut } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';

interface User {
  name: string;
  tennis_club?: {
    name: string;
    id: number;
  };
  tennis_club_id?: number;  // Add this field
  is_admin: boolean;
  is_super_admin: boolean;
}

interface NavigationBarProps {
  currentUser: User;
}

const NavigationBar: React.FC<NavigationBarProps> = ({ currentUser }) => {
  const isAdmin = currentUser.is_admin || currentUser.is_super_admin;
  const clubName = currentUser.tennis_club?.name || 'No Club Assigned';
  // Try both possible locations for club ID
  const clubId = currentUser.tennis_club?.id || currentUser.tennis_club_id;

  useEffect(() => {
    console.log('Current User Data:', currentUser);
    console.log('Is Admin:', isAdmin);
    console.log('Club ID:', clubId);
  }, [currentUser]);

  // Show settings if user is admin and we have either form of club ID
  const showSettings = isAdmin && (currentUser.tennis_club?.id || currentUser.tennis_club_id);

  return (
    <nav className="bg-white border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          {/* Left side - Brand and Club Info */}
          <div className="flex">
            <div className="flex-shrink-0 flex items-center">
              <a href="/home" className="text-xl font-bold text-blue-600 hover:text-blue-700">
                {clubName}
              </a>
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
                      href={`/clubs/manage/${clubId}/club`}
                      className="flex items-center w-full"
                    >
                      Club
                    </a>
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <a 
                      href={`/clubs/manage/${clubId}/teaching-periods`}
                      className="flex items-center w-full"
                    >
                      Terms
                    </a>
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <a 
                      href={`/clubs/manage/${clubId}/groups`}
                      className="flex items-center w-full"
                    >
                      Groups
                    </a>
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <a 
                      href={`/clubs/manage/${clubId}/coaches`}
                      className="flex items-center w-full"
                    >
                      Coaches
                    </a>
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <a
                      href={`/clubs/manage/${clubId}/report-templates`}
                      className="flex items-center w-full"
                    >
                      Report Templates
                    </a>
                  </DropdownMenuItem>
                  {currentUser.is_super_admin && (
                    <DropdownMenuItem>
                      <a 
                        href="/club/onboard" 
                        className="flex items-center w-full"
                      >
                        New Tennis Club
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
                      .slice(0, 2) // Take first two parts of the name
                      .map(part => part.charAt(0)) // Get first letter of each part
                      .join('')} {/* Join the letters together */}
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="flex flex-col">
                    <span className="font-medium">{currentUser.name}</span>
                    <span className="text-xs text-gray-500">{clubName}</span>
                  </div>
                </DropdownMenuLabel>
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
  );
};

export default NavigationBar;
