import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '../../components/ui/card';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { Download, PlusCircle, Pencil } from 'lucide-react';
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
  };
  report_submitted: boolean;
  report_id: number | null;
  can_edit: boolean;
}

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

const PlayersList: React.FC<{
  players: Player[];
  loading: boolean;
  clubId: number;
}> = ({ players, loading, clubId }) => {
  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-500 mx-auto"></div>
        <p className="mt-2 text-gray-600">Loading players...</p>
      </div>
    );
  }

  if (!players.length) {
    return (
      <div className="text-center py-8 bg-gray-50 rounded-lg">
        No players found for this teaching period.
      </div>
    );
  }

  const groupedPlayers: GroupedPlayers = players.reduce((acc, player) => {
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

  const formatTime = (time: string) => {
    return new Date(`2000-01-01T${time}`).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="space-y-8">
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
            {Object.entries(group.timeSlots).map(([timeSlotId, timeSlot]) => (
              <div key={timeSlotId} className="p-4">
                <h4 className="text-sm font-medium text-gray-700 mb-3">
                  {timeSlot.dayOfWeek} {formatTime(timeSlot.startTime)} - {formatTime(timeSlot.endTime)}
                </h4>
                <div className="space-y-2">
                  {timeSlot.players.map(player => (
                    <div
                      key={player.id}
                      className="flex items-center justify-between px-4 py-2 bg-gray-50 rounded-lg"
                    >
                      <div>
                        <span className="font-medium text-gray-900">
                          {player.student_name}
                        </span>
                        <span className="ml-2">
                          {player.report_submitted ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              Completed Report
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                              Pending Report
                            </span>
                          )}
                        </span>
                      </div>
                      {player.can_edit && (
                        <button
                          onClick={() => window.location.href = `/clubs/manage/${clubId}/players/${player.id}/edit`}
                          className="inline-flex items-center px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-md hover:bg-indigo-100 transition-colors"
                        >
                          <Pencil className="h-4 w-4 mr-1" />
                          Edit
                        </button>
                      )}
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
                <div className="space-y-2">
                  {group.unassignedPlayers.map(player => (
                    <div
                      key={player.id}
                      className="flex items-center justify-between px-4 py-2 bg-gray-50 rounded-lg"
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
                        <button
                          onClick={() => window.location.href = `/clubs/manage/${clubId}/players/${player.id}/edit`}
                          className="inline-flex items-center px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-md hover:bg-indigo-100 transition-colors"
                        >
                          <Pencil className="h-4 w-4 mr-1" />
                          Edit
                        </button>
                      )}
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

  // Separate useEffect for tracking showBulkUpload changes
  useEffect(() => {
  }, [showBulkUpload]);

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

  const toggleBulkUpload = () => {
    setShowBulkUpload(prev => {
      return !prev;
    });
  };

  const handleBulkUploadSuccess = () => {
    fetchPlayers();
    setShowBulkUpload(false);
  };

  const handleDownloadTemplate = () => {
    window.location.href = `/clubs/api/template/download`;
  };

  const handleAddPlayer = () => {
    if (clubId) {
      window.location.href = `/clubs/manage/${clubId}/players/add`;
    }
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
            </div>
          </div>



          {/* Bulk Upload Section with debug wrapper */}
          {showBulkUpload && (
            <div className="mb-6">
              <BulkUploadSection
                periodId={selectedPeriod}
                onSuccess={() => {
                  console.log('BulkUploadSection onSuccess called');
                  handleBulkUploadSuccess();
                }}
                onCancel={() => {
                  console.log('BulkUploadSection onCancel called');
                  setShowBulkUpload(false);
                }}
              />
            </div>
          )}
          
          {/* Analytics Section */}
          <ProgrammeAnalytics players={players} />

          {/* Players List */}
          <PlayersList
            players={players}
            loading={loading}
            clubId={clubId}
          />
        </CardContent>
      </Card>
    </div>
  );
};

export default ProgrammeManagement;