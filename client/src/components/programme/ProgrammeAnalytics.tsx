import React from 'react';
import { Card } from '../../components/ui/card';
import { Users, Calendar, PieChart } from 'lucide-react';

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

const ProgrammeAnalytics: React.FC<ProgrammeAnalyticsProps> = ({ players }) => {
  const analytics = React.useMemo(() => {
    const summary = {
      totalPlayers: players.length,
      groupBreakdown: {} as Record<string, number>,
      sessionBreakdown: {} as Record<string, SessionInfo>
    };

    players.forEach(player => {
      // Group breakdown
      summary.groupBreakdown[player.group_name] = 
        (summary.groupBreakdown[player.group_name] || 0) + 1;

      // Session breakdown
      if (player.time_slot) {
        const sessionKey = `${player.group_name} ${player.time_slot.start_time}-${player.time_slot.end_time}`;
        if (!summary.sessionBreakdown[sessionKey]) {
          summary.sessionBreakdown[sessionKey] = {
            count: 0,
            group: player.group_name,
            dayOfWeek: player.time_slot.day_of_week,
            timeSlot: `${player.time_slot.start_time}-${player.time_slot.end_time}`,
            capacity: player.time_slot.capacity
          };
        }
        summary.sessionBreakdown[sessionKey].count += 1;
      }
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
      {/* Total Players Card */}
      <Card className="p-6 bg-white rounded-lg shadow">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-medium text-gray-900">Total Players</h3>
          <div className="bg-blue-100 p-2 rounded-full">
            <Users className="h-5 w-5 text-blue-600" />
          </div>
        </div>
        <p className="text-3xl font-semibold text-gray-900">
          {analytics.totalPlayers}
        </p>
      </Card>

      {/* Group Breakdown Card */}
      <Card className="p-6 bg-white rounded-lg shadow">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-gray-900">Group Breakdown</h3>
          <div className="bg-purple-100 p-2 rounded-full">
            <PieChart className="h-5 w-5 text-purple-600" />
          </div>
        </div>
        <div className="space-y-2 max-h-[200px] overflow-y-auto pr-2">
          {Object.entries(analytics.groupBreakdown)
            .sort((a, b) => b[1] - a[1])
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
        <div className="space-y-2 max-h-[200px] overflow-y-auto pr-2">
          {Object.entries(analytics.sessionBreakdown)
            .sort((a, b) => {
              const sessionA = analytics.sessionBreakdown[a[0]];
              const sessionB = analytics.sessionBreakdown[b[0]];
              
              // First sort by group name
              const groupCompare = sessionA.group.localeCompare(sessionB.group);
              if (groupCompare !== 0) return groupCompare;

              // Then sort by day of week
              const dayOrder = {
                'Monday': 1, 'Tuesday': 2, 'Wednesday': 3,
                'Thursday': 4, 'Friday': 5, 'Saturday': 6, 'Sunday': 7
              };
              const dayDiff = dayOrder[sessionA.dayOfWeek as keyof typeof dayOrder] - 
                            dayOrder[sessionB.dayOfWeek as keyof typeof dayOrder];
              if (dayDiff !== 0) return dayDiff;

              // Finally sort by time
              return sessionA.timeSlot.localeCompare(sessionB.timeSlot);
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