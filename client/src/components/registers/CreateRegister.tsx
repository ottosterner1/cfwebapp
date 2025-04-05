// client/src/components/registers/CreateRegister.tsx

import React, { useState, useEffect } from 'react';
import { UpcomingSession } from '../../types/register';

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
  day_of_week: string;
  start_time: string;
  end_time: string;
}

interface CoachSession {
  id: number;
  group_name: string;
  day: string;
  start_time: string;
  end_time: string;
  player_count: number;
  teaching_period_id: number;
}

interface Player {
  id: number;
  student_id: number;
  student_name: string;
  attendance_status: 'present' | 'absent' | 'excused' | 'late';
  notes: string;
  predicted_attendance: boolean;
}

interface CreateRegisterProps {
  onNavigate: (path: string) => void;
  onCreateSuccess: (registerId: string) => void;
}

const CreateRegister: React.FC<CreateRegisterProps> = ({ onNavigate, onCreateSuccess }) => {
  const [teachingPeriods, setTeachingPeriods] = useState<TeachingPeriod[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);
  const [upcomingSessions, setUpcomingSessions] = useState<UpcomingSession[]>([]);
  const [todaySessions, setTodaySessions] = useState<CoachSession[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  
  const [selectedPeriodId, setSelectedPeriodId] = useState<number | ''>('');
  const [selectedGroupId, setSelectedGroupId] = useState<number | ''>('');
  const [selectedTimeSlotId, setSelectedTimeSlotId] = useState<number | ''>('');
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [showPlayers, setShowPlayers] = useState<boolean>(false);
  const [quickRegisterTab, setQuickRegisterTab] = useState<'upcoming' | 'today'>('today');
  
  const [loadingPeriods, setLoadingPeriods] = useState(true);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [loadingTimeSlots, setLoadingTimeSlots] = useState(false);
  const [loadingUpcoming, setLoadingUpcoming] = useState(false);
  const [loadingTodaySessions, setLoadingTodaySessions] = useState(false);
  const [loadingPlayers, setLoadingPlayers] = useState(false);
  const [creating, setCreating] = useState(false);
  
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Fetch teaching periods on component mount
  useEffect(() => {
    const fetchTeachingPeriods = async () => {
      try {
        setLoadingPeriods(true);
        const response = await fetch('/clubs/api/teaching-periods');
        
        if (!response.ok) {
          throw new Error(`Error fetching teaching periods: ${response.statusText}`);
        }
        
        const data = await response.json();
        setTeachingPeriods(data);
        
        // If there are periods, select the first one by default
        if (data.length > 0) {
          setSelectedPeriodId(data[0].id);
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An error occurred';
        setError(errorMessage);
        console.error('Error fetching teaching periods:', err);
      } finally {
        setLoadingPeriods(false);
      }
    };
    
    fetchTeachingPeriods();
  }, []);

  // Fetch groups when period changes
  useEffect(() => {
    const fetchGroups = async () => {
      if (!selectedPeriodId) return;
      
      try {
        setLoadingGroups(true);
        const response = await fetch('/api/groups');
        
        if (!response.ok) {
          throw new Error(`Error fetching groups: ${response.statusText}`);
        }
        
        const data = await response.json();
        setGroups(data);
        
        // Reset group and time slot selections
        setSelectedGroupId('');
        setSelectedTimeSlotId('');
        setShowPlayers(false);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An error occurred';
        setError(errorMessage);
        console.error('Error fetching groups:', err);
      } finally {
        setLoadingGroups(false);
      }
    };
    
    fetchGroups();
    
    // Also fetch today's sessions when teaching period changes
    fetchTodaySessions();
  }, [selectedPeriodId]);

  // Fetch time slots when group changes
  useEffect(() => {
    const fetchTimeSlots = async () => {
      if (!selectedGroupId) return;
      
      try {
        setLoadingTimeSlots(true);
        const response = await fetch(`/clubs/api/groups/${selectedGroupId}/times`);
        
        if (!response.ok) {
          throw new Error(`Error fetching time slots: ${response.statusText}`);
        }
        
        const data = await response.json();
        setTimeSlots(data);
        
        // Reset time slot selection
        setSelectedTimeSlotId('');
        setShowPlayers(false);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An error occurred';
        setError(errorMessage);
        console.error('Error fetching time slots:', err);
      } finally {
        setLoadingTimeSlots(false);
      }
    };
    
    fetchTimeSlots();
  }, [selectedGroupId]);

  // Fetch players when time slot and date are selected
  useEffect(() => {
    const fetchPlayers = async () => {
      if (!selectedTimeSlotId || !selectedPeriodId || !selectedDate) return;
      
      try {
        setLoadingPlayers(true);
        const response = await fetch(`/api/group-time-players?group_time_id=${selectedTimeSlotId}&teaching_period_id=${selectedPeriodId}`);
        
        if (!response.ok) {
          throw new Error(`Error fetching players: ${response.statusText}`);
        }
        
        const data = await response.json();
        setPlayers(data);
        setShowPlayers(true);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An error occurred';
        setError(errorMessage);
        console.error('Error fetching players:', err);
      } finally {
        setLoadingPlayers(false);
      }
    };
    
    if (selectedTimeSlotId && selectedPeriodId && selectedDate) {
      fetchPlayers();
    }
  }, [selectedTimeSlotId, selectedPeriodId, selectedDate]);

  // Fetch upcoming sessions for quick selection
  useEffect(() => {
    const fetchUpcomingSessions = async () => {
      try {
        setLoadingUpcoming(true);
        const response = await fetch('/api/registers/upcoming');
        
        if (!response.ok) {
          throw new Error(`Error fetching upcoming sessions: ${response.statusText}`);
        }
        
        const data = await response.json();
        setUpcomingSessions(data);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An error occurred';
        setError(errorMessage);
        console.error('Error fetching upcoming sessions:', err);
      } finally {
        setLoadingUpcoming(false);
      }
    };
    
    fetchUpcomingSessions();
  }, []);

  // Fetch today's sessions for the coach
  const fetchTodaySessions = async () => {
    if (!selectedPeriodId) return;
    
    try {
      setLoadingTodaySessions(true);
      // Get current day of week
      const today = new Date();
      const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const dayOfWeek = daysOfWeek[today.getDay()];
      
      const response = await fetch(`/api/coach-sessions?day_of_week=${dayOfWeek}&teaching_period_id=${selectedPeriodId}`);
      
      if (!response.ok) {
        throw new Error(`Error fetching today's sessions: ${response.statusText}`);
      }
      
      const data = await response.json();
      setTodaySessions(data);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An error occurred';
      setError(errorMessage);
      console.error('Error fetching today\'s sessions:', err);
    } finally {
      setLoadingTodaySessions(false);
    }
  };

  // Handle selecting an upcoming session
  const handleSelectUpcomingSession = (session: UpcomingSession) => {
    setSelectedPeriodId(session.teaching_period.id);
    setSelectedGroupId(session.group.id);
    setSelectedTimeSlotId(session.group_time.id);
    setSelectedDate(session.date);
  };

  // Handle selecting a today's session
  const handleSelectTodaySession = (session: CoachSession) => {
    setSelectedPeriodId(session.teaching_period_id);
    // We would need to find the corresponding group ID
    const groupForSession = groups.find(g => g.name === session.group_name);
    if (groupForSession) {
      setSelectedGroupId(groupForSession.id);
    }
    setSelectedTimeSlotId(session.id);
    
    // Set today's date in YYYY-MM-DD format
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    setSelectedDate(`${year}-${month}-${day}`);
  };

  // Handle updating player attendance status
  const updatePlayerAttendance = (playerId: number, status: 'present' | 'absent' | 'excused' | 'late') => {
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

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedPeriodId || !selectedTimeSlotId || !selectedDate) {
      setError('Please select all required fields');
      return;
    }
    
    try {
      setCreating(true);
      
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
      
      if (!createResponse.ok) {
        const errorData = await createResponse.json();
        
        // Special handling for conflict (register already exists)
        if (createResponse.status === 409 && errorData.register_id) {
          // If we have players with attendance data, update the existing register
          if (players.length > 0) {
            await updateRegisterEntries(errorData.register_id);
          }
          
          setSuccessMessage('Register updated successfully.');
          setTimeout(() => {
            onCreateSuccess(errorData.register_id.toString());
          }, 1500);
          return;
        }
        
        throw new Error(errorData.error || `Error creating register: ${createResponse.statusText}`);
      }
      
      const createData = await createResponse.json();
      const registerId = createData.register_id;
      
      // If we have players with attendance data, update the register entries
      if (players.length > 0) {
        await updateRegisterEntries(registerId);
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
      setCreating(false);
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

  // Format date for display
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
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

      {/* Quick Create from Today's or Upcoming Sessions */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="border-b border-gray-200">
          <nav className="flex -mb-px">
            <button
              onClick={() => setQuickRegisterTab('today')}
              className={`w-1/2 py-4 px-1 text-center border-b-2 font-medium text-sm ${
                quickRegisterTab === 'today'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Today's Sessions
            </button>
            <button
              onClick={() => setQuickRegisterTab('upcoming')}
              className={`w-1/2 py-4 px-1 text-center border-b-2 font-medium text-sm ${
                quickRegisterTab === 'upcoming'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Upcoming Sessions
            </button>
          </nav>
        </div>

        <div className="p-4">
          {quickRegisterTab === 'today' ? (
            <div>
              <h2 className="text-lg font-medium mb-4">Today's Sessions</h2>
              
              {loadingTodaySessions ? (
                <div className="flex justify-center items-center h-24">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-700"></div>
                </div>
              ) : todaySessions.length === 0 ? (
                <p className="text-gray-500">No sessions found for today.</p>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {todaySessions.map((session) => (
                    <div 
                      key={session.id} 
                      className="border rounded-lg p-4 hover:bg-gray-50 cursor-pointer"
                      onClick={() => handleSelectTodaySession(session)}
                    >
                      <div className="font-medium">{session.group_name}</div>
                      <div className="text-sm text-gray-500">
                        {session.day} {session.start_time}-{session.end_time}
                      </div>
                      <div className="mt-2 text-xs bg-blue-100 text-blue-800 rounded-full px-2 py-1 inline-block">
                        {session.player_count} players
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div>
              <h2 className="text-lg font-medium mb-4">Upcoming Sessions</h2>
              
              {loadingUpcoming ? (
                <div className="flex justify-center items-center h-24">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-700"></div>
                </div>
              ) : upcomingSessions.length === 0 ? (
                <p className="text-gray-500">No upcoming sessions found that need registers.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th scope="col" className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sm:px-6">
                          Date
                        </th>
                        <th scope="col" className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sm:px-6">
                          Group
                        </th>
                        <th scope="col" className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sm:px-6">
                          Time
                        </th>
                        <th scope="col" className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sm:px-6">
                          Action
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {upcomingSessions.slice(0, 5).map((session, index) => (
                        <tr key={index} className="hover:bg-gray-50">
                          <td className="px-2 py-2 whitespace-nowrap text-sm font-medium text-gray-900 sm:px-6 sm:py-4">
                            {formatDate(session.date)}
                          </td>
                          <td className="px-2 py-2 whitespace-nowrap text-sm text-gray-500 sm:px-6 sm:py-4">
                            {session.group.name}
                          </td>
                          <td className="px-2 py-2 whitespace-nowrap text-sm text-gray-500 sm:px-6 sm:py-4">
                            {session.group_time.day} {session.group_time.start_time}
                          </td>
                          <td className="px-2 py-2 whitespace-nowrap text-sm text-blue-600 hover:text-blue-900 sm:px-6 sm:py-4">
                            <button 
                              onClick={() => handleSelectUpcomingSession(session)}
                              className="text-blue-600 hover:text-blue-900"
                            >
                              Select
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
        
        {/* Manual Creation Form */}
        <div className="p-4 border-t">
          <h2 className="text-lg font-medium mb-4">Manual Creation</h2>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="teachingPeriod" className="block text-sm font-medium text-gray-700 mb-1">
                  Teaching Period*
                </label>
                <select
                  id="teachingPeriod"
                  value={selectedPeriodId}
                  onChange={(e) => setSelectedPeriodId(e.target.value ? Number(e.target.value) : '')}
                  className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  required
                  disabled={loadingPeriods}
                >
                  <option value="">Select Teaching Period</option>
                  {teachingPeriods.map((period) => (
                    <option key={period.id} value={period.id}>{period.name}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label htmlFor="group" className="block text-sm font-medium text-gray-700 mb-1">
                  Group*
                </label>
                <select
                  id="group"
                  value={selectedGroupId}
                  onChange={(e) => setSelectedGroupId(e.target.value ? Number(e.target.value) : '')}
                  className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  required
                  disabled={loadingGroups || !selectedPeriodId}
                >
                  <option value="">Select Group</option>
                  {groups.map((group) => (
                    <option key={group.id} value={group.id}>{group.name}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label htmlFor="timeSlot" className="block text-sm font-medium text-gray-700 mb-1">
                  Time Slot*
                </label>
                <select
                  id="timeSlot"
                  value={selectedTimeSlotId}
                  onChange={(e) => setSelectedTimeSlotId(e.target.value ? Number(e.target.value) : '')}
                  className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  required
                  disabled={loadingTimeSlots || !selectedGroupId}
                >
                  <option value="">Select Time Slot</option>
                  {timeSlots.map((slot) => (
                    <option key={slot.id} value={slot.id}>
                      {slot.day_of_week} {slot.start_time}-{slot.end_time}
                    </option>
                  ))}
                </select>
              </div>
              
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
              
              <div className="sm:col-span-2">
                <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
                  Session Notes
                </label>
                <textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  rows={2}
                  placeholder="Add notes about this session (optional)"
                />
              </div>
            </div>
            
            {/* Player Attendance Section */}
            {showPlayers && (
              <div className="mt-6">
                <h3 className="text-lg font-medium mb-4">Mark Attendance</h3>
                
                {loadingPlayers ? (
                  <div className="flex justify-center items-center h-24">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-700"></div>
                  </div>
                ) : players.length === 0 ? (
                  <p className="text-gray-500">No players found for this group and time slot.</p>
                ) : (
                  <div className="space-y-4">
                    <div className="sm:flex sm:items-center sm:justify-between">
                      <h4 className="text-sm font-medium text-gray-700">
                        {players.length} players
                      </h4>
                      <div className="mt-2 sm:mt-0 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setPlayers(prevPlayers => 
                            prevPlayers.map(p => ({ ...p, attendance_status: 'present' }))
                          )}
                          className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                        >
                          Mark All Present
                        </button>
                        <button
                          type="button"
                          onClick={() => setPlayers(prevPlayers => 
                            prevPlayers.map(p => ({ ...p, attendance_status: 'absent' }))
                          )}
                          className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs rounded-md shadow-sm text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                        >
                          Mark All Absent
                        </button>
                      </div>
                    </div>
                    
                    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                      {players.map((player) => (
                        <div 
                          key={player.id} 
                          className="border rounded-md p-3"
                        >
                          <div className="font-medium">{player.student_name}</div>
                          
                          <div className="mt-2 grid grid-cols-2 gap-1">
                            <button
                              type="button"
                              className={`border rounded-md py-1 px-1 text-xs font-medium ${
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
                              className={`border rounded-md py-1 px-1 text-xs font-medium ${
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
                              className={`border rounded-md py-1 px-1 text-xs font-medium ${
                                player.attendance_status === 'late' 
                                  ? 'bg-yellow-100 border-yellow-500 text-yellow-800' 
                                  : 'bg-gray-100 border-gray-300 text-gray-800'
                              }`}
                              onClick={() => updatePlayerAttendance(player.id, 'late')}
                            >
                              Late
                            </button>
                            <button
                              type="button"
                              className={`border rounded-md py-1 px-1 text-xs font-medium ${
                                player.attendance_status === 'excused' 
                                  ? 'bg-blue-100 border-blue-500 text-blue-800' 
                                  : 'bg-gray-100 border-gray-300 text-gray-800'
                              }`}
                              onClick={() => updatePlayerAttendance(player.id, 'excused')}
                            >
                              Excused
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
            
            <div className="flex justify-end">
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 shadow"
                disabled={creating}
              >
                {creating ? (
                  <span className="flex items-center">
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    {showPlayers ? 'Saving Attendance...' : 'Creating Register...'}
                  </span>
                ) : (showPlayers ? 'Save Attendance' : 'Create Register')}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default CreateRegister;