import React, { useState, useEffect } from 'react';
import SessionPlanList from './SessionPlanList';
import SessionPlanDetail from './SessionPlanDetail';
import SessionPlanCreate from './SessionPlanCreate';
import SessionPlanEdit from './SessionPlanEdit';
import SessionPlanCalendar from './SessionPlanCalendar';
import SessionPlanStats from './SessionPlanStats';

export enum SessionPlanView {
  CALENDAR = 'calendar',
  LIST = 'list',
  DETAIL = 'detail',
  CREATE = 'create',
  EDIT = 'edit',
  STATS = 'stats'
}

export type UserRole = 'coach' | 'admin' | 'super_admin';

interface UserInfo {
  id: number;
  is_admin: boolean;
  is_super_admin: boolean;
  coach_id?: number;
  name: string;
  tennis_club_id: number;
}

interface TeachingPeriod {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
}

interface SessionPlanData {
  group_time_id: number;
  date: string;
  teaching_period_id: number;
  group_name: string;
  group_id: number;
  time_display: string;
  start_time: string;
  end_time: string;
  day_of_week: string;
}

const SessionPlan: React.FC = () => {
  const [currentView, setCurrentView] = useState<SessionPlanView>(SessionPlanView.CALENDAR);
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [userInfoLoading, setUserInfoLoading] = useState(true);
  const [teachingPeriods, setTeachingPeriods] = useState<TeachingPeriod[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState<number | null>(null);
  const [sessionPlanData, setSessionPlanData] = useState<SessionPlanData | null>(null);
  
  // Fetch user info on component mount
  useEffect(() => {
    const fetchUserInfo = async () => {
      try {
        setUserInfoLoading(true);
        const response = await fetch('/api/user/info');
        if (!response.ok) {
          throw new Error(`Failed to fetch user info: ${response.statusText}`);
        }
        
        const data = await response.json();
        setUserInfo(data);
      } catch (err) {
        console.error('Error fetching user info:', err);
      } finally {
        setUserInfoLoading(false);
      }
    };
    
    fetchUserInfo();
  }, []);

  // Fetch teaching periods
  useEffect(() => {
    const fetchTeachingPeriods = async () => {
      try {
        const response = await fetch('/clubs/api/teaching-periods');
        if (!response.ok) {
          throw new Error(`Failed to fetch teaching periods: ${response.statusText}`);
        }
        
        const periods = await response.json();
        setTeachingPeriods(periods);
        
        // Set default period to active one
        const activePeriod = periods.find((p: TeachingPeriod) => p.is_active);
        if (activePeriod) {
          setSelectedPeriodId(activePeriod.id);
        } else if (periods.length > 0) {
          setSelectedPeriodId(periods[0].id);
        }
      } catch (err) {
        console.error('Error fetching teaching periods:', err);
      }
    };
    
    fetchTeachingPeriods();
  }, []);
  
  // Helper function to determine user role from boolean flags
  const getUserRole = (): UserRole => {
    if (!userInfo) return 'coach'; // Default to coach if no user info
    
    if (userInfo.is_super_admin === true) {
      return 'super_admin';
    } else if (userInfo.is_admin === true) {
      return 'admin';
    } else {
      return 'coach';
    }
  };
  
  // Navigation handlers
  const navigateToCalendar = () => {
    setCurrentView(SessionPlanView.CALENDAR);
    setSelectedPlanId(null);
    setSessionPlanData(null);
  };

  const navigateToList = () => {
    setCurrentView(SessionPlanView.LIST);
    setSelectedPlanId(null);
    setSessionPlanData(null);
  };

  const navigateToStats = () => {
    setCurrentView(SessionPlanView.STATS);
    setSelectedPlanId(null);
    setSessionPlanData(null);
  };
  
  const navigateToDetail = (planId: number) => {
    setSelectedPlanId(planId);
    setCurrentView(SessionPlanView.DETAIL);
    setSessionPlanData(null);
  };
  
  const navigateToCreate = (sessionData?: SessionPlanData) => {
    setCurrentView(SessionPlanView.CREATE);
    setSelectedPlanId(null);
    setSessionPlanData(sessionData || null);
  };
  
  const navigateToEdit = (planId: number) => {
    setSelectedPlanId(planId);
    setCurrentView(SessionPlanView.EDIT);
    setSessionPlanData(null);
  };

  // Handle navigation from other parts of the app
  const handleNavigate = (path: string) => {
    if (path.includes('calendar')) {
      navigateToCalendar();
    } else if (path.includes('list')) {
      navigateToList();
    } else if (path.includes('stats')) {
      navigateToStats();
    } else if (path.includes('/session-plans/')) {
      // Extract plan ID from path like '/session-plans/123'
      const planId = parseInt(path.split('/').pop() || '0');
      if (planId) {
        navigateToDetail(planId);
      }
    } else {
      navigateToCalendar();
    }
  };
  
  // Handler after saving plan
  const handleSaveSuccess = (savedPlanId: number) => {
    navigateToDetail(savedPlanId);
  };

  // Handler after creating plan
  const handleCreateSuccess = (newPlanId: number) => {
    navigateToDetail(newPlanId);
  };
  
  // Get the user role
  const userRole = getUserRole();
  
  // Check if user has admin permissions
  const hasAdminPermissions = userRole === 'admin' || userRole === 'super_admin';
  
  // Render navigation header
  const renderNavigationHeader = () => {
    const getViewTitle = () => {
      switch (currentView) {
        case SessionPlanView.CALENDAR:
          return 'Session Plan Calendar';
        case SessionPlanView.LIST:
          return 'Session Plans';
        case SessionPlanView.STATS:
          return 'Session Planning Statistics';
        case SessionPlanView.CREATE:
          return 'Create Session Plan';
        case SessionPlanView.DETAIL:
          return 'Session Plan Details';
        case SessionPlanView.EDIT:
          return 'Edit Session Plan';
        default:
          return 'Session Plans';
      }
    };

    const getViewActions = () => {
      const baseActions = [
        {
          label: 'Calendar',
          active: currentView === SessionPlanView.CALENDAR,
          onClick: navigateToCalendar
        },
        {
          label: 'List',
          active: currentView === SessionPlanView.LIST,
          onClick: navigateToList
        },
        {
          label: 'Statistics',
          active: currentView === SessionPlanView.STATS,
          onClick: navigateToStats
        }
      ];

      // Add create action if not already creating
      if (currentView !== SessionPlanView.CREATE) {
        baseActions.push({
          label: 'Create',
          active: false,
          onClick: () => navigateToCreate()
        });
      }

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
  
  // Render the appropriate view
  const renderView = () => {
    switch (currentView) {
      case SessionPlanView.CALENDAR:
        return (
          <SessionPlanCalendar
            onNavigate={handleNavigate}
            onCreateSessionPlan={navigateToCreate}
            onViewSessionPlan={navigateToDetail}
            selectedPeriodId={selectedPeriodId}
            teachingPeriods={teachingPeriods}
            onPeriodChange={setSelectedPeriodId}
          />
        );

      case SessionPlanView.LIST:
        return (
          <SessionPlanList 
            onViewPlan={navigateToDetail}
            onEditPlan={navigateToEdit}
            onCreatePlan={() => navigateToCreate()}
            userRole={userRole}
            selectedPeriodId={selectedPeriodId}
            onPeriodChange={setSelectedPeriodId}
            teachingPeriods={teachingPeriods}
            hasAdminPermissions={hasAdminPermissions}
          />
        );

      case SessionPlanView.STATS:
        return (
          <SessionPlanStats
            onNavigate={handleNavigate}
            periodId={selectedPeriodId || undefined}
          />
        );
      
      case SessionPlanView.DETAIL:
        return selectedPlanId ? (
          <SessionPlanDetail 
            planId={selectedPlanId}
            onBack={navigateToCalendar}
            onEdit={() => navigateToEdit(selectedPlanId)}
            userRole={userRole}
            hasAdminPermissions={hasAdminPermissions}
          />
        ) : <>{navigateToCalendar()}</>;
      
      case SessionPlanView.CREATE:
        return (
          <SessionPlanCreate 
            onBack={navigateToCalendar}
            onSuccess={handleCreateSuccess}
            selectedPeriodId={selectedPeriodId}
            teachingPeriods={teachingPeriods}
            userRole={userRole}
            initialData={sessionPlanData}
          />
        );
      
      case SessionPlanView.EDIT:
        return selectedPlanId ? (
          <SessionPlanEdit 
            planId={selectedPlanId}
            onBack={navigateToCalendar}
            onSaveSuccess={() => handleSaveSuccess(selectedPlanId)}
            userRole={userRole}
          />
        ) : <>{navigateToCalendar()}</>;
      
      default:
        return <>{navigateToCalendar()}</>;
    }
  };
  
  // Show loading state while fetching user info
  if (userInfoLoading) {
    return (
      <div className="container mx-auto px-4 py-6">
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </div>
    );
  }

  // Show message if user doesn't have admin permissions
  if (!hasAdminPermissions) {
    return (
      <div className="container mx-auto px-4 py-6">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-yellow-800">
                Admin Access Required
              </h3>
              <div className="mt-2 text-sm text-yellow-700">
                <p>Session planning is only available to administrators. Please contact your club administrator if you need access to this feature.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="container mx-auto px-4 py-6">
      {renderNavigationHeader()}
      {renderView()}
    </div>
  );
};

export default SessionPlan;