import React, { useState, useEffect, useMemo } from 'react';
import { Calendar, Clock, Users, AlertCircle, CheckCircle, Plus, ChevronLeft, ChevronRight, Eye, X, User, FileText, AlertTriangle } from 'lucide-react';

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
  has_plan?: boolean;
  plan_id?: number;
}

interface SessionPlan {
  id: number;
  date: string;
  group_time_id: number;
  group_name: string;
  notes: string;
  planned_by: string;
  summary: {
    total_players: number;
    planned_present: number;
    planned_absent: number;
    makeup_players: number;
    trial_players: number;
  };
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
  total_sessions: number;
  planned_sessions: number;
  unplanned_sessions: number;
  register_exists_sessions: number;
}

interface DaySession {
  date: Date;
  dateStr: string;
  sessions: Session[];
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

interface SessionPlanCalendarProps {
  onNavigate: (path: string, data?: any) => void;
  onCreateSessionPlan: (sessionData?: SessionPlanData) => void;
  onViewSessionPlan: (planId: number) => void;
  selectedPeriodId: number | null;
  teachingPeriods: TeachingPeriod[];
  onPeriodChange: (periodId: number) => void;
}

type SessionStatus = 'has_plan' | 'needs_plan' | 'has_register';

const getCurrentDayIndex = (): number => {
  const today = new Date();
  const day = today.getDay();
  return day === 0 ? 6 : day - 1;
};

const SessionPlanCalendar: React.FC<SessionPlanCalendarProps> = ({
  onNavigate,
  onCreateSessionPlan,
  onViewSessionPlan,
  selectedPeriodId,
  teachingPeriods,
  onPeriodChange
}) => {
  // State management
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionPlans, setSessionPlans] = useState<SessionPlan[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [,setUserInfo] = useState<UserInfo | null>(null);
  const [currentDayIndex, setCurrentDayIndex] = useState<number>(getCurrentDayIndex());

  // Modal states
  const [showSessionModal, setShowSessionModal] = useState<boolean>(false);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);

  // Data fetching functions
  const fetchUserInfo = async (): Promise<void> => {
    try {
      const response = await fetch('/api/user/info');
      if (!response.ok) throw new Error('Failed to fetch user info');
      const data: UserInfo = await response.json();
      setUserInfo(data);
    } catch (err) {
      console.error('Error fetching user info:', err);
      setError('Failed to load user information');
    }
  };

  const fetchSessions = async (): Promise<void> => {
    if (!selectedPeriodId) return;
    
    try {
      setLoading(true);
      setError(null);
      
      const startOfWeek = new Date(currentDate);
      const day = startOfWeek.getDay();
      const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1);
      startOfWeek.setDate(diff);
      
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      
      const params = new URLSearchParams({
        period_id: selectedPeriodId.toString(),
        start_date: startOfWeek.toISOString().split('T')[0],
        end_date: endOfWeek.toISOString().split('T')[0]
      });
      
      const response = await fetch(`/api/register-calendar?${params}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch sessions: ${response.status}`);
      }
      
      const data: Session[] = await response.json();
      setSessions(data);
      
    } catch (err) {
      console.error('Error fetching sessions:', err);
      setError('Failed to load sessions');
    } finally {
      setLoading(false);
    }
  };

  const fetchSessionPlans = async (): Promise<void> => {
    if (!selectedPeriodId) return;
    
    try {
      const startOfWeek = new Date(currentDate);
      const day = startOfWeek.getDay();
      const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1);
      startOfWeek.setDate(diff);
      
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      
      const params = new URLSearchParams({
        period_id: selectedPeriodId.toString(),
        start_date: startOfWeek.toISOString().split('T')[0],
        end_date: endOfWeek.toISOString().split('T')[0]
      });
      
      const response = await fetch(`/api/session-plans?${params}`);
      if (!response.ok) {
        if (response.status === 403) {
          setSessionPlans([]);
          return;
        }
        throw new Error(`Failed to fetch session plans: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (!Array.isArray(data)) {
        setSessionPlans([]);
        return;
      }
      
      // Transform backend data to match frontend interface
      const transformedPlans: SessionPlan[] = [];
      
      for (let i = 0; i < data.length; i++) {
        const plan = data[i];
        const groupTimeId = plan.time_slot?.id;
        const groupName = plan.group?.name;
        const plannedBy = plan.planned_by?.name || 'Unknown';
        
        if (!groupTimeId) {
          continue;
        }
        
        const transformed: SessionPlan = {
          id: plan.id,
          group_time_id: groupTimeId,
          date: plan.date,
          group_name: groupName || 'Unknown Group',
          notes: plan.notes || '',
          planned_by: plannedBy,
          summary: plan.summary || {
            total_players: 0,
            planned_present: 0,
            planned_absent: 0,
            makeup_players: 0,
            trial_players: 0
          }
        };
        
        transformedPlans.push(transformed);
      }
      
      setSessionPlans(transformedPlans);
      
    } catch (err) {
      console.error('Error fetching session plans:', err);
      setSessionPlans([]);
    }
  };

  // Session management functions
  const handleShowSessionDetails = (session: Session): void => {
    setSelectedSession(session);
    setShowSessionModal(true);
  };

  const handleCreateSessionPlan = (session: Session): void => {
    const status = getSessionStatus(session);
    if (status === 'has_register') {
      alert('Cannot create session plan - register already exists for this session');
      return;
    }
    
    const sessionData: SessionPlanData = {
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
    
    onCreateSessionPlan(sessionData);
  };

  const handleSessionClick = (session: Session): void => {
    handleShowSessionDetails(session);
  };

  const handleGeneralCreateSessionPlan = (): void => {
    onCreateSessionPlan();
  };

  // Check if a session has a plan
  const getSessionPlan = (session: Session): SessionPlan | undefined => {
    return sessionPlans.find(plan => {
      const dateMatch = plan.date === session.date;
      const groupTimeMatch = plan.group_time_id === session.group_time_id;
      return dateMatch && groupTimeMatch;
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

  // Session status logic
  const getSessionStatus = (session: Session): SessionStatus => {
    if (session.has_register) {
      return 'has_register';
    }
    
    const sessionPlan = getSessionPlan(session);
    if (sessionPlan) {
      return 'has_plan';
    }
    
    return 'needs_plan';
  };

  // Styling functions with inline fallbacks
  const getStatusStyling = (status: SessionStatus): string => {
    switch (status) {
      case 'has_plan':
        return 'bg-green-100 border-l-4 border-green-500 text-green-900 hover:bg-green-200';
      case 'needs_plan':
        return 'bg-orange-100 border-l-4 border-orange-500 text-orange-900 hover:bg-orange-200';
      case 'has_register':
        return 'bg-gray-100 border-l-4 border-gray-500 text-gray-700 hover:bg-gray-200 opacity-90';
      default:
        return 'bg-gray-50 border-l-4 border-gray-300 text-gray-800 hover:bg-gray-100';
    }
  };

  const getStatusInlineStyles = (status: SessionStatus): React.CSSProperties => {
    switch (status) {
      case 'has_plan':
        return {
          backgroundColor: '#dcfce7',
          borderLeftColor: '#22c55e',
          color: '#14532d'
        };
      case 'needs_plan':
        return {
          backgroundColor: '#fed7aa',
          borderLeftColor: '#f97316',
          color: '#9a3412'
        };
      case 'has_register':
        return {
          backgroundColor: '#f3f4f6',
          borderLeftColor: '#6b7280',
          color: '#374151',
          opacity: 0.9
        };
      default:
        return {};
    }
  };

  const getStatusIcon = (status: SessionStatus): JSX.Element => {
    switch (status) {
      case 'has_plan':
        return <CheckCircle size={16} className="text-green-600 flex-shrink-0" />;
      case 'needs_plan':
        return <AlertTriangle size={16} className="text-orange-600 flex-shrink-0" />;
      case 'has_register':
        return <FileText size={16} className="text-gray-500 flex-shrink-0" />;
      default:
        return <Calendar size={16} className="text-gray-600 flex-shrink-0" />;
    }
  };

  const getStatusMessage = (session: Session): string => {
    const status = getSessionStatus(session);
    switch (status) {
      case 'has_plan':
        return 'Session plan created - ready to go!';
      case 'needs_plan':
        return 'Session needs planning';
      case 'has_register':
        return 'Register exists - cannot create plan';
      default:
        return 'Unknown status';
    }
  };

  const getStatusBadge = (status: SessionStatus): JSX.Element | null => {
    switch (status) {
      case 'has_plan':
        return (
          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-200 text-green-800">
            PLANNED
          </span>
        );
      case 'has_register':
        return (
          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-200 text-gray-700">
            REGISTER
          </span>
        );
      case 'needs_plan':
      default:
        return null; // No badge for sessions that need planning
    }
  };

  // Statistics calculation
  const weeklyStats: WeeklyStats = useMemo(() => {
    let planned = 0;
    let unplanned = 0;
    let registerExists = 0;
    
    sessions.forEach(session => {
      const status = getSessionStatus(session);
      switch (status) {
        case 'has_plan':
          planned++;
          break;
        case 'needs_plan':
          unplanned++;
          break;
        case 'has_register':
          registerExists++;
          break;
      }
    });
    
    return {
      total_sessions: sessions.length,
      planned_sessions: planned,
      unplanned_sessions: unplanned,
      register_exists_sessions: registerExists
    };
  }, [sessions, sessionPlans]);

  // Event handlers
  const handlePeriodChange = (event: React.ChangeEvent<HTMLSelectElement>): void => {
    onPeriodChange(Number(event.target.value));
  };

  // Effect hooks
  useEffect(() => {
    fetchUserInfo();
  }, []);

  useEffect(() => {
    fetchSessions();
    fetchSessionPlans();
  }, [currentDate, selectedPeriodId]);

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
      </div>
    );
  }

  return (
    <div className="space-y-6">
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
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-medium text-gray-900">{selectedSession.group_name}</h3>
                  {getStatusBadge(getSessionStatus(selectedSession))}
                </div>
                
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
                    </div>
                  )}
                </div>
              </div>

              {/* Status-specific information */}
              {getSessionStatus(selectedSession) === 'has_register' && (
                <div className="p-3 bg-gray-50 border border-gray-200 rounded">
                  <div className="flex items-center gap-2 text-gray-700 mb-1">
                    <FileText size={16} />
                    <span className="font-medium">Register Exists</span>
                  </div>
                  <p className="text-sm text-gray-600">
                    A register has already been created for this session.
                    {getSessionPlan(selectedSession) && (
                      <span className="text-green-600 ml-1">Session plan is also available.</span>
                    )}
                  </p>
                </div>
              )}

              {getSessionStatus(selectedSession) === 'has_plan' && (
                <div className="p-3 bg-green-50 border border-green-200 rounded">
                  <div className="flex items-center gap-2 text-green-700 mb-1">
                    <CheckCircle size={16} />
                    <span className="font-medium">Session Planned</span>
                  </div>
                </div>
              )}
            </div>
            
            <div className="p-4 border-t border-gray-200 flex justify-end gap-3">
              {getSessionStatus(selectedSession) === 'needs_plan' ? (
                // Orange sessions - prominent Create Plan button
                <>
                  <button
                    onClick={() => setShowSessionModal(false)}
                    className="px-4 py-2 text-gray-700 border border-gray-300 rounded hover:bg-gray-50"
                  >
                    Close
                  </button>
                  <button
                    onClick={() => {
                      handleCreateSessionPlan(selectedSession);
                      setShowSessionModal(false);
                    }}
                    className="px-6 py-2 bg-green-600 text-white rounded hover:bg-green-700 flex items-center gap-2 font-medium"
                  >
                    <Plus size={16} />
                    Create Plan
                  </button>
                </>
              ) : (
                // Green and gray sessions - check for session plan
                <>
                  <button
                    onClick={() => setShowSessionModal(false)}
                    className="px-4 py-2 text-gray-700 border border-gray-300 rounded hover:bg-gray-50"
                  >
                    Close
                  </button>
                  
                  {/* Show View Plan button for any session that has a plan (green or gray) */}
                  {(() => {
                    const plan = getSessionPlan(selectedSession);
                    return plan ? (
                      <button
                        onClick={() => {
                          onViewSessionPlan(plan.id);
                          setShowSessionModal(false);
                        }}
                        className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 flex items-center gap-2"
                      >
                        <Eye size={16} />
                        View Plan
                      </button>
                    ) : null;
                  })()}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Header Controls */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Session Plan Calendar</h2>
          <p className="text-gray-600">
            Plan your sessions and manage attendance in advance
          </p>
        </div>
        
        <select 
          value={selectedPeriodId || ''} 
          onChange={handlePeriodChange}
          className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          {teachingPeriods.map(period => (
            <option key={period.id} value={period.id}>{period.name}</option>
          ))}
        </select>
      </div>

      {/* Weekly Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg border-l-4 border-blue-500">
          <div className="text-2xl font-bold text-gray-900">{weeklyStats.total_sessions}</div>
          <div className="text-sm text-gray-600">Total Sessions</div>
        </div>
        <div className="bg-white p-4 rounded-lg border-l-4 border-green-500">
          <div className="text-2xl font-bold text-green-600">{weeklyStats.planned_sessions}</div>
          <div className="text-sm text-gray-600">Planned</div>
        </div>
        <div className="bg-white p-4 rounded-lg border-l-4 border-orange-500">
          <div className="text-2xl font-bold text-orange-600">{weeklyStats.unplanned_sessions}</div>
          <div className="text-sm text-gray-600">Need Planning</div>
        </div>
        <div className="bg-white p-4 rounded-lg border-l-4 border-gray-500">
          <div className="text-2xl font-bold text-gray-600">{weeklyStats.register_exists_sessions}</div>
          <div className="text-sm text-gray-600">Have Register</div>
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
        
        <div className="text-center">
          <h3 className="text-lg font-semibold">
            Week of {weekSessions[0]?.date.toLocaleDateString('en-GB', { 
              day: 'numeric', 
              month: 'long',
              year: 'numeric'
            })}
          </h3>
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
                const sessionPlan = getSessionPlan(session);
                
                return (
                  <div
                    key={session.id}
                    className={`p-4 rounded-lg cursor-pointer transition-colors ${styling}`}
                    style={getStatusInlineStyles(status)}
                    onClick={() => handleSessionClick(session)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          {icon}
                          <span className="font-medium text-lg">
                            {session.group_name}
                          </span>
                          {getStatusBadge(status) && getStatusBadge(status)}
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
                        
                        {status === 'needs_plan' && (
                          <button
                            onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                              e.stopPropagation();
                              handleCreateSessionPlan(session);
                            }}
                            className="p-2 bg-orange-100 text-orange-600 rounded-full hover:bg-orange-200 transition-colors"
                            title="Create session plan"
                          >
                            <Plus size={16} />
                          </button>
                        )}
                        
                        {(status === 'has_plan' || (status === 'has_register' && sessionPlan)) && (
                          <button
                            onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                              e.stopPropagation();
                              if (sessionPlan) {
                                onViewSessionPlan(sessionPlan.id);
                              }
                            }}
                            className="p-2 bg-green-100 text-green-600 rounded-full hover:bg-green-200 transition-colors"
                            title="View session plan"
                          >
                            <Eye size={16} />
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
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
            <div key={day} className="p-3 bg-gray-50 text-center text-sm font-medium text-gray-900 border-r border-gray-200 last:border-r-0">
              {day}
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

              <div className="p-2 space-y-2">
                {day.sessions.length === 0 ? (
                  <div className="text-center text-gray-400 text-xs py-2">
                    No sessions
                  </div>
                ) : (
                  day.sessions.map((session: Session) => {
                    const status = getSessionStatus(session);
                    const styling = getStatusStyling(status);
                    const icon = getStatusIcon(status);
                    
                    return (
                      <div
                        key={session.id}
                        className={`p-2 rounded cursor-pointer transition-colors ${styling}`}
                        style={getStatusInlineStyles(status)}
                        onClick={() => handleSessionClick(session)}
                        title={getStatusMessage(session)}
                      >
                        <div className="flex items-start justify-between gap-1">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1 mb-1">
                              {icon}
                              <span className="text-xs font-medium truncate">
                                {session.group_name}
                              </span>
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
                            
                            <div className="mt-1">
                              {status === 'has_plan' && (
                                <span className="inline-block w-2 h-2 bg-green-500 rounded-full" title="Planned"></span>
                              )}
                              {status === 'needs_plan' && (
                                <span className="inline-block w-2 h-2 bg-orange-500 rounded-full" title="Needs Plan"></span>
                              )}
                              {status === 'has_register' && (
                                <span className="inline-block w-2 h-2 bg-gray-500 rounded-full" title="Has Register"></span>
                              )}
                            </div>
                          </div>
                          
                          <div className="flex flex-col gap-1">
                            {status === 'needs_plan' && (
                              <button
                                onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                                  e.stopPropagation();
                                  handleCreateSessionPlan(session);
                                }}
                                className="p-1 bg-white bg-opacity-50 rounded-full hover:bg-opacity-75 transition-colors"
                                title="Create session plan"
                              >
                                <Plus size={10} />
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

      {/* Quick Actions */}
      <div className="bg-white p-4 rounded-lg border border-gray-200">
        <h4 className="text-lg font-semibold mb-3">Quick Actions</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button 
            onClick={handleGeneralCreateSessionPlan}
            className="p-3 text-left border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <Plus className="text-blue-600" size={20} />
              <div>
                <div className="font-medium">Create Session Plan</div>
                <div className="text-sm text-gray-600">Plan a new session</div>
              </div>
            </div>
          </button>
          
          <button 
            onClick={() => onNavigate('/session-plans?tab=list')}
            className="p-3 text-left border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <Calendar className="text-green-600" size={20} />
              <div>
                <div className="font-medium">View All Plans</div>
                <div className="text-sm text-gray-600">See all session plans</div>
              </div>
            </div>
          </button>
        </div>
      </div>
      
      {/* Status Legend */}
      <div className="bg-white p-4 rounded-lg border border-gray-200">
        <h5 className="text-sm font-medium text-gray-900 mb-3">Status Legend</h5>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 bg-green-100 border-l-4 border-green-500 rounded flex items-center justify-center">
              <CheckCircle size={12} className="text-green-600" />
            </div>
            <div>
              <div className="font-medium text-green-900">Planned</div>
              <div className="text-xs text-gray-600">Session plan created</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 bg-orange-100 border-l-4 border-orange-500 rounded flex items-center justify-center">
              <AlertTriangle size={12} className="text-orange-600" />
            </div>
            <div>
              <div className="font-medium text-orange-900">Needs Plan</div>
              <div className="text-xs text-gray-600">Planning required</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 bg-gray-100 border-l-4 border-gray-500 rounded flex items-center justify-center">
              <FileText size={12} className="text-gray-600" />
            </div>
            <div>
              <div className="font-medium text-gray-700">Has Register</div>
              <div className="text-xs text-gray-600">May also have plan</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SessionPlanCalendar;