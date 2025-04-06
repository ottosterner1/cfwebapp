import { useState, useEffect } from 'react';
import { Download, Send, Menu, Filter, X, ChevronRight } from 'lucide-react';
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

const Dashboard = () => {
  const [selectedPeriod, setSelectedPeriod] = useState<number | null>(null);
  const [periods, setPeriods] = useState<TeachingPeriod[]>([]);
  const [stats, setStats] = useState<DashboardMetrics | null>(null);
  const [players, setPlayers] = useState<ProgrammePlayer[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showBulkEmail, setShowBulkEmail] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  
  // Filter state variables
  const [selectedCoach, setSelectedCoach] = useState<number | null>(null);
  const [selectedCoachName, setSelectedCoachName] = useState<string>('');
  const [showCoachFilter, setShowCoachFilter] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [showGroupFilter, setShowGroupFilter] = useState(false);
  const [allCoaches, setAllCoaches] = useState<{id: number, name: string}[]>([]);
  const [filteredPlayers, setFilteredPlayers] = useState<ProgrammePlayer[]>([]);
  const [groupFilterPlayers, setGroupFilterPlayers] = useState<number[]>([]); // IDs of players recommended for a group

  // New state variables for improved movement analysis
  const [analysisTab, setAnalysisTab] = useState<'group' | 'session'>('group');
  const [analysisSearchTerm, setAnalysisSearchTerm] = useState<string>('');
  const [analysisSortOrder, setAnalysisSortOrder] = useState<string>('alphabetical');
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [expandedSessionGroups, setExpandedSessionGroups] = useState<Record<string, boolean>>({});
  const [movementAnalysisExpanded, setMovementAnalysisExpanded] = useState(false);

  // Toggle expanded state for a group
  const toggleGroupExpanded = (groupName: string) => {
    setExpandedGroups(prev => ({
      ...prev,
      [groupName]: !prev[groupName]
    }));
  };

  // Toggle expanded state for a session group
  const toggleSessionGroupExpanded = (groupName: string) => {
    setExpandedSessionGroups(prev => ({
      ...prev,
      [groupName]: !prev[groupName]
    }));
  };

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

  // Extract coaches from stats
  useEffect(() => {
    if (stats?.coachSummaries) {
      setAllCoaches(stats.coachSummaries.map(coach => ({
        id: coach.id,
        name: coach.name
      })));
    }
  }, [stats]);

  // Apply filters (coach and group) to players
  useEffect(() => {
    let filtered = [...players];
    
    // Apply coach filter
    if (selectedCoach !== null) {
      filtered = filtered.filter(player => player.assigned_coach_id === selectedCoach);
    }
    
    // Apply group recommendation filter
    if (selectedGroup !== null && groupFilterPlayers.length > 0) {
      filtered = filtered.filter(player => groupFilterPlayers.includes(player.id));
    }
    
    setFilteredPlayers(filtered);
  }, [selectedCoach, selectedGroup, groupFilterPlayers, players]);

  const handleCoachClick = (coachId: number, coachName: string) => {
    setSelectedCoach(coachId);
    setSelectedCoachName(coachName);
    setShowCoachFilter(true);
  };

  const clearCoachFilter = () => {
    setSelectedCoach(null);
    setSelectedCoachName('');
    setShowCoachFilter(false);
  };

  // Updated handleGroupClick function and useEffect for filtering
  
  const handleGroupClick = async (groupName: string) => {
    try {
      setSelectedGroup(groupName);
      setShowGroupFilter(true);
      
      // Fetch players that are recommended for this group
      if (selectedPeriod) {
        try {
          // Add logging to debug API requests
          console.log(`Fetching players recommended for ${groupName} in period ${selectedPeriod}`);
          
          const response = await fetch(`/api/group-recommendations/players?to_group=${encodeURIComponent(groupName)}&period=${selectedPeriod}`);
          
          if (response.ok) {
            const data = await response.json();
            console.log('API response:', data);
            
            // Extract player IDs for filtering - ensure they are numbers
            const playerIds = data.players.map((id: string | number) => typeof id === 'string' ? parseInt(id, 10) : id);
            console.log('Filtered player IDs:', playerIds);
            
            setGroupFilterPlayers(playerIds);
            
            // If no players found, show a more helpful message
            if (playerIds.length === 0) {
              console.warn('No players found with this recommendation, but they might exist in the database');
            }
          } else {
            // Log error response
            const errorText = await response.text();
            console.error('Error response:', errorText);
            setGroupFilterPlayers([]);
          }
        } catch (error) {
          console.error('Error fetching group player details:', error);
          setGroupFilterPlayers([]);
        }
      }
    } catch (error) {
      console.error('Error setting group filter:', error);
    }
  };

  // Fix filtering effect to handle player IDs correctly
  // Place this inside your component
  useEffect(() => {
    // Add debugging for filter values
    console.log('Filtering state:', {
      selectedCoach,
      selectedGroup,
      groupFilterPlayers: groupFilterPlayers.length > 0 ? `${groupFilterPlayers.length} players` : 'empty',
      totalPlayers: players.length
    });
    
    // Always start with a fresh copy of players
    let filtered = [...players];
    
    // Apply coach filter
    if (selectedCoach !== null) {
      filtered = filtered.filter(player => player.assigned_coach_id === selectedCoach);
      console.log(`After coach filter: ${filtered.length} players`);
    }
    
    // Apply group recommendation filter
    if (selectedGroup !== null && groupFilterPlayers.length > 0) {
      // Ensure we're comparing numbers to numbers, not strings to numbers
      const playerIds = new Set(groupFilterPlayers.map(id => Number(id)));
      filtered = filtered.filter(player => playerIds.has(Number(player.id)));
      console.log(`After group filter: ${filtered.length} players`);
    } else if (selectedGroup !== null) {
      // If we have a selected group but no players, the filtering should return empty
      // Don't return an empty array here - let's log the issue and continue with the same list
      console.warn(`Group '${selectedGroup}' is selected but no matching player IDs were found`);
    }
    
    // Store filtered players for rendering
    setFilteredPlayers(filtered);
  }, [selectedCoach, selectedGroup, groupFilterPlayers, players]);
  

  const clearGroupFilter = () => {
    setSelectedGroup(null);
    setShowGroupFilter(false);
    setGroupFilterPlayers([]);
  };

  const clearAllFilters = () => {
    clearCoachFilter();
    clearGroupFilter();
  };

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

  const handleDownloadAllReports = async () => {
    if (!selectedPeriod) {
      alert('Please select a teaching period');
      return;
    }
  
    try {
      setDownloading(true);
      const response = await fetch(`/api/reports/download-all/${selectedPeriod}`, {
        method: 'GET',
        credentials: 'include'
      });
  
      if (!response.ok) {
        const errorData = response.headers.get('content-type')?.includes('application/json') 
          ? await response.json()
          : { error: 'Failed to download reports' };
        throw new Error(errorData.error || 'Failed to download reports');
      }
  
      const blob = await response.blob();
      const filename = getFilenameFromResponse(response) || 'reports.zip';
      downloadFile(blob, filename);
  
    } catch (error) {
      console.error('Error downloading reports:', error);
      alert('Error downloading reports: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setDownloading(false);
      setShowMobileMenu(false);
    }
  };

  // TypeScript-safe function to handle single report downloads
  const handleSingleReportDownload = (reportId: number | undefined): void => {
    if (!reportId) {
      console.error('No report ID provided');
      return;
    }

    try {
      // Simply open the PDF in a new tab - most reliable cross-browser approach
      window.open(`/download_single_report/${reportId}`, '_blank');
    } catch (error: unknown) {
      console.error('Error opening report:', error);
      // TypeScript-safe error handling
      let errorMessage = 'Unknown error occurred';
      if (error instanceof Error) {
        errorMessage = error.message;
      }
      alert(`Error opening report: ${errorMessage}`);
    }
  };

  const handlePrintAllReports = async () => {
    if (!selectedPeriod) {
      alert('Please select a teaching period');
      return;
    }
  
    try {
      setPrinting(true);
      const response = await fetch(`/api/reports/print-all/${selectedPeriod}`, {
        method: 'GET',
        credentials: 'include'
      });
  
      if (!response.ok) {
        const errorData = response.headers.get('content-type')?.includes('application/json') 
          ? await response.json()
          : { error: 'Failed to print reports' };
        throw new Error(errorData.error || 'Failed to print reports');
      }
  
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      window.open(url, '_blank');
      window.URL.revokeObjectURL(url);
  
    } catch (error) {
      console.error('Error printing reports:', error);
      alert('Error printing reports: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setPrinting(false);
      setShowMobileMenu(false);
    }
  };

  const sortTimeSlots = (aTime: string, bTime: string): number => {
    // Handle "Unscheduled" case
    if (aTime === 'Unscheduled') return 1;
    if (bTime === 'Unscheduled') return -1;
    
    // Extract day and time components
    const [aDay, aTimeRange] = aTime.split(' ');
    const [bDay, bTimeRange] = bTime.split(' ');
    
    // Define day order
    const dayOrder: { [key: string]: number } = {
      'Monday': 1,
      'Tuesday': 2,
      'Wednesday': 3,
      'Thursday': 4,
      'Friday': 5,
      'Saturday': 6,
      'Sunday': 7
    };
    
    // First compare days
    const aDayValue = dayOrder[aDay] || 8;
    const bDayValue = dayOrder[bDay] || 8;
    
    if (aDayValue !== bDayValue) {
      return aDayValue - bDayValue;
    }
    
    // If days are same, compare start times
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

  const getFilenameFromResponse = (response: Response): string | null => {
    const disposition = response.headers.get('Content-Disposition');
    if (disposition) {
      const matches = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/.exec(disposition);
      if (matches?.[1]) {
        return matches[1].replace(/['"]/g, '');
      }
    }
    return null;
  };

  const downloadFile = (blob: Blob, filename: string) => {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  // Function to get a count of draft reports
  const getDraftCount = () => {
    return players.filter(player => player.has_draft).length;
  };

  if (loading) return <div>Loading...</div>;
  if (error) return <div className="text-red-600">Error: {error}</div>;
  if (!stats || !currentUser) return <div>No data available</div>;

  const groupedPlayers = groupPlayersByGroupAndTime(filteredPlayers);
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

        {/* Active Filters Section */}
        {(showCoachFilter || showGroupFilter) && (
          <div className="flex flex-wrap gap-2">
            {/* Coach Filter Badge */}
            {showCoachFilter && (
              <div className="flex items-center bg-blue-50 border border-blue-200 p-2 rounded-md">
                <Filter className="w-4 h-4 text-blue-600 mr-2" />
                <span className="text-blue-800 font-medium">Coach: {selectedCoachName}</span>
                <button 
                  onClick={clearCoachFilter}
                  className="ml-2 text-blue-600 hover:text-blue-800"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
            
            {/* Group Filter Badge */}
            {showGroupFilter && (
              <div className="flex items-center bg-green-50 border border-green-200 p-2 rounded-md">
                <Filter className="w-4 h-4 text-green-600 mr-2" />
                <span className="text-green-800 font-medium">Recommended for: {selectedGroup}</span>
                <button 
                  onClick={clearGroupFilter}
                  className="ml-2 text-green-600 hover:text-green-800"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
            
            {/* Clear All Filters Button - Show only when multiple filters are active */}
            {showCoachFilter && showGroupFilter && (
              <button
                onClick={clearAllFilters}
                className="text-sm text-gray-600 hover:text-gray-900 underline"
              >
                Clear all filters
              </button>
            )}
          </div>
        )}

        {/* Draft Reports Alert - Show if there are drafts */}
        {draftCount > 0 && (
          <div className="bg-indigo-50 border border-indigo-200 p-3 rounded-md text-indigo-800">
            <span className="font-medium">You have {draftCount} report draft{draftCount !== 1 ? 's' : ''}</span>
            <span className="ml-2">These reports need to be finalised before they can be sent out.</span>
          </div>
        )}

        {/* Controls Section */}
        <div className={`flex flex-col md:flex-row gap-4 ${showMobileMenu ? 'block' : 'hidden md:flex'}`}>
          {/* Period Selector - Full width on mobile */}
          <select
            className="w-full md:w-auto rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            value={selectedPeriod || ''}
            onChange={(e) => setSelectedPeriod(e.target.value ? Number(e.target.value) : null)}
          >
            {periods.map((period) => (
              <option key={period.id} value={period.id}>{period.name}</option>
            ))}
          </select>

          {/* Coach Filter Dropdown - For admins only */}
          {isAdmin && allCoaches.length > 0 && (
            <select
              className="w-full md:w-auto rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              value={selectedCoach || ''}
              onChange={(e) => {
                const value = e.target.value;
                if (value === '') {
                  clearCoachFilter();
                } else {
                  const coachId = Number(value);
                  const coach = allCoaches.find(c => c.id === coachId);
                  if (coach) {
                    handleCoachClick(coachId, coach.name);
                  }
                }
              }}
            >
              <option value="">All Coaches</option>
              {allCoaches.map((coach) => (
                <option key={coach.id} value={coach.id}>{coach.name}</option>
              ))}
            </select>
          )}

          {/* Admin Actions */}
          {isAdmin && (
            <div className="flex flex-col md:flex-row gap-2">
              <button
                onClick={handleDownloadAllReports}
                disabled={!selectedPeriod || !stats?.submittedReports || downloading}
                className="w-full md:w-auto px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 
                         flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Download className="w-4 h-4" />
                <span className="md:hidden lg:inline">Download All</span>
                {stats?.submittedReports > 0 && !downloading && (
                  <span className="bg-blue-500 px-2 py-0.5 rounded-full text-sm">
                    {stats.submittedReports}
                  </span>
                )}
              </button>

              <button
                onClick={handlePrintAllReports}
                disabled={!selectedPeriod || !stats?.submittedReports || printing}
                className="w-full md:w-auto px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 
                         flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span>{printing ? 'Preparing...' : 'Print All'}</span>
                {stats?.submittedReports > 0 && !printing && (
                  <span className="bg-purple-500 px-2 py-0.5 rounded-full text-sm">
                    {stats.submittedReports}
                  </span>
                )}
              </button>

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

      {/* Admin Analytics Section */}
      {isAdmin && stats.coachSummaries && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Group Progress Card */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Group Progress</h3>
              <div className="space-y-3 max-h-[300px] overflow-y-auto">
                {stats.currentGroups.map((group) => (
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

            {/* Coach Progress Card - ENHANCED: Made coach names clickable */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Coach Progress</h3>
              <div className="space-y-3 max-h-[300px] overflow-y-auto">
                {stats.coachSummaries.map((coach) => (
                  <div 
                    key={coach.id} 
                    className={`p-3 ${selectedCoach === coach.id ? 'bg-blue-50 border border-blue-200' : 'bg-gray-50'} 
                      rounded-lg flex flex-col transition-colors duration-150 ease-in-out`}
                  >
                    <div className="flex justify-between items-center">
                      <button 
                        onClick={() => handleCoachClick(coach.id, coach.name)}
                        className="font-medium text-left hover:text-blue-700 transition-colors flex items-center"
                      >
                        <span className={selectedCoach === coach.id ? 'text-blue-700' : 'text-gray-900'}>
                          {coach.name}
                        </span>
                        <ChevronRight className={`w-4 h-4 ml-1 ${selectedCoach === coach.id ? 'text-blue-500' : 'text-gray-400'}`} />
                      </button>
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
                        className={`h-2 rounded-full ${selectedCoach === coach.id ? 'bg-blue-500' : 'bg-blue-600'}`} 
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

            {/* Group Recommendations Card - Made group names clickable filters */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Group Recommendations</h3>
              {stats.groupRecommendations && stats.groupRecommendations.length > 0 ? (
                <div className="space-y-3">
                  {/* Destination Groups - With proper deduplication */}
                  <div className="space-y-2 max-h-[300px] overflow-y-auto">
                    {(() => {
                      // Create a mapping of destination groups to total counts
                      const destinationGroups: Record<string, number> = {};
                      let totalPlayers = 0;
                      
                      // First pass: aggregate all recommendations by destination
                      stats.groupRecommendations.forEach(rec => {
                        destinationGroups[rec.to_group] = (destinationGroups[rec.to_group] || 0) + rec.count;
                        totalPlayers += rec.count;
                      });
                      
                      // Sort and render the groups
                      return Object.entries(destinationGroups)
                        .sort((a, b) => b[1] - a[1]) // Sort by count descending
                        .map(([group, count], index) => {
                          const percentage = Math.round((count / totalPlayers) * 100);
                          return (
                            <button 
                              key={`group-rec-${index}`} 
                              className={`p-3 ${selectedGroup === group ? 'bg-green-50 border border-green-200' : 'bg-gray-50'} 
                                w-full rounded-lg flex justify-between items-center text-left transition-colors 
                                hover:bg-green-50 hover:border hover:border-green-200`}
                              onClick={() => handleGroupClick(group)}
                            >
                              <div className="flex items-center">
                                <span className={`font-medium ${selectedGroup === group ? 'text-green-700' : 'text-gray-900'}`}>
                                  {group}
                                </span>
                                <ChevronRight className={`w-4 h-4 ml-1 ${selectedGroup === group ? 'text-green-500' : 'text-gray-400'}`} />
                              </div>
                              <div className="flex items-center">
                                <span className={`text-sm ${selectedGroup === group ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'} px-3 py-1 rounded-full`}>
                                  {count} {count === 1 ? 'player' : 'players'}
                                </span>
                                <span className="text-xs text-gray-500 ml-2">({percentage}%)</span>
                              </div>
                            </button>
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

          {/* Movement Analysis Section - Collapsible by default */}
          {stats.groupRecommendations && stats.groupRecommendations.length > 0 && (
            <div className="mt-6">
              {/* Section header with toggle */}
              <div 
                className="bg-white rounded-t-lg shadow p-4 flex justify-between items-center cursor-pointer hover:bg-gray-50"
                onClick={() => setMovementAnalysisExpanded(prev => !prev)}
              >
                <h3 className="text-lg font-medium text-gray-900">Movement Analysis</h3>
                <div className="flex items-center">
                  <span className="text-sm text-gray-500 mr-2">
                    {movementAnalysisExpanded ? 'Collapse' : 'Expand'} section
                  </span>
                  <button className="text-gray-500 p-1">
                    {movementAnalysisExpanded ? (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
              
              {/* Expanded content - only shown when toggled */}
              {movementAnalysisExpanded && (
                <div className="bg-white rounded-b-lg shadow">
                  {/* Tabs for switching between analysis views */}
                  <div className="flex border-b">
                    <button 
                      onClick={() => setAnalysisTab('group')}
                      className={`px-4 py-3 text-sm font-medium ${analysisTab === 'group' 
                        ? 'border-b-2 border-blue-500 text-blue-600' 
                        : 'text-gray-500 hover:text-gray-700'}`}
                    >
                      Group Movement
                    </button>
                    <button 
                      onClick={() => setAnalysisTab('session')}
                      className={`px-4 py-3 text-sm font-medium ${analysisTab === 'session' 
                        ? 'border-b-2 border-blue-500 text-blue-600' 
                        : 'text-gray-500 hover:text-gray-700'}`}
                    >
                      Session Movement
                    </button>
                  </div>
                  
                  {/* Search and Filter Controls */}
                  <div className="p-4 border-b">
                    <div className="flex flex-col sm:flex-row gap-3">
                      <div className="relative grow">
                        <input
                          type="text"
                          placeholder={`Search ${analysisTab === 'group' ? 'groups' : 'sessions'}...`}
                          value={analysisSearchTerm}
                          onChange={(e) => setAnalysisSearchTerm(e.target.value)}
                          className="w-full rounded-md border-gray-300 pl-10 focus:border-blue-500 focus:ring-blue-500"
                        />
                        <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                          </svg>
                        </div>
                      </div>
                      
                      <select 
                        className="rounded-md border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                        value={analysisSortOrder}
                        onChange={(e) => setAnalysisSortOrder(e.target.value)}
                      >
                        <option value="alphabetical">Sort Alphabetically</option>
                        <option value="count">Sort by Count</option>
                        <option value="percentage">Sort by Percentage</option>
                      </select>
                    </div>
                  </div>
                  
                  {/* Group Movement Analysis Tab Content */}
                  {analysisTab === 'group' && (
                    <div className="p-4">
                      <div className="space-y-4 max-h-[500px] overflow-y-auto">
                        {(() => {
                          // Define types for our data structures
                          type Movement = {
                            from_group: string;
                            to_group: string;
                            count: number;
                          };
                          
                          type GroupMovementMap = Record<string, Record<string, number>>;
                          
                          // First, create a deduplicated map of source groups to destination groups
                          const sourceGroups: GroupMovementMap = {};
                          
                          // Group recommendations by source group and deduplicate
                          stats.groupRecommendations.forEach(rec => {
                            if (!sourceGroups[rec.from_group]) {
                              sourceGroups[rec.from_group] = {};
                            }
                            
                            // Add or increment the count for this destination
                            sourceGroups[rec.from_group][rec.to_group] = 
                              (sourceGroups[rec.from_group][rec.to_group] || 0) + rec.count;
                          });
                          
                          // Get sorted list of groups based on current search and sort settings
                          let groupEntries = Object.entries(sourceGroups);
                          
                          // Apply search filter
                          if (analysisSearchTerm) {
                            groupEntries = groupEntries.filter(([groupName]) => 
                              groupName.toLowerCase().includes(analysisSearchTerm.toLowerCase())
                            );
                          }
                          
                          // Apply sort
                          if (analysisSortOrder === 'alphabetical') {
                            groupEntries.sort(([aGroup], [bGroup]) => aGroup.localeCompare(bGroup));
                          } else if (analysisSortOrder === 'count') {
                            groupEntries.sort(([, aDestinations], [, bDestinations]) => {
                              const aTotal = Object.values(aDestinations).reduce((sum, count) => sum + count, 0);
                              const bTotal = Object.values(bDestinations).reduce((sum, count) => sum + count, 0);
                              return bTotal - aTotal; // Descending
                            });
                          }
                          
                          // If no groups to show
                          if (groupEntries.length === 0) {
                            return (
                              <div className="text-center py-8 text-gray-500">
                                No groups match your search criteria
                              </div>
                            );
                          }
                          
                          // Convert the nested objects to the format needed for rendering
                          return groupEntries.map(([groupName, destinations]) => {
                            // Convert destinations object to array of {to_group, count} objects
                            const movements: Movement[] = Object.entries(destinations).map(([toGroup, count]) => ({
                              from_group: groupName,
                              to_group: toGroup,
                              count
                            }));
                            
                            const totalPlayers = movements.reduce((sum, m) => sum + m.count, 0);
                            
                            // Determine if this group should be expanded
                            const isExpanded = expandedGroups[groupName] !== false; // Default to expanded
                            
                            return (
                              <div key={`group-${groupName}`} className="border border-gray-200 rounded-lg overflow-hidden">
                                <div 
                                  className="bg-gray-100 p-3 flex justify-between items-center cursor-pointer hover:bg-gray-200"
                                  onClick={() => toggleGroupExpanded(groupName)}
                                >
                                  <h4 className="font-medium text-gray-900">{groupName} ({totalPlayers} players)</h4>
                                  <button className="text-gray-500 p-1">
                                    {isExpanded ? (
                                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                      </svg>
                                    ) : (
                                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                      </svg>
                                    )}
                                  </button>
                                </div>
                                
                                {isExpanded && (
                                  <div className="p-3">
                                    <div className="space-y-2">
                                      {movements
                                        .sort((a, b) => b.count - a.count) // Sort by count descending
                                        .map((move, idx) => (
                                          <button 
                                            key={`move-${groupName}-${idx}`} 
                                            className={`flex justify-between items-center p-2 rounded-md w-full text-left
                                              ${selectedGroup === move.to_group ? 'bg-green-50 border border-green-200' : 'bg-gray-50'}
                                              hover:bg-green-50 hover:border hover:border-green-200 transition-colors`}
                                            onClick={() => handleGroupClick(move.to_group)}
                                          >
                                            <div className="flex items-center">
                                              <span className="inline-block w-2 h-2 rounded-full bg-blue-500 mr-2"></span>
                                              <span className={`font-medium ${selectedGroup === move.to_group ? 'text-green-700' : 'text-gray-900'}`}>
                                                {move.to_group}
                                              </span>
                                              <ChevronRight className={`w-4 h-4 ml-1 ${selectedGroup === move.to_group ? 'text-green-500' : 'text-gray-400'}`} />
                                            </div>
                                            <div className="flex items-center space-x-2">
                                              <span className="text-sm">{move.count}</span>
                                              <span className="text-xs text-gray-500">({Math.round((move.count/totalPlayers)*100)}%)</span>
                                            </div>
                                          </button>
                                        ))
                                      }
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          });
                        })()}
                      </div>
                    </div>
                  )}
                  
                  {/* Session Movement Analysis Tab Content */}
                  {analysisTab === 'session' && (
                    <div className="p-4">
                      <div className="space-y-4 max-h-[500px] overflow-y-auto">
                        {(() => {
                          // Define types for our data structures
                          type SessionRecommendation = {
                            to_group: string;
                            count: number;
                            staying: boolean;
                          };
                          
                          type SessionData = {
                            group: string;
                            timeSlot: string;
                            recommendations: Record<string, number>;
                          };
                          
                          type SessionMap = Record<string, SessionData>;
                          
                          // Create a map of session keys to session data with deduplicated recommendations
                          const sessionMap: SessionMap = {};
                          
                          // Group recommendations by session and deduplicate
                          stats.groupRecommendations.forEach(rec => {
                            // Create session key
                            const sessionKey = rec.session
                              ? `${rec.from_group} ${rec.session.day_of_week} ${rec.session.start_time}-${rec.session.end_time}`
                              : `${rec.from_group} Unscheduled`;
                            
                            // Initialize session data if not exists
                            if (!sessionMap[sessionKey]) {
                              sessionMap[sessionKey] = {
                                group: rec.from_group,
                                timeSlot: rec.session 
                                  ? `${rec.session.day_of_week} ${rec.session.start_time}-${rec.session.end_time}` 
                                  : 'Unscheduled',
                                recommendations: {}
                              };
                            }
                            
                            // Add or increment the count for this destination
                            sessionMap[sessionKey].recommendations[rec.to_group] = 
                              (sessionMap[sessionKey].recommendations[rec.to_group] || 0) + rec.count;
                          });
                          
                          // Days array for sorting
                          const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
                          
                          // Get entries from the session map
                          let sessionEntries = Object.entries(sessionMap);
                          
                          // Apply search filter
                          if (analysisSearchTerm) {
                            sessionEntries = sessionEntries.filter(([, sessionData]) => {
                              const searchText = `${sessionData.group} ${sessionData.timeSlot}`.toLowerCase();
                              return searchText.includes(analysisSearchTerm.toLowerCase());
                            });
                          }
                          
                          // Group sessions by group name for collapsible display
                          const sessionsByGroup: Record<string, [string, SessionData][]> = {};
                          sessionEntries.forEach(([, sessionData]) => {
                            const groupName = sessionData.group;
                            if (!sessionsByGroup[groupName]) {
                              sessionsByGroup[groupName] = [];
                            }
                            sessionsByGroup[groupName].push(['', sessionData]);
                          });
                          
                          // Sort group names
                          let groupNames = Object.keys(sessionsByGroup);
                          groupNames.sort((a, b) => a.localeCompare(b));
                          
                          // If no sessions to show
                          if (groupNames.length === 0) {
                            return (
                              <div className="text-center py-8 text-gray-500">
                                No sessions match your search criteria
                              </div>
                            );
                          }
                          
                          return groupNames.map(groupName => {
                            const isExpanded = expandedSessionGroups[groupName] !== false; // Default to expanded
                            
                            // Get and sort sessions for this group
                            const groupSessions = sessionsByGroup[groupName];
                            groupSessions.sort(([, aData], [, bData]) => {
                              // Unscheduled sessions go last
                              if (aData.timeSlot === 'Unscheduled') return 1;
                              if (bData.timeSlot === 'Unscheduled') return -1;
                              
                              // Extract day and sort by day order
                              const aDay = aData.timeSlot.split(' ')[0];
                              const bDay = bData.timeSlot.split(' ')[0];
                              
                              const aDayIndex = days.indexOf(aDay);
                              const bDayIndex = days.indexOf(bDay);
                              
                              if (aDayIndex !== bDayIndex) {
                                return aDayIndex - bDayIndex;
                              }
                              
                              // Then sort by time
                              const aTime = aData.timeSlot.split(' ')[1]?.split('-')[0];
                              const bTime = bData.timeSlot.split(' ')[1]?.split('-')[0];
                              
                              return aTime?.localeCompare(bTime || '') || 0;
                            });
                            
                            return (
                              <div key={`session-group-${groupName}`} className="border border-gray-200 rounded-lg overflow-hidden mb-4">
                                <div 
                                  className="bg-gray-100 p-3 flex justify-between items-center cursor-pointer hover:bg-gray-200"
                                  onClick={() => toggleSessionGroupExpanded(groupName)}
                                >
                                  <h4 className="font-medium text-gray-900">{groupName} ({groupSessions.length} sessions)</h4>
                                  <button className="text-gray-500 p-1">
                                    {isExpanded ? (
                                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                      </svg>
                                    ) : (
                                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                      </svg>
                                    )}
                                  </button>
                                </div>
                                
                                {isExpanded && (
                                  <div className="p-3">
                                    <div className="grid gap-4 md:grid-cols-1 lg:grid-cols-2">
                                      {groupSessions.map(([, sessionData], sessionIdx) => {
                                        // Convert recommendations object to array for rendering
                                        const recommendations: SessionRecommendation[] = Object.entries(sessionData.recommendations)
                                          .map(([toGroup, count]) => ({
                                            to_group: toGroup,
                                            count,
                                            staying: sessionData.group === toGroup
                                          }));
                                        
                                        const totalPlayers = recommendations.reduce((sum, rec) => sum + rec.count, 0);
                                        
                                        return (
                                          <div key={`session-${sessionIdx}`} className="border border-gray-200 rounded-lg overflow-hidden">
                                            <div className="bg-gray-50 p-3">
                                              <p className="text-sm font-medium text-gray-900">{sessionData.timeSlot}</p>
                                            </div>
                                            <div className="p-3">
                                              <div className="space-y-2">
                                                {recommendations
                                                  .sort((a, b) => b.count - a.count) // Sort only by count descending
                                                  .map((rec, recIdx) => (
                                                    <button 
                                                      key={`session-rec-${sessionIdx}-${recIdx}`}
                                                      className={`flex justify-between items-center p-2 rounded-md w-full text-left
                                                        ${selectedGroup === rec.to_group ? 'bg-green-50 border border-green-200' : 'bg-gray-50'}
                                                        hover:bg-green-50 hover:border hover:border-green-200 transition-colors`}
                                                      onClick={() => handleGroupClick(rec.to_group)}
                                                    >
                                                      <div className="flex items-center">
                                                        <span className="inline-block w-2 h-2 rounded-full bg-blue-500 mr-2"></span>
                                                        <span className={`font-medium ${selectedGroup === rec.to_group ? 'text-green-700' : 'text-gray-900'}`}>
                                                          {rec.to_group}
                                                        </span>
                                                        <ChevronRight className={`w-4 h-4 ml-1 ${selectedGroup === rec.to_group ? 'text-green-500' : 'text-gray-400'}`} />
                                                      </div>
                                                      <div className="flex items-center space-x-2">
                                                        <span className="text-sm">{rec.count}</span>
                                                        <span className="text-xs text-gray-500">({Math.round((rec.count/totalPlayers)*100)}%)</span>
                                                      </div>
                                                    </button>
                                                  ))
                                                }
                                              </div>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          });
                        })()}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Reports Management Section */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-medium text-gray-900">
            {isAdmin ? (
              (() => {
                if (selectedCoach && selectedGroup) {
                  return `Reports for ${selectedCoachName} recommended for ${selectedGroup}`;
                } else if (selectedCoach) {
                  return `Reports for ${selectedCoachName}`;
                } else if (selectedGroup) {
                  return `Reports recommended for ${selectedGroup}`;
                } else {
                  return 'All Reports';
                }
              })()
            ) : 'My Reports'}
          </h2>
          
          {/* Report Status Filter */}
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
        
        {Object.keys(groupedPlayers).length === 0 ? (
          <p className="text-gray-500">
            {(() => {
              if (selectedCoach && selectedGroup) {
                return `No reports available for ${selectedCoachName} recommended for ${selectedGroup}.`;
              } else if (selectedCoach) {
                return `No reports available for ${selectedCoachName}.`;
              } else if (selectedGroup) {
                return `No reports available recommended for ${selectedGroup}.`;
              } else {
                return 'No reports available for this period.';
              }
            })()}
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
                                // For reports that exist (either draft or submitted)
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
                                    href={`/reports/${player.report_id}/edit`}
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
                                // For reports that don't exist yet
                                player.can_edit && player.has_template ? (
                                  <a 
                                    href={`/report/new/${player.id}`}
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