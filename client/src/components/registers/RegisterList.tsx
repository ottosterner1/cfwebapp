// client/src/components/registers/RegisterList.tsx

import React, { useState, useEffect, useMemo } from 'react';
import { Register } from '../../types/register';

interface TeachingPeriod {
  id: number;
  name: string;
}

interface Group {
  id: number;
  name: string;
}

interface RegisterListProps {
  onNavigate: (registerId: string) => void;
  onEdit: (registerId: string) => void; // New prop for direct editing
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // State for filter options
  const [periods, setPeriods] = useState<TeachingPeriod[]>([]);
  const [loadingPeriods, setLoadingPeriods] = useState(true);
  const [periodsError, setPeriodsError] = useState<string | null>(null);
  
  const [groups, setGroups] = useState<Group[]>([]);
  
  // State for selected filters
  const [selectedPeriod, setSelectedPeriod] = useState<number | undefined>(initialPeriodId);
  const [selectedGroup, setSelectedGroup] = useState<number | undefined>(initialGroupId);
  const [selectedDay, setSelectedDay] = useState<string>('');
  const [selectedSession, setSelectedSession] = useState<string>('');
  
  // State for filter visibility on mobile
  const [showFilters, setShowFilters] = useState(false);

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
        const response = await fetch('/clubs/api/groups');
        if (!response.ok) throw new Error('Failed to fetch groups');
        const data = await response.json();
        setGroups(data);
      } catch (err) {
        console.error('Error fetching groups:', err);
      }
    };
    
    fetchGroups();
  }, []);

  // Fetch registers when period filter changes
  useEffect(() => {
    const fetchRegisters = async () => {
      try {
        setLoading(true);
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
        setAllRegisters(data);
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
        setLoading(false);
      }
    };
    
    if (selectedPeriod) {
      fetchRegisters();
    } else {
      // If no period is selected, clear loading state to avoid eternal spinner
      setLoading(false);
    }
  }, [selectedPeriod]);

  // Apply all filters to the registers
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
    
    // Apply session filter
    if (selectedSession) {
      filteredData = filteredData.filter(register => 
        `${register.time_slot.start_time}-${register.time_slot.end_time}` === selectedSession
      );
    }
    
    setRegisters(filteredData);
  }, [allRegisters, selectedGroup, selectedDay, selectedSession, groups]);

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

  const handleSessionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedSession(e.target.value);
  };

  // Reset all filters
  const handleResetFilters = () => {
    setSelectedGroup(undefined);
    setSelectedDay('');
    setSelectedSession('');
  };

  // Toggle filter visibility on mobile
  const toggleFilters = () => {
    setShowFilters(prev => !prev);
  };

  // Handle case where we have no teaching periods
  if (!loadingPeriods && periods.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h1 className="text-2xl font-bold">Registers</h1>
          <button
            onClick={onCreateNew}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 shadow"
          >
            <span className="hidden sm:inline">Create New Register</span>
            <span className="sm:hidden">Create</span>
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
        <div className="flex flex-wrap gap-2">
          <button
            onClick={toggleFilters}
            className="md:hidden px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
          >
            {showFilters ? 'Hide Filters' : 'Show Filters'}
          </button>
          <button
            onClick={onViewStats}
            className="px-4 py-2 bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200"
          >
            <span className="hidden sm:inline">View Statistics</span>
            <span className="sm:hidden">Stats</span>
          </button>
          <button
            onClick={onCreateNew}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 shadow"
          >
            <span className="hidden sm:inline">Create New Register</span>
            <span className="sm:hidden">Create</span>
          </button>
        </div>
      </div>
      
      {/* Filters */}
      <div className={`bg-white p-4 rounded-lg shadow ${!showFilters ? 'hidden md:block' : ''}`}>
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-lg font-semibold">Filters</h2>
          <button
            onClick={handleResetFilters}
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            Reset Filters
          </button>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Term Filter */}
          <div>
            <label htmlFor="period" className="block text-sm font-medium text-gray-700 mb-1">
              Term
            </label>
            <select
              id="period"
              value={selectedPeriod || ''}
              onChange={handlePeriodChange}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
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
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            >
              <option value="">All Days</option>
              {availableDays.map(day => (
                <option key={day} value={day}>{day}</option>
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
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
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
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            >
              <option value="">All Sessions</option>
              {availableSessions.map(session => (
                <option key={session} value={session}>{session}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Result display */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading ? (
          <div className="flex justify-center items-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-700"></div>
          </div>
        ) : error ? (
          <div className="p-4 text-red-500">{error}</div>
        ) : registers.length === 0 ? (
          <div className="p-6 text-center text-gray-500">
            <p className="mb-2">No registers found matching your criteria.</p>
            {selectedPeriod || selectedGroup || selectedDay || selectedSession ? (
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
          <div>
            {/* For desktop */}
            <div className="hidden md:block overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Date
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Group
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Time
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Coach
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Attendance
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {registers.map((register) => (
                    <tr key={register.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        {formatDate(register.date)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {register.group_name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {register.time_slot.day} {register.time_slot.start_time}-{register.time_slot.end_time}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {register.coach_name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="w-16 bg-gray-200 rounded-full h-2.5 mr-2">
                            <div 
                              className={`h-2.5 rounded-full ${
                                register.stats.attendance_rate >= 80 ? 'bg-green-600' :
                                register.stats.attendance_rate >= 60 ? 'bg-yellow-500' :
                                'bg-red-600'
                              }`}
                              style={{ width: `${register.stats.attendance_rate}%` }}
                            ></div>
                          </div>
                          <span className="text-sm text-gray-700">
                            {register.stats.attendance_rate}%
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex space-x-3">
                          <button 
                            onClick={() => onNavigate(register.id.toString())}
                            className="text-blue-600 hover:text-blue-900 font-medium"
                          >
                            View
                          </button>
                          <button 
                            onClick={() => onEdit(register.id.toString())}
                            className="text-green-600 hover:text-green-900 font-medium"
                          >
                            Edit
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            {/* For mobile */}
            <div className="md:hidden">
              <div className="p-3 bg-gray-50 border-b border-gray-200 text-xs font-medium text-gray-500 uppercase">
                {registers.length} Registers Found
              </div>
              {registers.map((register) => (
                <div key={register.id} className="p-4 border-b border-gray-200 hover:bg-gray-50">
                  <div className="flex justify-between">
                    <div className="font-medium text-gray-900">{formatDate(register.date)}</div>
                    <div className="flex space-x-2">
                      <button 
                        onClick={() => onNavigate(register.id.toString())}
                        className="text-blue-600 hover:text-blue-900 font-medium text-sm px-2 py-1 bg-blue-50 rounded"
                      >
                        View
                      </button>
                      <button 
                        onClick={() => onEdit(register.id.toString())}
                        className="text-green-600 hover:text-green-900 font-medium text-sm px-2 py-1 bg-green-50 rounded"
                      >
                        Edit
                      </button>
                    </div>
                  </div>
                  <div className="mt-2 text-sm text-gray-700">{register.group_name}</div>
                  <div className="mt-1 text-sm text-gray-500">
                    {register.time_slot.day} {register.time_slot.start_time}-{register.time_slot.end_time}
                  </div>
                  <div className="mt-1 text-sm text-gray-500">Coach: {register.coach_name}</div>
                  <div className="mt-2 flex items-center">
                    <span className="text-xs text-gray-500 mr-2">Attendance:</span>
                    <div className="flex-grow bg-gray-200 rounded-full h-2">
                      <div 
                        className={`h-2 rounded-full ${
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
              ))}
            </div>
          </div>
        )}
      </div>
      
      {/* Results summary */}
      {!loading && !error && registers.length > 0 && (
        <div className="bg-white p-4 rounded-lg shadow text-sm text-gray-500">
          Showing {registers.length} {registers.length === 1 ? 'register' : 'registers'}
          {(selectedPeriod || selectedGroup || selectedDay || selectedSession) && ' with applied filters'}
        </div>
      )}
    </div>
  );
};

export default RegisterList;