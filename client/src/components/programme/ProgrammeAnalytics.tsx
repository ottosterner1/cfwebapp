import React from 'react';
import { Card } from '../../components/ui/card';
import { Users, Calendar, PieChart, BarChart2 } from 'lucide-react';

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
  time_slot?: TimeSlot;
}

interface ProgrammeAnalyticsProps {
  players: Player[];
}

interface SessionInfo {
  count: number;
  group: string;
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

  const analytics = React.useMemo(() => {
    const summary = {
      totalPlayers: players.length,
      totalCapacity: 0,
      groupBreakdown: {} as Record<string, number>,
      sessionBreakdown: {} as Record<string, SessionInfo>,
      groupCapacityBreakdown: {} as Record<string, GroupCapacityInfo>
    };

    // First pass: collect all group capacities from time slots
    interface GroupCapacity {
      slots: number;
      capacity: number;
      [key: string]: number | boolean; // Allow both number properties and boolean flags
    }
    const groupCapacities: Record<string, GroupCapacity> = {};

    players.forEach(player => {
      const groupName = player.group_name;
      
      // Initialize groupCapacities entry if needed
      if (!groupCapacities[groupName]) {
        groupCapacities[groupName] = { slots: 0, capacity: 0 } as GroupCapacity;
      }

      // Group breakdown (player count per group)
      summary.groupBreakdown[groupName] = 
        (summary.groupBreakdown[groupName] || 0) + 1;

      // Session breakdown
      if (player.time_slot && player.time_slot.capacity) {
        // Add to total capacity once per unique time slot
        const timeSlotKey = `${groupName}|${player.time_slot.day_of_week}|${player.time_slot.start_time}-${player.time_slot.end_time}`;
        
        // Include day_of_week in the sessionKey to distinguish between sessions on different days
        const sessionKey = `${groupName} ${player.time_slot.day_of_week} ${player.time_slot.start_time}-${player.time_slot.end_time}`;
        
        if (!summary.sessionBreakdown[sessionKey]) {
          summary.sessionBreakdown[sessionKey] = {
            count: 0,
            group: groupName,
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
    
    const isFull = session.count >= session.capacity;
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
    
    const ratio = session.count / session.capacity;
    if (ratio >= 1) return 'bg-green-50';
    if (ratio >= 0.8) return 'bg-yellow-50';
    return 'bg-gray-50';
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
      {/* Total Players and Capacity Card */}
      <Card className="p-6 bg-white rounded-lg shadow">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-medium text-gray-900">Programme Totals</h3>
          <div className="bg-blue-100 p-2 rounded-full">
            <Users className="h-5 w-5 text-blue-600" />
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-gray-600">Total Players</span>
            <span className="text-xl font-semibold text-gray-900">
              {analytics.totalPlayers}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-600">Total Capacity</span>
            <span className="text-xl font-semibold text-gray-900">
              {analytics.totalCapacity}
            </span>
          </div>
          <div className="flex justify-between items-center mb-4">
            <span className="text-gray-600">Fill Rate</span>
            <span className="text-xl font-semibold text-gray-900">
              {analytics.totalCapacity > 0 
                ? `${Math.round((analytics.totalPlayers / analytics.totalCapacity) * 100)}%` 
                : 'N/A'}
            </span>
          </div>
          
          {/* Group Capacity Section (moved here) */}
          <div className="pt-4 border-t border-gray-200">
            <h4 className="font-medium text-gray-900 mb-3 flex items-center">
              <BarChart2 className="h-4 w-4 text-indigo-600 mr-2" />
              Group Fill Rates
            </h4>
            <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1">
              {Object.values(analytics.groupCapacityBreakdown)
                .sort((a, b) => a.name.localeCompare(b.name)) // Sort alphabetically by group name
                .map((group) => (
                  <div key={group.name} className="space-y-1">
                    <div className="flex justify-between items-center text-sm">
                      <span className="font-medium text-gray-900">{group.name}</span>
                      <span className="text-gray-600">
                        {group.playerCount}/{group.totalCapacity}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-indigo-600 h-2 rounded-full" 
                        style={{ width: `${Math.min(100, group.fillPercentage)}%` }}
                      ></div>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      </Card>

      {/* Group Breakdown Card */}
      <Card className="p-6 bg-white rounded-lg shadow">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-gray-900">Group Breakdown</h3>
          <div className="bg-purple-100 p-2 rounded-full">
            <PieChart className="h-5 w-5 text-purple-600" />
          </div>
        </div>
        <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
          {Object.entries(analytics.groupBreakdown)
            .sort((a, b) => a[0].localeCompare(b[0])) // Sort alphabetically by group name
            .map(([group, count]) => (
              <div key={group} className="p-3 bg-gray-50 rounded-lg flex justify-between items-center">
                <span className="font-medium text-gray-900">{group}</span>
                <span className="text-lg font-semibold text-gray-900">
                  {count}
                </span>
              </div>
            ))}
        </div>
      </Card>

      {/* Session Breakdown Card */}
      <Card className="p-6 bg-white rounded-lg shadow">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-gray-900">Session Breakdown</h3>
          <div className="bg-green-100 p-2 rounded-full">
            <Calendar className="h-5 w-5 text-green-600" />
          </div>
        </div>
        <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
          {Object.entries(analytics.sessionBreakdown)
            .sort((a, b) => {
              const sessionA = analytics.sessionBreakdown[a[0]];
              const sessionB = analytics.sessionBreakdown[b[0]];
              
              // First sort by day of week
              const dayOrderA = getDayOrder(sessionA.dayOfWeek);
              const dayOrderB = getDayOrder(sessionB.dayOfWeek);
              if (dayOrderA !== dayOrderB) return dayOrderA - dayOrderB;
              
              // Then sort by time
              const timeValueA = getTimeValue(sessionA.timeSlot);
              const timeValueB = getTimeValue(sessionB.timeSlot);
              if (timeValueA !== timeValueB) return timeValueA - timeValueB;
              
              // Finally sort by group name if day and time are the same
              return sessionA.group.localeCompare(sessionB.group);
            })
            .map(([sessionKey, session]) => (
              <div 
                key={sessionKey} 
                className={`p-3 rounded-lg ${getCapacityColor(session)}`}
              >
                <div className="flex justify-between items-center">
                  <div className="flex flex-col">
                    <span className="font-medium text-gray-900">{session.group}</span>
                    <span className="text-sm text-gray-500">
                      {session.dayOfWeek} {session.timeSlot}
                    </span>
                  </div>
                  <span className="text-lg font-semibold">
                    {getCapacityDisplay(session)}
                  </span>
                </div>
              </div>
            ))}
        </div>
      </Card>
    </div>
  );
};

export default ProgrammeAnalytics;