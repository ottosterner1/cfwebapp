import React, { useState, useEffect, useMemo } from 'react';
import { Calendar, Clock, Users, AlertCircle, CheckCircle, Plus, ChevronLeft, ChevronRight, BarChart3, X, User, Ban, Eye } from 'lucide-react';

interface Session {
  id: string;
  date: string;
  day_of_week: string;
  start_time: string;
  end_time: string;
  time_display: string;
  group_id: number;
  group_name: string;
  group_time_id: number;
  student_count: number;
  has_register: boolean;
  register_id?: number;
  teaching_period_id: number;
  coach: {
    id: number | null;
    name: string;
  };
  is_cancelled?: boolean;
  cancellation_reason?: string;
  status?: 'scheduled' | 'completed' | 'cancelled';
}

interface TeachingPeriod {
  id: number;
  name: string;
}

interface UserInfo {
  id: number;
  is_admin: boolean;
  is_super_admin: boolean;
  coach_id?: number;
  name: string;
  tennis_club_id: number;
}

interface WeeklyStats {
  week_sessions: number;
  completed_sessions: number;
  overdue_sessions: number;
  upcoming_sessions: number;
  completion_rate: number;
  cancelled_sessions: number;
}

interface DaySession {
  date: Date;
  dateStr: string;
  sessions: Session[];
}

interface SessionData {
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

interface OverdueSession {
  id: string;
  date: string;
  group_name: string;
  group_id: number;
  time_display: string;
  start_time: string;
  end_time: string;
  day_of_week: string;
  student_count: number;
  group_time_id: number;
  teaching_period_id: number;
  days_overdue: number;
  coach_name?: string;
  coach_id?: number;
}

interface Cancellation {
  type: 'session' | 'day' | 'week';
  reason: string;
  specific_date?: string;
  week_start_date?: string;
  week_end_date?: string;
  group_time_id?: number;
}

interface RegisterCalendarProps {
  onNavigate: (path: string, data?: any) => void;
  onCreateRegister: (sessionData?: SessionData) => void;
  onViewRegister: (registerId: string) => void;
}

type SessionStatus = 'completed' | 'overdue' | 'today' | 'upcoming' | 'cancelled';

const getCurrentDayIndex = (): number => {
  const today = new Date();
  const day = today.getDay();
  return day === 0 ? 6 : day - 1;
};

const RegisterCalendar: React.FC<RegisterCalendarProps> = ({ 
  onNavigate, 
  onCreateRegister, 
  onViewRegister 
}) => {
  // State management
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [sessions, setSessions] = useState<Session[]>([]);
  const [periods, setPeriods] = useState<TeachingPeriod[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<number | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [currentDayIndex, setCurrentDayIndex] = useState<number>(getCurrentDayIndex());

  // Modal states
  const [showSessionModal, setShowSessionModal] = useState<boolean>(false);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [showCancelModal, setShowCancelModal] = useState<boolean>(false);
  const [showOverdueModal, setShowOverdueModal] = useState<boolean>(false);
  const [overdueSessions, setOverdueSessions] = useState<OverdueSession[]>([]);
  const [loadingOverdue, setLoadingOverdue] = useState<boolean>(false);

  // Cancellation states
  const [cancelModalData, setCancelModalData] = useState<{
    type: 'session' | 'day' | 'week';
    title: string;
    description: string;
    data: any;
  } | null>(null);
  const [cancellationReason, setCancellationReason] = useState<string>('');
  const [submittingCancellation, setSubmittingCancellation] = useState<boolean>(false);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    show: boolean;
    x: number;
    y: number;
    session: Session | null;
  }>({
    show: false,
    x: 0,
    y: 0,
    session: null
  });

  // Permission helper functions
  const isUserAdmin = (): boolean => {
    return Boolean(userInfo?.is_admin || userInfo?.is_super_admin);
  };

  const canUserCancelSession = (session: Session): boolean => {
    if (!userInfo || session.is_cancelled) return false;
    
    // Admins can cancel any session
    if (isUserAdmin()) return true;
    
    // Coaches can cancel sessions they are assigned to
    return session.coach.id !== null && session.coach.id === userInfo.id;
  };

  const canUserCancelDay = (): boolean => {
    return isUserAdmin();
  };

  const canUserCancelWeek = (): boolean => {
    return isUserAdmin();
  };

  // Data fetching functions
  const fetchUserInfo = async (): Promise<void> => {
    try {
      console.log('Fetching user info...');
      const response = await fetch('/api/user/info');
      console.log('User info response status:', response.status);
      
      if (!response.ok) throw new Error('Failed to fetch user info');
      
      const data: UserInfo = await response.json();
      console.log('User info data:', data);
      setUserInfo(data);
    } catch (err) {
      console.error('Error fetching user info:', err);
      setError('Failed to load user information');
    }
  };

  const fetchTeachingPeriods = async (): Promise<void> => {
    try {
      console.log('Fetching teaching periods...');
      const response = await fetch('/clubs/api/teaching-periods');
      console.log('Periods response status:', response.status);
      
      if (!response.ok) throw new Error('Failed to fetch teaching periods');
      
      const data: TeachingPeriod[] = await response.json();
      console.log('Periods data:', data);
      setPeriods(data);
      
      if (data.length > 0) {
        setSelectedPeriod(data[0].id);
      }
    } catch (err) {
      console.error('Error fetching periods:', err);
      setError('Failed to load teaching periods');
    }
  };

  const fetchSessions = async (): Promise<void> => {
    if (!selectedPeriod) return;
    
    try {
      console.log('Fetching sessions for period:', selectedPeriod);
      setLoading(true);
      setError(null);
      
      const startOfWeek = new Date(currentDate);
      const day = startOfWeek.getDay();
      const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1);
      startOfWeek.setDate(diff);
      
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      
      const params = new URLSearchParams({
        period_id: selectedPeriod.toString(),
        start_date: startOfWeek.toISOString().split('T')[0],
        end_date: endOfWeek.toISOString().split('T')[0]
      });
      
      const url = `/api/register-calendar?${params}`;
      console.log('Fetching sessions from:', url);
      
      const response = await fetch(url);
      console.log('Sessions response status:', response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Sessions API Error:', errorText);
        throw new Error(`Failed to fetch sessions: ${response.status}`);
      }
      
      const data: Session[] = await response.json();
      console.log('Sessions data:', data);
      setSessions(data);
      
    } catch (err) {
      console.error('Error fetching sessions:', err);
      setError('Failed to load sessions');
    } finally {
      setLoading(false);
    }
  };

  const refreshSessions = async (): Promise<void> => {
    await fetchSessions();
  };

  // Cancellation API call
  const createCancellation = async (cancellationData: Cancellation): Promise<boolean> => {
    try {
      console.log('Creating cancellation:', cancellationData);
      const response = await fetch('/api/cancellations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(cancellationData),
      });

      console.log('Cancellation response status:', response.status);
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error('Cancellation error:', errorData);
        throw new Error(errorData.error || 'Failed to create cancellation');
      }

      console.log('Cancellation created successfully');
      return true;
    } catch (error) {
      console.error('Error creating cancellation:', error);
      alert(`Failed to create cancellation: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return false;
    }
  };

  // Session management functions
  const handleShowSessionDetails = (session: Session): void => {
    setSelectedSession(session);
    setShowSessionModal(true);
  };

  const handleCancelSession = (session: Session): void => {
    if (session.is_cancelled) return;
    
    if (!canUserCancelSession(session)) {
      if (isUserAdmin()) {
        alert('Unable to cancel this session');
      } else {
        alert('You can only cancel sessions that you are assigned to coach');
      }
      return;
    }
    
    setCancelModalData({
      type: 'session',
      title: 'Cancel Session',
      description: `Cancel ${session.group_name} on ${new Date(session.date).toLocaleDateString('en-GB', {
        weekday: 'long',
        day: 'numeric',
        month: 'long'
      })} at ${session.time_display}?`,
      data: session
    });
    setCancellationReason('');
    setShowCancelModal(true);
    setShowSessionModal(false);
  };

  const handleCancelDay = (date: Date): void => {
    if (!canUserCancelDay()) {
      alert('Only administrators can cancel entire days');
      return;
    }
    
    const dayStr = date.toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
    
    setCancelModalData({
      type: 'day',
      title: 'Cancel Day',
      description: `Cancel all sessions on ${dayStr}?`,
      data: { date }
    });
    setCancellationReason('');
    setShowCancelModal(true);
  };

  const handleCancelWeek = (): void => {
    if (!canUserCancelWeek()) {
      alert('Only administrators can cancel entire weeks');
      return;
    }
    
    const weekSessions = getWeekSessions();
    const startDate = weekSessions[0]?.date;
    const endDate = weekSessions[6]?.date;
    
    if (!startDate || !endDate) return;
    
    const weekStr = `${startDate.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long'
    })} - ${endDate.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    })}`;
    
    setCancelModalData({
      type: 'week',
      title: 'Cancel Week',
      description: `Cancel all sessions for the week of ${weekStr}?`,
      data: { startDate, endDate }
    });
    setCancellationReason('');
    setShowCancelModal(true);
  };

  const submitCancellation = async (): Promise<void> => {
    if (!cancelModalData || !cancellationReason.trim()) {
      alert('Please provide a reason for cancellation');
      return;
    }

    setSubmittingCancellation(true);

    try {
      let cancellationData: Cancellation;

      switch (cancelModalData.type) {
        case 'session':
          cancellationData = {
            type: 'session',
            reason: cancellationReason.trim(),
            specific_date: cancelModalData.data.date,
            group_time_id: cancelModalData.data.group_time_id
          };
          break;

        case 'day':
          cancellationData = {
            type: 'day',
            reason: cancellationReason.trim(),
            specific_date: cancelModalData.data.date.toISOString().split('T')[0]
          };
          break;

        case 'week':
          cancellationData = {
            type: 'week',
            reason: cancellationReason.trim(),
            week_start_date: cancelModalData.data.startDate.toISOString().split('T')[0],
            week_end_date: cancelModalData.data.endDate.toISOString().split('T')[0]
          };
          break;

        default:
          throw new Error('Invalid cancellation type');
      }

      const success = await createCancellation(cancellationData);
      
      if (success) {
        await refreshSessions();
        setShowCancelModal(false);
        setCancelModalData(null);
        setCancellationReason('');
      }
    } catch (error) {
      console.error('Error submitting cancellation:', error);
      alert(`Failed to submit cancellation: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setSubmittingCancellation(false);
    }
  };

  // Register management functions
  const handleCreateRegister = (session: Session): void => {
    if (session.is_cancelled) {
      alert('Cannot create register for cancelled session');
      return;
    }
    
    const sessionData: SessionData = {
      group_time_id: session.group_time_id,
      date: session.date,
      teaching_period_id: session.teaching_period_id,
      group_name: session.group_name,
      group_id: session.group_id,
      time_display: session.time_display,
      start_time: session.start_time,
      end_time: session.end_time,
      day_of_week: session.day_of_week
    };
    
    console.log('Creating register with session data:', sessionData);
    onCreateRegister(sessionData);
  };

  const handleSessionClick = (session: Session): void => {
    handleShowSessionDetails(session);
  };

  const handleGeneralCreateRegister = (): void => {
    onCreateRegister();
  };

  // Overdue sessions functionality
  const getOverdueSessions = async (): Promise<OverdueSession[]> => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const overdueSessions = sessions
      .filter(session => {
        const sessionDate = new Date(session.date);
        sessionDate.setHours(0, 0, 0, 0);
        return sessionDate < today && !session.has_register && !session.is_cancelled;
      })
      .map(session => ({
        ...session,
        days_overdue: Math.floor((today.getTime() - new Date(session.date).getTime()) / (1000 * 60 * 60 * 24)),
        coach_name: session.coach.name,
        coach_id: session.coach.id ?? undefined
      }));

    return overdueSessions;
  };

  const handleOverdueClick = async (): Promise<void> => {
    setShowOverdueModal(true);
    setLoadingOverdue(true);
    
    const overdueSessionsList = await getOverdueSessions();
    setOverdueSessions(overdueSessionsList);
    setLoadingOverdue(false);
  };

  const handleCreateRegisterFromOverdue = (overdueSession: OverdueSession): void => {
    const sessionData: SessionData = {
      group_time_id: overdueSession.group_time_id,
      date: overdueSession.date,
      teaching_period_id: overdueSession.teaching_period_id,
      group_name: overdueSession.group_name,
      group_id: overdueSession.group_id,
      time_display: overdueSession.time_display,
      start_time: overdueSession.start_time,
      end_time: overdueSession.end_time,
      day_of_week: overdueSession.day_of_week
    };
    
    setShowOverdueModal(false);
    onCreateRegister(sessionData);
  };

  // Context menu functionality
  const handleSessionRightClick = (e: React.MouseEvent, session: Session): void => {
    e.preventDefault();
    e.stopPropagation();
    
    setContextMenu({
      show: true,
      x: e.clientX,
      y: e.clientY,
      session
    });
  };

  // Navigation functions
  const navigateWeek = (direction: number): void => {
    const newDate = new Date(currentDate);
    newDate.setDate(currentDate.getDate() + (direction * 7));
    setCurrentDate(newDate);
  };

  const navigateDay = (direction: number): void => {
    const weekSessions = getWeekSessions();
    const newIndex = currentDayIndex + direction;
    
    if (newIndex < 0) {
      navigateWeek(-1);
      setCurrentDayIndex(6);
    } else if (newIndex >= weekSessions.length) {
      navigateWeek(1);
      setCurrentDayIndex(0);
    } else {
      setCurrentDayIndex(newIndex);
    }
  };

  // Helper functions
  const getWeekSessions = (): DaySession[] => {
    const startOfWeek = new Date(currentDate);
    const day = startOfWeek.getDay();
    const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1);
    startOfWeek.setDate(diff);
    
    const weekSessions: DaySession[] = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(startOfWeek);
      date.setDate(startOfWeek.getDate() + i);
      const dateStr = date.toISOString().split('T')[0];
      const daySessions = sessions.filter(s => s.date === dateStr);
      weekSessions.push({
        date: date,
        dateStr: dateStr,
        sessions: daySessions
      });
    }
    return weekSessions;
  };

  const getSessionStatus = (session: Session): SessionStatus => {
    if (session.is_cancelled) return 'cancelled';
    
    const sessionDate = new Date(session.date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    sessionDate.setHours(0, 0, 0, 0);

    if (session.has_register) return 'completed';
    if (sessionDate < today) return 'overdue';
    if (sessionDate.getTime() === today.getTime()) return 'today';
    return 'upcoming';
  };

  const getStatusStyling = (status: SessionStatus): string => {
    switch (status) {
      case 'completed':
        return 'bg-green-50 border-green-500 text-green-800 hover:bg-green-100';
      case 'overdue':
        return 'bg-red-50 border-red-500 text-red-800 hover:bg-red-100';
      case 'today':
        return 'bg-yellow-50 border-yellow-500 text-yellow-800 hover:bg-yellow-100';
      case 'upcoming':
        return 'bg-blue-50 border-blue-500 text-blue-800 hover:bg-blue-100';
      case 'cancelled':
        return 'bg-gray-50 border-gray-400 text-gray-600 hover:bg-gray-100 opacity-75';
      default:
        return 'bg-gray-50 border-gray-300 text-gray-800 hover:bg-gray-100';
    }
  };

  const getStatusIcon = (status: SessionStatus): JSX.Element => {
    switch (status) {
      case 'completed':
        return <CheckCircle size={14} className="text-green-600" />;
      case 'overdue':
        return <AlertCircle size={14} className="text-red-600" />;
      case 'today':
        return <Clock size={14} className="text-yellow-600" />;
      case 'upcoming':
        return <Calendar size={14} className="text-blue-600" />;
      case 'cancelled':
        return <Ban size={14} className="text-gray-500" />;
      default:
        return <Calendar size={14} className="text-gray-600" />;
    }
  };

  // Statistics calculation
  const weeklyStats: WeeklyStats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    let completed = 0;
    let overdue = 0;
    let upcoming = 0;
    let cancelled = 0;
    
    sessions.forEach(session => {
      const sessionDate = new Date(session.date);
      sessionDate.setHours(0, 0, 0, 0);
      
      if (session.is_cancelled) {
        cancelled++;
        return;
      }
      
      if (session.has_register) {
        completed++;
      } else if (sessionDate < today) {
        overdue++;
      } else {
        upcoming++;
      }
    });
    
    const totalSessions = sessions.filter(s => !s.is_cancelled).length;
    const completionRate = totalSessions > 0 ? Math.round((completed / totalSessions) * 100) : 0;
    
    return {
      week_sessions: totalSessions,
      completed_sessions: completed,
      overdue_sessions: overdue,
      upcoming_sessions: upcoming,
      cancelled_sessions: cancelled,
      completion_rate: completionRate
    };
  }, [sessions]);

  // Event handlers
  const handlePeriodChange = (event: React.ChangeEvent<HTMLSelectElement>): void => {
    setSelectedPeriod(Number(event.target.value));
  };

  // Effect hooks
  useEffect(() => {
    fetchUserInfo();
  }, []);

  useEffect(() => {
    fetchTeachingPeriods();
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [currentDate, selectedPeriod]);

  useEffect(() => {
    const handleClickOutside = () => {
      setContextMenu(prev => ({ ...prev, show: false }));
    };

    if (contextMenu.show) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [contextMenu.show]);

  useEffect(() => {
    const weekSessions = getWeekSessions();
    if (currentDayIndex >= weekSessions.length) {
      setCurrentDayIndex(getCurrentDayIndex());
    }
  }, [currentDate, sessions]);

  const weekSessions = getWeekSessions();

  // Loading state
  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="bg-red-50 p-6 rounded-lg border border-red-200">
        <div className="flex items-center gap-2 text-red-700 mb-2">
          <AlertCircle size={20} />
          <h3 className="font-medium">Error Loading Calendar</h3>
        </div>
        <p className="text-red-600">{error}</p>
        <div className="mt-4 text-sm text-gray-600">
          <p>Debugging info:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>User info loaded: {userInfo ? 'Yes' : 'No'}</li>
            <li>Periods loaded: {periods.length > 0 ? 'Yes' : 'No'}</li>
            <li>Selected period: {selectedPeriod || 'None'}</li>
          </ul>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Context Menu */}
      {contextMenu.show && contextMenu.session && (
        <div
          className="fixed bg-white border border-gray-200 rounded-lg shadow-lg py-2 z-50"
          style={{
            left: `${contextMenu.x}px`,
            top: `${contextMenu.y}px`,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {!contextMenu.session.is_cancelled ? (
            <>
              <button
                onClick={() => {
                  handleShowSessionDetails(contextMenu.session!);
                  setContextMenu(prev => ({ ...prev, show: false }));
                }}
                className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 flex items-center gap-2"
              >
                <Eye size={14} />
                View Details
              </button>
              {contextMenu.session.has_register && contextMenu.session.register_id && (
                <button
                  onClick={() => {
                    onViewRegister(contextMenu.session!.register_id!.toString());
                    setContextMenu(prev => ({ ...prev, show: false }));
                  }}
                  className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 flex items-center gap-2"
                >
                  <Calendar size={14} />
                  View Register
                </button>
              )}
              {!contextMenu.session.has_register && (
                <button
                  onClick={() => {
                    handleCreateRegister(contextMenu.session!);
                    setContextMenu(prev => ({ ...prev, show: false }));
                  }}
                  className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 flex items-center gap-2"
                >
                  <Plus size={14} />
                  Create Register
                </button>
              )}
              {canUserCancelSession(contextMenu.session) && (
                <button
                  onClick={() => {
                    handleCancelSession(contextMenu.session!);
                    setContextMenu(prev => ({ ...prev, show: false }));
                  }}
                  className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 text-red-600 flex items-center gap-2"
                >
                  <Ban size={14} />
                  Cancel Session
                </button>
              )}
            </>
          ) : (
            <div className="px-4 py-2 text-sm text-gray-500">
              Session Cancelled
              {contextMenu.session.cancellation_reason && (
                <div className="text-xs mt-1 italic">
                  Reason: {contextMenu.session.cancellation_reason}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Session Details Modal */}
      {showSessionModal && selectedSession && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="p-4 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">Session Details</h2>
                <button
                  onClick={() => setShowSessionModal(false)}
                  className="p-1 hover:bg-gray-100 rounded transition-colors"
                >
                  <X size={20} className="text-gray-500" />
                </button>
              </div>
            </div>
            
            <div className="p-4 space-y-4">
              <div>
                <h3 className="font-medium text-gray-900 mb-2">{selectedSession.group_name}</h3>
                <div className="space-y-2 text-sm text-gray-600">
                  <div className="flex items-center gap-2">
                    <Calendar size={16} />
                    <span>{new Date(selectedSession.date).toLocaleDateString('en-GB', {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric'
                    })}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock size={16} />
                    <span>{selectedSession.time_display}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Users size={16} />
                    <span>{selectedSession.student_count} student{selectedSession.student_count !== 1 ? 's' : ''}</span>
                  </div>
                  {selectedSession.coach.name && (
                    <div className="flex items-center gap-2">
                      <User size={16} />
                      <span>{selectedSession.coach.name}</span>
                      {selectedSession.coach.id === userInfo?.id && (
                        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                          Your Session
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {selectedSession.is_cancelled && (
                <div className="p-3 bg-red-50 border border-red-200 rounded">
                  <div className="flex items-center gap-2 text-red-700 mb-1">
                    <Ban size={16} />
                    <span className="font-medium">Session Cancelled</span>
                  </div>
                  {selectedSession.cancellation_reason && (
                    <p className="text-sm text-red-600">
                      Reason: {selectedSession.cancellation_reason}
                    </p>
                  )}
                </div>
              )}

              <div className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${
                  selectedSession.is_cancelled ? 'bg-gray-400' :
                  selectedSession.has_register ? 'bg-green-500' : 'bg-red-500'
                }`}></div>
                <span className="text-sm text-gray-600">
                  {selectedSession.is_cancelled ? 'Cancelled' :
                   selectedSession.has_register ? 'Register completed' : 'Register needed'}
                </span>
              </div>
            </div>
            
            <div className="p-4 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={() => setShowSessionModal(false)}
                className="px-4 py-2 text-gray-700 border border-gray-300 rounded hover:bg-gray-50"
              >
                Close
              </button>
              
              {!selectedSession.is_cancelled && (
                <>
                  {selectedSession.has_register && selectedSession.register_id ? (
                    <button
                      onClick={() => {
                        onViewRegister(selectedSession.register_id!.toString());
                        setShowSessionModal(false);
                      }}
                      className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center gap-2"
                    >
                      <Eye size={16} />
                      View Register
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        handleCreateRegister(selectedSession);
                        setShowSessionModal(false);
                      }}
                      className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 flex items-center gap-2"
                    >
                      <Plus size={16} />
                      Create Register
                    </button>
                  )}
                  
                  {canUserCancelSession(selectedSession) && (
                    <button
                      onClick={() => handleCancelSession(selectedSession)}
                      className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 flex items-center gap-2"
                    >
                      <Ban size={16} />
                      Cancel Session
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Cancellation Modal */}
      {showCancelModal && cancelModalData && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="p-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">{cancelModalData.title}</h2>
              <p className="text-sm text-gray-600 mt-1">{cancelModalData.description}</p>
            </div>
            
            <div className="p-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Reason for cancellation *
              </label>
              <textarea
                value={cancellationReason}
                onChange={(e) => setCancellationReason(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                rows={3}
                placeholder="Please provide a reason for the cancellation..."
                disabled={submittingCancellation}
              />
            </div>
            
            <div className="p-4 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowCancelModal(false);
                  setCancelModalData(null);
                  setCancellationReason('');
                }}
                disabled={submittingCancellation}
                className="px-4 py-2 text-gray-700 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={submitCancellation}
                disabled={submittingCancellation || !cancellationReason.trim()}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
              >
                {submittingCancellation ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Cancelling...
                  </>
                ) : (
                  <>
                    <Ban size={16} />
                    Confirm Cancellation
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header Controls */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Register Calendar</h2>
          <p className="text-gray-600">
            Manage your session registers and view weekly schedule
            {userInfo && !isUserAdmin() && (
              <span className="block text-sm text-blue-600 mt-1">
                💡 You can cancel sessions that you coach
              </span>
            )}
          </p>
        </div>
        
        <select 
          value={selectedPeriod || ''} 
          onChange={handlePeriodChange}
          className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          {periods.map(period => (
            <option key={period.id} value={period.id}>{period.name}</option>
          ))}
        </select>
      </div>

      {/* Weekly Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="text-2xl font-bold text-gray-900">{weeklyStats.week_sessions}</div>
          <div className="text-sm text-gray-600">Active Sessions</div>
        </div>
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="text-2xl font-bold text-green-600">{weeklyStats.completed_sessions}</div>
          <div className="text-sm text-gray-600">Completed</div>
        </div>
        <div 
          className="bg-white p-4 rounded-lg border border-gray-200 cursor-pointer hover:bg-red-50 transition-colors"
          onClick={handleOverdueClick}
        >
          <div className="text-2xl font-bold text-red-600">{weeklyStats.overdue_sessions}</div>
          <div className="text-sm text-gray-600">Overdue</div>
        </div>
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="text-2xl font-bold text-gray-600">{weeklyStats.cancelled_sessions}</div>
          <div className="text-sm text-gray-600">Cancelled</div>
        </div>
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="text-2xl font-bold text-blue-600">{weeklyStats.completion_rate}%</div>
          <div className="text-sm text-gray-600">Completion Rate</div>
        </div>
      </div>

      {/* Week Navigation */}
      <div className="hidden sm:flex items-center justify-between bg-white p-4 rounded-lg border border-gray-200">
        <button
          onClick={() => navigateWeek(-1)}
          className="p-2 hover:bg-gray-100 rounded-md transition-colors"
          aria-label="Previous week"
        >
          <ChevronLeft size={20} />
        </button>
        
        <div className="text-center flex items-center gap-4">
          <h3 className="text-lg font-semibold">
            Week of {weekSessions[0]?.date.toLocaleDateString('en-GB', { 
              day: 'numeric', 
              month: 'long',
              year: 'numeric'
            })}
          </h3>
          
          {canUserCancelWeek() && (
            <button
              onClick={handleCancelWeek}
              className="px-3 py-1 bg-red-50 text-red-600 border border-red-200 rounded hover:bg-red-100 transition-colors text-sm flex items-center gap-1"
              title="Cancel entire week"
            >
              <Ban size={14} />
              Cancel Week
            </button>
          )}
        </div>
        
        <button
          onClick={() => navigateWeek(1)}
          className="p-2 hover:bg-gray-100 rounded-md transition-colors"
          aria-label="Next week"
        >
          <ChevronRight size={20} />
        </button>
      </div>

      {/* Mobile Day Navigation */}
      <div className="sm:hidden bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <button
            onClick={() => navigateDay(-1)}
            className="p-2 rounded-md transition-colors text-gray-600 hover:bg-gray-100 flex-shrink-0"
            aria-label="Previous day"
          >
            <ChevronLeft size={20} />
          </button>
          
          <div className="flex-1 mx-4">
            <div className="text-center">
              <div className="text-sm font-medium text-gray-900">
                Week of {weekSessions[0]?.date.toLocaleDateString('en-GB', { 
                  day: 'numeric', 
                  month: 'long',
                  year: 'numeric'
                })}
              </div>
              <div className="text-xs text-gray-600 mt-1">
                {weekSessions[currentDayIndex]?.date.toLocaleDateString('en-GB', { 
                  weekday: 'long',
                  day: 'numeric', 
                  month: 'long'
                })}
              </div>
            </div>
          </div>
          
          <button
            onClick={() => navigateDay(1)}
            className="p-2 rounded-md transition-colors text-gray-600 hover:bg-gray-100 flex-shrink-0"
            aria-label="Next day"
          >
            <ChevronRight size={20} />
          </button>
        </div>
        
        <div className="flex">
          {weekSessions.map((day, index) => {
            const isToday = day.dateStr === new Date().toISOString().split('T')[0];
            const hasSession = day.sessions.length > 0;
            
            return (
              <button
                key={day.dateStr}
                onClick={() => setCurrentDayIndex(index)}
                className={`flex-1 px-1 py-2 text-xs transition-colors ${
                  index === currentDayIndex
                    ? 'bg-blue-100 text-blue-700 font-medium'
                    : isToday
                    ? 'bg-yellow-100 text-yellow-700 font-medium'
                    : hasSession
                    ? 'text-gray-600 hover:bg-gray-100'
                    : 'text-gray-400 hover:bg-gray-50'
                }`}
              >
                <div className="text-center">
                  <div>{day.date.toLocaleDateString('en-GB', { weekday: 'short' })}</div>
                  <div className="text-xs">{day.date.getDate()}</div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Mobile Single Day View */}
        <div className="p-4">
          {canUserCancelDay() && weekSessions[currentDayIndex] && (
            <div className="mb-4 text-center">
              <button
                onClick={() => handleCancelDay(weekSessions[currentDayIndex].date)}
                className="px-3 py-1 bg-red-50 text-red-600 border border-red-200 rounded hover:bg-red-100 transition-colors text-sm flex items-center gap-1 mx-auto"
              >
                <Ban size={14} />
                Cancel Day
              </button>
            </div>
          )}
          
          {weekSessions[currentDayIndex]?.sessions.length === 0 ? (
            <div className="text-center text-gray-400 py-8">
              <Calendar size={48} className="mx-auto mb-2 opacity-50" />
              <p className="text-sm">No sessions scheduled</p>
            </div>
          ) : (
            <div className="space-y-3">
              {weekSessions[currentDayIndex]?.sessions.map((session: Session) => {
                const status = getSessionStatus(session);
                const styling = getStatusStyling(status);
                const icon = getStatusIcon(status);
                const canCancel = canUserCancelSession(session);
                
                return (
                  <div
                    key={session.id}
                    className={`p-4 rounded-lg border-l-4 cursor-pointer transition-colors ${styling}`}
                    onClick={() => handleSessionClick(session)}
                    onContextMenu={(e) => handleSessionRightClick(e, session)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          {icon}
                          <span className="font-medium text-lg">
                            {session.group_name}
                          </span>
                          {session.is_cancelled && (
                            <span className="text-xs bg-gray-200 text-gray-600 px-2 py-1 rounded">
                              CANCELLED
                            </span>
                          )}
                          {session.coach.id === userInfo?.id && !session.is_cancelled && (
                            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                              YOUR SESSION
                            </span>
                          )}
                        </div>
                        <div className="text-sm opacity-75 mb-2">
                          {session.time_display}
                        </div>
                        <div className="flex items-center gap-4 text-sm opacity-75">
                          <div className="flex items-center gap-1">
                            <Users size={16} />
                            <span>{session.student_count} students</span>
                          </div>
                          {session.coach.name && (
                            <div className="flex items-center gap-1">
                              <User size={16} />
                              <span className="truncate">{session.coach.name}</span>
                            </div>
                          )}
                        </div>
                        {session.is_cancelled && session.cancellation_reason && (
                          <div className="text-xs text-gray-600 mt-2 italic">
                            Reason: {session.cancellation_reason}
                          </div>
                        )}
                      </div>
                      
                      <div className="flex flex-col gap-2 ml-3">
                        <button
                          onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                            e.stopPropagation();
                            handleShowSessionDetails(session);
                          }}
                          className="p-2 bg-white bg-opacity-75 rounded-full hover:bg-opacity-100 transition-colors border border-gray-300"
                          title="View details"
                        >
                          <Eye size={16} />
                        </button>
                        
                        {!session.is_cancelled && !session.has_register && (
                          <button
                            onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                              e.stopPropagation();
                              handleCreateRegister(session);
                            }}
                            className="p-2 bg-green-100 text-green-600 rounded-full hover:bg-green-200 transition-colors"
                            title="Create register"
                          >
                            <Plus size={16} />
                          </button>
                        )}
                        
                        {session.has_register && session.register_id && (
                          <button
                            onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                              e.stopPropagation();
                              onViewRegister(session.register_id!.toString());
                            }}
                            className="p-2 bg-blue-100 text-blue-600 rounded-full hover:bg-blue-200 transition-colors"
                            title="View register"
                          >
                            <Calendar size={16} />
                          </button>
                        )}

                        {canCancel && (
                          <button
                            onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                              e.stopPropagation();
                              handleCancelSession(session);
                            }}
                            className="p-2 bg-red-100 text-red-600 rounded-full hover:bg-red-200 transition-colors"
                            title="Cancel session"
                          >
                            <Ban size={16} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Desktop Week Calendar Grid */}
      <div className="hidden sm:block bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="grid grid-cols-7 gap-0 border-b border-gray-200">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, index) => (
            <div key={day} className="p-3 bg-gray-50 text-center text-sm font-medium text-gray-900 border-r border-gray-200 last:border-r-0 relative">
              <div className="flex items-center justify-center gap-2">
                <span>{day}</span>
                {canUserCancelDay() && weekSessions[index] && (
                  <button
                    onClick={() => handleCancelDay(weekSessions[index].date)}
                    className="p-1 text-red-500 hover:bg-red-100 rounded transition-colors"
                    title="Cancel day"
                  >
                    <Ban size={12} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-0">
          {weekSessions.map((day: DaySession) => (
            <div key={day.dateStr} className="min-h-[200px] border-r border-gray-200 last:border-r-0">
              <div className="p-2 bg-gray-50 text-center border-b border-gray-200">
                <div className="text-lg font-bold text-gray-900">
                  {day.date.getDate()}
                </div>
              </div>

              <div className="p-2 space-y-1">
                {day.sessions.length === 0 ? (
                  <div className="text-center text-gray-400 text-xs py-2">
                    No sessions
                  </div>
                ) : (
                  day.sessions.map((session: Session) => {
                    const status = getSessionStatus(session);
                    const styling = getStatusStyling(status);
                    const icon = getStatusIcon(status);
                    const canCancel = canUserCancelSession(session);
                    
                    return (
                      <div
                        key={session.id}
                        className={`p-2 rounded border-l-4 cursor-pointer transition-colors ${styling} ${
                          session.coach.id === userInfo?.id && !session.is_cancelled 
                            ? 'ring-2 ring-blue-200' 
                            : ''
                        }`}
                        onClick={() => handleSessionClick(session)}
                        onContextMenu={(e) => handleSessionRightClick(e, session)}
                        title={
                          session.is_cancelled 
                            ? `Cancelled: ${session.cancellation_reason}` 
                            : session.coach.id === userInfo?.id 
                              ? 'Your session - Click for details' 
                              : 'Click for details'
                        }
                      >
                        <div className="flex items-start justify-between gap-1">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1 mb-1">
                              {icon}
                              <span className="text-xs font-medium truncate">
                                {session.group_name}
                              </span>
                              {session.is_cancelled && (
                                <span className="text-xs bg-gray-200 text-gray-600 px-1 rounded">
                                  ✕
                                </span>
                              )}
                            </div>
                            <div className="text-xs opacity-75 mb-1">
                              {session.time_display}
                            </div>
                            <div className="text-xs opacity-75 mb-1">
                              <div className="flex items-center gap-1">
                                <Users size={10} />
                                <span>{session.student_count}</span>
                              </div>
                            </div>
                            {session.coach.name && (
                              <div className="text-xs opacity-75 truncate">
                                <div className="flex items-center gap-1">
                                  <User size={10} />
                                  <span>{session.coach.name}</span>
                                </div>
                              </div>
                            )}
                          </div>
                          
                          <div className="flex flex-col gap-1">
                            {!session.has_register && !session.is_cancelled && (
                              <button
                                onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                                  e.stopPropagation();
                                  handleCreateRegister(session);
                                }}
                                className="p-1 bg-white bg-opacity-50 rounded-full hover:bg-opacity-75 transition-colors"
                                title="Create register"
                              >
                                <Plus size={10} />
                              </button>
                            )}
                            
                            {canCancel && (
                              <button
                                onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                                  e.stopPropagation();
                                  handleCancelSession(session);
                                }}
                                className="p-1 bg-red-100 text-red-600 rounded-full hover:bg-red-200 transition-colors"
                                title="Cancel session"
                              >
                                <Ban size={10} />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Overdue Sessions Modal */}
      {showOverdueModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 flex-shrink-0">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Sessions Needing Registers</h2>
                <p className="text-sm text-gray-600 mt-1">
                  Week of {weekSessions[0]?.date.toLocaleDateString('en-GB', { 
                    day: 'numeric', 
                    month: 'long',
                    year: 'numeric'
                  })} • {overdueSessions.length} session{overdueSessions.length !== 1 ? 's' : ''}
                </p>
              </div>
              <button
                onClick={() => setShowOverdueModal(false)}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors flex-shrink-0"
              >
                <X size={20} className="text-gray-500" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4" style={{ maxHeight: 'calc(90vh - 140px)' }}>
              {loadingOverdue ? (
                <div className="flex justify-center items-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
              ) : overdueSessions.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <CheckCircle size={48} className="mx-auto mb-4 opacity-50" />
                  <p className="font-medium">No overdue sessions this week!</p>
                  <p className="text-sm">All sessions for this week have registers created.</p>
                </div>
              ) : (
                <div className="grid gap-3">
                  {overdueSessions.map((session) => (
                    <div
                      key={session.id}
                      className="bg-red-50 border border-red-200 rounded-lg p-3 hover:bg-red-100 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <AlertCircle size={14} className="text-red-600 flex-shrink-0" />
                            <h3 className="font-medium text-red-900 truncate">{session.group_name}</h3>
                            <span className="text-xs text-red-600 font-medium bg-red-100 px-2 py-1 rounded flex-shrink-0">
                              {session.days_overdue} day{session.days_overdue !== 1 ? 's' : ''} overdue
                            </span>
                          </div>
                          
                          <div className="flex items-center gap-6 text-sm text-gray-600 mb-3 flex-wrap">
                            <div className="flex items-center gap-1">
                              <Calendar size={14} className="flex-shrink-0" />
                              <span>
                                {new Date(session.date).toLocaleDateString('en-GB', {
                                  weekday: 'short',
                                  day: 'numeric',
                                  month: 'short'
                                })}
                              </span>
                            </div>
                            
                            <div className="flex items-center gap-1">
                              <Clock size={14} className="flex-shrink-0" />
                              <span>{session.time_display}</span>
                            </div>
                            
                            <div className="flex items-center gap-1">
                              <Users size={14} className="flex-shrink-0" />
                              <span>{session.student_count} student{session.student_count !== 1 ? 's' : ''}</span>
                            </div>

                            {session.coach_name && (
                              <div className="flex items-center gap-1">
                                <User size={14} className="flex-shrink-0" />
                                <span className="truncate">{session.coach_name}</span>
                                {session.coach_id === userInfo?.id && (
                                  <span className="text-xs bg-blue-100 text-blue-700 px-1 py-0.5 rounded">
                                    YOU
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                        
                        <button
                          onClick={() => handleCreateRegisterFromOverdue(session)}
                          className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 transition-colors flex-shrink-0 ml-3"
                        >
                          Create Register
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            <div className="px-4 py-3 border-t border-gray-200 bg-gray-50 flex-shrink-0 flex justify-between items-center">
              <span className="text-sm text-gray-600">
                {overdueSessions.length} session{overdueSessions.length !== 1 ? 's' : ''} need{overdueSessions.length === 1 ? 's' : ''} register{overdueSessions.length !== 1 ? 's' : ''}
              </span>
              <button
                onClick={() => setShowOverdueModal(false)}
                className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="bg-white p-4 rounded-lg border border-gray-200">
        <h4 className="text-lg font-semibold mb-3">Quick Actions</h4>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button 
            onClick={handleGeneralCreateRegister}
            className="p-3 text-left border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <Plus className="text-blue-600" size={20} />
              <div>
                <div className="font-medium">Create Register</div>
                <div className="text-sm text-gray-600">Start a new session register</div>
              </div>
            </div>
          </button>
          
          <button 
            onClick={() => onNavigate('/registers?tab=list')}
            className="p-3 text-left border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <Calendar className="text-green-600" size={20} />
              <div>
                <div className="font-medium">View All Registers</div>
                <div className="text-sm text-gray-600">See all completed registers</div>
              </div>
            </div>
          </button>
          
          <button 
            onClick={() => onNavigate('/registers?tab=stats')}
            className="p-3 text-left border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <BarChart3 className="text-purple-600" size={20} />
              <div>
                <div className="font-medium">View Statistics</div>
                <div className="text-sm text-gray-600">Attendance analytics</div>
              </div>
            </div>
          </button>
        </div>
      </div>
      
      {/* Status Legend */}
      <div className="bg-gray-50 p-4 rounded-lg">
        <h5 className="text-sm font-medium text-gray-900 mb-3">Status Legend</h5>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-green-50 border-l-4 border-green-500 rounded"></div>
            <span>Completed</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-red-50 border-l-4 border-red-500 rounded"></div>
            <span>Overdue</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-yellow-50 border-l-4 border-yellow-500 rounded"></div>
            <span>Due Today</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-blue-50 border-l-4 border-blue-500 rounded"></div>
            <span>Upcoming</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-gray-50 border-l-4 border-gray-400 rounded opacity-75"></div>
            <span>Cancelled</span>
          </div>
        </div>
        <div className="mt-3 text-xs text-gray-500">
          <p>💡 <strong>Tip:</strong> Click on any session to view details and manage it. Right-click for quick actions.</p>
          {userInfo && isUserAdmin() ? (
            <p>🔧 <strong>Admin:</strong> You can cancel individual sessions, entire days, or weeks.</p>
          ) : (
            <p>👨‍🏫 <strong>Coach:</strong> You can cancel sessions that you are assigned to coach.</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default RegisterCalendar;