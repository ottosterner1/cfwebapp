import React, { useState, useEffect } from 'react';

interface TeachingPeriod {
  id: number;
  name: string;
}

interface Group {
  id: number;
  name: string;
}

interface TimeSlot {
  id: number;
  day: string;
  start_time: string;
  end_time: string;
}

interface Player {
  id: number;
  student_id: number;
  student_name: string;
  contact_number: string | null;
  contact_email: string | null;
  emergency_contact_number: string | null;
  medical_information: string | null;
  walk_home: boolean | null;
  attendance_status: 'present' | 'absent' | 'sick' | 'away_with_notice';
  notes: string;
  predicted_attendance: boolean;
  date_of_birth: string | null;
}

interface CreateRegisterProps {
  onNavigate: (path: string) => void;
  onCreateSuccess: (registerId: string) => void;
}

// API response types
interface SessionResponse {
  id: number;
  day: string;
  group_id?: number;
  group_name: string;
  start_time: string;
  end_time: string;
  player_count?: number;
  coach_player_count?: number; // Number of players assigned to the current coach
  [key: string]: any;
}

const CreateRegister: React.FC<CreateRegisterProps> = ({ onNavigate, onCreateSuccess }) => {
  // Core filter state
  const [teachingPeriods, setTeachingPeriods] = useState<TeachingPeriod[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState<number | ''>('');
  const [availableDays, setAvailableDays] = useState<string[]>([]);
  const [selectedDay, setSelectedDay] = useState<string>('');
  const [availableGroups, setAvailableGroups] = useState<Group[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<number | ''>('');
  const [availableTimeSlots, setAvailableTimeSlots] = useState<TimeSlot[]>([]);
  const [selectedTimeSlotId, setSelectedTimeSlotId] = useState<number | ''>('');
  const [selectedDate, setSelectedDate] = useState<string>('');
  
  // New state for showing all sessions
  const [showAllSessions, setShowAllSessions] = useState<boolean>(false);
  
  // Session data
  const [players, setPlayers] = useState<Player[]>([]);
  const [notes, setNotes] = useState<string>('');
  
  // UI state
  const [loading, setLoading] = useState<{[key: string]: boolean}>({
    periods: true,
    days: false,
    groups: false,
    timeSlots: false,
    players: false,
    creating: false
  });
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [expandedPlayerInfo, setExpandedPlayerInfo] = useState<{[key: number]: boolean}>({});

  // Define days of week in Monday-Sunday order for consistency across the component
  const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  
  // Fetch teaching periods on component mount
  useEffect(() => {
    const fetchTeachingPeriods = async () => {
      try {
        setLoading(prev => ({ ...prev, periods: true }));
        const response = await fetch('/clubs/api/teaching-periods');
        
        if (!response.ok) {
          throw new Error(`Error fetching teaching periods: ${response.statusText}`);
        }
        
        const data = await response.json();
        // Validate data is an array of teaching periods
        if (Array.isArray(data) && data.every(item => 
          typeof item === 'object' && 
          item !== null &&
          'id' in item && 
          'name' in item
        )) {
          setTeachingPeriods(data as TeachingPeriod[]);
          
          // If there are periods, select the first one by default
          if (data.length > 0 && typeof data[0].id === 'number') {
            setSelectedPeriodId(data[0].id);
          }
        } else {
          throw new Error('Invalid teaching period data received');
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An error occurred';
        setError(errorMessage);
        console.error('Error fetching teaching periods:', err);
      } finally {
        setLoading(prev => ({ ...prev, periods: false }));
      }
    };
    
    fetchTeachingPeriods();
  }, []);

  // Fetch available days when teaching period changes
  useEffect(() => {
    const fetchAvailableDays = async () => {
      if (!selectedPeriodId) return;
      
      try {
        setLoading(prev => ({ ...prev, days: true }));
        setError(null);
        
        // Get current day of week
        const today = new Date();
        const currentDayIndex = today.getDay();
        // Convert JavaScript day index (0=Sunday) to our array (0=Monday)
        const adjustedCurrentDayIndex = currentDayIndex === 0 ? 6 : currentDayIndex - 1;
        const currentDay = daysOfWeek[adjustedCurrentDayIndex];
        
        // Since the API requires day_of_week, we need to make multiple requests for each day
        const allDays = new Set<string>();
        const fetchPromises = daysOfWeek.map(day => 
          fetch(`/api/coach-sessions?day_of_week=${day}&teaching_period_id=${selectedPeriodId}&show_all=${showAllSessions}`)
            .then(response => {
              if (!response.ok) {
                // Skip days that don't have sessions
                return [];
              }
              return response.json();
            })
            .then(data => {
              if (Array.isArray(data) && data.length > 0) {
                // This day has sessions
                allDays.add(day);
              }
              return data;
            })
            .catch(() => {
              // Handle errors gracefully
              return [];
            })
        );
        
        // Wait for all requests to complete
        await Promise.all(fetchPromises);
        
        // Convert set to array and sort by day of week (Monday-Sunday)
        const availableDaysList = Array.from(allDays).sort((a, b) => 
          daysOfWeek.indexOf(a) - daysOfWeek.indexOf(b)
        );
        
        setAvailableDays(availableDaysList);
        
        // Default to current day if available, otherwise first day
        if (availableDaysList.includes(currentDay)) {
          setSelectedDay(currentDay);
        } else if (availableDaysList.length > 0) {
          setSelectedDay(availableDaysList[0]);
        } else {
          setSelectedDay('');
        }
        
        // Reset child selections
        setSelectedGroupId('');
        setSelectedTimeSlotId('');
        setSelectedDate('');
        setPlayers([]);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An error occurred';
        setError(errorMessage);
        console.error('Error fetching available days:', err);
      } finally {
        setLoading(prev => ({ ...prev, days: false }));
      }
    };
    
    fetchAvailableDays();
  }, [selectedPeriodId, showAllSessions]);

  // Fetch available groups when day changes
  useEffect(() => {
    const fetchAvailableGroups = async () => {
      if (!selectedPeriodId || !selectedDay) return;
      
      try {
        setLoading(prev => ({ ...prev, groups: true }));
        setError(null);
        
        // Fetch sessions for the selected day and period
        const response = await fetch(`/api/coach-sessions?day_of_week=${selectedDay}&teaching_period_id=${selectedPeriodId}&show_all=${showAllSessions}`);
        
        if (!response.ok) {
          throw new Error('Error fetching available groups');
        }
        
        const data = await response.json();
        
        // Type guard to ensure we have an array of sessions
        const sessions: SessionResponse[] = Array.isArray(data) ? data as SessionResponse[] : [];
        
        // Extract unique groups with names
        const uniqueGroups: Record<string, Group> = {};
        sessions.forEach(session => {
          if (typeof session.group_name === 'string' && !uniqueGroups[session.group_name]) {
            const groupId = typeof session.group_id === 'number' ? session.group_id : 0;
            uniqueGroups[session.group_name] = {
              id: groupId,
              name: session.group_name
            };
          }
        });
        
        const groups = Object.values(uniqueGroups);
        setAvailableGroups(groups);
        
        // Don't select any group by default, coach must select manually
        setSelectedGroupId('');
        
        // Reset child selections
        setSelectedTimeSlotId('');
        setSelectedDate('');
        setPlayers([]);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An error occurred';
        setError(errorMessage);
        console.error('Error fetching available groups:', err);
      } finally {
        setLoading(prev => ({ ...prev, groups: false }));
      }
    };
    
    fetchAvailableGroups();
  }, [selectedPeriodId, selectedDay, showAllSessions]);

  // Fetch available time slots when group changes
  useEffect(() => {
    const fetchAvailableTimeSlots = async () => {
      if (!selectedPeriodId || !selectedDay || !selectedGroupId) return;
      
      try {
        setLoading(prev => ({ ...prev, timeSlots: true }));
        setError(null);
        
        // Fetch sessions for the selected day, group, and period
        const response = await fetch(`/api/coach-sessions?day_of_week=${selectedDay}&teaching_period_id=${selectedPeriodId}&show_all=${showAllSessions}`);
        
        if (!response.ok) {
          throw new Error('Error fetching available time slots');
        }
        
        const data = await response.json();
        
        // Type guard to ensure we have an array of sessions
        const sessions: SessionResponse[] = Array.isArray(data) ? data as SessionResponse[] : [];
        
        // Filter sessions for the selected group and create time slots
        const timeSlots: TimeSlot[] = [];
        
        for (const session of sessions) {
          // Determine if this session belongs to the selected group
          const sessionGroupId = typeof session.group_id === 'number' ? session.group_id : 0;
          const groupIdMatch = sessionGroupId === selectedGroupId;
          const groupNameMatch = typeof session.group_name === 'string' && 
                                session.group_name.includes(`ID: ${selectedGroupId}`);
          
          if ((groupIdMatch || groupNameMatch) && 
              typeof session.id === 'number' && 
              typeof session.day === 'string' && 
              typeof session.start_time === 'string' && 
              typeof session.end_time === 'string') {
            timeSlots.push({
              id: session.id,
              day: session.day,
              start_time: session.start_time,
              end_time: session.end_time
            });
          }
        }
        
        setAvailableTimeSlots(timeSlots);
        
        // Only auto-select time slot if there's exactly ONE option available
        if (timeSlots.length === 1) {
          setSelectedTimeSlotId(timeSlots[0].id);
        } else {
          setSelectedTimeSlotId('');
        }
        
        // Set default date to today or next occurrence of the selected day
        const today = new Date();
        const currentDayIndex = today.getDay();
        // Adjust for Monday-Sunday ordering (Sunday is 0 in JS but 6 in our array)
        const adjustedCurrentDayIndex = currentDayIndex === 0 ? 6 : currentDayIndex - 1;
        const selectedDayIndex = daysOfWeek.indexOf(selectedDay);
        
        let daysToAdd = (selectedDayIndex - adjustedCurrentDayIndex + 7) % 7;
        if (daysToAdd === 0 && today.getHours() >= 19) { 
          // If it's the same day but after 7 PM, use next week
          daysToAdd = 7;
        }
        
        const dateToUse = new Date(today);
        dateToUse.setDate(today.getDate() + daysToAdd);
        setSelectedDate(dateToUse.toISOString().split('T')[0]);
        
        // Reset players
        setPlayers([]);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An error occurred';
        setError(errorMessage);
        console.error('Error fetching available time slots:', err);
      } finally {
        setLoading(prev => ({ ...prev, timeSlots: false }));
      }
    };
    
    fetchAvailableTimeSlots();
  }, [selectedPeriodId, selectedDay, selectedGroupId, showAllSessions]);

  // Fetch players when all required criteria are set
  useEffect(() => {
    // Clear players array if any required selections are missing
    if (!selectedTimeSlotId || !selectedPeriodId || !selectedGroupId || !selectedDay) {
      setPlayers([]);
      return;
    }
    
    const fetchPlayers = async () => {
      try {
        setLoading(prev => ({ ...prev, players: true }));
        const response = await fetch(`/api/group-time-players?group_time_id=${selectedTimeSlotId}&teaching_period_id=${selectedPeriodId}`);
        
        if (!response.ok) {
          throw new Error(`Error fetching players: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        // Validate data is an array of players
        if (Array.isArray(data)) {
          const validatedPlayers = data.filter(player => 
            typeof player === 'object' && 
            player !== null &&
            'id' in player &&
            'student_name' in player
          ) as Player[];
          
          setPlayers(validatedPlayers);
          
          // Initialize expanded state for all players as false
          const expandedState: {[key: number]: boolean} = {};
          validatedPlayers.forEach(player => {
            expandedState[player.id] = false;
          });
          setExpandedPlayerInfo(expandedState);
        } else {
          throw new Error('Invalid player data received');
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An error occurred';
        setError(errorMessage);
        console.error('Error fetching players:', err);
      } finally {
        setLoading(prev => ({ ...prev, players: false }));
      }
    };
    
    fetchPlayers();
  }, [selectedTimeSlotId, selectedPeriodId, selectedGroupId, selectedDay]);

  // Handle toggling show all sessions
  const handleToggleShowAllSessions = () => {
    setShowAllSessions(prev => !prev);
    // Reset selections since the available options will change
    setSelectedDay('');
    setSelectedGroupId('');
    setSelectedTimeSlotId('');
  };

  // Handle updating player attendance status
  const updatePlayerAttendance = (playerId: number, status: 'present' | 'absent' | 'sick' | 'away_with_notice') => {
    setPlayers(prevPlayers => 
      prevPlayers.map(player => 
        player.id === playerId 
          ? { ...player, attendance_status: status } 
          : player
      )
    );
  };

  // Handle updating player notes
  const updatePlayerNotes = (playerId: number, notes: string) => {
    setPlayers(prevPlayers => 
      prevPlayers.map(player => 
        player.id === playerId 
          ? { ...player, notes } 
          : player
      )
    );
  };

  // Toggle player info expansion
  const togglePlayerInfo = (playerId: number) => {
    setExpandedPlayerInfo(prev => ({
      ...prev,
      [playerId]: !prev[playerId]
    }));
  };

  // Quick actions for attendance
  const handleMarkAllPresent = () => {
    setPlayers(prevPlayers => 
      prevPlayers.map(player => ({ ...player, attendance_status: 'present' }))
    );
  };

  const handleMarkAllAbsent = () => {
    setPlayers(prevPlayers => 
      prevPlayers.map(player => ({ ...player, attendance_status: 'absent' }))
    );
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedPeriodId || !selectedTimeSlotId || !selectedDate) {
      setError('Please select all required fields');
      return;
    }
    
    try {
      setLoading(prev => ({ ...prev, creating: true }));
      setError(null);
      
      // First create the register
      const createResponse = await fetch('/api/registers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          teaching_period_id: selectedPeriodId,
          group_time_id: selectedTimeSlotId,
          date: selectedDate,
          notes: notes
        }),
      });
      
      const data = await createResponse.json();
      
      // Special handling for conflict (register already exists)
      if (createResponse.status === 409 && data.register_id) {
        // Instead of trying to update the existing register (which might fail with permission denied),
        // ask the user if they want to view the existing register
        
        setLoading(prev => ({ ...prev, creating: false }));
        
        const groupInfo = availableGroups.find(g => g.id === selectedGroupId)?.name || 'this group';
        const message = `A register already exists for ${groupInfo} on ${new Date(selectedDate).toLocaleDateString()}`;
        
        // Offer to view the existing register
        if (window.confirm(`${message}. Would you like to view the existing register?`)) {
          onNavigate(`/registers/${data.register_id}`);
        }
        
        return;
      }
      
      if (!createResponse.ok) {
        throw new Error(data.error || `Error creating register: ${createResponse.statusText}`);
      }
      
      const registerId = data.register_id;
      
      // If we have players with attendance data, update the register entries
      if (players.length > 0) {
        try {
          await updateRegisterEntries(registerId);
        } catch (error) {
          // If updating entries fails, still allow viewing the register
          console.error('Error updating register entries:', error);
          
          setSuccessMessage('Register created, but there was an error updating attendance data.');
          setTimeout(() => {
            onCreateSuccess(registerId.toString());
          }, 1500);
          
          return;
        }
      }
      
      setSuccessMessage('Register created and attendance recorded successfully');
      
      // Call success callback after a brief delay
      setTimeout(() => {
        onCreateSuccess(registerId.toString());
      }, 1500);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An error occurred';
      setError(errorMessage);
      console.error('Error creating register:', err);
    } finally {
      setLoading(prev => ({ ...prev, creating: false }));
    }
  };

  // Update register entries with attendance data
  const updateRegisterEntries = async (registerId: number) => {
    // Map players to register entries
    const entries = players.map(player => ({
      player_id: player.id,
      attendance_status: player.attendance_status,
      notes: player.notes,
      predicted_attendance: player.predicted_attendance
    }));
    
    const response = await fetch(`/api/registers/${registerId}/entries`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ entries }),
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to update attendance');
    }
    
    return response.json();
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center flex-wrap">
        <h1 className="text-2xl font-bold">Create New Register</h1>
        <button
          onClick={() => onNavigate('/registers')}
          className="px-4 py-2 mt-2 sm:mt-0 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
        >
          Back to Registers
        </button>
      </div>

      {error && (
        <div className="bg-red-50 p-4 rounded-md text-red-700">
          {error}
        </div>
      )}

      {successMessage && (
        <div className="bg-green-50 p-4 rounded-md text-green-700">
          {successMessage}
        </div>
      )}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <form onSubmit={handleSubmit} className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-medium">Select Session</h2>
            
            {/* Show All Sessions Toggle */}
            <div className="flex items-center">
              <label htmlFor="showAllSessions" className="mr-2 text-sm text-gray-700">
                {showAllSessions ? 'Showing all sessions' : 'Showing my sessions'}
              </label>
              <button
                type="button"
                id="showAllSessions"
                onClick={handleToggleShowAllSessions}
                className={`relative inline-flex h-6 w-11 items-center rounded-full ${
                  showAllSessions ? 'bg-blue-600' : 'bg-gray-300'
                } transition-colors duration-300 focus:outline-none`}
              >
                <span 
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-300 ${
                    showAllSessions ? 'translate-x-6' : 'translate-x-1'
                  }`} 
                />
              </button>
            </div>
          </div>
          
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
            {/* Teaching Period Selector */}
            <div>
              <label htmlFor="teachingPeriod" className="block text-sm font-medium text-gray-700 mb-1">
                Term*
              </label>
              <select
                id="teachingPeriod"
                value={selectedPeriodId}
                onChange={(e) => setSelectedPeriodId(e.target.value ? Number(e.target.value) : '')}
                className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                required
                disabled={loading.periods}
              >
                <option value="">Select Term</option>
                {teachingPeriods.map((period) => (
                  <option key={period.id} value={period.id}>{period.name}</option>
                ))}
              </select>
              {loading.periods && (
                <div className="mt-1 text-xs text-gray-500">Loading terms...</div>
              )}
            </div>
            
            {/* Day Selector */}
            <div>
              <label htmlFor="daySelect" className="block text-sm font-medium text-gray-700 mb-1">
                Day*
              </label>
              <select
                id="daySelect"
                value={selectedDay}
                onChange={(e) => setSelectedDay(e.target.value)}
                className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                required
                disabled={loading.days || availableDays.length === 0}
              >
                <option value="">Select Day</option>
                {availableDays.map((day) => (
                  <option key={day} value={day}>{day}</option>
                ))}
              </select>
              {loading.days && (
                <div className="mt-1 text-xs text-gray-500">Loading days...</div>
              )}
            </div>
            
            {/* Group Selector */}
            <div>
              <label htmlFor="groupSelect" className="block text-sm font-medium text-gray-700 mb-1">
                Group*
              </label>
              <select
                id="groupSelect"
                value={selectedGroupId}
                onChange={(e) => setSelectedGroupId(e.target.value ? Number(e.target.value) : '')}
                className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                required
                disabled={loading.groups || availableGroups.length === 0}
              >
                <option value="">Select Group</option>
                {availableGroups.map((group) => (
                  <option key={group.id} value={group.id}>{group.name}</option>
                ))}
              </select>
              {loading.groups && (
                <div className="mt-1 text-xs text-gray-500">Loading groups...</div>
              )}
            </div>
            
            {/* Time Slot Selector */}
            <div>
              <label htmlFor="timeSlotSelect" className="block text-sm font-medium text-gray-700 mb-1">
                Session Time*
              </label>
              <select
                id="timeSlotSelect"
                value={selectedTimeSlotId}
                onChange={(e) => setSelectedTimeSlotId(e.target.value ? Number(e.target.value) : '')}
                className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                required
                disabled={loading.timeSlots || availableTimeSlots.length === 0}
              >
                <option value="">Select Time</option>
                {availableTimeSlots.map((timeSlot) => (
                  <option key={timeSlot.id} value={timeSlot.id}>
                    {timeSlot.start_time} - {timeSlot.end_time}
                  </option>
                ))}
              </select>
              {loading.timeSlots && (
                <div className="mt-1 text-xs text-gray-500">Loading times...</div>
              )}
            </div>
          </div>
          
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 mb-6">
            {/* Date Selector */}
            <div>
              <label htmlFor="date" className="block text-sm font-medium text-gray-700 mb-1">
                Date*
              </label>
              <input
                type="date"
                id="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                required
              />
            </div>
            
            {/* Session Notes */}
            <div>
              <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
                Session Notes
              </label>
              <textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                rows={1}
                placeholder="Add notes about this session (optional)"
              />
            </div>
          </div>
          
          {/* Player Attendance Section */}
          {players.length > 0 && (
            <div className="mt-8">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium">Mark Attendance</h3>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleMarkAllPresent}
                    className="px-3 py-1.5 text-xs rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700"
                  >
                    All Present
                  </button>
                  <button
                    type="button"
                    onClick={handleMarkAllAbsent}
                    className="px-3 py-1.5 text-xs rounded-md shadow-sm text-white bg-red-600 hover:bg-red-700"
                  >
                    All Absent
                  </button>
                </div>
              </div>
              
              {loading.players ? (
                <div className="flex justify-center items-center h-24">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-700"></div>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-sm text-gray-700">{players.length} players</p>
                  
                  <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                    {players.map((player) => (
                      <div 
                        key={player.id} 
                        className="border rounded-md p-3"
                      >
                        <div className="flex justify-between items-start">
                          <div className="font-medium">{player.student_name}</div>
                          <button 
                            type="button"
                            onClick={() => togglePlayerInfo(player.id)}
                            className="text-xs text-blue-600 hover:text-blue-800"
                          >
                            {expandedPlayerInfo[player.id] ? 'Hide Info' : 'Show Info'}
                          </button>
                        </div>
                        
                        {/* Contact Information - Updated with clickable phone numbers and email */}
                        {expandedPlayerInfo[player.id] && (
                          <div className="mt-2 p-2 bg-gray-50 rounded-md text-xs">
                            <div className="grid grid-cols-1 gap-y-1">
                              {player.date_of_birth && (
                                <div>
                                  <span className="font-semibold">DOB:</span>{" "}
                                  {new Date(player.date_of_birth).toLocaleDateString()}
                                </div>
                              )}
                              {player.contact_number && (
                                <div>
                                  <span className="font-semibold">Contact:</span>{" "}
                                  <a href={`tel:${player.contact_number}`} className="text-blue-600 hover:underline">
                                    {player.contact_number}
                                  </a>
                                </div>
                              )}
                              {player.emergency_contact_number && (
                                <div>
                                  <span className="font-semibold">Emergency:</span>{" "}
                                  <a href={`tel:${player.emergency_contact_number}`} className="text-blue-600 hover:underline">
                                    {player.emergency_contact_number}
                                  </a>
                                </div>
                              )}
                              {player.contact_email && (
                                <div>
                                  <span className="font-semibold">Email:</span>{" "}
                                  <a href={`mailto:${player.contact_email}`} className="text-blue-600 hover:underline">
                                    {player.contact_email}
                                  </a>
                                </div>
                              )}
                              {player.medical_information && (
                                <div>
                                  <span className="font-semibold">Medical:</span> {player.medical_information}
                                </div>
                              )}
                              {player.walk_home !== null && (
                                <div>
                                  <span className="font-semibold">Walk home:</span> {player.walk_home ? 'Yes' : 'No'}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                        
                        <div className="mt-2 grid grid-cols-2 gap-1">
                          <button
                            type="button"
                            className={`border rounded-md py-1.5 px-1 text-xs font-medium ${
                              player.attendance_status === 'present' 
                                ? 'bg-green-100 border-green-500 text-green-800' 
                                : 'bg-gray-100 border-gray-300 text-gray-800'
                            }`}
                            onClick={() => updatePlayerAttendance(player.id, 'present')}
                          >
                            Present
                          </button>
                          <button
                            type="button"
                            className={`border rounded-md py-1.5 px-1 text-xs font-medium ${
                              player.attendance_status === 'absent' 
                                ? 'bg-red-100 border-red-500 text-red-800' 
                                : 'bg-gray-100 border-gray-300 text-gray-800'
                            }`}
                            onClick={() => updatePlayerAttendance(player.id, 'absent')}
                          >
                            Absent
                          </button>
                          <button
                            type="button"
                            className={`border rounded-md py-1.5 px-1 text-xs font-medium ${
                              player.attendance_status === 'away_with_notice' 
                                ? 'bg-yellow-100 border-yellow-500 text-yellow-800' 
                                : 'bg-gray-100 border-gray-300 text-gray-800'
                            }`}
                            onClick={() => updatePlayerAttendance(player.id, 'away_with_notice')}
                          >
                            Away With Notice
                          </button>
                          <button
                            type="button"
                            className={`border rounded-md py-1.5 px-1 text-xs font-medium ${
                              player.attendance_status === 'sick' 
                                ? 'bg-blue-100 border-blue-500 text-blue-800' 
                                : 'bg-gray-100 border-gray-300 text-gray-800'
                            }`}
                            onClick={() => updatePlayerAttendance(player.id, 'sick')}
                          >
                            Sick
                          </button>
                        </div>
                        
                        <div className="mt-2">
                          <input
                            type="text"
                            value={player.notes || ''}
                            onChange={(e) => updatePlayerNotes(player.id, e.target.value)}
                            className="w-full text-sm border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                            placeholder="Notes"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          
          <div className="flex justify-end mt-6">
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 shadow"
              disabled={loading.creating}
            >
              {loading.creating ? (
                <span className="flex items-center">
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  {players.length > 0 ? 'Save Attendance' : 'Create Register'}
                </span>
              ) : (players.length > 0 ? 'Save Attendance' : 'Create Register')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateRegister;