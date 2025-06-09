import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Card, CardContent } from '../../components/ui/card';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { Download, PlusCircle, Pencil, Trash2, Search, FileDown, Users, Mail, Phone, AlertTriangle, FileText, Home } from 'lucide-react';
import BulkUploadSection from './BulkUploadSection';
import ProgrammeAnalytics from './ProgrammeAnalytics';

interface TeachingPeriod {
  id: number;
  name: string;
}

interface Player {
  id: number;
  student_name: string;
  group_name: string;
  group_id: number;
  group_time_id: number;
  time_slot?: {
    day_of_week: string;
    start_time: string;
    end_time: string; 
    capacity?: number;
  };
  report_submitted: boolean;
  report_id: number | null;
  can_edit: boolean;
  contact_email?: string;
  contact_number?: string;
  emergency_contact_number?: string;
  medical_information?: string;
  notes?: string;
  walk_home?: boolean | null;
}

// PeriodFilter Component
const PeriodFilter: React.FC<{
  periods: TeachingPeriod[];
  selectedPeriod: number | null;
  onPeriodChange: (periodId: number) => void;
}> = ({ periods, selectedPeriod, onPeriodChange }) => (
  <div className="mb-8 mt-4">
    <div className="flex items-center space-x-3">
      <label htmlFor="period" className="block text-sm font-medium text-gray-700">
        Teaching Period:
      </label>
      <select
        id="period"
        value={selectedPeriod || ''}
        onChange={(e) => onPeriodChange(Number(e.target.value))}
        className="rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 min-w-[200px]"
      >
        {periods.map((period) => (
          <option key={period.id} value={period.id}>
            {period.name}
          </option>
        ))}
      </select>
    </div>
  </div>
);

// Helper function to get day order value
const getDayOrder = (day: string): number => {
  const normalizedDay = day.trim().toLowerCase();
  const DAY_ORDER: Record<string, number> = {
    'monday': 1,
    'tuesday': 2,
    'wednesday': 3,
    'thursday': 4,
    'friday': 5,
    'saturday': 6,
    'sunday': 7
  };
  return DAY_ORDER[normalizedDay] || 999;
};

// Helper function to convert time string to numerical minutes for sorting
const getTimeValue = (timeStr: string): number => {
  const [time] = timeStr.split('-');
  const [hoursStr, minutesStr] = time.trim().split(':');
  
  let hours = parseInt(hoursStr, 10);
  const minutes = parseInt(minutesStr, 10) || 0;
  
  // Handle 12-hour format if needed
  if (hours > 0 && hours < 9) {
    hours += 12;
  }
  
  return hours * 60 + minutes;
};

// Player Info Bar Component - Compact Version
const PlayerInfoBar: React.FC<{ player: Player }> = ({ player }) => {
  const hasInfo = player.contact_email || player.contact_number || player.emergency_contact_number || 
                 player.medical_information || player.notes || player.walk_home !== null;

  if (!hasInfo) {
    return null;
  }

  const infoItems = [];

  // Contact Email
  if (player.contact_email) {
    infoItems.push(
      <span key="email" className="flex items-center text-gray-600">
        <Mail className="h-3 w-3 mr-1" />
        {player.contact_email}
      </span>
    );
  }

  // Contact Number
  if (player.contact_number) {
    infoItems.push(
      <span key="phone" className="flex items-center text-gray-600">
        <Phone className="h-3 w-3 mr-1" />
        {player.contact_number}
      </span>
    );
  }

  // Emergency Contact
  if (player.emergency_contact_number) {
    infoItems.push(
      <span key="emergency" className="flex items-center text-gray-600">
        <AlertTriangle className="h-3 w-3 mr-1 text-orange-500" />
        Emergency: {player.emergency_contact_number}
      </span>
    );
  }

  // Walk Home Status
  if (player.walk_home !== null) {
    infoItems.push(
      <span key="walk-home" className="flex items-center">
        <Home className="h-3 w-3 mr-1" />
        <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
          player.walk_home 
            ? 'bg-green-100 text-green-700' 
            : 'bg-red-100 text-red-700'
        }`}>
          {player.walk_home ? 'Can walk home' : 'No walk home'}
        </span>
      </span>
    );
  }

  // Medical Information
  if (player.medical_information) {
    infoItems.push(
      <span key="medical" className="flex items-center text-red-600 font-medium">
        <AlertTriangle className="h-3 w-3 mr-1" />
        Medical: {player.medical_information}
      </span>
    );
  }

  // Notes
  if (player.notes) {
    infoItems.push(
      <span key="notes" className="flex items-center text-gray-600">
        <FileText className="h-3 w-3 mr-1" />
        {player.notes}
      </span>
    );
  }

  return (
    <div className="mt-2 px-2 py-1 bg-gray-50 rounded text-xs">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {infoItems.map((item, index) => (
          <React.Fragment key={index}>
            {item}
            {index < infoItems.length - 1 && (
              <span className="text-gray-300">•</span>
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};

const PlayersList: React.FC<{
  players: Player[];
  filteredPlayers: Player[];
  loading: boolean;
  clubId: number;
  onDeletePlayer: (playerId: number) => Promise<void>;
  searchQuery: string;
  selectedGroup: string | null;
  selectedDay: string | null;
}> = ({ 
  players, 
  filteredPlayers, 
  loading, 
  clubId, 
  onDeletePlayer, 
  searchQuery, 
  selectedGroup, 
  selectedDay 
}) => {
  const [deleteInProgress, setDeleteInProgress] = useState<Record<number, boolean>>({});
  
  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-500 mx-auto"></div>
        <p className="mt-2 text-gray-600">Loading players...</p>
      </div>
    );
  }

  if (!filteredPlayers.length) {
    return (
      <div className="text-center py-8 bg-gray-50 rounded-lg">
        {players.length > 0 
          ? `No players match your search criteria${searchQuery ? ` for "${searchQuery}"` : ''}${selectedGroup ? ` in group "${selectedGroup}"` : ''}${selectedDay ? ` on ${selectedDay}` : ''}`
          : "No players found for this teaching period."}
      </div>
    );
  }
  
  const groupPlayers = (players: Player[]) => {
    interface GroupedPlayers {
      [groupId: string]: {
        groupName: string;
        timeSlots: {
          [timeSlotId: string]: {
            dayOfWeek: string;
            startTime: string;
            endTime: string;
            players: Player[];
          };
        };
        unassignedPlayers: Player[];
      };
    }
    
    return players.reduce((acc, player) => {
      const groupId = String(player.group_id);
      const timeSlotId = player.group_time_id ? String(player.group_time_id) : 'unassigned';

      if (!acc[groupId]) {
        acc[groupId] = {
          groupName: player.group_name,
          timeSlots: {},
          unassignedPlayers: []
        };
      }

      if (player.time_slot) {
        if (!acc[groupId].timeSlots[timeSlotId]) {
          acc[groupId].timeSlots[timeSlotId] = {
            dayOfWeek: player.time_slot.day_of_week,
            startTime: player.time_slot.start_time,
            endTime: player.time_slot.end_time,
            players: []
          };
        }
        acc[groupId].timeSlots[timeSlotId].players.push(player);
      } else {
        acc[groupId].unassignedPlayers.push(player);
      }

      return acc;
    }, {} as GroupedPlayers);
  };

  const groupedPlayers = groupPlayers(filteredPlayers);

  const formatTime = (time: string) => {
    return new Date(`2000-01-01T${time}`).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const handleDelete = async (playerId: number, event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    
    if (deleteInProgress[playerId]) return;
    
    if (window.confirm('Are you sure you want to delete this player?')) {
      setDeleteInProgress(prev => ({ ...prev, [playerId]: true }));
      try {
        await onDeletePlayer(playerId);
      } finally {
        setDeleteInProgress(prev => ({ ...prev, [playerId]: false }));
      }
    }
  };

  const saveScrollPosition = (playerId: number) => {
    // Store the current scroll position in sessionStorage before navigating
    sessionStorage.setItem('programmeScrollPosition', window.scrollY.toString());
    sessionStorage.setItem('lastEditedPlayerId', playerId.toString());
    
    // Additional: Store the element's position for more precise return
    const element = document.getElementById(`player-${playerId}`);
    if (element) {
      const rect = element.getBoundingClientRect();
      sessionStorage.setItem('playerElementOffset', rect.top.toString());
    }
  };

  // Results summary
  const resultsSummary = (
    <div className="mb-4 text-sm text-gray-500">
      Showing {filteredPlayers.length} of {players.length} players
      {selectedGroup && ` in group "${selectedGroup}"`}
      {selectedDay && ` on ${selectedDay}`}
      {searchQuery && ` matching "${searchQuery}"`}
    </div>
  );

  return (
    <div className="space-y-8">
      {resultsSummary}
      
      {Object.entries(groupedPlayers).map(([groupId, group]) => (
        <div key={groupId} className="bg-white shadow rounded-lg overflow-hidden">
          <div className="p-4 bg-gray-50">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-900">
                {group.groupName}
              </h3>
              <span className="text-gray-500">
                {Object.values(group.timeSlots).reduce(
                  (total, slot) => total + slot.players.length,
                  group.unassignedPlayers.length
                )}{' '}
                players
              </span>
            </div>
          </div>

          <div className="divide-y divide-gray-200">
            {/* Sort time slots by day of week first, then by start time */}
            {Object.entries(group.timeSlots)
              .sort(([, a], [, b]) => {
                const dayOrderA = getDayOrder(a.dayOfWeek);
                const dayOrderB = getDayOrder(b.dayOfWeek);
                if (dayOrderA !== dayOrderB) return dayOrderA - dayOrderB;
                
                const timeValueA = getTimeValue(a.startTime);
                const timeValueB = getTimeValue(b.startTime);
                return timeValueA - timeValueB;
              })
              .map(([timeSlotId, timeSlot]) => (
                <div 
                  key={timeSlotId} 
                  className="p-4"
                  id={`group-${groupId}-time-${timeSlotId}`}
                >
                  <h4 className="text-sm font-medium text-gray-700 mb-3">
                    {timeSlot.dayOfWeek} {formatTime(timeSlot.startTime)} - {formatTime(timeSlot.endTime)}
                  </h4>
                  <div className="space-y-3">
                    {timeSlot.players.map(player => (
                      <div key={player.id} className="bg-gray-50 rounded-lg p-3">
                        <div
                          id={`player-${player.id}`}
                          className="flex items-center justify-between"
                        >
                          <div>
                            <span className="font-medium text-gray-900">
                              {player.student_name}
                            </span>
                            <span className="ml-2">
                              {player.report_submitted ? (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                  Completed
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                                  Pending
                                </span>
                              )}
                            </span>
                          </div>
                          {player.can_edit && (
                            <div className="flex space-x-2">
                              <button
                                onClick={() => {
                                  saveScrollPosition(player.id);
                                  window.location.href = `/clubs/manage/${clubId}/players/${player.id}/edit`;
                                }}
                                className="inline-flex items-center px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-md hover:bg-indigo-100 transition-colors"
                              >
                                <Pencil className="h-4 w-4 mr-1" />
                                Edit
                              </button>
                              <button
                                onClick={(e) => handleDelete(player.id, e)}
                                disabled={deleteInProgress[player.id]}
                                className="inline-flex items-center px-3 py-1.5 bg-red-50 text-red-700 rounded-md hover:bg-red-100 transition-colors"
                              >
                                {deleteInProgress[player.id] ? (
                                  <div className="h-4 w-4 mr-1 animate-spin rounded-full border-2 border-t-transparent border-red-700"></div>
                                ) : (
                                  <Trash2 className="h-4 w-4 mr-1" />
                                )}
                                Delete
                              </button>
                            </div>
                          )}
                        </div>
                        {/* Player Info Bar */}
                        <PlayerInfoBar player={player} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}

            {group.unassignedPlayers.length > 0 && (
              <div className="p-4">
                <h4 className="text-sm font-medium text-gray-700 mb-3">
                  Unassigned Time Slot
                </h4>
                <div className="space-y-3">
                  {group.unassignedPlayers.map(player => (
                    <div key={player.id} className="bg-gray-50 rounded-lg p-3">
                      <div
                        id={`player-${player.id}`}
                        className="flex items-center justify-between"
                      >
                        <div>
                          <span className="font-medium text-gray-900">
                            {player.student_name}
                          </span>
                          <span className="ml-2">
                            {player.report_submitted ? (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                Completed
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                                Pending
                              </span>
                            )}
                          </span>
                        </div>
                        {player.can_edit && (
                          <div className="flex space-x-2">
                            <button
                              onClick={() => {
                                saveScrollPosition(player.id);
                                window.location.href = `/clubs/manage/${clubId}/players/${player.id}/edit`;
                              }}
                              className="inline-flex items-center px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-md hover:bg-indigo-100 transition-colors"
                            >
                              <Pencil className="h-4 w-4 mr-1" />
                              Edit
                            </button>
                            <button
                              onClick={(e) => handleDelete(player.id, e)}
                              disabled={deleteInProgress[player.id]}
                              className="inline-flex items-center px-3 py-1.5 bg-red-50 text-red-700 rounded-md hover:bg-red-100 transition-colors"
                            >
                              {deleteInProgress[player.id] ? (
                                <div className="h-4 w-4 mr-1 animate-spin rounded-full border-2 border-t-transparent border-red-700"></div>
                              ) : (
                                <Trash2 className="h-4 w-4 mr-1" />
                              )}
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                      {/* Player Info Bar */}
                      <PlayerInfoBar player={player} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

const ProgrammeManagement = () => {
  const [clubId, setClubId] = useState<number | null>(null);
  const [periods, setPeriods] = useState<TeachingPeriod[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<number | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  
  // Search and filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  // Refs for scrolling
  const playersListRef = useRef<HTMLDivElement>(null);

  // Fetch user data
  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const response = await fetch('/api/current-user');
        if (!response.ok) throw new Error('Failed to fetch user data');
        const userData = await response.json();
        setClubId(userData.tennis_club.id);
      } catch (err) {
        setError('Failed to load user data');
        console.error('Error:', err);
      }
    };

    fetchUserData();
  }, []);

  const fetchPlayers = useCallback(async () => {
    if (!selectedPeriod) return;
    
    setLoading(true);
    try {
      const response = await fetch(`/api/programme-players?period=${selectedPeriod}`);
      if (!response.ok) throw new Error('Failed to fetch players');
      const data = await response.json();
      setPlayers(data);
    } catch (err) {
      setError('Failed to load players');
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedPeriod]);

  useEffect(() => {
    const fetchPeriods = async () => {
      try {
        const response = await fetch('/api/dashboard/stats');
        if (!response.ok) throw new Error('Failed to fetch periods');
        const data = await response.json();
        setPeriods(data.periods);
        
        // Use the defaultPeriodId if available
        if (data.defaultPeriodId) {
          setSelectedPeriod(data.defaultPeriodId);
        } else if (data.periods.length > 0) {
          setSelectedPeriod(data.periods[0].id);
        }
      } catch (err) {
        setError('Failed to load teaching periods');
        console.error('Error:', err);
      }
    };

    fetchPeriods();
  }, []);

  useEffect(() => {
    fetchPlayers();
  }, [fetchPlayers]);

  // Restore scroll position when returning from edit
  useEffect(() => {
    if (!loading) {
      const storedPosition = sessionStorage.getItem('programmeScrollPosition');
      const lastEditedPlayerId = sessionStorage.getItem('lastEditedPlayerId');
      
      if (storedPosition) {
        // A small delay to ensure DOM is fully rendered
        setTimeout(() => {
          // If we have a specific player ID that was edited
          if (lastEditedPlayerId) {
            const playerElement = document.getElementById(`player-${lastEditedPlayerId}`);
            if (playerElement) {
              playerElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
              // Highlight briefly to show where we are
              playerElement.classList.add('bg-yellow-100');
              setTimeout(() => {
                playerElement.classList.remove('bg-yellow-100');
              }, 2000);
            } else {
              // Fall back to previous scroll position if element not found
              window.scrollTo(0, parseInt(storedPosition));
            }
          } else {
            // No player ID, just restore scroll position
            window.scrollTo(0, parseInt(storedPosition));
          }
          
          // Clear storage after use
          sessionStorage.removeItem('programmeScrollPosition');
          sessionStorage.removeItem('lastEditedPlayerId');
          sessionStorage.removeItem('playerElementOffset');
        }, 100);
      }
    }
  }, [loading]);

  const toggleBulkUpload = () => {
    setShowBulkUpload(prev => !prev);
  };

  const handleBulkUploadSuccess = () => {
    fetchPlayers();
    setShowBulkUpload(false);
  };

  const handleDownloadTemplate = () => {
    window.location.href = `/clubs/api/template/download`;
  };

  const handleExportData = () => {
    if (selectedPeriod) {
      window.location.href = `/clubs/api/players/export/${selectedPeriod}`;
    } else {
      alert('Please select a teaching period first');
    }
  };

  const handleAddPlayer = () => {
    if (clubId) {
      window.location.href = `/clubs/manage/${clubId}/players/add`;
    }
  };

  const handleDeletePlayer = async (playerId: number) => {
    try {
      const response = await fetch(`/clubs/api/players/${playerId}`, {
        method: 'DELETE',
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        // Check if it's a report constraint error
        if (response.status === 400 && data.error && data.error.includes('report')) {
          alert('This player cannot be deleted because they have reports associated with them. Please remove or reassign the reports first.');
        } else {
          alert(`Failed to delete player: ${data.error || 'Unknown error'}`);
        }
        return;
      }
      
      // Refresh player list after successful deletion
      await fetchPlayers();
      
    } catch (error) {
      console.error('Error deleting player:', error);
      alert('Failed to delete player. Please try again.');
    }
  };

  // Handler for when a group is clicked from analytics
  const handleGroupClick = (groupName: string) => {
    setSelectedGroup(groupName);
    setSearchQuery(''); // Clear search to avoid conflicts
    setSelectedDay(null); // Clear day filter to show all sessions for the group
    
    // Scroll to the players list section
    setTimeout(() => {
      if (playersListRef.current) {
        playersListRef.current.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'start' 
        });
      }
    }, 100);
  };
  
  // Get unique groups and days for filter options
  const { groups, days } = useMemo(() => {
    const groupsSet = new Set<string>();
    const daysSet = new Set<string>();
    
    players.forEach(player => {
      groupsSet.add(player.group_name);
      if (player.time_slot) {
        daysSet.add(player.time_slot.day_of_week);
      }
    });
    
    return {
      groups: Array.from(groupsSet).sort(),
      days: Array.from(daysSet).sort((a, b) => getDayOrder(a) - getDayOrder(b))
    };
  }, [players]);

  // Filter players based on search and filters
  const filteredPlayers = useMemo(() => {
    return players.filter(player => {
      // Search filter
      const searchLower = searchQuery.toLowerCase();
      if (searchQuery && !player.student_name.toLowerCase().includes(searchLower) && 
          !player.group_name.toLowerCase().includes(searchLower)) {
        return false;
      }
      
      // Group filter
      if (selectedGroup && player.group_name !== selectedGroup) {
        return false;
      }
      
      // Day filter
      if (selectedDay && (!player.time_slot || player.time_slot.day_of_week !== selectedDay)) {
        return false;
      }
      
      return true;
    });
  }, [players, searchQuery, selectedGroup, selectedDay]);
  
  // Clear all filters
  const clearFilters = () => {
    setSearchQuery('');
    setSelectedGroup(null);
    setSelectedDay(null);
  };

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!clubId) {
    return null;
  }

  return (
    <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
      <Card>
        <CardContent>
          {/* Period Filter */}
          <PeriodFilter
            periods={periods}
            selectedPeriod={selectedPeriod}
            onPeriodChange={setSelectedPeriod}
          />

          {/* Header with Actions */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 space-y-4 md:space-y-0">
            <h1 className="text-2xl font-bold text-gray-900">
              Manage Programme
            </h1>

            <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-4">
              <button
                onClick={handleAddPlayer}
                className="inline-flex items-center justify-center px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
              >
                <PlusCircle className="h-5 w-5 mr-2" />
                Add New Player
              </button>
              <button
                onClick={toggleBulkUpload}
                className="inline-flex items-center justify-center px-4 py-2 bg-indigo-500 text-white rounded-md hover:bg-indigo-600 transition-colors"
              >
                {showBulkUpload ? 'Hide Bulk Upload' : 'Show Bulk Upload'}
              </button>
              <button
                onClick={handleDownloadTemplate}
                className="inline-flex items-center justify-center px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 transition-colors"
              >
                <Download className="h-5 w-5 mr-2" />
                Download Template
              </button>
              <button
                onClick={handleExportData}
                className="inline-flex items-center justify-center px-4 py-2 bg-purple-500 text-white rounded-md hover:bg-purple-600 transition-colors"
              >
                <FileDown className="h-5 w-5 mr-2" />
                Export Players
              </button>
            </div>
          </div>

          {/* Bulk Upload Section */}
          {showBulkUpload && (
            <div className="mb-6">
              <BulkUploadSection
                periodId={selectedPeriod}
                onSuccess={handleBulkUploadSuccess}
                onCancel={() => setShowBulkUpload(false)}
              />
            </div>
          )}
          
          {/* Analytics Section */}
          <ProgrammeAnalytics 
            players={players} 
            onGroupClick={handleGroupClick}
          />

          {/* Search and Filter Bar */}
          <div className="p-4 border rounded-lg bg-gray-50 mb-6">
            <div className="flex flex-col md:flex-row gap-3">
              {/* Search Input */}
              <div className="relative flex-grow">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-4 w-4 text-gray-400" />
                </div>
                <input
                  type="text"
                  placeholder="Search players or groups..."
                  className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              
              {/* Group Filter */}
              <select
                className="px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                value={selectedGroup || ''}
                onChange={(e) => setSelectedGroup(e.target.value || null)}
              >
                <option value="">All Groups</option>
                {groups.map(group => (
                  <option key={group} value={group}>{group}</option>
                ))}
              </select>
              
              {/* Day Filter */}
              <select
                className="px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                value={selectedDay || ''}
                onChange={(e) => setSelectedDay(e.target.value || null)}
              >
                <option value="">All Days</option>
                {days.map(day => (
                  <option key={day} value={day}>{day}</option>
                ))}
              </select>
              
              {/* Clear Filters Button */}
              <button 
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
                onClick={clearFilters}
              >
                Clear Filters
              </button>
            </div>

            {/* Filter Status Indicator */}
            {selectedGroup && (
              <div className="mt-3 flex items-center space-x-2">
                <Users className="h-4 w-4 text-indigo-500" />
                <span className="text-sm text-indigo-700">
                  Showing group: <strong>{selectedGroup}</strong>
                </span>
                <button
                  onClick={() => setSelectedGroup(null)}
                  className="text-xs text-indigo-500 hover:text-indigo-700 underline"
                >
                  Clear
                </button>
              </div>
            )}
          </div>

          {/* Players List - WITH REF FOR SCROLLING */}
          <div ref={playersListRef}>
            <PlayersList
              players={players}
              filteredPlayers={filteredPlayers}
              loading={loading}
              clubId={clubId}
              onDeletePlayer={handleDeletePlayer}
              searchQuery={searchQuery}
              selectedGroup={selectedGroup}
              selectedDay={selectedDay}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ProgrammeManagement;