import React, { useState} from 'react';
import { Card } from '../../components/ui/card';
import { 
  Users, 
  Calendar, 
  PieChart as PieChartIcon, 
  BarChart2, 
  ChevronDown, 
  ChevronUp
} from 'lucide-react';

interface TimeSlot {
  day_of_week: string;
  start_time: string;
  end_time: string;
  capacity?: number;
}

interface Player {
  id: number;
  student_name: string;
  group_name: string;
  group_id: number;
  group_time_id: number;
  time_slot?: TimeSlot;
  report_submitted: boolean;
  report_id: number | null;
  can_edit: boolean;
}

interface ProgrammeAnalyticsProps {
  players: Player[];
}

interface SessionInfo {
  count: number;
  group: string;
  groupId: number;
  timeId: number;
  dayOfWeek: string;
  timeSlot: string;
  capacity?: number;
}

interface GroupCapacityInfo {
  name: string;
  playerCount: number;
  totalCapacity: number;
  fillPercentage: number;
}

const ProgrammeAnalytics: React.FC<ProgrammeAnalyticsProps> = ({ players }) => {
  const [expanded, setExpanded] = useState(true); // Start expanded
  const [activeTab, setActiveTab] = useState<'overview' | 'groups'>('overview');

  // Helper function to get day order value - handles case and whitespace
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
    return DAY_ORDER[normalizedDay] || 999; // Default to high number if not found
  };

  // Helper function to convert time string to numerical minutes for sorting
  const getTimeValue = (timeStr: string): number => {
    // Extract just the hours and minutes from the start time
    const [time] = timeStr.split('-');
    const [hoursStr, minutesStr] = time.trim().split(':');
    
    // Convert to integers
    let hours = parseInt(hoursStr, 10);
    const minutes = parseInt(minutesStr, 10) || 0;
    
    // Handle 12-hour format if needed (assuming afternoon lessons)
    // If time seems to be in 12-hour format (1-8), convert to 24-hour
    // This assumes tennis lessons don't happen between 1-8 AM
    if (hours > 0 && hours < 9) {
      hours += 12;
    }
    
    // Return a numerical value for sorting (hours * 60 + minutes)
    return hours * 60 + minutes;
  };

  const scrollToSession = (groupId: number, timeId: number) => {
    const elementId = `group-${groupId}-time-${timeId}`;
    const element = document.getElementById(elementId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Add a highlight effect
      element.classList.add('bg-yellow-100');
      setTimeout(() => {
        element.classList.remove('bg-yellow-100');
      }, 2000);
    }
  };

  const analytics = React.useMemo(() => {
    const summary = {
      totalPlayers: players.length,
      totalCapacity: 0,
      groupBreakdown: {} as Record<string, number>,
      sessionBreakdown: {} as Record<string, SessionInfo>,
      groupCapacityBreakdown: {} as Record<string, GroupCapacityInfo>,
      uniqueStudents: new Set<string>()
    };

    // First pass: collect all group capacities from time slots
    interface GroupCapacity {
      slots: number;
      capacity: number;
      [key: string]: number | boolean; // Allow both number properties and boolean flags
    }
    const groupCapacities: Record<string, GroupCapacity> = {};

    players.forEach(player => {
      // Track unique students
      summary.uniqueStudents.add(player.student_name);
      
      const groupName = player.group_name;
      
      // Initialize groupCapacities entry if needed
      if (!groupCapacities[groupName]) {
        groupCapacities[groupName] = { slots: 0, capacity: 0 } as GroupCapacity;
      }

      // Group breakdown (player count per group)
      summary.groupBreakdown[groupName] = 
        (summary.groupBreakdown[groupName] || 0) + 1;

      // Session breakdown
      if (player.time_slot) {
        // Add to total capacity once per unique time slot
        const timeSlotKey = `${groupName}|${player.time_slot.day_of_week}|${player.time_slot.start_time}-${player.time_slot.end_time}`;
        
        // Include day_of_week in the sessionKey to distinguish between sessions on different days
        const sessionKey = `${groupName} ${player.time_slot.day_of_week} ${player.time_slot.start_time}-${player.time_slot.end_time}`;
        
        if (!summary.sessionBreakdown[sessionKey]) {
          summary.sessionBreakdown[sessionKey] = {
            count: 0,
            group: groupName,
            groupId: player.group_id,
            timeId: player.group_time_id,
            dayOfWeek: player.time_slot.day_of_week,
            timeSlot: `${player.time_slot.start_time}-${player.time_slot.end_time}`,
            capacity: player.time_slot.capacity
          };

          // Only count capacity once per unique session (to avoid double counting)
          if (!groupCapacities[groupName][timeSlotKey]) {
            groupCapacities[groupName].slots += 1;
            groupCapacities[groupName].capacity += (player.time_slot.capacity || 0);
            summary.totalCapacity += (player.time_slot.capacity || 0);
            
            // Mark this time slot as counted
            groupCapacities[groupName][timeSlotKey] = true;
          }
        }
        summary.sessionBreakdown[sessionKey].count += 1;
      }
    });

    // Calculate group capacity metrics
    Object.keys(summary.groupBreakdown).forEach(groupName => {
      const playerCount = summary.groupBreakdown[groupName];
      const totalCapacity = groupCapacities[groupName]?.capacity || 0;
      const fillPercentage = totalCapacity > 0 ? (playerCount / totalCapacity) * 100 : 0;

      summary.groupCapacityBreakdown[groupName] = {
        name: groupName,
        playerCount,
        totalCapacity,
        fillPercentage
      };
    });

    return summary;
  }, [players]);

  const getCapacityDisplay = (session: SessionInfo) => {
    if (!session.capacity) {
      return `${session.count}`;
    }
    
    const isFull = session.count >= (session.capacity || 0);
    const capacityText = `${session.count}/${session.capacity}`;
    
    return (
      <span className={`${isFull ? 'text-green-600' : 'text-gray-900'}`}>
        {capacityText}
        {isFull && ' (Full)'}
      </span>
    );
  };

  const getCapacityColor = (session: SessionInfo) => {
    if (!session.capacity) return 'bg-gray-50';
    
    const ratio = session.count / (session.capacity || 1);
    if (ratio >= 1) return 'bg-green-50';
    if (ratio >= 0.8) return 'bg-yellow-50';
    return 'bg-gray-50';
  };

  if (!players || players.length === 0) {
    return null;
  }

  // Calculate duplicate students
  const duplicateCount = players.length - analytics.uniqueStudents.size;

  return (
    <div className="mb-8 bg-white border rounded-lg shadow-sm overflow-hidden">
      <div 
        className="flex justify-between items-center p-4 bg-indigo-50 border-b cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center">
          <Users className="h-5 w-5 text-indigo-600 mr-2" />
          <h3 className="font-medium text-indigo-900">Programme Analytics</h3>
          {duplicateCount > 0 && (
            <span className="ml-2 text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full">
              {duplicateCount} students in multiple groups
            </span>
          )}
        </div>
        {expanded ? (
          <ChevronUp className="h-5 w-5 text-indigo-600" />
        ) : (
          <ChevronDown className="h-5 w-5 text-indigo-600" />
        )}
      </div>
      
      {expanded && (
        <div className="p-4">
          {/* Tab Navigation */}
          <div className="flex border-b mb-6">
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-4 py-2 font-medium ${
                activeTab === 'overview' 
                  ? 'text-indigo-600 border-b-2 border-indigo-600' 
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => setActiveTab('groups')}
              className={`px-4 py-2 font-medium ${
                activeTab === 'groups' 
                  ? 'text-indigo-600 border-b-2 border-indigo-600' 
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Groups
            </button>
          </div>
          
          {/* Tab Content */}
          {activeTab === 'overview' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Total Players and Capacity Card with Group Fill Rate */}
              <Card className="p-4 bg-white rounded-lg shadow">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-md font-medium text-gray-900">Programme Totals</h3>
                  <div className="bg-blue-100 p-1.5 rounded-full">
                    <Users className="h-4 w-4 text-blue-600" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center mb-3">
                  <div className="bg-gray-50 rounded p-2">
                    <div className="text-xs text-gray-500">Players</div>
                    <div className="text-lg font-semibold text-gray-900">{analytics.totalPlayers}</div>
                  </div>
                  <div className="bg-gray-50 rounded p-2">
                    <div className="text-xs text-gray-500">Capacity</div>
                    <div className="text-lg font-semibold text-gray-900">{analytics.totalCapacity}</div>
                  </div>
                  <div className="bg-gray-50 rounded p-2">
                    <div className="text-xs text-gray-500">Fill Rate</div>
                    <div className="text-lg font-semibold text-gray-900">
                      {analytics.totalCapacity > 0 
                        ? `${Math.round((analytics.totalPlayers / analytics.totalCapacity) * 100)}%` 
                        : 'N/A'}
                    </div>
                  </div>
                </div>
                
                {/* Group Fill Rate Section */}
                <div className="pt-2 border-t border-gray-200">
                  <h4 className="text-sm font-medium text-gray-900 mb-2 flex items-center">
                    <BarChart2 className="h-3.5 w-3.5 text-indigo-600 mr-1.5" />
                    Group Fill Rates
                  </h4>
                  <div className="space-y-2 max-h-[120px] overflow-y-auto pr-1">
                    {Object.values(analytics.groupCapacityBreakdown)
                      .sort((a, b) => a.name.localeCompare(b.name)) // Sort alphabetically by group name
                      .map((group) => (
                        <div key={group.name} className="space-y-1">
                          <div className="flex justify-between items-center text-xs">
                            <span className="font-medium text-gray-900">{group.name}</span>
                            <span className="text-gray-600">
                              {group.playerCount}/{group.totalCapacity} ({Math.round(group.fillPercentage)}%)
                            </span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-1.5">
                            <div 
                              className={`h-1.5 rounded-full ${
                                group.fillPercentage >= 95 ? 'bg-green-500' : 
                                group.fillPercentage >= 80 ? 'bg-yellow-500' : 
                                'bg-indigo-500'
                              }`}
                              style={{ width: `${Math.min(100, group.fillPercentage)}%` }}
                            ></div>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              </Card>

              {/* Group Breakdown Card sorted by size */}
              <Card className="p-4 bg-white rounded-lg shadow">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-md font-medium text-gray-900">Group Breakdown</h3>
                  <div className="bg-purple-100 p-1.5 rounded-full">
                    <PieChartIcon className="h-4 w-4 text-purple-600" />
                  </div>
                </div>
                <div className="space-y-2 max-h-[180px] overflow-y-auto pr-1">
                  {Object.entries(analytics.groupBreakdown)
                    .sort((a, b) => b[1] - a[1]) // Sort by player count (largest to smallest)
                    .map(([group, count]) => (
                      <div key={group} className="bg-gray-50 rounded p-2 flex justify-between items-center">
                        <span className="text-sm font-medium text-gray-900">{group}</span>
                        <span className="text-sm font-semibold text-gray-900">
                          {count}
                        </span>
                      </div>
                    ))}
                </div>
              </Card>

              {/* Session Breakdown Card with clickable sessions */}
              <Card className="p-4 bg-white rounded-lg shadow">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-md font-medium text-gray-900">Session Breakdown</h3>
                  <div className="bg-green-100 p-1.5 rounded-full">
                    <Calendar className="h-4 w-4 text-green-600" />
                  </div>
                </div>
                <div className="bg-gray-50 rounded p-2 mb-3 text-center">
                  <div className="text-xs text-gray-500">Total Sessions</div>
                  <div className="text-lg font-semibold text-gray-900">
                    {Object.keys(analytics.sessionBreakdown).length}
                  </div>
                </div>
                
                {/* Group sessions by group name first */}
                <div className="space-y-3 max-h-[150px] overflow-y-auto pr-1">
                  {Object.entries(
                    // First group sessions by group name
                    Object.values(analytics.sessionBreakdown).reduce((groups, session) => {
                      if (!groups[session.group]) {
                        groups[session.group] = [];
                      }
                      groups[session.group].push(session);
                      return groups;
                    }, {} as Record<string, SessionInfo[]>)
                  )
                    .sort((a, b) => a[0].localeCompare(b[0])) // Sort groups alphabetically
                    .map(([groupName, sessions]) => (
                      <div key={groupName} className="bg-gray-100 rounded p-2">
                        <div className="font-medium text-sm text-gray-900 mb-1">{groupName}</div>
                        <div className="space-y-1.5 pl-2">
                          {sessions
                            .sort((a, b) => {
                              // Sort by day of week first
                              const dayOrderA = getDayOrder(a.dayOfWeek);
                              const dayOrderB = getDayOrder(b.dayOfWeek);
                              if (dayOrderA !== dayOrderB) return dayOrderA - dayOrderB;
                              
                              // Then sort by time
                              const timeValueA = getTimeValue(a.timeSlot);
                              const timeValueB = getTimeValue(b.timeSlot);
                              return timeValueA - timeValueB;
                            })
                            .map((session) => (
                              <div 
                                key={`${session.group}-${session.dayOfWeek}-${session.timeSlot}`}
                                className={`rounded px-2 py-1.5 ${getCapacityColor(session)} cursor-pointer hover:shadow transition-shadow hover:bg-opacity-80`}
                                onClick={() => scrollToSession(session.groupId, session.timeId)}
                                title="Click to navigate to this session"
                              >
                                <div className="flex justify-between items-center text-xs">
                                  <span className="text-gray-700">
                                    {session.dayOfWeek} {session.timeSlot}
                                  </span>
                                  <span className="font-medium">
                                    {getCapacityDisplay(session)}
                                  </span>
                                </div>
                              </div>
                            ))}
                        </div>
                      </div>
                    ))}
                </div>
              </Card>
            </div>
          )}

          {activeTab === 'groups' && (
            <div>
              <div className="p-4 bg-gray-50 rounded-lg">
                <h5 className="font-medium text-gray-800 mb-4">Group Capacity</h5>
                <div className="space-y-4">
                  {Object.values(analytics.groupCapacityBreakdown)
                    .sort((a, b) => b.fillPercentage - a.fillPercentage)
                    .map(group => (
                      <div key={group.name} className="bg-white p-3 rounded shadow-sm">
                        <div className="font-medium mb-1">{group.name}</div>
                        <div className="flex items-center space-x-4">
                          <div className="flex-grow bg-gray-200 rounded-full h-2.5">
                            <div 
                              className={`h-2.5 rounded-full ${
                                group.fillPercentage > 95 ? 'bg-green-500' : 
                                group.fillPercentage > 80 ? 'bg-yellow-500' : 
                                'bg-indigo-500'
                              }`}
                              style={{ width: `${Math.min(100, group.fillPercentage)}%` }}
                            ></div>
                          </div>
                          <span className="text-sm font-medium min-w-20 text-right">
                            {group.playerCount}/{group.totalCapacity} 
                            <span className="text-gray-500 ml-1">
                              ({Math.round(group.fillPercentage)}%)
                            </span>
                          </span>
                        </div>
                      </div>
                    ))
                  }
                </div>
              </div>
              
              {/* Display info about duplicate students if any */}
              {duplicateCount > 0 && (
                <div className="mt-4 p-4 bg-yellow-50 border border-yellow-100 rounded-lg">
                  <h4 className="font-medium text-yellow-700 mb-2">Multiple Group Assignments</h4>
                  <p className="text-gray-700">
                    You have {duplicateCount} students who are registered in multiple groups or time slots.
                    This is normal if students attend multiple classes per week.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ProgrammeAnalytics;