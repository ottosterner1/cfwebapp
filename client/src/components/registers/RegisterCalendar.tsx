import React, { useState, useEffect, useMemo } from 'react';
import { Calendar, Clock, Users, AlertCircle, CheckCircle, Plus, ChevronLeft, ChevronRight, BarChart3 } from 'lucide-react';

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
}

interface TeachingPeriod {
  id: number;
  name: string;
}

interface CalendarSummary {
  total_sessions: number;
  completed_registers: number;
  missing_registers: number;
  overdue_registers: number;
  completion_rate: number;
  weekly_sessions: number;
}

// Weekly-specific stats interface
interface WeeklyStats {
  week_sessions: number;
  completed_sessions: number;
  overdue_sessions: number;
  upcoming_sessions: number;
  completion_rate: number;
}

interface DaySession {
  date: Date;
  dateStr: string;
  sessions: Session[];
}

// Enhanced interface for session data to pass to create register
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

interface RegisterCalendarProps {
  onNavigate: (path: string, data?: any) => void;
  onCreateRegister: (sessionData?: SessionData) => void;
  onViewRegister: (registerId: string) => void;
}

type SessionStatus = 'completed' | 'overdue' | 'today' | 'upcoming';

const RegisterCalendar: React.FC<RegisterCalendarProps> = ({ 
  onNavigate, 
  onCreateRegister, 
  onViewRegister 
}) => {
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [sessions, setSessions] = useState<Session[]>([]);
  const [periods, setPeriods] = useState<TeachingPeriod[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<number | null>(null);
  const [, setSummary] = useState<CalendarSummary | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  
  // Mobile day view state
  const [currentDayIndex, setCurrentDayIndex] = useState<number>(0);

  // Fetch teaching periods
  useEffect(() => {
    const fetchPeriods = async (): Promise<void> => {
      try {
        const response = await fetch('/clubs/api/teaching-periods');
        if (!response.ok) throw new Error('Failed to fetch teaching periods');
        
        const data: TeachingPeriod[] = await response.json();
        setPeriods(data);
        
        if (data.length > 0) {
          setSelectedPeriod(data[0].id);
        }
      } catch (err) {
        console.error('Error fetching periods:', err);
        setError('Failed to load teaching periods');
      }
    };
    
    fetchPeriods();
  }, []);

  // Fetch sessions for current week
  useEffect(() => {
    if (!selectedPeriod) return;
    
    const fetchSessions = async (): Promise<void> => {
      try {
        setLoading(true);
        setError(null);
        
        // Get start and end of current week
        const startOfWeek = new Date(currentDate);
        const day = startOfWeek.getDay();
        const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1); // Monday start
        startOfWeek.setDate(diff);
        
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);
        
        const params = new URLSearchParams({
          period_id: selectedPeriod.toString(),
          start_date: startOfWeek.toISOString().split('T')[0],
          end_date: endOfWeek.toISOString().split('T')[0]
        });
        
        const response = await fetch(`/api/register-calendar?${params}`);
        if (!response.ok) throw new Error('Failed to fetch sessions');
        
        const data: Session[] = await response.json();
        setSessions(data);
        
      } catch (err) {
        console.error('Error fetching sessions:', err);
        setError('Failed to load sessions');
      } finally {
        setLoading(false);
      }
    };
    
    fetchSessions();
  }, [currentDate, selectedPeriod]);

  // Fetch overall summary statistics (for reference)
  useEffect(() => {
    if (!selectedPeriod) return;
    
    const fetchSummary = async (): Promise<void> => {
      try {
        const params = new URLSearchParams({
          period_id: selectedPeriod.toString()
        });
        
        const response = await fetch(`/api/register-calendar/summary?${params}`);
        if (!response.ok) throw new Error('Failed to fetch summary');
        
        const data: CalendarSummary = await response.json();
        setSummary(data);
        
      } catch (err) {
        console.error('Error fetching summary:', err);
      }
    };
    
    fetchSummary();
  }, [selectedPeriod]);

  // Get sessions grouped by date
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

  // Calculate weekly stats from current week sessions
  const weeklyStats: WeeklyStats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    let completed = 0;
    let overdue = 0;
    let upcoming = 0;
    
    sessions.forEach(session => {
      const sessionDate = new Date(session.date);
      sessionDate.setHours(0, 0, 0, 0);
      
      if (session.has_register) {
        completed++;
      } else if (sessionDate < today) {
        overdue++;
      } else {
        upcoming++;
      }
    });
    
    const totalSessions = sessions.length;
    const completionRate = totalSessions > 0 ? Math.round((completed / totalSessions) * 100) : 0;
    
    return {
      week_sessions: totalSessions,
      completed_sessions: completed,
      overdue_sessions: overdue,
      upcoming_sessions: upcoming,
      completion_rate: completionRate
    };
  }, [sessions]);

  // Get status for a session
  const getSessionStatus = (session: Session): SessionStatus => {
    const sessionDate = new Date(session.date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    sessionDate.setHours(0, 0, 0, 0);

    if (session.has_register) {
      return 'completed';
    } else if (sessionDate < today) {
      return 'overdue';
    } else if (sessionDate.getTime() === today.getTime()) {
      return 'today';
    } else {
      return 'upcoming';
    }
  };

  // Get status styling
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
      default:
        return 'bg-gray-50 border-gray-300 text-gray-800 hover:bg-gray-100';
    }
  };

  // Get status icon
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
      default:
        return <Calendar size={14} className="text-gray-600" />;
    }
  };

  // Navigate weeks
  const navigateWeek = (direction: number): void => {
    const newDate = new Date(currentDate);
    newDate.setDate(currentDate.getDate() + (direction * 7));
    setCurrentDate(newDate);
    setCurrentDayIndex(0); // Reset to first day when changing weeks
  };

  // Navigate days (mobile) - NOW WITH WEEK WRAPPING
  const navigateDay = (direction: number): void => {
    const weekSessions = getWeekSessions();
    const newIndex = currentDayIndex + direction;
    
    if (newIndex < 0) {
      // Going left from Monday (index 0) - go to previous week's Sunday (index 6)
      navigateWeek(-1);
      setCurrentDayIndex(6); // Sunday is index 6
    } else if (newIndex >= weekSessions.length) {
      // Going right from Sunday (index 6) - go to next week's Monday (index 0)
      navigateWeek(1);
      setCurrentDayIndex(0); // Monday is index 0
    } else {
      // Normal navigation within the week
      setCurrentDayIndex(newIndex);
    }
  };

  // Enhanced create register handler - passes session data
  const handleCreateRegister = (session: Session): void => {
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

  // Handle session click
  const handleSessionClick = (session: Session): void => {
    if (session.has_register && session.register_id) {
      onViewRegister(session.register_id.toString());
    } else {
      handleCreateRegister(session);
    }
  };

  // Handle period change
  const handlePeriodChange = (event: React.ChangeEvent<HTMLSelectElement>): void => {
    setSelectedPeriod(Number(event.target.value));
  };

  // Handle create register without session data (general create)
  const handleGeneralCreateRegister = (): void => {
    onCreateRegister(); // No session data - user will select manually
  };

  // Reset day index when week changes
  useEffect(() => {
    const weekSessions = getWeekSessions();
    if (currentDayIndex >= weekSessions.length) {
      setCurrentDayIndex(0);
    }
  }, [currentDate, sessions]);

  const weekSessions = getWeekSessions();

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

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
    <div className="space-y-4">
      {/* Header Controls */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <p className="text-gray-600">Manage your session registers</p>
        </div>
        
        {/* Period Selector */}
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

      {/* Weekly Stats - Updated to show current week only */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="text-2xl font-bold text-gray-900">{weeklyStats.week_sessions}</div>
          <div className="text-sm text-gray-600">This Week's Sessions</div>
        </div>
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="text-2xl font-bold text-green-600">{weeklyStats.completed_sessions}</div>
          <div className="text-sm text-gray-600">Completed</div>
        </div>
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="text-2xl font-bold text-red-600">{weeklyStats.overdue_sessions}</div>
          <div className="text-sm text-gray-600">Overdue</div>
        </div>
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="text-2xl font-bold text-blue-600">{weeklyStats.completion_rate}%</div>
          <div className="text-sm text-gray-600">Week Completion</div>
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
            <span className="hidden sm:inline">
              Week of {weekSessions[0]?.date.toLocaleDateString('en-GB', { 
                day: 'numeric', 
                month: 'long',
                year: 'numeric'
              })}
            </span>
            <span className="sm:hidden">
              {weekSessions[currentDayIndex]?.date.toLocaleDateString('en-GB', { 
                weekday: 'long',
                day: 'numeric', 
                month: 'long',
                year: 'numeric'
              })}
            </span>
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

      {/* Mobile Day Navigation - WITH WEEK WRAPPING */}
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
                
                return (
                  <div
                    key={session.id}
                    className={`p-4 rounded-lg border-l-4 cursor-pointer transition-colors ${styling}`}
                    onClick={() => handleSessionClick(session)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          {icon}
                          <span className="font-medium text-lg">
                            {session.group_name}
                          </span>
                        </div>
                        <div className="text-sm opacity-75 mb-2">
                          {session.time_display}
                        </div>
                        <div className="flex items-center gap-1 text-sm opacity-75">
                          <Users size={16} />
                          <span>{session.student_count} students</span>
                        </div>
                      </div>
                      
                      {!session.has_register && (
                        <button
                          onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                            e.stopPropagation();
                            handleCreateRegister(session);
                          }}
                          className="p-3 bg-white bg-opacity-50 rounded-full hover:bg-opacity-75 transition-colors"
                          title="Create register"
                        >
                          <Plus size={20} />
                        </button>
                      )}
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
              {/* Day Header */}
              <div className="p-2 bg-gray-50 text-center border-b border-gray-200">
                <div className="text-lg font-bold text-gray-900">
                  {day.date.getDate()}
                </div>
              </div>

              {/* Sessions */}
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
                    
                    return (
                      <div
                        key={session.id}
                        className={`p-2 rounded border-l-4 cursor-pointer transition-colors ${styling}`}
                        onClick={() => handleSessionClick(session)}
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
                            <div className="flex items-center gap-1 text-xs opacity-75">
                              <Users size={10} />
                              <span>{session.student_count}</span>
                            </div>
                          </div>
                          
                          {!session.has_register && (
                            <button
                              onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                                e.stopPropagation();
                                handleCreateRegister(session);
                              }}
                              className="p-1 bg-white bg-opacity-50 rounded-full hover:bg-opacity-75 transition-colors"
                              title="Create register"
                            >
                              <Plus size={12} />
                            </button>
                          )}
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
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
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
        </div>
      </div>
    </div>
  );
};

export default RegisterCalendar;