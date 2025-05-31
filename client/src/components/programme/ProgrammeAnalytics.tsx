import React, { useState} from 'react';
import { Card } from '../../components/ui/card';
import { 
  Users, 
  Calendar, 
  PieChart as PieChartIcon, 
  BarChart2, 
  ChevronDown, 
  ChevronUp,
  Mail
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
  contact_email?: string; // Added for email functionality
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
  players: Player[]; // Added to track players in each session
}

interface GroupCapacityInfo {
  name: string;
  playerCount: number;
  totalCapacity: number;
  fillPercentage: number;
}

const ProgrammeAnalytics: React.FC<ProgrammeAnalyticsProps> = ({ players }) => {
  const [expanded, setExpanded] = useState(true);

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
    return DAY_ORDER[normalizedDay] || 999;
  };

  // Helper function to convert time string to numerical minutes for sorting
  const getTimeValue = (timeStr: string): number => {
    const [time] = timeStr.split('-');
    const [hoursStr, minutesStr] = time.trim().split(':');
    
    let hours = parseInt(hoursStr, 10);
    const minutes = parseInt(minutesStr, 10) || 0;
    
    if (hours > 0 && hours < 9) {
      hours += 12;
    }
    
    return hours * 60 + minutes;
  };

  const scrollToSession = (groupId: number, timeId: number) => {
    const elementId = `group-${groupId}-time-${timeId}`;
    const element = document.getElementById(elementId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      element.classList.add('bg-yellow-100');
      setTimeout(() => {
        element.classList.remove('bg-yellow-100');
      }, 2000);
    }
  };

  const handleEmailSession = (session: SessionInfo) => {
    // Get all players in this specific session with valid emails
    const playersWithEmails = session.players.filter(player => player.contact_email);
    
    if (playersWithEmails.length === 0) {
      alert('No email addresses found for players in this session.');
      return;
    }

    // Create mailto link
    const emails = playersWithEmails.map(player => player.contact_email).join(',');
    const subject = encodeURIComponent(`${session.group} - ${session.dayOfWeek} ${session.timeSlot}`);
    const mailtoLink = `mailto:?bcc=${emails}&subject=${subject}`;
    
    // Open email client
    window.location.href = mailtoLink;
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

    interface GroupCapacity {
      slots: number;
      capacity: number;
      [key: string]: number | boolean;
    }
    const groupCapacities: Record<string, GroupCapacity> = {};

    players.forEach(player => {
      summary.uniqueStudents.add(player.student_name);
      
      const groupName = player.group_name;
      
      if (!groupCapacities[groupName]) {
        groupCapacities[groupName] = { slots: 0, capacity: 0 } as GroupCapacity;
      }

      summary.groupBreakdown[groupName] = 
        (summary.groupBreakdown[groupName] || 0) + 1;

      if (player.time_slot) {
        const timeSlotKey = `${groupName}|${player.time_slot.day_of_week}|${player.time_slot.start_time}-${player.time_slot.end_time}`;
        const sessionKey = `${groupName} ${player.time_slot.day_of_week} ${player.time_slot.start_time}-${player.time_slot.end_time}`;
        
        if (!summary.sessionBreakdown[sessionKey]) {
          summary.sessionBreakdown[sessionKey] = {
            count: 0,
            group: groupName,
            groupId: player.group_id,
            timeId: player.group_time_id,
            dayOfWeek: player.time_slot.day_of_week,
            timeSlot: `${player.time_slot.start_time}-${player.time_slot.end_time}`,
            capacity: player.time_slot.capacity,
            players: [] // Initialize players array
          };

          if (!groupCapacities[groupName][timeSlotKey]) {
            groupCapacities[groupName].slots += 1;
            groupCapacities[groupName].capacity += (player.time_slot.capacity || 0);
            summary.totalCapacity += (player.time_slot.capacity || 0);
            groupCapacities[groupName][timeSlotKey] = true;
          }
        }
        
        // Add player to the session
        summary.sessionBreakdown[sessionKey].count += 1;
        summary.sessionBreakdown[sessionKey].players.push(player);
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
        </div>
        {expanded ? (
          <ChevronUp className="h-5 w-5 text-indigo-600" />
        ) : (
          <ChevronDown className="h-5 w-5 text-indigo-600" />
        )}
      </div>
      
      {expanded && (
        <div className="p-4">
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
                    .sort((a, b) => a.name.localeCompare(b.name))
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
                  .sort((a, b) => b[1] - a[1])
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

            {/* Session Breakdown Card with clickable sessions and email buttons */}
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
              
              <div className="space-y-3 max-h-[150px] overflow-y-auto pr-1">
                {Object.entries(
                  Object.values(analytics.sessionBreakdown).reduce((groups, session) => {
                    if (!groups[session.group]) {
                      groups[session.group] = [];
                    }
                    groups[session.group].push(session);
                    return groups;
                  }, {} as Record<string, SessionInfo[]>)
                )
                  .sort((a, b) => a[0].localeCompare(b[0]))
                  .map(([groupName, sessions]) => (
                    <div key={groupName} className="bg-gray-100 rounded p-2">
                      <div className="font-medium text-sm text-gray-900 mb-1">{groupName}</div>
                      <div className="space-y-1.5 pl-2">
                        {sessions
                          .sort((a, b) => {
                            const dayOrderA = getDayOrder(a.dayOfWeek);
                            const dayOrderB = getDayOrder(b.dayOfWeek);
                            if (dayOrderA !== dayOrderB) return dayOrderA - dayOrderB;
                            
                            const timeValueA = getTimeValue(a.timeSlot);
                            const timeValueB = getTimeValue(b.timeSlot);
                            return timeValueA - timeValueB;
                          })
                          .map((session) => (
                            <div 
                              key={`${session.group}-${session.dayOfWeek}-${session.timeSlot}`}
                              className={`rounded px-2 py-1.5 ${getCapacityColor(session)}`}
                            >
                              <div className="flex justify-between items-center text-xs">
                                <div 
                                  className="flex-1 cursor-pointer hover:text-indigo-600 transition-colors"
                                  onClick={() => scrollToSession(session.groupId, session.timeId)}
                                  title="Click to navigate to this session"
                                >
                                  <span className="text-gray-700">
                                    {session.dayOfWeek} {session.timeSlot}
                                  </span>
                                  <div className="font-medium">
                                    {getCapacityDisplay(session)}
                                  </div>
                                </div>
                                <button
                                  onClick={() => handleEmailSession(session)}
                                  className="ml-2 p-1 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                  title="Email players in this session"
                                >
                                  <Mail className="h-3 w-3" />
                                </button>
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  ))}
              </div>
            </Card>
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
  );
};

export default ProgrammeAnalytics;