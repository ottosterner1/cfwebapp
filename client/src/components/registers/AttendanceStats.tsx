// client/src/components/registers/AttendanceStats.tsx

import React, { useState, useEffect } from 'react';
import { 
  AttendanceStats as IAttendanceStats, 
  GroupAttendanceStats
} from '../../types/register';

interface TeachingPeriod {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
}

interface Group {
  id: number;
  name: string;
}

interface RegisterSummary {
  id: number;
  date: string;
  group_name: string;
  coach_name: string;
  time_slot: {
    day: string;
    start_time: string;
    end_time: string;
  };
  status: string;
  stats: {
    total: number;
    present: number;
    absent: number;
    sick: number;
    away_with_notice: number;
    attendance_rate: number;
  };
}

interface WeeklyStats {
  week_number: number;
  week_start: string;
  week_end: string;
  total_registers: number;
  total_entries: number;
  present: number;
  absent: number;
  sick: number;
  away_with_notice: number;
  attendance_rate: number;
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
  const [statsType, setStatsType] = useState<'summary' | 'by_group' | 'by_register' | 'by_week'>('summary');
  
  const [summaryStats, setSummaryStats] = useState<IAttendanceStats | null>(null);
  const [groupStats, setGroupStats] = useState<GroupAttendanceStats[]>([]);
  const [registers, setRegisters] = useState<RegisterSummary[]>([]);
  const [weeklyStats, setWeeklyStats] = useState<WeeklyStats[]>([]);
  
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

  // Fetch summary stats
  useEffect(() => {
    const fetchSummaryStats = async () => {
      if (!selectedPeriodId) return;
      
      try {
        setLoading(true);
        
        // Build query params
        const params = new URLSearchParams();
        params.append('period_id', selectedPeriodId.toString());
        params.append('type', 'summary');
        if (selectedGroupId) params.append('group_id', selectedGroupId.toString());
        
        const response = await fetch(`/api/registers/attendance-stats?${params.toString()}`);
        
        if (!response.ok) {
          throw new Error(`Error fetching attendance stats: ${response.statusText}`);
        }
        
        const data = await response.json();
        setSummaryStats(data);
        setError(null);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An error occurred';
        setError(errorMessage);
        console.error('Error fetching summary stats:', err);
      } finally {
        setLoading(false);
      }
    };
    
    if (statsType === 'summary') {
      fetchSummaryStats();
    }
  }, [selectedPeriodId, selectedGroupId, statsType]);

  // Fetch group stats
  useEffect(() => {
    const fetchGroupStats = async () => {
      if (!selectedPeriodId) return;
      
      try {
        setLoading(true);
        
        // Build query params
        const params = new URLSearchParams();
        params.append('period_id', selectedPeriodId.toString());
        params.append('type', 'by_group');
        if (selectedGroupId) params.append('group_id', selectedGroupId.toString());
        
        const response = await fetch(`/api/registers/attendance-stats?${params.toString()}`);
        
        if (!response.ok) {
          throw new Error(`Error fetching group stats: ${response.statusText}`);
        }
        
        const data = await response.json();
        setGroupStats(data);
        setError(null);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An error occurred';
        setError(errorMessage);
        console.error('Error fetching group stats:', err);
      } finally {
        setLoading(false);
      }
    };
    
    if (statsType === 'by_group') {
      fetchGroupStats();
    }
  }, [selectedPeriodId, selectedGroupId, statsType]);

  // Fetch registers
  useEffect(() => {
    const fetchRegisters = async () => {
      if (!selectedPeriodId) return;
      
      try {
        setLoading(true);
        
        // Build query params
        const params = new URLSearchParams();
        params.append('period_id', selectedPeriodId.toString());
        if (selectedGroupId) params.append('group_id', selectedGroupId.toString());
        
        const response = await fetch(`/api/registers?${params.toString()}`);
        
        if (!response.ok) {
          throw new Error(`Error fetching registers: ${response.statusText}`);
        }
        
        const data = await response.json();
        setRegisters(data);
        setError(null);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An error occurred';
        setError(errorMessage);
        console.error('Error fetching registers:', err);
      } finally {
        setLoading(false);
      }
    };
    
    if (statsType === 'by_register') {
      fetchRegisters();
    }
  }, [selectedPeriodId, selectedGroupId, statsType]);

  // Calculate weekly stats
  useEffect(() => {
    const calculateWeeklyStats = async () => {
      if (!selectedPeriodId || statsType !== 'by_week') return;
      
      try {
        setLoading(true);
        
        // Fetch registers first to calculate weekly stats
        const params = new URLSearchParams();
        params.append('period_id', selectedPeriodId.toString());
        if (selectedGroupId) params.append('group_id', selectedGroupId.toString());
        
        const response = await fetch(`/api/registers?${params.toString()}`);
        
        if (!response.ok) {
          throw new Error(`Error fetching registers for weekly stats: ${response.statusText}`);
        }
        
        const registers = await response.json();
        
        // Get the teaching period details to calculate week numbers
        const period = periods.find(p => p.id === selectedPeriodId);
        if (!period) {
          throw new Error("Selected teaching period not found");
        }
        
        const periodStart = new Date(period.start_date);
        
        // Group registers by week
        const weekMap = new Map<number, RegisterSummary[]>();
        
        registers.forEach((register: RegisterSummary) => {
          const registerDate = new Date(register.date);
          // Calculate days since period start
          const daysSincePeriodStart = Math.floor((registerDate.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24));
          // Calculate week number (0-indexed)
          const weekNumber = Math.floor(daysSincePeriodStart / 7) + 1;
          
          if (!weekMap.has(weekNumber)) {
            weekMap.set(weekNumber, []);
          }
          
          weekMap.get(weekNumber)?.push(register);
        });
        
        // Calculate stats for each week
        const weeklyStats: WeeklyStats[] = [];
        
        weekMap.forEach((weekRegisters, weekNumber) => {
          const weekStart = new Date(periodStart);
          weekStart.setDate(weekStart.getDate() + (weekNumber - 1) * 7);
          
          const weekEnd = new Date(weekStart);
          weekEnd.setDate(weekEnd.getDate() + 6);
          
          let totalEntries = 0;
          let presentCount = 0;
          let absentCount = 0;
          let sickCount = 0;
          let awayWithNoticeCount = 0;
          
          weekRegisters.forEach(register => {
            totalEntries += register.stats.total;
            presentCount += register.stats.present;
            absentCount += register.stats.absent;
            sickCount += register.stats.sick;
            awayWithNoticeCount += register.stats.away_with_notice;
          });
          
          const attendanceRate = totalEntries > 0 
            ? Math.round(((presentCount + awayWithNoticeCount) / totalEntries) * 100 * 10) / 10
            : 0;
          
          weeklyStats.push({
            week_number: weekNumber,
            week_start: weekStart.toISOString().split('T')[0],
            week_end: weekEnd.toISOString().split('T')[0],
            total_registers: weekRegisters.length,
            total_entries: totalEntries,
            present: presentCount,
            absent: absentCount,
            sick: sickCount,
            away_with_notice: awayWithNoticeCount,
            attendance_rate: attendanceRate
          });
        });
        
        // Sort by week number
        weeklyStats.sort((a, b) => a.week_number - b.week_number);
        
        setWeeklyStats(weeklyStats);
        setError(null);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An error occurred';
        setError(errorMessage);
        console.error('Error calculating weekly stats:', err);
      } finally {
        setLoading(false);
      }
    };
    
    calculateWeeklyStats();
  }, [selectedPeriodId, selectedGroupId, statsType, periods]);

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
    setStatsType(e.target.value as 'summary' | 'by_group' | 'by_register' | 'by_week');
  };

  // View a specific register
  const handleViewRegister = (registerId: number) => {
    onNavigate(`/registers/${registerId}`);
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
      case 'by_register':
        return renderRegisterStats();
      case 'by_week':
        return renderWeeklyStats();
      default:
        return null;
    }
  };

  // Render summary stats
  const renderSummaryStats = () => {
    if (!summaryStats) return <p>No summary data available</p>;
    
    return (
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 p-6">
          <div className="bg-blue-50 p-4 rounded-lg text-center">
            <div className="text-2xl font-bold text-blue-700">{summaryStats.total_registers || summaryStats.total_sessions}</div>
            <div className="text-sm text-blue-500">Total Registers</div>
          </div>
          
          <div className="bg-green-50 p-4 rounded-lg text-center">
            <div className="text-2xl font-bold text-green-700">{summaryStats.present}</div>
            <div className="text-sm text-green-500">Present</div>
          </div>
          
          <div className="bg-red-50 p-4 rounded-lg text-center">
            <div className="text-2xl font-bold text-red-700">{summaryStats.absent}</div>
            <div className="text-sm text-red-500">Absent</div>
          </div>
          
          <div className="bg-indigo-50 p-4 rounded-lg text-center">
            <div className="text-2xl font-bold text-indigo-700">{summaryStats.sick}</div>
            <div className="text-sm text-indigo-500">Sick</div>
          </div>
          
          <div className="bg-yellow-50 p-4 rounded-lg text-center">
            <div className="text-2xl font-bold text-yellow-700">{summaryStats.away_with_notice}</div>
            <div className="text-sm text-yellow-500">Away With Notice</div>
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
    if (!groupStats || !groupStats.length) return <p>No group data available</p>;
    
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
                  Sick
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Away With Notice
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
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-indigo-600">
                    {group.sick}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-yellow-600">
                    {group.away_with_notice}
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

  // Render register details
  const renderRegisterStats = () => {
    if (!registers || registers.length === 0) {
      return <p>No register data available for the selected filters</p>;
    }
    
    return (
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <h3 className="text-lg font-medium p-6 border-b">Register Breakdown</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Group
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Coach
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Present
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Absent
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Sick
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Away With Notice
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Attendance Rate
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {registers.map((register) => (
                <tr key={register.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {formatDate(register.date)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {register.group_name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {register.coach_name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600">
                    {register.stats.present}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-red-600">
                    {register.stats.absent}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-indigo-600">
                    {register.stats.sick}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-yellow-600">
                    {register.stats.away_with_notice}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="w-16 bg-gray-200 rounded-full h-2.5 mr-2">
                        <div 
                          className={`h-2.5 rounded-full ${
                            register.stats.attendance_rate >= 80 ? 'bg-green-600' :
                            register.stats.attendance_rate >= 60 ? 'bg-yellow-500' :
                            'bg-red-600'
                          }`}
                          style={{ width: `${register.stats.attendance_rate}%` }}
                        ></div>
                      </div>
                      <span className="text-sm text-gray-900">
                        {register.stats.attendance_rate}%
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-blue-600">
                    <button 
                      onClick={() => handleViewRegister(register.id)}
                      className="hover:text-blue-900"
                    >
                      View
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

  // Render weekly stats
  const renderWeeklyStats = () => {
    if (!weeklyStats || weeklyStats.length === 0) {
      return <p>No weekly data available for the selected filters</p>;
    }
    
    return (
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <h3 className="text-lg font-medium p-6 border-b">Weekly Stats</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Week
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Period
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Registers
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Present
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Absent
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Sick
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Away With Notice
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Attendance Rate
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {weeklyStats.map((week) => (
                <tr key={week.week_number} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    Week {week.week_number}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatDate(week.week_start)} - {formatDate(week.week_end)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {week.total_registers}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600">
                    {week.present}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-red-600">
                    {week.absent}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-indigo-600">
                    {week.sick}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-yellow-600">
                    {week.away_with_notice}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="w-24 bg-gray-200 rounded-full h-2.5 mr-2">
                        <div 
                          className={`h-2.5 rounded-full ${
                            week.attendance_rate >= 80 ? 'bg-green-600' :
                            week.attendance_rate >= 60 ? 'bg-yellow-500' :
                            'bg-red-600'
                          }`}
                          style={{ width: `${week.attendance_rate}%` }}
                        ></div>
                      </div>
                      <span className="text-sm text-gray-900">
                        {week.attendance_rate}%
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
      
      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-lg font-semibold mb-3">Filters</h2>
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
              <option value="by_register">By Register</option>
              <option value="by_week">By Week</option>
            </select>
          </div>
        </div>
      </div>
      
      {renderStats()}
    </div>
  );
};

export default AttendanceStats;