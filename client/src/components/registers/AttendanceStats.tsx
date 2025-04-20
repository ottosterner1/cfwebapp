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

interface Coach {
  id: number;
  name: string;
}

interface UserInfo {
  is_admin: boolean;
  coach_id?: number;
}

interface DayOfWeek {
  value: string;
  label: string;
}

interface Session {
  id: number;
  start_time: string;
  end_time: string;
  time_display: string;
  register_count: number;
}

interface RegisterSummary {
  id: number;
  date: string;
  group_name: string;
  group_id: number;
  coach_name: string;
  coach_id: number;
  time_slot: {
    day: string;
    start_time: string;
    end_time: string;
  };
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
  // Filters
  const [periods, setPeriods] = useState<TeachingPeriod[]>([]);
  const [days, setDays] = useState<DayOfWeek[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [loadingUserInfo, setLoadingUserInfo] = useState(true);
  
  // Selected filter values
  const [selectedPeriodId, setSelectedPeriodId] = useState<number | undefined>(initialPeriodId);
  const [selectedDay, setSelectedDay] = useState<string>('');
  const [selectedCoachId, setSelectedCoachId] = useState<number | undefined>(undefined);
  const [selectedGroupId, setSelectedGroupId] = useState<number | undefined>(initialGroupId);
  const [selectedSessionId, setSelectedSessionId] = useState<number | undefined>(undefined);
  
  // Data states
  const [registers, setRegisters] = useState<RegisterSummary[]>([]);
  const [weeklyStats, setWeeklyStats] = useState<WeeklyStats[]>([]);
  const [groupStats, setGroupStats] = useState<GroupAttendanceStats[]>([]);
  const [overallStats, setOverallStats] = useState<IAttendanceStats | null>(null);
  
  // UI states
  const [loading, setLoading] = useState(true);
  const [loadingCoaches, setLoadingCoaches] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  // Fetch coaches
  useEffect(() => {
    const fetchCoaches = async () => {
      try {
        setLoadingCoaches(true);
        
        const response = await fetch('/api/coaches'); // Fixed URL
        
        if (!response.ok) {
          throw new Error(`Failed to fetch coaches: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (!Array.isArray(data)) {
          console.warn('Expected array of coaches but got:', data);
          setCoaches([]);
        } else {
          setCoaches(data);
        }
      } catch (err) {
        console.error('Error fetching coaches:', err);
      } finally {
        setLoadingCoaches(false);
      }
    };
    
    fetchCoaches();
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

  // Fetch days of week when period changes
  useEffect(() => {
    const fetchDays = async () => {
      if (!selectedPeriodId) return;
      
      try {
        setLoading(true);
        
        // Fixed URL - removed /registers from the path
        const response = await fetch(`/api/days-of-week?period_id=${selectedPeriodId}`);
        
        if (!response.ok) {
          throw new Error(`Error fetching days: ${response.statusText}`);
        }
        
        const data = await response.json();
        setDays(data);
        
        // Reset day selection
        setSelectedDay('');
        setSelectedGroupId(undefined);
        setSelectedSessionId(undefined);
        
        setError(null);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An error occurred';
        setError(errorMessage);
        console.error('Error fetching days:', err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchDays();
  }, [selectedPeriodId]);

  // Fetch groups when day changes
  useEffect(() => {
    const fetchGroups = async () => {
      if (!selectedPeriodId || !selectedDay) return;
      
      try {
        setLoading(true);
        
        // Build query parameters including coach filter if set
        let url = `/api/groups-by-day?period_id=${selectedPeriodId}&day_of_week=${selectedDay}`;
        if (selectedCoachId) {
          url += `&coach_id=${selectedCoachId}`;
        }
        
        const response = await fetch(url);
        
        if (!response.ok) {
          throw new Error(`Error fetching groups: ${response.statusText}`);
        }
        
        const data = await response.json();
        setGroups(data);
        
        // Reset group selection
        setSelectedGroupId(undefined);
        setSelectedSessionId(undefined);
        
        setError(null);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An error occurred';
        setError(errorMessage);
        console.error('Error fetching groups:', err);
      } finally {
        setLoading(false);
      }
    };
    
    if (selectedDay) {
      fetchGroups();
    }
  }, [selectedPeriodId, selectedDay, selectedCoachId]);

  // Fetch sessions when group changes
  useEffect(() => {
    const fetchSessions = async () => {
      if (!selectedPeriodId || !selectedDay || !selectedGroupId) return;
      
      try {
        setLoading(true);
        
        // Build query parameters including coach filter if set
        let url = `/api/sessions?period_id=${selectedPeriodId}&day_of_week=${selectedDay}&group_id=${selectedGroupId}`;
        if (selectedCoachId) {
          url += `&coach_id=${selectedCoachId}`;
        }
        
        const response = await fetch(url);
        
        if (!response.ok) {
          throw new Error(`Error fetching sessions: ${response.statusText}`);
        }
        
        const data = await response.json();
        setSessions(data);
        
        // Reset session selection
        setSelectedSessionId(undefined);
        
        setError(null);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An error occurred';
        setError(errorMessage);
        console.error('Error fetching sessions:', err);
      } finally {
        setLoading(false);
      }
    };
    
    if (selectedGroupId) {
      fetchSessions();
    }
  }, [selectedPeriodId, selectedDay, selectedGroupId, selectedCoachId]);

  // Fetch registers based on all filters
  useEffect(() => {
    const fetchRegisters = async () => {
      if (!selectedPeriodId) return;
      
      try {
        setLoading(true);
        
        // Build query params
        const params = new URLSearchParams();
        params.append('period_id', selectedPeriodId.toString());
        
        if (selectedDay) {
          params.append('day_of_week', selectedDay);
        }
        
        if (selectedCoachId) {
          params.append('coach_id', selectedCoachId.toString());
        }
        
        if (selectedGroupId) {
          params.append('group_id', selectedGroupId.toString());
        }
        
        const response = await fetch(`/api/registers?${params.toString()}`);
        
        if (!response.ok) {
          throw new Error(`Error fetching registers: ${response.statusText}`);
        }
        
        let data = await response.json();
        
        // Filter by session if selected
        if (selectedSessionId) {
          data = data.filter((register: RegisterSummary) => 
            register.time_slot.start_time === sessions.find(s => s.id === selectedSessionId)?.start_time &&
            register.time_slot.end_time === sessions.find(s => s.id === selectedSessionId)?.end_time
          );
        }
        
        setRegisters(data);
        
        // Calculate overall stats
        if (data.length > 0) {
          const totalEntries = data.reduce((sum: number, register: RegisterSummary) => sum + register.stats.total, 0);
          const presentCount = data.reduce((sum: number, register: RegisterSummary) => sum + register.stats.present, 0);
          const absentCount = data.reduce((sum: number, register: RegisterSummary) => sum + register.stats.absent, 0);
          const sickCount = data.reduce((sum: number, register: RegisterSummary) => sum + register.stats.sick, 0);
          const awayWithNoticeCount = data.reduce((sum: number, register: RegisterSummary) => sum + register.stats.away_with_notice, 0);
          
          // Updated: Only counting "present" as attendance, treating "away_with_notice" as absence
          const attendanceRate = totalEntries > 0 
            ? Math.round((presentCount / totalEntries) * 100 * 10) / 10
            : 0;
          
          setOverallStats({
            total_registers: data.length,
            total_sessions: totalEntries,
            present: presentCount,
            absent: absentCount,
            sick: sickCount,
            away_with_notice: awayWithNoticeCount,
            attendance_rate: attendanceRate
          });
        } else {
          setOverallStats(null);
        }
        
        // Calculate weekly stats
        if (data.length > 0) {
          calculateWeeklyStats(data);
        } else {
          setWeeklyStats([]);
        }
        
        // Calculate group stats
        calculateGroupStats(data);
        
        setError(null);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An error occurred';
        setError(errorMessage);
        console.error('Error fetching registers:', err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchRegisters();
  }, [selectedPeriodId, selectedDay, selectedCoachId, selectedGroupId, selectedSessionId]);

  // Calculate weekly stats from registers
  const calculateWeeklyStats = (registers: RegisterSummary[]) => {
    if (!registers.length) {
      setWeeklyStats([]);
      return;
    }
    
    try {
      // Find the period we're working with
      const period = periods.find(p => p.id === selectedPeriodId);
      if (!period) {
        throw new Error("Selected teaching period not found");
      }
      
      const periodStart = new Date(period.start_date);
      
      // Group registers by week
      const weekMap = new Map<number, RegisterSummary[]>();
      
      registers.forEach(register => {
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
      const calculatedWeeklyStats: WeeklyStats[] = [];
      
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
        
        // Updated: Only counting "present" as attendance, treating "away_with_notice" as absence
        const attendanceRate = totalEntries > 0 
          ? Math.round((presentCount / totalEntries) * 100 * 10) / 10
          : 0;
        
        calculatedWeeklyStats.push({
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
      calculatedWeeklyStats.sort((a, b) => a.week_number - b.week_number);
      setWeeklyStats(calculatedWeeklyStats);
      
    } catch (err) {
      console.error('Error calculating weekly stats:', err);
    }
  };

  // Calculate group stats from registers
  const calculateGroupStats = (registers: RegisterSummary[]) => {
    if (!registers.length) {
      setGroupStats([]);
      return;
    }
    
    try {
      // Group by group_id
      const groupMap = new Map<number, RegisterSummary[]>();
      
      registers.forEach(register => {
        if (!register.group_id) return;
        
        if (!groupMap.has(register.group_id)) {
          groupMap.set(register.group_id, []);
        }
        
        groupMap.get(register.group_id)?.push(register);
      });
      
      // Calculate stats for each group
      const groupStatsData: GroupAttendanceStats[] = [];
      
      groupMap.forEach((groupRegisters, groupId) => {
        let totalEntries = 0;
        let presentCount = 0;
        let absentCount = 0;
        let sickCount = 0;
        let awayWithNoticeCount = 0;
        
        groupRegisters.forEach(register => {
          totalEntries += register.stats.total;
          presentCount += register.stats.present;
          absentCount += register.stats.absent;
          sickCount += register.stats.sick;
          awayWithNoticeCount += register.stats.away_with_notice;
        });
        
        // Updated: Only counting "present" as attendance, treating "away_with_notice" as absence
        const attendanceRate = totalEntries > 0 
          ? Math.round((presentCount / totalEntries) * 100 * 10) / 10
          : 0;
        
        groupStatsData.push({
          id: groupId,
          name: groupRegisters[0].group_name,
          total: totalEntries,
          present: presentCount,
          absent: absentCount,
          sick: sickCount,
          away_with_notice: awayWithNoticeCount,
          attendance_rate: attendanceRate
        });
      });
      
      // Sort by group name
      groupStatsData.sort((a, b) => a.name.localeCompare(b.name));
      setGroupStats(groupStatsData);
      
    } catch (err) {
      console.error('Error calculating group stats:', err);
    }
  };

  // Handle filter changes
  const handlePeriodChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    setSelectedPeriodId(value ? Number(value) : undefined);
  };

  const handleDayChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedDay(e.target.value);
  };

  const handleCoachChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    setSelectedCoachId(value ? Number(value) : undefined);
  };

  const handleGroupChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    setSelectedGroupId(value ? Number(value) : undefined);
  };

  const handleSessionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    setSelectedSessionId(value ? Number(value) : undefined);
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

  // Render stats card
  const renderStatsCard = () => {
    if (!overallStats) return <p>No data available for the selected filters</p>;
    
    return (
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 p-6">
          <div className="bg-blue-50 p-4 rounded-lg text-center">
            <div className="text-2xl font-bold text-blue-700">{overallStats.total_registers}</div>
            <div className="text-sm text-blue-500">Total Registers</div>
          </div>
          
          <div className="bg-green-50 p-4 rounded-lg text-center">
            <div className="text-2xl font-bold text-green-700">{overallStats.present}</div>
            <div className="text-sm text-green-500">Present</div>
          </div>
          
          <div className="bg-red-50 p-4 rounded-lg text-center">
            <div className="text-2xl font-bold text-red-700">{overallStats.absent}</div>
            <div className="text-sm text-red-500">Absent</div>
          </div>
          
          <div className="bg-indigo-50 p-4 rounded-lg text-center">
            <div className="text-2xl font-bold text-indigo-700">{overallStats.sick}</div>
            <div className="text-sm text-indigo-500">Sick</div>
          </div>
          
          <div className="bg-yellow-50 p-4 rounded-lg text-center">
            <div className="text-2xl font-bold text-yellow-700">{overallStats.away_with_notice}</div>
            <div className="text-sm text-yellow-500">Away With Notice</div>
          </div>
        </div>
        
        <div className="p-6 border-t">
          <h3 className="text-lg font-medium mb-4">Overall Attendance Rate</h3>
          <div className="w-full bg-gray-200 rounded-full h-4">
            <div 
              className={`h-4 rounded-full ${
                overallStats.attendance_rate >= 80 ? 'bg-green-600' :
                overallStats.attendance_rate >= 60 ? 'bg-yellow-500' :
                'bg-red-600'
              }`}
              style={{ width: `${overallStats.attendance_rate}%` }}
            ></div>
          </div>
          <div className="mt-2 text-right font-medium">
            {overallStats.attendance_rate}%
          </div>
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

  // Render group stats
  const renderGroupStats = () => {
    if (!groupStats || groupStats.length === 0) {
      return null;
    }
    
    return (
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <h3 className="text-lg font-medium p-6 border-b">Group Breakdown</h3>
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
                      <div className="w-24 bg-gray-200 rounded-full h-2.5 mr-2">
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
        <h3 className="text-lg font-medium p-6 border-b">Register Details</h3>
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
                  Time
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Present
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Absent
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
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {register.time_slot.start_time}-{register.time_slot.end_time}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600">
                    {register.stats.present} / {register.stats.total}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-red-600">
                    {register.stats.absent + register.stats.sick + register.stats.away_with_notice}
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

  // Render content
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
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {/* Term Filter */}
          <div>
            <label htmlFor="period" className="block text-sm font-medium text-gray-700 mb-1">
              Term
            </label>
            <select
              id="period"
              value={selectedPeriodId || ''}
              onChange={handlePeriodChange}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            >
              <option value="">Select Term</option>
              {periods.map(period => (
                <option key={period.id} value={period.id}>{period.name}</option>
              ))}
            </select>
          </div>
          
          {/* Day Filter */}
          <div>
            <label htmlFor="day" className="block text-sm font-medium text-gray-700 mb-1">
              Day
            </label>
            <select
              id="day"
              value={selectedDay}
              onChange={handleDayChange}
              disabled={!selectedPeriodId || days.length === 0}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 disabled:bg-gray-100"
            >
              <option value="">All Days</option>
              {days.map(day => (
                <option key={day.value} value={day.value}>{day.label}</option>
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
              disabled={!userInfo?.is_admin || loadingUserInfo}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 disabled:bg-gray-100"
            >
              <option value="">All Coaches</option>
              {coaches.map(coach => (
                <option key={coach.id} value={coach.id}>{coach.name}</option>
              ))}
            </select>
            {loadingUserInfo ? (
              <div className="text-xs text-gray-500 mt-1">Loading user info...</div>
            ) : loadingCoaches ? (
              <div className="text-xs text-gray-500 mt-1">Loading coaches...</div>
            ) : coaches.length === 0 ? (
              <div className="text-xs text-yellow-600 mt-1">
                No coaches found for your tennis club
              </div>
            ) : null}
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
              disabled={!selectedDay || groups.length === 0}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 disabled:bg-gray-100"
            >
              <option value="">All Groups</option>
              {groups.map(group => (
                <option key={group.id} value={group.id}>{group.name}</option>
              ))}
            </select>
            {selectedDay && groups.length === 0 && (
              <p className="text-sm text-red-500 mt-1">No groups found for this day</p>
            )}
          </div>
          
          {/* Session Filter */}
          <div>
            <label htmlFor="session" className="block text-sm font-medium text-gray-700 mb-1">
              Session
            </label>
            <select
              id="session"
              value={selectedSessionId || ''}
              onChange={handleSessionChange}
              disabled={!selectedGroupId || sessions.length === 0}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 disabled:bg-gray-100"
            >
              <option value="">All Sessions</option>
              {sessions.map(session => (
                <option key={session.id} value={session.id}>{session.time_display}</option>
              ))}
            </select>
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
        <>
          {/* Overall Stats Card */}
          {renderStatsCard()}
          
          {/* Weekly Stats Table */}
          <div className="mt-8">
            {renderWeeklyStats()}
          </div>
          
          {/* Group Stats Table (shown only when multiple groups are in results) */}
          {groupStats.length > 1 && (
            <div className="mt-8">
              {renderGroupStats()}
            </div>
          )}
          
          {/* Individual Register Table */}
          <div className="mt-8">
            {renderRegisterStats()}
          </div>
        </>
      )}
    </div>
  );
};

export default AttendanceStats;