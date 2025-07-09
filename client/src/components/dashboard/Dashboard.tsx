import { useState, useEffect, useMemo, useCallback } from 'react';
import { Download, Send, Menu, Search, Users, X } from 'lucide-react';
import { DashboardStats } from './DashboardStats';
import BulkEmailSender from '../email/BulkEmailSender';
import { 
  TeachingPeriod, 
  DashboardMetrics, 
  ProgrammePlayer,
  User
} from '../../types/dashboard';

interface GroupedPlayers {
  [groupName: string]: {
    timeSlots: {
      [timeSlot: string]: ProgrammePlayer[];
    };
  };
}

type ReportStatus = 'all' | 'completed' | 'remaining';

interface ComprehensiveFilterProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  selectedGroup: string | null;
  onGroupChange: (group: string | null) => void;
  selectedCoach: number | null;
  onCoachChange: (coachId: number | null) => void;
  selectedRecommendedGroup: string | null;
  onRecommendedGroupChange: (group: string | null) => void;
  reportStatus: ReportStatus;
  onReportStatusChange: (status: ReportStatus) => void;
  onClearAllFilters: () => void;
  availableGroups: string[];
  availableCoaches: {id: number, name: string}[];
  availableRecommendedGroups: string[];
  totalPlayers: number;
  filteredCount: number;
}

// Comprehensive Search and Filter Bar Component
const ComprehensiveFilterBar: React.FC<ComprehensiveFilterProps> = ({
  searchQuery,
  onSearchChange,
  selectedGroup,
  onGroupChange,
  selectedCoach,
  onCoachChange,
  selectedRecommendedGroup,
  onRecommendedGroupChange,
  reportStatus,
  onReportStatusChange,
  onClearAllFilters,
  availableGroups,
  availableCoaches,
  availableRecommendedGroups,
  totalPlayers,
  filteredCount
}) => {
  const hasActiveFilters = searchQuery || selectedGroup || selectedCoach || 
                          selectedRecommendedGroup || reportStatus !== 'all';

  const getSelectedCoachName = () => {
    const coach = availableCoaches.find(c => c.id === selectedCoach);
    return coach ? coach.name : '';
  };

  return (
    <div className="mb-6 p-4 border rounded-lg bg-gray-50">
      {/* Search and Filter Controls */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3 mb-3">
        {/* Search Input */}
        <div className="relative lg:col-span-2">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-gray-400" />
          </div>
          <input
            type="text"
            placeholder="Search by student name..."
            className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
        
        {/* Group Filter */}
        <select
          className="px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
          value={selectedGroup || ''}
          onChange={(e) => onGroupChange(e.target.value || null)}
        >
          <option value="">All Groups</option>
          {availableGroups.map(group => (
            <option key={group} value={group}>{group}</option>
          ))}
        </select>

        {/* Coach Filter */}
        <select
          className="px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
          value={selectedCoach || ''}
          onChange={(e) => onCoachChange(e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">All Coaches</option>
          {availableCoaches.map(coach => (
            <option key={coach.id} value={coach.id}>{coach.name}</option>
          ))}
        </select>

        {/* Recommended Group Filter */}
        <select
          className="px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
          value={selectedRecommendedGroup || ''}
          onChange={(e) => onRecommendedGroupChange(e.target.value || null)}
        >
          <option value="">All Recommendations</option>
          {availableRecommendedGroups.map(group => (
            <option key={group} value={group}>Recommended for {group}</option>
          ))}
        </select>

        {/* Report Status Filter */}
        <select
          className="px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
          value={reportStatus}
          onChange={(e) => onReportStatusChange(e.target.value as ReportStatus)}
        >
          <option value="all">All Reports</option>
          <option value="completed">Completed Only</option>
          <option value="remaining">Remaining Only</option>
        </select>
      </div>

      {/* Results Summary and Clear Button */}
      <div className="flex justify-between items-center">
        <div className="text-sm text-gray-600">
          Showing {filteredCount} of {totalPlayers} reports
          {searchQuery && ` matching "${searchQuery}"`}
          {selectedGroup && ` in group "${selectedGroup}"`}
          {selectedCoach && ` for coach "${getSelectedCoachName()}"`}
          {selectedRecommendedGroup && ` recommended for "${selectedRecommendedGroup}"`}
          {reportStatus !== 'all' && ` (${reportStatus} only)`}
        </div>

        {hasActiveFilters && (
          <button 
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
            onClick={onClearAllFilters}
          >
            Clear All Filters
          </button>
        )}
      </div>

      {/* Active Filters Display */}
      {hasActiveFilters && (
        <div className="flex flex-wrap gap-2 mt-3">
          {searchQuery && (
            <div className="flex items-center bg-blue-50 border border-blue-200 p-2 rounded-md">
              <Search className="w-4 h-4 text-blue-600 mr-2" />
              <span className="text-blue-800 font-medium">Search: "{searchQuery}"</span>
              <button 
                onClick={() => onSearchChange('')}
                className="ml-2 text-blue-600 hover:text-blue-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
          
          {selectedGroup && (
            <div className="flex items-center bg-green-50 border border-green-200 p-2 rounded-md">
              <Users className="w-4 h-4 text-green-600 mr-2" />
              <span className="text-green-800 font-medium">Group: {selectedGroup}</span>
              <button 
                onClick={() => onGroupChange(null)}
                className="ml-2 text-green-600 hover:text-green-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {selectedCoach && (
            <div className="flex items-center bg-purple-50 border border-purple-200 p-2 rounded-md">
              <Users className="w-4 h-4 text-purple-600 mr-2" />
              <span className="text-purple-800 font-medium">Coach: {getSelectedCoachName()}</span>
              <button 
                onClick={() => onCoachChange(null)}
                className="ml-2 text-purple-600 hover:text-purple-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {selectedRecommendedGroup && (
            <div className="flex items-center bg-orange-50 border border-orange-200 p-2 rounded-md">
              <Users className="w-4 h-4 text-orange-600 mr-2" />
              <span className="text-orange-800 font-medium">Recommended for: {selectedRecommendedGroup}</span>
              <button 
                onClick={() => onRecommendedGroupChange(null)}
                className="ml-2 text-orange-600 hover:text-orange-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {reportStatus !== 'all' && (
            <div className="flex items-center bg-indigo-50 border border-indigo-200 p-2 rounded-md">
              <Users className="w-4 h-4 text-indigo-600 mr-2" />
              <span className="text-indigo-800 font-medium">Status: {reportStatus}</span>
              <button 
                onClick={() => onReportStatusChange('all')}
                className="ml-2 text-indigo-600 hover:text-indigo-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const Dashboard = () => {
  const [selectedPeriod, setSelectedPeriod] = useState<number | null>(null);
  const [periods, setPeriods] = useState<TeachingPeriod[]>([]);
  const [stats, setStats] = useState<DashboardMetrics | null>(null);
  const [players, setPlayers] = useState<ProgrammePlayer[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showBulkEmail, setShowBulkEmail] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  
  // Filter state variables - consolidated
  const [playerSearchQuery, setPlayerSearchQuery] = useState<string>('');
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [selectedCoach, setSelectedCoach] = useState<number | null>(null);
  const [selectedRecommendedGroup, setSelectedRecommendedGroup] = useState<string | null>(null);
  const [reportStatus, setReportStatus] = useState<ReportStatus>('all');

  // Additional state for recommendations data
  const [groupRecommendations, setGroupRecommendations] = useState<any[]>([]);
  const [allCoaches, setAllCoaches] = useState<{id: number, name: string}[]>([]);

  // Extract unique groups from players for filter dropdown
  const availableGroups = useMemo(() => {
    const groupsSet = new Set<string>();
    players.forEach(player => {
      groupsSet.add(player.group_name);
    });
    return Array.from(groupsSet).sort();
  }, [players]);

  // Extract unique recommended groups from recommendations data
  const availableRecommendedGroups = useMemo(() => {
    const groupsSet = new Set<string>();
    groupRecommendations.forEach(rec => {
      groupsSet.add(rec.to_group);
    });
    return Array.from(groupsSet).sort();
  }, [groupRecommendations]);

  // Get players that are recommended for the selected group
  const getRecommendedPlayerIds = useCallback(async (groupName: string): Promise<number[]> => {
    if (!selectedPeriod) return [];
    
    try {
      const response = await fetch(`/api/group-recommendations/players?to_group=${encodeURIComponent(groupName)}&period=${selectedPeriod}`);
      if (response.ok) {
        const data = await response.json();
        return data.players.map((id: string | number) => 
          typeof id === 'string' ? parseInt(id, 10) : id
        );
      }
    } catch (error) {
      console.error('Error fetching recommended players:', error);
    }
    return [];
  }, [selectedPeriod]);

  // Enhanced filtering logic with all filters
  const filteredPlayers = useMemo(() => {
    return players.filter(player => {
      // Search filter
      if (playerSearchQuery) {
        const searchLower = playerSearchQuery.toLowerCase();
        if (!player.student_name.toLowerCase().includes(searchLower)) {
          return false;
        }
      }
      
      // Group filter
      if (selectedGroup && player.group_name !== selectedGroup) {
        return false;
      }
      
      // Coach filter
      if (selectedCoach && player.assigned_coach_id !== selectedCoach) {
        return false;
      }
      
      // Report status filter
      if (reportStatus === 'completed' && !player.report_submitted) {
        return false;
      }
      if (reportStatus === 'remaining') {
        // For remaining: show only non-submitted reports that have templates available for creation
        if (player.report_submitted) {
          return false; // Already submitted
        }
        // Only show if they can create a report (has template and can edit, and no existing report)
        if (!player.can_edit || !player.has_template || player.report_id) {
          return false;
        }
      }
      
      return true;
    });
  }, [players, playerSearchQuery, selectedGroup, selectedCoach, reportStatus]);

  // Apply recommended group filter separately since it's async
  const [recommendedPlayerIds, setRecommendedPlayerIds] = useState<number[]>([]);

  useEffect(() => {
    if (selectedRecommendedGroup) {
      getRecommendedPlayerIds(selectedRecommendedGroup).then(setRecommendedPlayerIds);
    } else {
      setRecommendedPlayerIds([]);
    }
  }, [selectedRecommendedGroup, getRecommendedPlayerIds]);

  const finalFilteredPlayers = useMemo(() => {
    if (selectedRecommendedGroup && recommendedPlayerIds.length > 0) {
      const playerIds = new Set(recommendedPlayerIds.map(id => Number(id)));
      return filteredPlayers.filter(player => playerIds.has(Number(player.id)));
    }
    return filteredPlayers;
  }, [filteredPlayers, selectedRecommendedGroup, recommendedPlayerIds]);

  // Clear all filters
  const clearAllFilters = useCallback(() => {
    setPlayerSearchQuery('');
    setSelectedGroup(null);
    setSelectedCoach(null);
    setSelectedRecommendedGroup(null);
    setReportStatus('all');
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
  
        const userResponse = await fetch('/api/current-user');
        if (!userResponse.ok) throw new Error('Failed to fetch user data');
        const userData = await userResponse.json();
        setCurrentUser(userData);
  
        const statsResponse = await fetch(`/api/dashboard/stats${selectedPeriod ? `?period=${selectedPeriod}` : ''}`);
        if (!statsResponse.ok) throw new Error('Failed to fetch dashboard stats');
        const statsData = await statsResponse.json();
        setPeriods(statsData.periods);
        
        if (!selectedPeriod && statsData.defaultPeriodId) {
          setSelectedPeriod(statsData.defaultPeriodId);
          setStats(statsData.stats);
          return;
        }
        
        setStats(statsData.stats);
        
        // Set group recommendations and coaches from stats
        if (statsData.stats?.groupRecommendations) {
          setGroupRecommendations(statsData.stats.groupRecommendations);
        }
        if (statsData.stats?.coachSummaries) {
          setAllCoaches(statsData.stats.coachSummaries.map((coach: any) => ({
            id: coach.id,
            name: coach.name
          })));
        }
  
        const playersResponse = await fetch(`/api/programme-players${selectedPeriod ? `?period=${selectedPeriod}` : ''}`);
        if (!playersResponse.ok) throw new Error('Failed to fetch programme players');
        const playersData = await playersResponse.json();

        // Filter players based on coach assignment
        const filteredPlayers = playersData.filter((player: { assigned_coach_id: number | undefined; }) => 
          currentUser?.is_admin || 
          currentUser?.is_super_admin || 
          player.assigned_coach_id === currentUser?.id
        );
        
        setPlayers(filteredPlayers);
  
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
        setError(error instanceof Error ? error.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    };
  
    fetchData();
  }, [selectedPeriod, currentUser?.id]);

  const handleSendReportsClick = () => {
    if (!selectedPeriod) {
      alert('Please select a teaching period before sending reports');
      return;
    }
    if (!stats?.submittedReports) {
      alert('There are no finalised reports available to send');
      return;
    }
    setShowBulkEmail(true);
    setShowMobileMenu(false);
  };

  const handleSingleReportDownload = (reportId: number | undefined): void => {
    if (!reportId) {
      console.error('No report ID provided');
      return;
    }

    try {
      window.open(`/download_single_report/${reportId}`, '_blank');
    } catch (error: unknown) {
      console.error('Error opening report:', error);
      let errorMessage = 'Unknown error occurred';
      if (error instanceof Error) {
        errorMessage = error.message;
      }
      alert(`Error opening report: ${errorMessage}`);
    }
  };

  const sortTimeSlots = (aTime: string, bTime: string): number => {
    if (aTime === 'Unscheduled') return 1;
    if (bTime === 'Unscheduled') return -1;
    
    const [aDay, aTimeRange] = aTime.split(' ');
    const [bDay, bTimeRange] = bTime.split(' ');
    
    const dayOrder: { [key: string]: number } = {
      'Monday': 1, 'Tuesday': 2, 'Wednesday': 3, 'Thursday': 4,
      'Friday': 5, 'Saturday': 6, 'Sunday': 7
    };
    
    const aDayValue = dayOrder[aDay] || 8;
    const bDayValue = dayOrder[bDay] || 8;
    
    if (aDayValue !== bDayValue) {
      return aDayValue - bDayValue;
    }
    
    const aStartTime = aTimeRange?.split('-')[0];
    const bStartTime = bTimeRange?.split('-')[0];
    
    return aStartTime?.localeCompare(bStartTime || '') || 0;
  };

  const groupPlayersByGroupAndTime = (players: ProgrammePlayer[]): GroupedPlayers => {
    return players.reduce((acc: GroupedPlayers, player) => {
      if (!currentUser?.is_admin && 
          !currentUser?.is_super_admin && 
          player.assigned_coach_id !== currentUser?.id) {
        return acc;
      }

      const groupName = player.group_name;
      const timeSlot = player.time_slot ? 
        `${player.time_slot.day_of_week} ${player.time_slot.start_time}-${player.time_slot.end_time}` : 
        'Unscheduled';

      if (!acc[groupName]) {
        acc[groupName] = { timeSlots: {} };
      }
      if (!acc[groupName].timeSlots[timeSlot]) {
        acc[groupName].timeSlots[timeSlot] = [];
      }
      acc[groupName].timeSlots[timeSlot].push(player);
      return acc;
    }, {});
  };

  const getDraftCount = () => {
    return players.filter(player => player.has_draft).length;
  };

  if (loading) return <div>Loading...</div>;
  if (error) return <div className="text-red-600">Error: {error}</div>;
  if (!stats || !currentUser) return <div>No data available</div>;

  const groupedPlayers = groupPlayersByGroupAndTime(finalFilteredPlayers);
  const isAdmin = currentUser.is_admin || currentUser.is_super_admin;
  const draftCount = getDraftCount();

  return (
    <div className="w-full space-y-6">
      {/* Responsive Header */}
      <div className="flex flex-col space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">
            {isAdmin ? 'Tennis Reports Dashboard' : 'Tennis Reports'}
          </h1>
          
          {/* Mobile Menu Button */}
          {isAdmin && (
            <button
              onClick={() => setShowMobileMenu(!showMobileMenu)}
              className="md:hidden p-2 text-gray-600 hover:text-gray-900"
            >
              <Menu className="w-6 h-6" />
            </button>
          )}
        </div>

        {/* Draft Reports Alert - Show if there are drafts */}
        {draftCount > 0 && (
          <div className="bg-indigo-50 border border-indigo-200 p-3 rounded-md text-indigo-800">
            <span className="font-medium">You have {draftCount} report draft{draftCount !== 1 ? 's' : ''}</span>
            <span className="ml-2">These reports need to be finalised before they can be sent out.</span>
          </div>
        )}

        {/* Controls Section - Simplified */}
        <div className={`flex flex-col md:flex-row gap-4 ${showMobileMenu ? 'block' : 'hidden md:flex'}`}>
          {/* Period Selector */}
          <select
            className="w-full md:w-auto rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            value={selectedPeriod || ''}
            onChange={(e) => setSelectedPeriod(e.target.value ? Number(e.target.value) : null)}
          >
            {periods.map((period) => (
              <option key={period.id} value={period.id}>{period.name}</option>
            ))}
          </select>

          {/* Admin Actions */}
          {isAdmin && (
            <div className="flex flex-col md:flex-row gap-2">
              <button
                onClick={handleSendReportsClick}
                disabled={!selectedPeriod || !stats?.submittedReports}
                className="w-full md:w-auto px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 
                         flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send className="w-4 h-4" />
                <span className="md:hidden lg:inline">Send Reports</span>
                {stats?.submittedReports > 0 && (
                  <span className="bg-green-500 px-2 py-0.5 rounded-full text-sm">
                    {stats.submittedReports}
                  </span>
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      <DashboardStats stats={stats} />

      {/* Modal for Bulk Email */}
      {showBulkEmail && selectedPeriod && (
        <BulkEmailSender
          periodId={selectedPeriod}
          clubName={currentUser.tennis_club.name}
          onClose={() => setShowBulkEmail(false)}
        />
      )}

      {/* Admin Analytics Section - Non-clickable */}
      {isAdmin && stats.coachSummaries && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Group Progress Card */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Group Progress</h3>
              <div className="space-y-3 max-h-[300px] overflow-y-auto">
                {stats.currentGroups.map((group: any) => (
                  <div 
                    key={group.name} 
                    className="p-3 bg-gray-50 rounded-lg flex flex-col"
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-medium text-gray-900">{group.name}</span>
                      <div className="text-sm text-gray-500">
                        <span>{group.count} players</span>
                        {group.reports_draft > 0 && (
                          <span className="ml-2 px-2 py-0.5 bg-indigo-100 text-indigo-800 rounded-full text-xs">
                            {group.reports_draft} drafts
                          </span>
                        )}  
                      </div>
                    </div>
                    <div className="mt-2 w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-blue-600 h-2 rounded-full" 
                        style={{ width: `${((group.reports_completed / group.count) * 100)}%` }}
                      />
                    </div>
                    <span className="text-sm text-gray-500 mt-1 self-end">
                      {((group.reports_completed / group.count) * 100).toFixed(1)}% complete
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Coach Progress Card - Non-clickable */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Coach Progress</h3>
              <div className="space-y-3 max-h-[300px] overflow-y-auto">
                {stats.coachSummaries.map((coach: any) => (
                  <div 
                    key={coach.id} 
                    className="p-3 bg-gray-50 rounded-lg flex flex-col"
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-medium text-gray-900">{coach.name}</span>
                      <div className="text-sm text-gray-500">
                        <span>
                          {coach.reports_completed}/{coach.total_assigned}
                        </span>
                        {coach.reports_draft > 0 && (
                          <span className="ml-2 px-2 py-0.5 bg-indigo-100 text-indigo-800 rounded-full text-xs">
                            {coach.reports_draft} drafts
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="mt-2 w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-blue-600 h-2 rounded-full" 
                        style={{ width: `${((coach.reports_completed / coach.total_assigned) * 100)}%` }}
                      />
                    </div>
                    <span className="text-sm text-gray-500 mt-1 self-end">
                      {((coach.reports_completed / coach.total_assigned) * 100).toFixed(1)}% complete
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Group Recommendations Card - Non-clickable */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Group Recommendations</h3>
              {stats.groupRecommendations && stats.groupRecommendations.length > 0 ? (
                <div className="space-y-3">
                  <div className="space-y-2 max-h-[300px] overflow-y-auto">
                    {(() => {
                      const destinationGroups: Record<string, number> = {};
                      let totalPlayers = 0;
                      
                      stats.groupRecommendations.forEach((rec: any) => {
                        destinationGroups[rec.to_group] = (destinationGroups[rec.to_group] || 0) + rec.count;
                        totalPlayers += rec.count;
                      });
                      
                      return Object.entries(destinationGroups)
                        .sort((a, b) => b[1] - a[1])
                        .map(([group, count], index) => {
                          const percentage = Math.round((count / totalPlayers) * 100);
                          return (
                            <div 
                              key={`group-rec-${index}`} 
                              className="p-3 bg-gray-50 w-full rounded-lg flex justify-between items-center"
                            >
                              <span className="font-medium text-gray-900">{group}</span>
                              <div className="flex items-center">
                                <span className="text-sm bg-blue-100 text-blue-800 px-3 py-1 rounded-full">
                                  {count} {count === 1 ? 'player' : 'players'}
                                </span>
                                <span className="text-xs text-gray-500 ml-2">({percentage}%)</span>
                              </div>
                            </div>
                          );
                        });
                    })()}
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-32 text-gray-500">
                  No recommendations for this period
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Reports Management Section with Comprehensive Filtering */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-medium text-gray-900">
            {isAdmin ? 'All Reports' : 'My Reports'}
          </h2>
          
          {/* Report Status Legend */}
          <div className="flex space-x-3">
            <div className="flex items-center space-x-1">
              <div className="w-3 h-3 rounded-full bg-green-500"></div>
              <span className="text-sm text-gray-600">Submitted</span>
            </div>
            <div className="flex items-center space-x-1">
              <div className="w-3 h-3 rounded-full bg-indigo-500"></div>
              <span className="text-sm text-gray-600">Draft</span>
            </div>
            <div className="flex items-center space-x-1">
              <div className="w-3 h-3 rounded-full bg-gray-300"></div>
              <span className="text-sm text-gray-600">Pending</span>
            </div>
          </div>
        </div>

        {/* Comprehensive Search and Filter Bar */}
        <ComprehensiveFilterBar
          searchQuery={playerSearchQuery}
          onSearchChange={setPlayerSearchQuery}
          selectedGroup={selectedGroup}
          onGroupChange={setSelectedGroup}
          selectedCoach={selectedCoach}
          onCoachChange={setSelectedCoach}
          selectedRecommendedGroup={selectedRecommendedGroup}
          onRecommendedGroupChange={setSelectedRecommendedGroup}
          reportStatus={reportStatus}
          onReportStatusChange={setReportStatus}
          onClearAllFilters={clearAllFilters}
          availableGroups={availableGroups}
          availableCoaches={allCoaches}
          availableRecommendedGroups={availableRecommendedGroups}
          totalPlayers={players.length}
          filteredCount={finalFilteredPlayers.length}
        />
        
        {Object.keys(groupedPlayers).length === 0 ? (
          <p className="text-gray-500">
            No reports match your current filter criteria.
          </p>
        ) : (
          <div className="space-y-8">
            {Object.entries(groupedPlayers)
              .sort(([aName], [bName]) => aName.localeCompare(bName))
              .map(([groupName, group], groupIndex) => (
              <div key={`group-${groupIndex}`} className="space-y-4">
                <div className="border-b pb-2">
                  <h3 className="text-xl font-medium text-gray-900">{groupName}</h3>
                </div>
                
                <div className="space-y-6">
                  {Object.entries(group.timeSlots)
                    .sort(([aTime], [bTime]) => sortTimeSlots(aTime, bTime))
                    .map(([timeSlot, players], timeIndex) => (
                    <div key={`time-${groupIndex}-${timeIndex}`} className="bg-gray-50 rounded-lg p-4">
                      <div className="flex justify-between items-center mb-4">
                        <h4 className="font-medium text-gray-900">{timeSlot}</h4>
                        <span className="text-sm text-gray-500">
                          {players.filter(p => p.report_submitted).length}/{players.length} reports completed
                          {players.filter(p => p.has_draft).length > 0 && ` (${players.filter(p => p.has_draft).length} drafts)`}
                        </span>
                      </div>
                      
                      <div className="bg-white rounded-lg divide-y">
                        {players
                          .sort((a, b) => a.student_name.localeCompare(b.student_name))
                          .map((player, playerIndex) => (
                          <div key={`player-${groupIndex}-${timeIndex}-${playerIndex}`} className="p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                            <div className="flex items-center gap-2">
                              <div className={`w-3 h-3 rounded-full ${
                                player.report_submitted ? 'bg-green-500' : 
                                player.has_draft ? 'bg-amber-500' : 'bg-gray-300'
                              }`}></div>
                              <div>
                                <h3 className="font-medium">{player.student_name}</h3>
                                {player.report_submitted ? (
                                  <span className="text-sm text-green-600 font-medium flex items-center">
                                    <div className="w-2 h-2 rounded-full bg-green-500 mr-2"></div>
                                    Report submitted
                                  </span>
                                ) : player.has_draft ? (
                                  <span className="text-sm text-indigo-600 font-medium flex items-center">
                                    <div className="w-2 h-2 rounded-full bg-indigo-500 mr-2"></div>
                                    Draft saved
                                  </span>
                                ) : (
                                  <span className="text-sm text-gray-600 flex items-center">
                                    <div className="w-2 h-2 rounded-full bg-gray-300 mr-2"></div>
                                    Report pending
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex gap-2">
                              {player.report_id ? (
                                <>
                                  {player.report_submitted && (
                                    <button 
                                      onClick={() => handleSingleReportDownload(player.report_id)}
                                      className="inline-flex items-center px-3 py-2 border border-blue-300 shadow-sm text-sm font-medium rounded-md text-blue-700 bg-white hover:bg-blue-50"
                                      title="Download Report"
                                    >
                                      <Download className="w-4 h-4" />
                                    </button>
                                  )}
                                  <a 
                                    href={`/reports/${player.report_id}`}
                                    className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                                  >
                                    View
                                  </a>
                                  {player.can_edit && (
                                  <a
                                    href={`/api/reports/${player.report_id}/edit`}
                                    className={`inline-flex items-center px-3 py-2 border shadow-sm text-sm font-medium rounded-md bg-white ${
                                      player.has_draft 
                                        ? 'border-indigo-300 text-indigo-700 hover:bg-indigo-50' 
                                        : 'border-blue-300 text-blue-700 hover:bg-blue-50'
                                    }`}
                                  >
                                    {player.has_draft ? 'Continue Draft' : 'Edit'}
                                  </a>
                                )}
                                </>
                              ) : (
                                player.can_edit && player.has_template ? (
                                  <a 
                                    href={`/api/report/new/${player.id}`}
                                    className="inline-flex items-center px-3 py-2 border border-green-300 shadow-sm text-sm font-medium rounded-md text-green-700 bg-white hover:bg-green-50"
                                  >
                                    Create Report
                                  </a>
                                ) : (
                                  <span className="text-sm text-gray-500 italic">
                                    No report template has been assigned to this group
                                  </span>
                                )
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;