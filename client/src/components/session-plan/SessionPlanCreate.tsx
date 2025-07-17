// client/src/components/session-plan/SessionPlanCreate.tsx

import React, { useState, useEffect } from 'react';
import { UserRole } from './SessionPlan';
import { Users, UserMinus, UserPlus, Calendar, AlertTriangle } from 'lucide-react';

interface TeachingPeriod {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
}

interface Group {
  id: number;
  name: string;
  description: string;
}

interface GroupTime {
  id: number;
  day_of_week: string;
  start_time: string;
  end_time: string;
}

interface Player {
  id: number;
  student_id: number;
  student_name: string;
  contact_number?: string;
  emergency_contact_number?: string;
  medical_information?: string;
  walk_home?: boolean;
  contact_email?: string;
  date_of_birth?: string;
}

interface MakeupPlayer extends Player {
  original_group_name: string;
  original_day_of_week: string;
  original_start_time: string;
  original_end_time: string;
}

interface PlanEntry {
  player_id: number;
  planned_status: 'planned_absent' | 'makeup_player';
  player_type: 'regular' | 'makeup';
  notes: string;
}

interface TrialPlayer {
  name: string;
  contact_email?: string;
  contact_number?: string;
  emergency_contact_number?: string;
  date_of_birth?: string;
  medical_information?: string;
  notes: string;
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

interface SessionPlanCreateProps {
  onBack: () => void;
  onSuccess: (newPlanId: number) => void;
  selectedPeriodId: number | null;
  teachingPeriods: TeachingPeriod[];
  userRole: UserRole;
  initialData?: SessionPlanData | null;
}

const SessionPlanCreate: React.FC<SessionPlanCreateProps> = ({
  onBack,
  onSuccess,
  selectedPeriodId,
  teachingPeriods,
  initialData
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Data states
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupTimes, setGroupTimes] = useState<GroupTime[]>([]);
  const [regularPlayers, setRegularPlayers] = useState<Player[]>([]);
  const [makeupPlayers, setMakeupPlayers] = useState<MakeupPlayer[]>([]);
  const [makeupSearchQuery, setMakeupSearchQuery] = useState('');
  const [makeupSearchResults, setMakeupSearchResults] = useState<MakeupPlayer[]>([]);
  
  // Loading states
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [loadingGroupTimes, setLoadingGroupTimes] = useState(false);
  const [loadingPlayers, setLoadingPlayers] = useState(false);
  const [loadingMakeupSearch, setLoadingMakeupSearch] = useState(false);

  // Form state - Initialize with calendar data if provided
  const [formData, setFormData] = useState(() => {
    if (initialData) {
      return {
        teaching_period_id: initialData.teaching_period_id.toString(),
        group_id: initialData.group_id.toString(),
        group_time_id: initialData.group_time_id.toString(),
        date: initialData.date,
        notes: ''
      };
    }
    return {
      teaching_period_id: selectedPeriodId?.toString() || '',
      group_id: '',
      group_time_id: '',
      date: '',
      notes: ''
    };
  });

  // Exception tracking - only track the exceptions to normal attendance
  const [absentPlayers, setAbsentPlayers] = useState<Set<number>>(new Set());
  const [playerNotes, setPlayerNotes] = useState<{ [playerId: number]: string }>({});
  const [trialPlayers, setTrialPlayers] = useState<TrialPlayer[]>([]);
  const [showMakeupSearch, setShowMakeupSearch] = useState(false);

  // Pre-populate flag to track if we're working with calendar data
  const [isPrePopulated, setIsPrePopulated] = useState(!!initialData);

  // Fetch groups on component mount
  useEffect(() => {
    const fetchGroups = async () => {
      try {
        setLoadingGroups(true);
        const response = await fetch('/clubs/api/groups');
        if (!response.ok) {
          throw new Error(`Failed to fetch groups: ${response.statusText}`);
        }
        
        const groupsData = await response.json();
        setGroups(groupsData);
      } catch (err) {
        console.error('Error fetching groups:', err);
        setError('Failed to load groups');
      } finally {
        setLoadingGroups(false);
      }
    };
    
    fetchGroups();
  }, []);

  // Fetch group times when group is selected or when initialData is provided
  useEffect(() => {
    const fetchGroupTimes = async () => {
      if (!formData.group_id) {
        setGroupTimes([]);
        return;
      }
      
      try {
        setLoadingGroupTimes(true);
        const response = await fetch(`/clubs/api/groups/${formData.group_id}/times`);
        if (!response.ok) {
          throw new Error(`Failed to fetch group times: ${response.statusText}`);
        }
        
        const timesData = await response.json();
        setGroupTimes(timesData);
      } catch (err) {
        console.error('Error fetching group times:', err);
        setError('Failed to load group times');
      } finally {
        setLoadingGroupTimes(false);
      }
    };
    
    fetchGroupTimes();
  }, [formData.group_id]);

  // Fetch regular players when group time and teaching period are selected
  useEffect(() => {
    const fetchPlayers = async () => {
      if (!formData.group_time_id || !formData.teaching_period_id) {
        setRegularPlayers([]);
        setAbsentPlayers(new Set());
        setPlayerNotes({});
        return;
      }
      
      try {
        setLoadingPlayers(true);
        const response = await fetch(
          `/api/group-time-players?group_time_id=${formData.group_time_id}&teaching_period_id=${formData.teaching_period_id}`
        );
        if (!response.ok) {
          throw new Error(`Failed to fetch players: ${response.statusText}`);
        }
        
        const data = await response.json();
        setRegularPlayers(data.players || []);
        
        // Reset exception tracking when players change
        setAbsentPlayers(new Set());
        setPlayerNotes({});
        
      } catch (err) {
        console.error('Error fetching players:', err);
        setError('Failed to load players');
      } finally {
        setLoadingPlayers(false);
      }
    };
    
    fetchPlayers();
  }, [formData.group_time_id, formData.teaching_period_id]);

  // Search for makeup players
  const searchMakeupPlayers = async () => {
    if (!formData.group_time_id || !formData.teaching_period_id || !makeupSearchQuery.trim()) {
      return;
    }

    try {
      setLoadingMakeupSearch(true);
      const response = await fetch(
        `/api/players/search?teaching_period_id=${formData.teaching_period_id}&exclude_group_time_id=${formData.group_time_id}&query=${encodeURIComponent(makeupSearchQuery)}`
      );
      if (!response.ok) {
        throw new Error(`Failed to search makeup players: ${response.statusText}`);
      }
      
      const searchResults = await response.json();
      
      // Transform to include original group name, day, and time - filter out already added players
      const makeupResults: MakeupPlayer[] = searchResults
        .map((player: any) => ({
          ...player,
          original_group_name: player.group_name,
          original_day_of_week: player.day_of_week,
          original_start_time: player.start_time,
          original_end_time: player.end_time
        }))
        .filter((player: MakeupPlayer) => !makeupPlayers.some(mp => mp.id === player.id));
      
      setMakeupSearchResults(makeupResults);
    } catch (err) {
      console.error('Error searching makeup players:', err);
      setError('Failed to search makeup players');
    } finally {
      setLoadingMakeupSearch(false);
    }
  };

  // Handle group selection change
  const handleGroupChange = (groupId: string) => {
    setFormData({
      ...formData,
      group_id: groupId,
      group_time_id: ''
    });
    setRegularPlayers([]);
    setAbsentPlayers(new Set());
    setPlayerNotes({});
    setMakeupPlayers([]);
    setTrialPlayers([]);
    setIsPrePopulated(false);
  };

  // Handle group time selection change
  const handleGroupTimeChange = (groupTimeId: string) => {
    setFormData({
      ...formData,
      group_time_id: groupTimeId
    });
    setIsPrePopulated(false);
  };

  // Handle teaching period change
  const handleTeachingPeriodChange = (periodId: string) => {
    setFormData({
      ...formData,
      teaching_period_id: periodId
    });
    setIsPrePopulated(false);
  };

  // Toggle player absent status
  const togglePlayerAbsent = (playerId: number) => {
    setAbsentPlayers(prev => {
      const newSet = new Set(prev);
      if (newSet.has(playerId)) {
        newSet.delete(playerId);
      } else {
        newSet.add(playerId);
      }
      return newSet;
    });
  };

  // Update player notes
  const updatePlayerNotes = (playerId: number, notes: string) => {
    setPlayerNotes(prev => ({
      ...prev,
      [playerId]: notes
    }));
  };

  // Add makeup player with enhanced note including day and time
  const addMakeupPlayer = (player: MakeupPlayer) => {
    setMakeupPlayers(prev => [...prev, player]);
    setMakeupSearchResults(prev => prev.filter(p => p.id !== player.id));
    
    // Format the time display
    const timeDisplay = `${player.original_start_time.slice(0, 5)}-${player.original_end_time.slice(0, 5)}`;
    
    setPlayerNotes(prev => ({
      ...prev,
      [player.id]: `Makeup from ${player.original_group_name}, ${player.original_day_of_week} ${timeDisplay}`
    }));
  };

  // Remove makeup player
  const removeMakeupPlayer = (playerId: number) => {
    setMakeupPlayers(prev => prev.filter(p => p.id !== playerId));
    setPlayerNotes(prev => {
      const newNotes = { ...prev };
      delete newNotes[playerId];
      return newNotes;
    });
  };

  // Add trial player
  const addTrialPlayer = () => {
    setTrialPlayers(prev => [...prev, {
      name: '',
      contact_email: '',
      contact_number: '',
      emergency_contact_number: '',
      date_of_birth: '',
      medical_information: '',
      notes: ''
    }]);
  };

  // Update trial player
  const updateTrialPlayer = (index: number, updates: Partial<TrialPlayer>) => {
    setTrialPlayers(prev => prev.map((player, i) => 
      i === index ? { ...player, ...updates } : player
    ));
  };

  // Remove trial player
  const removeTrialPlayer = (index: number) => {
    setTrialPlayers(prev => prev.filter((_, i) => i !== index));
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      setLoading(true);
      setError(null);
      
      // Validate required fields
      if (!formData.teaching_period_id || !formData.group_time_id || !formData.date) {
        setError('Please fill in all required fields');
        return;
      }
      
      // UPDATED: Only include exceptions, not all players
      const planEntries: PlanEntry[] = [];

      // Add absent regular players (exceptions to attendance)
      absentPlayers.forEach(playerId => {
        planEntries.push({
          player_id: playerId,
          planned_status: 'planned_absent',
          player_type: 'regular',
          notes: playerNotes[playerId] || ''
        });
      });

      // Add makeup players (additions to session)
      makeupPlayers.forEach(player => {
        planEntries.push({
          player_id: player.id,
          planned_status: 'makeup_player',
          player_type: 'makeup',
          notes: playerNotes[player.id] || `Makeup from ${player.original_group_name}, ${player.original_day_of_week} ${player.original_start_time.slice(0, 5)}-${player.original_end_time.slice(0, 5)}`
        });
      });

      // Filter out trial players with empty names
      const validTrialPlayers = trialPlayers.filter(tp => tp.name.trim());
      
      // Prepare submission data
      const submissionData = {
        teaching_period_id: formData.teaching_period_id,
        group_time_id: formData.group_time_id,
        date: formData.date,
        notes: formData.notes,
        plan_entries: planEntries,
        trial_players: validTrialPlayers
      };
      
      const response = await fetch('/api/session-plans', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(submissionData),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create session plan');
      }
      
      const result = await response.json();
      onSuccess(result.plan_id);
      
    } catch (err) {
      console.error('Error creating session plan:', err);
      setError(err instanceof Error ? err.message : 'Failed to create session plan');
    } finally {
      setLoading(false);
    }
  };

  // Get selected group name for display
  const getSelectedGroupName = () => {
    if (!formData.group_id) return '';
    const group = groups.find(g => g.id.toString() === formData.group_id);
    return group ? group.name : '';
  };

  // Get selected group time display
  const getSelectedGroupTimeDisplay = () => {
    if (!formData.group_time_id) return '';
    const groupTime = groupTimes.find(gt => gt.id.toString() === formData.group_time_id);
    return groupTime ? `${groupTime.day_of_week} ${groupTime.start_time.slice(0, 5)}-${groupTime.end_time.slice(0, 5)}` : '';
  };

  // Format date for display
  const formatDateForDisplay = (dateString: string) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  };

  // Format time for display
  const formatTimeDisplay = (startTime: string, endTime: string) => {
    return `${startTime.slice(0, 5)}-${endTime.slice(0, 5)}`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center space-x-4">
        <button
          onClick={onBack}
          className="text-gray-600 hover:text-gray-800 flex items-center space-x-1"
        >
          <span>←</span>
          <span>Back to Session Plans</span>
        </button>
        <h1 className="text-2xl font-bold text-gray-900">Create Session Plan</h1>
      </div>

      {/* Pre-populated Data Alert */}
      {isPrePopulated && initialData && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center space-x-2">
            <Calendar className="w-5 h-5 text-blue-600" />
            <h3 className="text-sm font-medium text-blue-800">Session Details from Calendar</h3>
          </div>
          <div className="mt-2 text-sm text-blue-700">
            <p><strong>Group:</strong> {initialData.group_name}</p>
            <p><strong>Time:</strong> {initialData.time_display}</p>
            <p><strong>Date:</strong> {formatDateForDisplay(initialData.date)}</p>
          </div>
          <div className="mt-2">
            <button
              type="button"
              onClick={() => setIsPrePopulated(false)}
              className="text-xs text-blue-600 hover:text-blue-800 underline"
            >
              Clear and start fresh
            </button>
          </div>
        </div>
      )}

      {/* Planning Approach Info */}
      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
        <div className="flex items-center space-x-2">
          <AlertTriangle className="w-5 h-5 text-green-600" />
          <h3 className="text-sm font-medium text-green-800">Planning Approach</h3>
        </div>
        <div className="mt-2 text-sm text-green-700">
          <p>This session plan only tracks <strong>exceptions</strong> to normal attendance:</p>
          <ul className="mt-1 list-disc list-inside space-y-1">
            <li><strong>Absences:</strong> Regular group members who won't be attending</li>
            <li><strong>Makeup players:</strong> Players from other groups joining this session</li>
            <li><strong>Trial players:</strong> New players trying the session</li>
          </ul>
          <p className="mt-2 text-xs">All other regular group members are assumed to be attending as normal.</p>
        </div>
      </div>

      {/* Form */}
      <div className="bg-white shadow rounded-lg p-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-red-800">Error</h3>
                  <div className="mt-2 text-sm text-red-700">
                    <p>{error}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Basic Session Details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Teaching Period */}
            <div>
              <label htmlFor="teaching_period_id" className="block text-sm font-medium text-gray-700">
                Teaching Period *
              </label>
              <select
                id="teaching_period_id"
                value={formData.teaching_period_id}
                onChange={(e) => handleTeachingPeriodChange(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
                disabled={isPrePopulated}
              >
                <option value="">Select a teaching period</option>
                {teachingPeriods.map((period) => (
                  <option key={period.id} value={period.id}>
                    {period.name} {period.is_active && '(Active)'}
                  </option>
                ))}
              </select>
            </div>

            {/* Date */}
            <div>
              <label htmlFor="date" className="block text-sm font-medium text-gray-700">
                Date *
              </label>
              <input
                type="date"
                id="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
                disabled={isPrePopulated}
              />
            </div>

            {/* Group */}
            <div>
              <label htmlFor="group_id" className="block text-sm font-medium text-gray-700">
                Group *
              </label>
              <select
                id="group_id"
                value={formData.group_id}
                onChange={(e) => handleGroupChange(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
                disabled={loadingGroups || isPrePopulated}
              >
                <option value="">
                  {loadingGroups ? 'Loading groups...' : 'Select a group'}
                </option>
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Group Time */}
            <div>
              <label htmlFor="group_time_id" className="block text-sm font-medium text-gray-700">
                Group Time *
              </label>
              <select
                id="group_time_id"
                value={formData.group_time_id}
                onChange={(e) => handleGroupTimeChange(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
                disabled={!formData.group_id || loadingGroupTimes || isPrePopulated}
              >
                <option value="">
                  {!formData.group_id 
                    ? 'Select a group first' 
                    : loadingGroupTimes 
                    ? 'Loading times...' 
                    : 'Select a time slot'}
                </option>
                {groupTimes.map((time) => (
                  <option key={time.id} value={time.id}>
                    {time.day_of_week} {formatTimeDisplay(time.start_time, time.end_time)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label htmlFor="notes" className="block text-sm font-medium text-gray-700">
              Session Notes
            </label>
            <textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Any notes about this session..."
            />
          </div>
        </form>
      </div>

      {/* Loading Players */}
      {loadingPlayers && (
        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex items-center justify-center space-x-2">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
            <span className="text-gray-600">Loading players...</span>
          </div>
        </div>
      )}

      {/* Absences Section */}
      {regularPlayers.length > 0 && (
        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex items-center space-x-2 mb-4">
            <UserMinus className="w-5 h-5 text-red-600" />
            <h2 className="text-lg font-medium text-gray-900">Mark Absences</h2>
            <span className="text-sm text-gray-500">({absentPlayers.size} of {regularPlayers.length} players marked absent)</span>
          </div>
          
          <div className="text-sm text-gray-600 mb-4">
            Click on any regular group members who <strong>won't be attending</strong> this session. All others are assumed to be attending as normal.
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {regularPlayers.map((player) => {
              const isAbsent = absentPlayers.has(player.id);
              const playerNote = playerNotes[player.id] || '';
              
              return (
                <div
                  key={player.id}
                  className={`p-3 border rounded-lg cursor-pointer transition-all ${
                    isAbsent 
                      ? 'border-red-300 bg-red-50' 
                      : 'border-gray-300 bg-gray-50 hover:bg-gray-100'
                  }`}
                  onClick={() => togglePlayerAbsent(player.id)}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-gray-900">{player.student_name}</span>
                    <div className="flex items-center space-x-2">
                      {isAbsent ? (
                        <div className="flex items-center space-x-1 text-red-600">
                          <UserMinus className="w-4 h-4" />
                          <span className="text-xs">Won't attend</span>
                        </div>
                      ) : (
                        <div className="flex items-center space-x-1 text-gray-500">
                          <Users className="w-4 h-4" />
                          <span className="text-xs">Will attend</span>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* Notes input - only show for absent players */}
                  {isAbsent && (
                    <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="text"
                        value={playerNote}
                        onChange={(e) => updatePlayerNotes(player.id, e.target.value)}
                        placeholder="Reason for absence..."
                        className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {absentPlayers.size === 0 && (
            <div className="text-center py-4 text-gray-500">
              <p className="text-sm">No absences marked - all regular group members will be attending.</p>
            </div>
          )}
        </div>
      )}

      {/* Makeup Players Section */}
      {formData.group_time_id && (
        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-2">
              <UserPlus className="w-5 h-5 text-blue-600" />
              <h2 className="text-lg font-medium text-gray-900">Makeup Players</h2>
              <span className="text-sm text-gray-500">({makeupPlayers.length} players)</span>
            </div>
            <button
              type="button"
              onClick={() => setShowMakeupSearch(!showMakeupSearch)}
              className="text-sm bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700"
            >
              {showMakeupSearch ? 'Hide Search' : 'Add Makeup Player'}
            </button>
          </div>

          {/* Makeup Player Search */}
          {showMakeupSearch && (
            <div className="mb-6 p-4 bg-gray-50 rounded-lg">
              <h3 className="text-sm font-medium text-gray-700 mb-2">Search for Makeup Players</h3>
              <div className="text-xs text-gray-600 mb-3">
                Search for players from other groups who will be attending this session as a makeup.
              </div>
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={makeupSearchQuery}
                  onChange={(e) => setMakeupSearchQuery(e.target.value)}
                  placeholder="Search by student name..."
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  onKeyPress={(e) => e.key === 'Enter' && searchMakeupPlayers()}
                />
                <button
                  type="button"
                  onClick={searchMakeupPlayers}
                  disabled={loadingMakeupSearch}
                  className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50"
                >
                  {loadingMakeupSearch ? 'Searching...' : 'Search'}
                </button>
              </div>
              
              {makeupSearchResults.length > 0 && (
                <div className="mt-3 space-y-2">
                  {makeupSearchResults.map((player) => (
                    <div key={player.id} className="flex justify-between items-center p-2 bg-white rounded border">
                      <div>
                        <span className="font-medium">{player.student_name}</span>
                        <span className="text-sm text-gray-500 ml-2">
                          from {player.original_group_name} ({player.original_day_of_week} {formatTimeDisplay(player.original_start_time, player.original_end_time)})
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => addMakeupPlayer(player)}
                        className="text-sm bg-green-600 text-white px-2 py-1 rounded hover:bg-green-700"
                      >
                        Add
                      </button>
                    </div>
                  ))}
                </div>
              )}
              
              {makeupSearchQuery && makeupSearchResults.length === 0 && !loadingMakeupSearch && (
                <p className="text-sm text-gray-500 mt-2">No makeup players found</p>
              )}
            </div>
          )}

          {/* Added Makeup Players */}
          {makeupPlayers.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <UserPlus className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No makeup players added yet.</p>
              <p className="text-xs">Players from other groups who will attend this session.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {makeupPlayers.map((player) => (
                <div key={player.id} className="p-4 border border-blue-200 bg-blue-50 rounded-lg">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2">
                        <span className="font-medium">{player.student_name}</span>
                        <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                          from {player.original_group_name} ({player.original_day_of_week} {formatTimeDisplay(player.original_start_time, player.original_end_time)})
                        </span>
                      </div>
                      
                      <div className="mt-2">
                        <input
                          type="text"
                          value={playerNotes[player.id] || ''}
                          onChange={(e) => updatePlayerNotes(player.id, e.target.value)}
                          placeholder="Optional notes..."
                          className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                    
                    <button
                      type="button"
                      onClick={() => removeMakeupPlayer(player.id)}
                      className="ml-2 text-red-600 hover:text-red-800 text-sm"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Trial Players Section */}
      {formData.group_time_id && (
        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-2">
              <UserPlus className="w-5 h-5 text-green-600" />
              <h2 className="text-lg font-medium text-gray-900">Trial Players</h2>
              <span className="text-sm text-gray-500">({trialPlayers.filter(t => t.name.trim()).length} players)</span>
            </div>
            <button
              type="button"
              onClick={addTrialPlayer}
              className="text-sm bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700"
            >
              Add Trial Player
            </button>
          </div>

          <div className="text-sm text-gray-600 mb-4">
            New players coming to try the session for the first time.
          </div>

          {trialPlayers.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <UserPlus className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No trial players added yet.</p>
              <p className="text-xs">Add new players who are trying the session.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {trialPlayers.map((trial, index) => (
                <div key={index} className="p-4 border border-green-200 bg-green-50 rounded-lg">
                  <div className="flex justify-between items-start mb-3">
                    <h3 className="font-medium">Trial Player #{index + 1}</h3>
                    <button
                      type="button"
                      onClick={() => removeTrialPlayer(index)}
                      className="text-red-600 hover:text-red-800 text-sm"
                    >
                      Remove
                    </button>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Name *
                      </label>
                      <input
                        type="text"
                        value={trial.name}
                        onChange={(e) => updateTrialPlayer(index, { name: e.target.value })}
                        className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                        required
                      />
                    </div>
                    
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Contact Email
                      </label>
                      <input
                        type="email"
                        value={trial.contact_email}
                        onChange={(e) => updateTrialPlayer(index, { contact_email: e.target.value })}
                        className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Contact Number
                      </label>
                      <input
                        type="text"
                        value={trial.contact_number}
                        onChange={(e) => updateTrialPlayer(index, { contact_number: e.target.value })}
                        className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Date of Birth
                      </label>
                      <input
                        type="date"
                        value={trial.date_of_birth}
                        onChange={(e) => updateTrialPlayer(index, { date_of_birth: e.target.value })}
                        className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                      />
                    </div>
                    
                    <div className="md:col-span-2">
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Notes
                      </label>
                      <input
                        type="text"
                        value={trial.notes}
                        onChange={(e) => updateTrialPlayer(index, { notes: e.target.value })}
                        className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                        placeholder="Any notes about this trial player..."
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Submit Buttons */}
      <div className="flex justify-end space-x-3">
        <button
          type="button"
          onClick={onBack}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          Cancel
        </button>
        <button
          type="submit"
          onClick={handleSubmit}
          disabled={loading || !formData.group_time_id}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
        >
          {loading && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>}
          <span>{loading ? 'Creating...' : 'Create Session Plan'}</span>
        </button>
      </div>

      {/* Summary */}
      {regularPlayers.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
          <h3 className="text-sm font-medium text-blue-800 mb-2">Session Plan Summary</h3>
          <div className="text-sm text-blue-700 space-y-1">
            <p><strong>Session:</strong> {getSelectedGroupName()} - {getSelectedGroupTimeDisplay()}</p>
            <p><strong>Date:</strong> {formatDateForDisplay(formData.date)}</p>
            <p><strong>Regular members attending:</strong> {regularPlayers.length - absentPlayers.size} (assuming default attendance)</p>
            <p><strong>Marked as absent:</strong> {absentPlayers.size} regular players</p>
            <p><strong>Makeup players:</strong> {makeupPlayers.length}</p>
            <p><strong>Trial players:</strong> {trialPlayers.filter(t => t.name.trim()).length}</p>
            <p><strong>Total expected attendance:</strong> {(regularPlayers.length - absentPlayers.size) + makeupPlayers.length + trialPlayers.filter(t => t.name.trim()).length}</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default SessionPlanCreate;