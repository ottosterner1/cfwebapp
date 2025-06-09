import React, { useState, useEffect } from 'react';
import RegisterCalendar from './RegisterCalendar';
import RegisterList from './RegisterList';
import CreateRegister from './CreateRegister';
import RegisterDetail from './RegisterDetail';
import RegisterEdit from './RegisterEdit';
import AttendanceStats from './AttendanceStats';

// Types for navigation state
export enum RegisterView {
  CALENDAR = 'calendar',
  LIST = 'list',
  CREATE = 'create',
  DETAIL = 'detail',
  EDIT = 'edit',
  STATS = 'stats'
}

// Interface for calendar session data
export interface CalendarSessionData {
  group_time_id?: number;
  date?: string;
  teaching_period_id?: number;
  group_name?: string;
  group_id?: number;
  time_display?: string;
  start_time?: string;
  end_time?: string;
  day_of_week?: string;
}

// Interface for navigation data
interface NavigationData {
  registerId?: string;
  periodId?: number;
  groupId?: number;
  initialData?: CalendarSessionData;
}

interface RegistersProps {
  // Optional props for initial state (could come from URL params or other navigation)
  initialView?: RegisterView;
  initialData?: NavigationData;
}

const Registers: React.FC<RegistersProps> = ({ 
  initialView = RegisterView.CALENDAR,
  initialData 
}) => {
  const [currentView, setCurrentView] = useState<RegisterView>(initialView);
  const [navigationData, setNavigationData] = useState<NavigationData>(initialData || {});
  const [error, setError] = useState<string | null>(null);

  // Update view when initialView prop changes
  useEffect(() => {
    setCurrentView(initialView);
  }, [initialView]);

  // Update navigation data when initialData prop changes
  useEffect(() => {
    if (initialData) {
      setNavigationData(initialData);
    }
  }, [initialData]);

  // Clear any errors when view changes
  useEffect(() => {
    setError(null);
  }, [currentView]);

  // Navigation handlers
  const handleNavigate = (view: RegisterView, data?: NavigationData) => {
    console.log('Navigating to:', view, 'with data:', data);
    setCurrentView(view);
    setNavigationData(data || {});
  };

  // Specific navigation methods for better type safety and clarity
  const navigateToCalendar = () => {
    handleNavigate(RegisterView.CALENDAR);
  };

  const navigateToList = (periodId?: number, groupId?: number) => {
    handleNavigate(RegisterView.LIST, { periodId, groupId });
  };

  const navigateToCreate = (initialData?: CalendarSessionData) => {
    console.log('Navigating to create with initial data:', initialData);
    handleNavigate(RegisterView.CREATE, { initialData });
  };

  const navigateToDetail = (registerId: string) => {
    handleNavigate(RegisterView.DETAIL, { registerId });
  };

  const navigateToEdit = (registerId: string) => {
    handleNavigate(RegisterView.EDIT, { registerId });
  };

  const navigateToStats = () => {
    handleNavigate(RegisterView.STATS);
  };

  // Handle create success - navigate to the new register detail
  const handleCreateSuccess = (registerId: string) => {
    navigateToDetail(registerId);
  };

  // Handle edit success - navigate back to detail view
  const handleEditSuccess = () => {
    if (navigationData.registerId) {
      navigateToDetail(navigationData.registerId);
    } else {
      navigateToCalendar();
    }
  };

  // Handle view register from calendar or list
  const handleViewRegister = (registerId: string) => {
    navigateToDetail(registerId);
  };

  // Handle edit register from detail view
  const handleEditRegister = (registerId: string) => {
    navigateToEdit(registerId);
  };

  // Handle navigation from register actions
  const handleRegisterAction = (action: string, data?: any) => {
    switch (action) {
      case 'view':
        if (data?.registerId) {
          navigateToDetail(data.registerId);
        }
        break;
      case 'edit':
        if (data?.registerId) {
          navigateToEdit(data.registerId);
        }
        break;
      case 'create':
        navigateToCreate(data?.initialData);
        break;
      case 'list':
        navigateToList(data?.periodId, data?.groupId);
        break;
      case 'calendar':
        navigateToCalendar();
        break;
      case 'stats':
        navigateToStats();
        break;
      default:
        console.warn('Unknown register action:', action);
        // Default to calendar view for unknown actions
        navigateToCalendar();
    }
  };

  // Navigation helper for path-based navigation (to maintain compatibility)
  const handlePathNavigation = (path: string, data?: any) => {
    if (path.startsWith('/registers/')) {
      const pathParts = path.split('/');
      if (pathParts.length >= 3) {
        const registerId = pathParts[2];
        if (pathParts[3] === 'edit') {
          navigateToEdit(registerId);
        } else {
          navigateToDetail(registerId);
        }
      }
    } else if (path === '/registers/list') {
      navigateToList();
    } else if (path === '/registers') {
      navigateToCalendar(); 
    } else if (path === '/registers/create' || path === '/registers/new') {
      navigateToCreate(data);
    } else if (path === '/registers/calendar') {
      navigateToCalendar();
    } else if (path === '/registers/stats') {
      navigateToStats();
    } else {
      // Default to calendar view
      navigateToCalendar();
    }
  };

  // Error boundary-like error handling
  const handleError = (error: string | Error) => {
    const errorMessage = error instanceof Error ? error.message : error;
    setError(errorMessage);
    console.error('Register component error:', error);
  };

  // Render the appropriate view
  const renderCurrentView = (): React.ReactNode => {
    try {
      switch (currentView) {
        case RegisterView.CALENDAR:
          return (
            <RegisterCalendar
              onNavigate={handlePathNavigation}
              onCreateRegister={navigateToCreate}
              onViewRegister={handleViewRegister}
            />
          );

        case RegisterView.LIST:
          return (
            <RegisterList
              onNavigate={handleViewRegister}
              onEdit={handleEditRegister}
              onCreateNew={() => navigateToCreate()}
              onViewStats={navigateToStats}
              periodId={navigationData.periodId}
              groupId={navigationData.groupId}
            />
          );

        case RegisterView.CREATE:
          return (
            <CreateRegister
              onNavigate={handlePathNavigation}
              onCreateSuccess={handleCreateSuccess}
              initialData={navigationData.initialData}
            />
          );

        case RegisterView.DETAIL:
          if (!navigationData.registerId) {
            setError('No register ID provided for detail view');
            navigateToCalendar();
            return null;
          }
          return (
            <RegisterDetail
              registerId={navigationData.registerId}
              onNavigate={handlePathNavigation}
              onEdit={() => handleEditRegister(navigationData.registerId!)}
            />
          );

        case RegisterView.EDIT:
          if (!navigationData.registerId) {
            setError('No register ID provided for edit view');
            navigateToCalendar();
            return null;
          }
          return (
            <RegisterEdit
              registerId={navigationData.registerId}
              onNavigate={handlePathNavigation}
              onSaveSuccess={handleEditSuccess}
            />
          );

        case RegisterView.STATS:
          return (
            <AttendanceStats
              onNavigate={handleRegisterAction}
            />
          );

        default:
          console.warn('Unknown view:', currentView);
          return (
            <RegisterCalendar
              onNavigate={handlePathNavigation}
              onCreateRegister={navigateToCreate}
              onViewRegister={handleViewRegister}
            />
          );
      }
    } catch (err) {
      handleError(err as Error);
      return null;
    }
  };

  // Navigation breadcrumbs/header
  const renderNavigationHeader = () => {
    const getViewTitle = () => {
      switch (currentView) {
        case RegisterView.CALENDAR:
          return 'Register Calendar';
        case RegisterView.LIST:
          return 'Register List';
        case RegisterView.CREATE:
          return 'Create Register';
        case RegisterView.DETAIL:
          return 'Register Details';
        case RegisterView.EDIT:
          return 'Edit Register';
        case RegisterView.STATS:
          return 'Attendance Statistics';
        default:
          return 'Registers';
      }
    };

    const getViewActions = () => {
      const baseActions = [
        {
          label: 'Calendar',
          active: currentView === RegisterView.CALENDAR,
          onClick: navigateToCalendar
        },
        {
          label: 'List',
          active: currentView === RegisterView.LIST,
          onClick: () => navigateToList()
        }
      ];

      // Add context-specific actions
      if (currentView !== RegisterView.CREATE) {
        baseActions.push({
          label: 'Create',
          active: false, // Create view doesn't stay "active" in nav
          onClick: () => navigateToCreate()
        });
      }

      baseActions.push({
        label: 'Stats',
        active: currentView === RegisterView.STATS,
        onClick: navigateToStats
      });

      return baseActions;
    };

    return (
      <div className="mb-6 border-b border-gray-200 pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-2xl font-bold text-gray-900 mb-4 sm:mb-0">
            {getViewTitle()}
          </h1>
          
          <nav className="flex space-x-1">
            {getViewActions().map((action) => (
              <button
                key={action.label}
                onClick={action.onClick}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                  action.active
                    ? 'bg-blue-100 text-blue-700 border border-blue-300'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100 border border-transparent'
                }`}
              >
                {action.label}
              </button>
            ))}
          </nav>
        </div>
      </div>
    );
  };

  return (
    <div className="container mx-auto px-4 py-6">
      {/* Navigation Header */}
      {renderNavigationHeader()}

      {/* Error Display */}
      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-md p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-red-700">{error}</p>
            </div>
            <div className="ml-auto pl-3">
              <button
                onClick={() => setError(null)}
                className="inline-flex text-red-400 hover:text-red-600"
              >
                <span className="sr-only">Dismiss</span>
                <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Current View */}
      <div className="register-view-container">
        {renderCurrentView()}
      </div>

    </div>
  );
};

export default Registers;