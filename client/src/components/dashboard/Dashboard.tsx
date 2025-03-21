import { useState, useEffect } from 'react';
import { Download, Send, Menu } from 'lucide-react';
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

  const groupedPlayers = groupPlayersByGroupAndTime(players);
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

      {/* Coach Progress Card */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Coach Progress</h3>
        <div className="space-y-3 max-h-[300px] overflow-y-auto">
          {stats.coachSummaries.map((coach) => (
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

      {/* Group Recommendations Card - FIXED */}
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
                      <div 
                        key={`group-rec-${index}`} 
                        className="p-3 bg-gray-50 rounded-lg flex justify-between items-center"
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

    {/* Movement Analysis Section - Two columns side by side */}
    {stats.groupRecommendations && stats.groupRecommendations.length > 0 && (
      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Group Movement Analysis - FIXED */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Group Movement Analysis</h3>
          <div className="space-y-4 max-h-[400px] overflow-y-auto">
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
              
              // Convert the nested objects to the format needed for rendering
              return Object.entries(sourceGroups)
                .sort(([aGroup], [bGroup]) => aGroup.localeCompare(bGroup))
                .map(([groupName, destinations]) => {
                  // Convert destinations object to array of {to_group, count} objects
                  const movements: Movement[] = Object.entries(destinations).map(([toGroup, count]) => ({
                    from_group: groupName,
                    to_group: toGroup,
                    count
                  }));
                  
                  const totalPlayers = movements.reduce((sum, m) => sum + m.count, 0);
                  
                  return (
                    <div key={`group-${groupName}`} className="border border-gray-200 rounded-lg overflow-hidden">
                      <div className="bg-gray-100 p-3">
                        <h4 className="font-medium text-gray-900">{groupName} ({totalPlayers} players)</h4>
                      </div>
                      <div className="p-3">
                        <div className="space-y-2">
                          {movements
                            .sort((a, b) => b.count - a.count) // Sort by count descending
                            .map((move, idx) => (
                              <div 
                                key={`move-${groupName}-${idx}`} 
                                className="flex justify-between items-center p-2 rounded-md bg-gray-50"
                              >
                                <div className="flex items-center">
                                  <span className="inline-block w-2 h-2 rounded-full bg-blue-500 mr-2"></span>
                                  <span className="font-medium text-gray-900">{move.to_group}</span>
                                </div>
                                <div className="flex items-center space-x-2">
                                  <span className="text-sm">{move.count}</span>
                                  <span className="text-xs text-gray-500">({Math.round((move.count/totalPlayers)*100)}%)</span>
                                </div>
                              </div>
                            ))
                          }
                        </div>
                      </div>
                    </div>
                  );
                });
            })()}
          </div>
        </div>

        {/* Session Movement Analysis - FIXED */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Session Movement Analysis</h3>
          <div className="space-y-4 max-h-[400px] overflow-y-auto">
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
              
              // Sort and convert to the format needed for rendering
              return Object.entries(sessionMap)
                // Group by group name first, then sort by time
                .sort(([aSession], [bSession]) => {
                  // Extract group name
                  const aGroupName = aSession.split(' ')[0];
                  const bGroupName = bSession.split(' ')[0];
                  
                  if (aGroupName !== bGroupName) {
                    return aGroupName.localeCompare(bGroupName);
                  }
                  
                  // Handle special case of 'Unscheduled'
                  if (aSession.includes('Unscheduled')) return 1;
                  if (bSession.includes('Unscheduled')) return -1;
                  
                  // Compare day names
                  const aDayTime = aSession.substring(aGroupName.length + 1);
                  const bDayTime = bSession.substring(bGroupName.length + 1);
                  const aDay = days.findIndex(day => aDayTime.startsWith(day));
                  const bDay = days.findIndex(day => bDayTime.startsWith(day));
                  return aDay - bDay;
                })
                .map(([, sessionData], sessionIdx) => {
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
                      <div className="bg-gray-100 p-3">
                        <h4 className="font-medium text-gray-900">{sessionData.group}</h4>
                        <p className="text-sm text-gray-600">{sessionData.timeSlot}</p>
                      </div>
                      <div className="p-3">
                        <div className="space-y-2">
                          {recommendations
                            .sort((a, b) => b.count - a.count) // Sort only by count descending
                            .map((rec, recIdx) => (
                              <div 
                                key={`session-rec-${sessionIdx}-${recIdx}`}
                                className="flex justify-between items-center p-2 rounded-md bg-gray-50"
                              >
                                <div className="flex items-center">
                                  <span className="inline-block w-2 h-2 rounded-full bg-blue-500 mr-2"></span>
                                  <span className="font-medium text-gray-900">{rec.to_group}</span>
                                </div>
                                <div className="flex items-center space-x-2">
                                  <span className="text-sm">{rec.count}</span>
                                  <span className="text-xs text-gray-500">({Math.round((rec.count/totalPlayers)*100)}%)</span>
                                </div>
                              </div>
                            ))
                          }
                        </div>
                      </div>
                    </div>
                  );
                });
            })()}
          </div>
        </div>
      </div>
    )}
  </>
)}
      {/* Reports Management Section */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-medium text-gray-900">
            {isAdmin ? 'All Reports' : 'My Reports'}
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
          <p className="text-gray-500">No reports available for this period.</p>
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