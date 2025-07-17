import React, { useState, useEffect } from 'react';

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
}

interface Coach {
  id: number;
  name: string;
}

interface UserInfo {
  is_admin: boolean;
  coach_id?: number;
  name: string;
}

interface TrialPlayer {
  id: number;
  name: string;
  contact_email?: string;
  contact_number?: string;
  emergency_contact_number?: string;
  date_of_birth?: string;
  medical_information?: string;
  notes: string;
  session_plan_id: number;
  session_date: string;
  group_name: string;
  group_id: number;
  time_slot: {
    day: string;
    start_time: string;
    end_time: string;
  };
  coach_name: string;
  coach_id: number;
  teaching_period: {
    id: number;
    name: string;
  };
}

interface SessionPlanSummary {
  total_plans: number;
  total_trial_players: number;
  total_makeup_players: number;
  total_planned_absences: number;
  plans_with_trials: number;
  plans_with_makeups: number;
  plans_with_absences: number;
}

interface SessionPlanStatsProps {
  onNavigate: (path: string) => void;
  periodId?: number;
  groupId?: number;
}

// Modal component for viewing trial player details
interface TrialPlayerModalProps {
  isOpen: boolean;
  onClose: () => void;
  trialPlayer: TrialPlayer | null;
  onViewSessionPlan: (planId: number) => void;
  formatDate: (dateString: string) => string;
}

const TrialPlayerModal: React.FC<TrialPlayerModalProps> = ({
  isOpen,
  onClose,
  trialPlayer,
  onViewSessionPlan,
  formatDate
}) => {
  if (!isOpen || !trialPlayer) return null;

  const calculateAge = (dateOfBirth: string) => {
    const today = new Date();
    const birth = new Date(dateOfBirth);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    
    return age;
  };

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-75 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-screen overflow-hidden">
        {/* Modal header */}
        <div className="px-6 py-4 border-b flex justify-between items-center">
          <div>
            <h3 className="text-lg font-medium text-gray-900">
              Trial Player Details
            </h3>
            <p className="text-sm text-gray-500">
              {formatDate(trialPlayer.session_date)} • {trialPlayer.group_name}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-500"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Modal body */}
        <div className="px-6 py-4 max-h-96 overflow-y-auto">
          <div className="space-y-4">
            {/* Basic Information */}
            <div>
              <h4 className="text-sm font-medium text-gray-900 mb-2">Basic Information</h4>
              <div className="bg-gray-50 p-4 rounded-md">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <span className="text-sm font-medium text-gray-500">Name:</span>
                    <p className="text-sm text-gray-900">{trialPlayer.name}</p>
                  </div>
                  
                  {trialPlayer.date_of_birth && (
                    <div>
                      <span className="text-sm font-medium text-gray-500">Age:</span>
                      <p className="text-sm text-gray-900">
                        {calculateAge(trialPlayer.date_of_birth)} years old
                      </p>
                    </div>
                  )}
                  
                  {trialPlayer.contact_email && (
                    <div>
                      <span className="text-sm font-medium text-gray-500">Email:</span>
                      <p className="text-sm text-gray-900">{trialPlayer.contact_email}</p>
                    </div>
                  )}
                  
                  {trialPlayer.contact_number && (
                    <div>
                      <span className="text-sm font-medium text-gray-500">Phone:</span>
                      <p className="text-sm text-gray-900">{trialPlayer.contact_number}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Session Information */}
            <div>
              <h4 className="text-sm font-medium text-gray-900 mb-2">Session Information</h4>
              <div className="bg-blue-50 p-4 rounded-md">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <span className="text-sm font-medium text-gray-500">Date:</span>
                    <p className="text-sm text-gray-900">{formatDate(trialPlayer.session_date)}</p>
                  </div>
                  
                  <div>
                    <span className="text-sm font-medium text-gray-500">Time:</span>
                    <p className="text-sm text-gray-900">
                      {trialPlayer.time_slot.day} {trialPlayer.time_slot.start_time}-{trialPlayer.time_slot.end_time}
                    </p>
                  </div>
                  
                  <div>
                    <span className="text-sm font-medium text-gray-500">Group:</span>
                    <p className="text-sm text-gray-900">{trialPlayer.group_name}</p>
                  </div>
                  
                  <div>
                    <span className="text-sm font-medium text-gray-500">Coach:</span>
                    <p className="text-sm text-gray-900">{trialPlayer.coach_name}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Medical Information */}
            {trialPlayer.medical_information && (
              <div>
                <h4 className="text-sm font-medium text-gray-900 mb-2">Medical Information</h4>
                <div className="bg-red-50 p-4 rounded-md">
                  <p className="text-sm text-gray-900 whitespace-pre-wrap">{trialPlayer.medical_information}</p>
                </div>
              </div>
            )}

            {/* Notes */}
            {trialPlayer.notes && (
              <div>
                <h4 className="text-sm font-medium text-gray-900 mb-2">Notes</h4>
                <div className="bg-yellow-50 p-4 rounded-md">
                  <p className="text-sm text-gray-900 whitespace-pre-wrap">{trialPlayer.notes}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Modal footer */}
        <div className="px-6 py-4 border-t flex justify-between">
          <button
            onClick={() => onViewSessionPlan(trialPlayer.session_plan_id)}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            View Session Plan
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

const SessionPlanStats: React.FC<SessionPlanStatsProps> = ({
  onNavigate,
  periodId: initialPeriodId,
  groupId: initialGroupId
}) => {
  // Filter data states
  const [periods, setPeriods] = useState<TeachingPeriod[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [loadingUserInfo, setLoadingUserInfo] = useState(true);

  // Selected filter values
  const [selectedPeriodId, setSelectedPeriodId] = useState<number | undefined>(initialPeriodId);
  const [selectedGroupId, setSelectedGroupId] = useState<number | undefined>(initialGroupId);
  const [selectedCoachId, setSelectedCoachId] = useState<number | undefined>(undefined);
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // Data states
  const [trialPlayers, setTrialPlayers] = useState<TrialPlayer[]>([]);
  const [sessionPlanSummary, setSessionPlanSummary] = useState<SessionPlanSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal states
  const [selectedTrialPlayer, setSelectedTrialPlayer] = useState<TrialPlayer | null>(null);
  const [showTrialPlayerModal, setShowTrialPlayerModal] = useState(false);

  // Fetch user info
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
          setSelectedCoachId(data.coach_id);
        }
      } catch (err) {
        console.error('Error fetching user info:', err);
      } finally {
        setLoadingUserInfo(false);
      }
    };
    
    fetchUserInfo();
  }, []);

  // Fetch teaching periods
  useEffect(() => {
    const fetchPeriods = async () => {
      try {
        const response = await fetch('/clubs/api/teaching-periods');
        if (!response.ok) throw new Error('Failed to fetch teaching periods');
        const data = await response.json();
        setPeriods(data);
        
        // Select first period if none provided
        if (!selectedPeriodId && data.length > 0) {
          setSelectedPeriodId(data[0].id);
        }
      } catch (err) {
        console.error('Error fetching teaching periods:', err);
      }
    };
    
    fetchPeriods();
  }, []);

  // Fetch groups
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

  // Fetch coaches
  useEffect(() => {
    const fetchCoaches = async () => {
      try {
        const response = await fetch('/clubs/api/coaches/organisation');
        if (!response.ok) throw new Error('Failed to fetch coaches');
        const data = await response.json();
        setCoaches(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error('Error fetching coaches:', err);
      }
    };
    
    fetchCoaches();
  }, []);

  // Fetch trial players and session plan summary
  useEffect(() => {
    const fetchData = async () => {
      if (!selectedPeriodId) return;
      
      try {
        setLoading(true);
        setError(null);
        
        // Build query parameters
        const params = new URLSearchParams();
        params.append('period_id', selectedPeriodId.toString());
        
        if (selectedGroupId) {
          params.append('group_id', selectedGroupId.toString());
        }
        
        if (selectedCoachId) {
          params.append('coach_id', selectedCoachId.toString());
        }
        
        if (startDate) {
          params.append('start_date', startDate);
        }
        
        if (endDate) {
          params.append('end_date', endDate);
        }
        
        // Fetch trial players
        const trialPlayersResponse = await fetch(`/api/session-plans/trial-players?${params.toString()}`);
        if (!trialPlayersResponse.ok) {
          throw new Error('Failed to fetch trial players');
        }
        const trialPlayersData = await trialPlayersResponse.json();
        setTrialPlayers(trialPlayersData);
        
        // Fetch session plan summary
        const summaryResponse = await fetch(`/api/session-plans/summary?${params.toString()}`);
        if (!summaryResponse.ok) {
          throw new Error('Failed to fetch session plan summary');
        }
        const summaryData = await summaryResponse.json();
        setSessionPlanSummary(summaryData);
        
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An error occurred';
        setError(errorMessage);
        console.error('Error fetching session plan data:', err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, [selectedPeriodId, selectedGroupId, selectedCoachId, startDate, endDate]);

  // Handle filter changes
  const handlePeriodChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    setSelectedPeriodId(value ? Number(value) : undefined);
  };

  const handleGroupChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    setSelectedGroupId(value ? Number(value) : undefined);
  };

  const handleCoachChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    setSelectedCoachId(value ? Number(value) : undefined);
  };

  // Handle trial player selection
  const handleViewTrialPlayer = (trialPlayer: TrialPlayer) => {
    setSelectedTrialPlayer(trialPlayer);
    setShowTrialPlayerModal(true);
  };

  // Handle navigation to session plan
  const handleViewSessionPlan = (planId: number) => {
    onNavigate(`/session-plans/${planId}`);
  };

  // Format date
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  // Render summary stats
  const renderSummaryStats = () => {
    if (!sessionPlanSummary) return null;
    
    return (
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b">
          <h3 className="text-lg font-medium text-gray-900">Session Planning Summary</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-6">
          <div className="bg-blue-50 p-4 rounded-lg text-center">
            <div className="text-2xl font-bold text-blue-700">{sessionPlanSummary.total_plans}</div>
            <div className="text-sm text-blue-500">Total Plans</div>
          </div>
          
          <div className="bg-green-50 p-4 rounded-lg text-center">
            <div className="text-2xl font-bold text-green-700">{sessionPlanSummary.total_trial_players}</div>
            <div className="text-sm text-green-500">Trial Players</div>
          </div>
          
          <div className="bg-purple-50 p-4 rounded-lg text-center">
            <div className="text-2xl font-bold text-purple-700">{sessionPlanSummary.total_makeup_players}</div>
            <div className="text-sm text-purple-500">Makeup Players</div>
          </div>
          
          <div className="bg-orange-50 p-4 rounded-lg text-center">
            <div className="text-2xl font-bold text-orange-700">{sessionPlanSummary.total_planned_absences}</div>
            <div className="text-sm text-orange-500">Planned Absences</div>
          </div>
        </div>
        
        <div className="px-6 py-4 border-t bg-gray-50">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div className="text-center">
              <span className="font-medium text-gray-900">{sessionPlanSummary.plans_with_trials}</span>
              <span className="text-gray-500"> plans with trials</span>
            </div>
            <div className="text-center">
              <span className="font-medium text-gray-900">{sessionPlanSummary.plans_with_makeups}</span>
              <span className="text-gray-500"> plans with makeups</span>
            </div>
            <div className="text-center">
              <span className="font-medium text-gray-900">{sessionPlanSummary.plans_with_absences}</span>
              <span className="text-gray-500"> plans with absences</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Render trial players table
  const renderTrialPlayersTable = () => {
    if (!trialPlayers || trialPlayers.length === 0) {
      return (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Trial Players</h3>
          <p className="text-gray-500">No trial players found for the selected filters</p>
        </div>
      );
    }

    return (
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b">
          <h3 className="text-lg font-medium text-gray-900">
            Trial Players ({trialPlayers.length})
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Name
                </th>
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
                  Contact
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {trialPlayers.map((trialPlayer) => (
                <tr key={`${trialPlayer.session_plan_id}-${trialPlayer.id}`} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{trialPlayer.name}</div>
                    {trialPlayer.notes && (
                      <div className="text-xs text-gray-500 mt-1">
                        {trialPlayer.notes.length > 50 
                          ? trialPlayer.notes.substring(0, 50) + '...' 
                          : trialPlayer.notes}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatDate(trialPlayer.session_date)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {trialPlayer.group_name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {trialPlayer.time_slot.day} {trialPlayer.time_slot.start_time}-{trialPlayer.time_slot.end_time}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {trialPlayer.coach_name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <div>
                      {trialPlayer.contact_email && (
                        <div className="text-xs">{trialPlayer.contact_email}</div>
                      )}
                      {trialPlayer.contact_number && (
                        <div className="text-xs">{trialPlayer.contact_number}</div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm space-x-2">
                    <button
                      onClick={() => handleViewTrialPlayer(trialPlayer)}
                      className="text-blue-600 hover:text-blue-900"
                    >
                      View Details
                    </button>
                    <button
                      onClick={() => handleViewSessionPlan(trialPlayer.session_plan_id)}
                      className="text-green-600 hover:text-green-900"
                    >
                      View Plan
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // Show loading state while fetching user info
  if (loadingUserInfo) {
    return (
      <div className="flex justify-center items-center h-32">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-700"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Session Planning Statistics</h1>
        <button
          onClick={() => onNavigate('/session-plans')}
          className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
        >
          Back to Session Plans
        </button>
      </div>

      {/* Filters section */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-lg font-semibold mb-3">Filters</h2>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {/* Teaching Period Filter */}
          <div>
            <label htmlFor="period" className="block text-sm font-medium text-gray-700 mb-1">
              Teaching Period
            </label>
            <select
              id="period"
              value={selectedPeriodId || ''}
              onChange={handlePeriodChange}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            >
              <option value="">Select Period</option>
              {periods.map(period => (
                <option key={period.id} value={period.id}>
                  {period.name} {period.is_active && '(Active)'}
                </option>
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
              value={selectedGroupId || ''}
              onChange={handleGroupChange}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            >
              <option value="">All Groups</option>
              {groups.map(group => (
                <option key={group.id} value={group.id}>{group.name}</option>
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
              value={selectedCoachId || ''}
              onChange={handleCoachChange}
              disabled={!userInfo?.is_admin}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 disabled:bg-gray-100"
            >
              <option value="">All Coaches</option>
              {coaches.map(coach => (
                <option key={coach.id} value={coach.id}>{coach.name}</option>
              ))}
            </select>
          </div>

          {/* Start Date Filter */}
          <div>
            <label htmlFor="start-date" className="block text-sm font-medium text-gray-700 mb-1">
              Start Date
            </label>
            <input
              type="date"
              id="start-date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
          </div>

          {/* End Date Filter */}
          <div>
            <label htmlFor="end-date" className="block text-sm font-medium text-gray-700 mb-1">
              End Date
            </label>
            <input
              type="date"
              id="end-date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-32">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-700"></div>
        </div>
      ) : error ? (
        <div className="bg-red-50 p-4 rounded-md text-red-700">
          {error}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Summary Stats */}
          {renderSummaryStats()}

          {/* Trial Players Table */}
          {renderTrialPlayersTable()}
        </div>
      )}

      {/* Trial Player Detail Modal */}
      {showTrialPlayerModal && (
        <TrialPlayerModal
          isOpen={showTrialPlayerModal}
          onClose={() => setShowTrialPlayerModal(false)}
          trialPlayer={selectedTrialPlayer}
          onViewSessionPlan={handleViewSessionPlan}
          formatDate={formatDate}
        />
      )}
    </div>
  );
};

export default SessionPlanStats;