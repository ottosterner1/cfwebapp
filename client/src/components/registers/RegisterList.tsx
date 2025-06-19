// client/src/components/registers/RegisterList.tsx

import React, { useState, useEffect, useMemo } from 'react';
import { Register } from '../../types/register';
import { Filter, RefreshCw, Eye, Edit, PieChart, Plus } from 'lucide-react';

interface TeachingPeriod {
  id: number;
  name: string;
}

interface Group {
  id: number;
  name: string;
}

interface Coach {
  id: number;
  name: string;
}

interface UserInfo {
  is_admin: boolean;
  coach_id?: number;
}

interface RegisterListProps {
  onNavigate: (registerId: string) => void;
  onEdit: (registerId: string) => void;
  onCreateNew: () => void;
  onViewStats: () => void;
  periodId?: number;
  groupId?: number;
}

const RegisterList: React.FC<RegisterListProps> = ({ 
  onNavigate, 
  onEdit,
  onCreateNew, 
  onViewStats,
  periodId: initialPeriodId, 
  groupId: initialGroupId 
}) => {
  // State for data
  const [registers, setRegisters] = useState<Register[]>([]);
  const [allRegisters, setAllRegisters] = useState<Register[]>([]);
  const [loading, setLoading] = useState({
    periods: true,
    groups: false,
    coaches: true,
    registers: true
  });
  const [error, setError] = useState<string | null>(null);
  
  // State for filter options
  const [periods, setPeriods] = useState<TeachingPeriod[]>([]);
  const [loadingPeriods, setLoadingPeriods] = useState(true);
  const [periodsError, setPeriodsError] = useState<string | null>(null);
  
  const [groups, setGroups] = useState<Group[]>([]);
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [loadingUserInfo, setLoadingUserInfo] = useState(true);
  
  // State for selected filters
  const [selectedPeriod, setSelectedPeriod] = useState<number | undefined>(initialPeriodId);
  const [selectedGroup, setSelectedGroup] = useState<number | undefined>(initialGroupId);
  const [selectedDay, setSelectedDay] = useState<string>('');
  const [selectedCoach, setSelectedCoach] = useState<number | undefined>(undefined);
  const [selectedSession, setSelectedSession] = useState<string>('');
  
  // State for filter visibility on mobile
  const [showFilters, setShowFilters] = useState(true);

  // Extract unique days from registers
  const availableDays = useMemo(() => {
    const days = new Set<string>();
    allRegisters.forEach(register => {
      if (register.time_slot.day) {
        days.add(register.time_slot.day);
      }
    });
    return Array.from(days).sort();
  }, [allRegisters]);

  // Extract unique sessions (time slots) from registers
  const availableSessions = useMemo(() => {
    const sessions = new Set<string>();
    allRegisters.forEach(register => {
      const timeSlot = `${register.time_slot.start_time}-${register.time_slot.end_time}`;
      sessions.add(timeSlot);
    });
    return Array.from(sessions).sort();
  }, [allRegisters]);

  // Load user info
  useEffect(() => {
    const fetchUserInfo = async () => {
      try {
        setLoadingUserInfo(true);
        
        const response = await fetch('/api/user/info');
        if (!response.ok) {
          throw new Error(`Failed to fetch user info: ${response.statusText}`);
        }
        
        const data = await response.json();
        setUserInfo(data);
        
        // If user is a coach, set the selected coach filter to their ID
        if (!data.is_admin && data.coach_id) {
          setSelectedCoach(data.coach_id);
        }
      } catch (err) {
        console.error('Error fetching user info:', err);
      } finally {
        setLoadingUserInfo(false);
      }
    };
    
    fetchUserInfo();
  }, []);

  // Load coaches
  useEffect(() => {
    const fetchCoaches = async () => {
      try {
        setLoading(prev => ({ ...prev, coaches: true }));
        
        const response = await fetch('/clubs/api/coaches/organsation');
        
        if (!response.ok) {
          throw new Error(`Failed to fetch coaches: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (!Array.isArray(data)) {
          console.warn('Expected array of coaches but got:', data);
          setCoaches([]);
        } else {
          setCoaches(data);
        }
      } catch (err) {
        console.error('Error fetching coaches:', err);
      } finally {
        setLoading(prev => ({ ...prev, coaches: false }));
      }
    };
    
    fetchCoaches();
  }, []);

  // Load teaching periods
  useEffect(() => {
    const fetchPeriods = async () => {
      try {
        setLoadingPeriods(true);
        setPeriodsError(null);
        
        const response = await fetch('/clubs/api/teaching-periods');
        if (!response.ok) {
          throw new Error(`Failed to fetch teaching periods: ${response.statusText}`);
        }
        
        const data = await response.json();
        setPeriods(data);
        
        // If no period was explicitly selected, use the first one
        if (!selectedPeriod && data.length > 0) {
          setSelectedPeriod(data[0].id);
        }
      } catch (err) {
        console.error('Error fetching teaching periods:', err);
        const errorMessage = err instanceof Error ? err.message : 'Failed to load teaching periods';
        setPeriodsError(errorMessage);
      } finally {
        setLoadingPeriods(false);
      }
    };
    
    fetchPeriods();
  }, []);
  
  // Load groups
  useEffect(() => {
    const fetchGroups = async () => {
      try {
        setLoading(prev => ({ ...prev, groups: true }));
        const response = await fetch('/clubs/api/groups');
        if (!response.ok) throw new Error('Failed to fetch groups');
        const data = await response.json();
        setGroups(data);
      } catch (err) {
        console.error('Error fetching groups:', err);
      } finally {
        setLoading(prev => ({ ...prev, groups: false }));
      }
    };
    
    fetchGroups();
  }, []);

  // Fetch registers when period filter changes
  useEffect(() => {
    const fetchRegisters = async () => {
      try {
        setLoading(prev => ({ ...prev, registers: true }));
        setError(null);
        
        // Build query params
        const params = new URLSearchParams();
        if (selectedPeriod) params.append('period_id', selectedPeriod.toString());
        
        // Add timeout to prevent eternal loading
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
        
        const response = await fetch(`/api/registers?${params.toString()}`, {
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          throw new Error(`Error fetching registers: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        // Update the attendance rate calculation for each register to only count "present" as attendance
        const updatedData = data.map((register: Register) => {
          // Calculate new attendance rate - Only counting "present" as attendance
          const total = register.stats.total;
          const presentCount = register.stats.present;
          const attendanceRate = total > 0 ? Math.round((presentCount / total) * 100 * 10) / 10 : 0;
          
          return {
            ...register,
            stats: {
              ...register.stats,
              attendance_rate: attendanceRate
            }
          };
        });
        
        setAllRegisters(updatedData);
      } catch (err) {
        console.error('Error fetching registers:', err);
        const errorMessage = 
          err instanceof Error && err.name === 'AbortError'
            ? 'Request timed out. Please try again.'
            : err instanceof Error 
              ? err.message 
              : 'An error occurred';
        setError(errorMessage);
      } finally {
        setLoading(prev => ({ ...prev, registers: false }));
      }
    };
    
    if (selectedPeriod) {
      fetchRegisters();
    } else {
      // If no period is selected, clear loading state to avoid eternal spinner
      setLoading(prev => ({ ...prev, registers: false }));
    }
  }, [selectedPeriod]);

  // Apply all filters to the registers and sort by newest date first
  useEffect(() => {
    let filteredData = [...allRegisters];
    
    // Apply group filter
    if (selectedGroup) {
      filteredData = filteredData.filter(register => {
        // Check if group_name contains the selected group id or name
        const group = groups.find(g => g.id === selectedGroup);
        return group && register.group_name.includes(group.name);
      });
    }
    
    // Apply day filter
    if (selectedDay) {
      filteredData = filteredData.filter(register => 
        register.time_slot.day === selectedDay
      );
    }
    
    // Apply coach filter
    if (selectedCoach) {
      filteredData = filteredData.filter(register => 
        register.coach_id === selectedCoach
      );
    }
    
    // Apply session filter
    if (selectedSession) {
      filteredData = filteredData.filter(register => 
        `${register.time_slot.start_time}-${register.time_slot.end_time}` === selectedSession
      );
    }
    
    // Sort registers by date in reverse chronological order (newest first)
    filteredData.sort((a, b) => {
      const dateA = new Date(a.date);
      const dateB = new Date(b.date);
      // Sort descending (newest first)
      return dateB.getTime() - dateA.getTime();
    });
    
    setRegisters(filteredData);
  }, [allRegisters, selectedGroup, selectedDay, selectedCoach, selectedSession, groups]);

  // Format date to a more readable format
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  // Update filters
  const handlePeriodChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    setSelectedPeriod(value ? Number(value) : undefined);
    // Reset other filters when period changes
    setSelectedDay('');
    setSelectedSession('');
  };
  
  const handleGroupChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    setSelectedGroup(value ? Number(value) : undefined);
  };

  const handleDayChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedDay(e.target.value);
  };

  const handleCoachChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    setSelectedCoach(value ? Number(value) : undefined);
  };

  const handleSessionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedSession(e.target.value);
  };

  // Reset all filters
  const handleResetFilters = () => {
    setSelectedGroup(undefined);
    setSelectedDay('');
    setSelectedSession('');
    // Only reset coach filter if user is admin
    if (userInfo?.is_admin) {
      setSelectedCoach(undefined);
    }
  };

  // Toggle filter visibility on mobile
  const toggleFilters = () => {
    setShowFilters(prev => !prev);
  };

  // Calculate total absences (including sick and away with notice)
  const getTotalAbsences = (register: Register) => {
    return register.stats.absent + register.stats.sick + register.stats.away_with_notice;
  };

  // Handle case where we have no teaching periods
  if (!loadingPeriods && periods.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h1 className="text-2xl font-bold">Registers</h1>
          <button
            onClick={onCreateNew}
            className="w-full sm:w-auto px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 shadow flex items-center justify-center gap-2"
          >
            <Plus size={18} />
            <span className="hidden sm:inline">Create New Register</span>
            <span className="sm:hidden">Create Register</span>
          </button>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow text-center">
          <p className="text-gray-600 mb-4">No teaching periods found for your account.</p>
          <p className="text-gray-500">Please contact an administrator to be assigned to a teaching period.</p>
        </div>
      </div>
    );
  }

  // Handle periods loading error
  if (periodsError) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h1 className="text-2xl font-bold">Registers</h1>
        </div>
        
        <div className="bg-red-50 p-6 rounded-lg shadow">
          <h2 className="text-lg font-medium text-red-700 mb-2">Error Loading Data</h2>
          <p className="text-red-600">{periodsError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with buttons */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold">Registers</h1>
        <div className="flex flex-wrap w-full sm:w-auto gap-2">
          <button
            onClick={toggleFilters}
            className="flex-1 sm:flex-auto px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 flex items-center justify-center gap-2"
            aria-expanded={showFilters}
          >
            <Filter size={18} />
            <span>{showFilters ? 'Hide Filters' : 'Filters'}</span>
          </button>
          <button
            onClick={onViewStats}
            className="flex-1 sm:flex-auto px-4 py-2 bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200 flex items-center justify-center gap-2"
          >
            <PieChart size={18} />
            <span className="hidden sm:inline">View Statistics</span>
            <span className="sm:hidden">Stats</span>
          </button>
          <button
            onClick={onCreateNew}
            className="flex-1 sm:flex-auto px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 shadow flex items-center justify-center gap-2"
          >
            <Plus size={18} />
            <span className="hidden sm:inline">Create New Register</span>
            <span className="sm:hidden">Create</span>
          </button>
        </div>
      </div>
      
      {/* Filters */}
      <div className={`bg-white rounded-lg shadow overflow-hidden transition-all duration-300 ease-in-out ${showFilters ? 'max-h-[1000px]' : 'max-h-0 sm:max-h-[1000px] hidden sm:block'}`}>
        <div className="p-4">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-lg font-semibold">Filters</h2>
            <button
              onClick={handleResetFilters}
              className="flex items-center text-sm text-blue-600 hover:text-blue-800 gap-1"
            >
              <RefreshCw size={14} />
              Reset Filters
            </button>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {/* Term Filter */}
            <div>
              <label htmlFor="period" className="block text-sm font-medium text-gray-700 mb-1">
                Term
              </label>
              <select
                id="period"
                value={selectedPeriod || ''}
                onChange={handlePeriodChange}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2"
                disabled={loadingPeriods}
              >
                <option value="">All Terms</option>
                {periods.map(period => (
                  <option key={period.id} value={period.id}>{period.name}</option>
                ))}
              </select>
            </div>

            {/* Day Filter */}
            <div>
              <label htmlFor="day" className="block text-sm font-medium text-gray-700 mb-1">
                Day
              </label>
              <select
                id="day"
                value={selectedDay}
                onChange={handleDayChange}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2"
              >
                <option value="">All Days</option>
                {availableDays.map(day => (
                  <option key={day} value={day}>{day}</option>
                ))}
              </select>
            </div>
            
            {/* Coach Filter */}
            <div>
              <label htmlFor="coach" className="block text-sm font-medium text-gray-700 mb-1">
                Coach
              </label>
              <select
                id="coach"
                value={selectedCoach || ''}
                onChange={handleCoachChange}
                disabled={!userInfo?.is_admin || loadingUserInfo}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 disabled:bg-gray-100"
              >
                <option value="">All Coaches</option>
                {coaches.map(coach => (
                  <option key={coach.id} value={coach.id}>{coach.name}</option>
                ))}
              </select>
            </div>
            
            {/* Group Filter */}
            <div>
              <label htmlFor="group" className="block text-sm font-medium text-gray-700 mb-1">
                Group
              </label>
              <select
                id="group"
                value={selectedGroup || ''}
                onChange={handleGroupChange}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2"
              >
                <option value="">All Groups</option>
                {groups.map(group => (
                  <option key={group.id} value={group.id}>{group.name}</option>
                ))}
              </select>
            </div>
            
            {/* Session Filter */}
            <div>
              <label htmlFor="session" className="block text-sm font-medium text-gray-700 mb-1">
                Session
              </label>
              <select
                id="session"
                value={selectedSession}
                onChange={handleSessionChange}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2"
              >
                <option value="">All Sessions</option>
                {availableSessions.map(session => (
                  <option key={session} value={session}>{session}</option>
                ))}
              </select>
            </div>
          </div>
          
          {/* Loading indicators */}
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
            {loading.coaches && <span>Loading coaches...</span>}
            {loading.groups && <span>Loading groups...</span>}
            {coaches.length === 0 && !loading.coaches && (
              <span className="text-yellow-600">No coaches found for your tennis club</span>
            )}
          </div>
        </div>
      </div>

      {/* Result display */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading.registers ? (
          <div className="flex justify-center items-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-700"></div>
          </div>
        ) : error ? (
          <div className="p-4 text-red-500">{error}</div>
        ) : registers.length === 0 ? (
          <div className="p-6 text-center text-gray-500">
            <p className="mb-2">No registers found matching your criteria.</p>
            {selectedPeriod || selectedGroup || selectedDay || selectedCoach || selectedSession ? (
              <button
                onClick={handleResetFilters}
                className="text-sm text-blue-600 hover:text-blue-800 underline"
              >
                Clear filters
              </button>
            ) : (
              <button
                onClick={onCreateNew}
                className="text-sm text-blue-600 hover:text-blue-800 underline"
              >
                Create a new register
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Register Cards - For all screen sizes */}
            <div className="divide-y divide-gray-200">
              <div className="p-3 bg-gray-50 text-xs font-medium text-gray-500 uppercase">
                {registers.length} Registers Found
              </div>
              {registers.map((register) => (
                <div key={register.id} className="p-4 hover:bg-gray-50">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                    {/* Main Info */}
                    <div className="flex-grow">
                      <div className="flex flex-col sm:flex-row gap-1 sm:gap-3 sm:items-center">
                        <h3 className="font-medium text-gray-900">{formatDate(register.date)}</h3>
                        <div className="text-sm text-gray-700">{register.group_name}</div>
                      </div>
                      <div className="mt-1 text-sm text-gray-500">
                        {register.time_slot.day} {register.time_slot.start_time}-{register.time_slot.end_time}
                      </div>
                      <div className="mt-1 text-sm text-gray-500">Coach: {register.coach_name}</div>
                      
                      {/* Attendance Stats */}
                      <div className="mt-2 grid grid-cols-3 gap-2">
                        <div className="col-span-3 sm:col-span-1">
                          <div className="flex items-center">
                            <span className="text-xs text-gray-500 mr-2">Attendance:</span>
                            <div className="flex-grow bg-gray-200 rounded-full h-2.5">
                              <div 
                                className={`h-2.5 rounded-full ${
                                  register.stats.attendance_rate >= 80 ? 'bg-green-600' :
                                  register.stats.attendance_rate >= 60 ? 'bg-yellow-500' :
                                  'bg-red-600'
                                }`}
                                style={{ width: `${register.stats.attendance_rate}%` }}
                              ></div>
                            </div>
                            <span className="ml-2 text-xs font-medium text-gray-700">
                              {register.stats.attendance_rate}%
                            </span>
                          </div>
                        </div>
                        <div className="text-xs text-green-600">
                          Present: {register.stats.present}/{register.stats.total}
                        </div>
                        <div className="text-xs text-red-600">
                          Absent: {getTotalAbsences(register)}
                        </div>
                      </div>
                    </div>
                    
                    {/* Action Buttons - Always visible, no horizontal scroll */}
                    <div className="flex mt-3 sm:mt-0 gap-2 sm:gap-3 self-end sm:self-center">
                      <button 
                        onClick={() => onNavigate(register.id.toString())}
                        className="flex items-center justify-center gap-1 text-blue-600 hover:text-blue-900 font-medium text-sm px-3 py-1.5 bg-blue-50 rounded border border-blue-100 hover:bg-blue-100 flex-1 sm:flex-auto"
                        aria-label="View register"
                      >
                        <Eye size={16} />
                        <span>View</span>
                      </button>
                      <button 
                        onClick={() => onEdit(register.id.toString())}
                        className="flex items-center justify-center gap-1 text-green-600 hover:text-green-900 font-medium text-sm px-3 py-1.5 bg-green-50 rounded border border-green-100 hover:bg-green-100 flex-1 sm:flex-auto"
                        aria-label="Edit register"
                      >
                        <Edit size={16} />
                        <span>Edit</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
      
      {/* Results summary */}
      {!loading.registers && !error && registers.length > 0 && (
        <div className="bg-white p-4 rounded-lg shadow text-sm text-gray-500">
          Showing {registers.length} {registers.length === 1 ? 'register' : 'registers'}
          {(selectedPeriod || selectedGroup || selectedDay || selectedCoach || selectedSession) && ' with applied filters'}
        </div>
      )}
    </div>
  );
};

export default RegisterList;