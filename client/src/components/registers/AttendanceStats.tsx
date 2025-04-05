// client/src/components/registers/AttendanceStats.tsx

import React, { useState, useEffect } from 'react';
import { 
  AttendanceStats as IAttendanceStats, 
  GroupAttendanceStats
} from '../../types/register';

interface TeachingPeriod {
  id: number;
  name: string;
}

interface Group {
  id: number;
  name: string;
}

interface AttendanceStatsProps {
  onNavigate: (path: string) => void;
  periodId?: number;
  groupId?: number;
}

const AttendanceStats: React.FC<AttendanceStatsProps> = ({
  onNavigate,
  periodId: initialPeriodId,
  groupId: initialGroupId
}) => {
  const [periods, setPeriods] = useState<TeachingPeriod[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState<number | undefined>(initialPeriodId);
  const [selectedGroupId, setSelectedGroupId] = useState<number | undefined>(initialGroupId);
  const [statsType, setStatsType] = useState<'summary' | 'by_group'>('summary');
  
  const [summaryStats, setSummaryStats] = useState<IAttendanceStats | null>(null);
  const [groupStats, setGroupStats] = useState<GroupAttendanceStats[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
  }, [selectedPeriodId]);

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

  // Fetch stats
  useEffect(() => {
    const fetchStats = async () => {
      if (!selectedPeriodId) return;
      
      try {
        setLoading(true);
        
        // Build query params
        const params = new URLSearchParams();
        params.append('period_id', selectedPeriodId.toString());
        params.append('type', statsType);
        if (selectedGroupId) params.append('group_id', selectedGroupId.toString());
        
        const response = await fetch(`/api/registers/attendance-stats?${params.toString()}`);
        
        if (!response.ok) {
          throw new Error(`Error fetching attendance stats: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        // Store data based on the requested type
        if (statsType === 'summary') {
          setSummaryStats(data);
        } else if (statsType === 'by_group') {
          setGroupStats(data);
        }
        
        setError(null);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An error occurred';
        setError(errorMessage);
        console.error('Error fetching attendance stats:', err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchStats();
  }, [selectedPeriodId, selectedGroupId, statsType]);

  // Handle period change
  const handlePeriodChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    setSelectedPeriodId(value ? Number(value) : undefined);
  };

  // Handle group change
  const handleGroupChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    setSelectedGroupId(value ? Number(value) : undefined);
  };

  // Handle stats type change
  const handleStatsTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setStatsType(e.target.value as 'summary' | 'by_group');
  };

  // Render the appropriate stats component based on the selected type
  const renderStats = () => {
    if (loading) {
      return (
        <div className="flex justify-center items-center h-32">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-700"></div>
        </div>
      );
    }
    
    if (error) {
      return (
        <div className="bg-red-50 p-4 rounded-md text-red-700">
          {error}
        </div>
      );
    }
    
    switch (statsType) {
      case 'summary':
        return renderSummaryStats();
      case 'by_group':
        return renderGroupStats();
      default:
        return null;
    }
  };

  // Render summary stats
  const renderSummaryStats = () => {
    if (!summaryStats) return <p>No summary data available</p>;
    
    return (
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-6">
          <div className="bg-blue-50 p-4 rounded-lg text-center">
            <div className="text-2xl font-bold text-blue-700">{summaryStats.total_sessions}</div>
            <div className="text-sm text-blue-500">Total Sessions</div>
          </div>
          
          <div className="bg-green-50 p-4 rounded-lg text-center">
            <div className="text-2xl font-bold text-green-700">{summaryStats.present}</div>
            <div className="text-sm text-green-500">Present</div>
          </div>
          
          <div className="bg-red-50 p-4 rounded-lg text-center">
            <div className="text-2xl font-bold text-red-700">{summaryStats.absent}</div>
            <div className="text-sm text-red-500">Absent</div>
          </div>
          
          <div className="bg-yellow-50 p-4 rounded-lg text-center">
            <div className="text-2xl font-bold text-yellow-700">{summaryStats.late}</div>
            <div className="text-sm text-yellow-500">Late</div>
          </div>
        </div>
        
        <div className="p-6 border-t">
          <h3 className="text-lg font-medium mb-4">Overall Attendance Rate</h3>
          <div className="w-full bg-gray-200 rounded-full h-4">
            <div 
              className={`h-4 rounded-full ${
                summaryStats.attendance_rate >= 80 ? 'bg-green-600' :
                summaryStats.attendance_rate >= 60 ? 'bg-yellow-500' :
                'bg-red-600'
              }`}
              style={{ width: `${summaryStats.attendance_rate}%` }}
            ></div>
          </div>
          <div className="mt-2 text-right font-medium">
            {summaryStats.attendance_rate}%
          </div>
        </div>
      </div>
    );
  };

  // Render group stats
  const renderGroupStats = () => {
    if (!groupStats.length) return <p>No group data available</p>;
    
    return (
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Group
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Total Sessions
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Present
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Absent
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Late
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Attendance Rate
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {groupStats.map((group) => (
                <tr key={group.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {group.name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {group.total}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600">
                    {group.present}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-red-600">
                    {group.absent}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-yellow-600">
                    {group.late}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="w-32 bg-gray-200 rounded-full h-2.5 mr-2">
                        <div 
                          className={`h-2.5 rounded-full ${
                            group.attendance_rate >= 80 ? 'bg-green-600' :
                            group.attendance_rate >= 60 ? 'bg-yellow-500' :
                            'bg-red-600'
                          }`}
                          style={{ width: `${group.attendance_rate}%` }}
                        ></div>
                      </div>
                      <span className="text-sm text-gray-900">
                        {group.attendance_rate}%
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Attendance Statistics</h1>
        <button
          onClick={() => onNavigate('/registers')}
          className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
        >
          Back to Registers
        </button>
      </div>
      
      <div className="bg-white p-4 rounded-lg shadow">
        <h2 className="text-lg font-semibold mb-3">Attendance Statistics</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                <option key={period.id} value={period.id}>{period.name}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label htmlFor="group" className="block text-sm font-medium text-gray-700 mb-1">
              Group (Optional)
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
          
          <div>
            <label htmlFor="statsType" className="block text-sm font-medium text-gray-700 mb-1">
              View By
            </label>
            <select
              id="statsType"
              value={statsType}
              onChange={handleStatsTypeChange}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            >
              <option value="summary">Overall Summary</option>
              <option value="by_group">By Group</option>
            </select>
          </div>
        </div>
      </div>
      
      {renderStats()}
    </div>
  );
};

export default AttendanceStats;