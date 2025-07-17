import React, { useState, useEffect } from 'react';
import { AttendanceStatus } from '../../types/register';

interface RegisterDetailProps {
  registerId: string;
  onNavigate: (path: string) => void;
  onEdit: () => void;
}

interface RegisterEntry {
  id: number | string;
  student_id: number | null;
  student_name: string;
  attendance_status: AttendanceStatus;
  notes: string | null;
  predicted_attendance: boolean;
  is_makeup?: boolean;
  is_trial?: boolean;
  group_name?: string;
  trial_player_id?: number;
  contact_email?: string;
  contact_number?: string;
  date_of_birth?: string;
}

interface Coach {
  id: number;
  name: string;
}

interface RegisterData {
  id: number;
  date: string;
  group: {
    id: number;
    name: string;
  };
  time_slot: {
    id: number;
    day: string;
    start_time: string;
    end_time: string;
  };
  coach: {
    id: number;
    name: string;
  };
  assistant_coaches?: Coach[];
  notes: string | null;
  entries: RegisterEntry[];
  teaching_period: {
    id: number;
    name: string;
  };
  stats?: {
    total: number;
    present: number;
    absent: number;
    sick: number;
    away_with_notice: number;
    attendance_rate: number;
  };
}

const RegisterDetailView: React.FC<RegisterDetailProps> = ({ registerId, onNavigate, onEdit }) => {
  const [register, setRegister] = useState<RegisterData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Function to normalize attendance status values
  const normalizeAttendanceStatus = (status: string): AttendanceStatus => {
    // Convert to lowercase and remove any spaces or special characters
    const normalizedStatus = String(status).toLowerCase().trim();
    
    // Map to one of the valid AttendanceStatus types
    if (normalizedStatus === 'present') return 'present';
    if (normalizedStatus === 'absent') return 'absent';
    if (normalizedStatus === 'sick') return 'sick';
    if (normalizedStatus.includes('away') || normalizedStatus.includes('notice')) return 'away_with_notice';
    
    // Default fallback
    return 'absent';
  };

  useEffect(() => {
    const fetchRegister = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/registers/${registerId}`);
        
        if (!response.ok) {
          throw new Error(`Error fetching register: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        // Normalize attendance status values in entries
        if (data.entries) {
          data.entries = data.entries.map((entry: any) => ({
            ...entry,
            attendance_status: normalizeAttendanceStatus(entry.attendance_status)
          }));
        }
        
        setRegister(data);
        setError(null);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An error occurred';
        setError(errorMessage);
        console.error('Error fetching register details:', err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchRegister();
  }, [registerId]);

  // Format date to a more readable format
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  };

  // Format attendance status for display
  const formatAttendanceStatus = (status: AttendanceStatus): string => {
    switch(status) {
      case 'present':
        return 'Present';
      case 'absent':
        return 'Absent';
      case 'away_with_notice':
        return 'Away With Notice';
      case 'sick':
        return 'Sick';
      default:
        // Use type assertion to handle the TypeScript error
        const statusString = status as unknown as string;
        if (typeof statusString === 'string') {
          return statusString.charAt(0).toUpperCase() + 
                 statusString.slice(1).replace(/_/g, ' ');
        }
        return 'Unknown';
    }
  };

  // Get attendance status class and color
  const getStatusClassAndIcon = (status: AttendanceStatus) => {
    // Normalize the status to handle any potential variations
    const normalizedStatus = String(status).toLowerCase().trim();
    
    if (normalizedStatus === 'present') {
      return {
        className: 'bg-green-100 text-green-800 border-green-500',
        icon: '✓'
      };
    } else if (normalizedStatus === 'absent') {
      return {
        className: 'bg-red-100 text-red-800 border-red-500',
        icon: '✗'
      };
    } else if (normalizedStatus.includes('away') || normalizedStatus.includes('notice')) {
      return {
        className: 'bg-yellow-100 text-yellow-800 border-yellow-500',
        icon: '⚠'
      };
    } else if (normalizedStatus === 'sick') {
      return {
        className: 'bg-blue-100 text-blue-800 border-blue-500',
        icon: '🤒'
      };
    } else {
      return {
        className: 'bg-gray-100 text-gray-800 border-gray-500',
        icon: '?'
      };
    }
  };

  // Calculate attendance totals
  const calculateAttendanceCounts = (entries: RegisterEntry[] = []) => {
    const counts = {
      total: entries.length,
      present: 0,
      absent: 0,
      away_with_notice: 0,
      sick: 0
    };
    
    entries.forEach(entry => {
      const status = normalizeAttendanceStatus(entry.attendance_status as string);
      if (status === 'present') counts.present++;
      else if (status === 'absent') counts.absent++;
      else if (status === 'away_with_notice') counts.away_with_notice++;
      else if (status === 'sick') counts.sick++;
    });
    
    return counts;
  };

  // Calculate attendance rate - only counting PRESENT as attendance
  const calculateAttendanceRate = (entries: RegisterEntry[] = []) => {
    if (entries.length === 0) return 0;
    
    const counts = calculateAttendanceCounts(entries);
    const rate = Math.round((counts.present / counts.total) * 100);
    
    return rate;
  };

  // Separate entries by type
  const separateEntries = (entries: RegisterEntry[] = []) => {
    const regular = entries.filter(entry => !entry.is_trial && !entry.is_makeup);
    const makeup = entries.filter(entry => entry.is_makeup && !entry.is_trial);
    const trial = entries.filter(entry => entry.is_trial);
    
    return { regular, makeup, trial };
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-700"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 p-6 rounded-lg">
        <h2 className="text-lg font-medium text-red-700 mb-2">Error Loading Register</h2>
        <p className="text-red-600">{error}</p>
        <button
          onClick={() => onNavigate('/registers')}
          className="mt-4 px-4 py-2 bg-red-100 text-red-700 rounded-md hover:bg-red-200"
        >
          Back to Registers
        </button>
      </div>
    );
  }

  if (!register) {
    return (
      <div className="bg-yellow-50 p-6 rounded-lg">
        <h2 className="text-lg font-medium text-yellow-700 mb-2">Register Not Found</h2>
        <p className="text-yellow-600">The requested register could not be found.</p>
        <button
          onClick={() => onNavigate('/registers')}
          className="mt-4 px-4 py-2 bg-yellow-100 text-yellow-700 rounded-md hover:bg-yellow-200"
        >
          Back to Registers
        </button>
      </div>
    );
  }

  // Calculate stats if they don't exist yet
  const attendanceCounts = register.stats || calculateAttendanceCounts(register.entries);
  const attendanceRate = register.stats?.attendance_rate ?? calculateAttendanceRate(register.entries);
  const { regular, makeup, trial } = separateEntries(register.entries);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center flex-wrap">
        <h1 className="text-2xl font-bold">Register Details</h1>
        <div className="flex space-x-3 mt-2 sm:mt-0">
          <button
            onClick={onEdit}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 shadow"
          >
            Edit Register
          </button>
          <button
            onClick={() => onNavigate('/registers')}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
          >
            Back to Registers
          </button>
        </div>
      </div>

      {/* Register header info */}
      <div className="bg-white p-6 rounded-lg shadow">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div>
            <h3 className="text-sm font-medium text-gray-500">Date & Time</h3>
            <p className="mt-1 text-lg font-semibold">{register.date ? formatDate(register.date) : 'Unknown date'}</p>
            <p className="text-md">{register.time_slot?.day || 'Unknown day'}, {register.time_slot?.start_time || '--:--'} - {register.time_slot?.end_time || '--:--'}</p>
          </div>
          
          <div>
            <h3 className="text-sm font-medium text-gray-500">Group</h3>
            <p className="mt-1 text-lg font-semibold">{register.group?.name || 'Unknown group'}</p>
            <p className="text-md">{register.teaching_period?.name || 'Unknown teaching period'}</p>
          </div>
          
          <div>
            <h3 className="text-sm font-medium text-gray-500">Coaches</h3>
            <p className="mt-1 text-lg font-semibold">{register.coach?.name || 'Unknown coach'}</p>
            {register.assistant_coaches && register.assistant_coaches.length > 0 && (
              <div className="mt-1">
                <p className="text-sm text-gray-500 mb-1">Assistant Coaches:</p>
                <div className="flex flex-wrap gap-1">
                  {register.assistant_coaches.map(coach => (
                    <span key={coach.id} className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-blue-50 text-blue-700">
                      {coach.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
        
        {register.notes && (
          <div className="mt-6 p-4 bg-gray-50 rounded-md">
            <h3 className="text-sm font-medium text-gray-500 mb-1">Notes</h3>
            <p className="whitespace-pre-line">{register.notes}</p>
          </div>
        )}
      </div>

      {/* Attendance stats */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-lg font-semibold mb-4">Attendance Statistics</h2>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="p-4 bg-green-50 rounded-lg">
            <p className="text-sm text-green-600">Present</p>
            <p className="text-2xl font-bold text-green-700">{attendanceCounts.present || 0}</p>
          </div>
          
          <div className="p-4 bg-red-50 rounded-lg">
            <p className="text-sm text-red-600">Absent</p>
            <p className="text-2xl font-bold text-red-700">{attendanceCounts.absent || 0}</p>
          </div>
          
          <div className="p-4 bg-yellow-50 rounded-lg">
            <p className="text-sm text-yellow-600">Away With Notice</p>
            <p className="text-2xl font-bold text-yellow-700">{attendanceCounts.away_with_notice || 0}</p>
          </div>
          
          <div className="p-4 bg-blue-50 rounded-lg">
            <p className="text-sm text-blue-600">Sick</p>
            <p className="text-2xl font-bold text-blue-700">{attendanceCounts.sick || 0}</p>
          </div>
        </div>

        {/* Player type breakdown */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="p-3 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-600">Regular Players</p>
            <p className="text-xl font-bold text-gray-700">{regular.length}</p>
          </div>
          
          {makeup.length > 0 && (
            <div className="p-3 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-600">Makeup Players</p>
              <p className="text-xl font-bold text-blue-700">{makeup.length}</p>
            </div>
          )}
          
          {trial.length > 0 && (
            <div className="p-3 bg-purple-50 rounded-lg">
              <p className="text-sm text-purple-600">Trial Players</p>
              <p className="text-xl font-bold text-purple-700">{trial.length}</p>
            </div>
          )}
        </div>
        
        <div className="mb-2">
          <div className="flex justify-between mb-1">
            <span className="text-sm font-medium">Attendance Rate</span>
            <span className="text-sm font-medium">{attendanceRate}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2.5">
            <div 
              className={`h-2.5 rounded-full ${
                attendanceRate >= 80 ? 'bg-green-600' :
                attendanceRate >= 60 ? 'bg-yellow-500' :
                'bg-red-600'
              }`}
              style={{ width: `${attendanceRate}%` }}
            ></div>
          </div>
        </div>
        <div className="mt-2 text-xs text-gray-500">
          <p>* Attendance rate is calculated based on present students only</p>
        </div>
      </div>

      {/* Attendance list */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <h2 className="text-lg font-semibold p-6 border-b">Attendance List</h2>
        
        {register.entries && register.entries.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Student
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Notes
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {register.entries.map((entry) => {
                  const { className, icon } = getStatusClassAndIcon(entry.attendance_status);
                  return (
                    <tr key={entry.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div>
                            <div className="text-sm font-medium text-gray-900">{entry.student_name}</div>
                            <div className="flex items-center gap-1 mt-1">
                              {entry.predicted_attendance && (
                                <span className="text-xs text-gray-500">Predicted attendance</span>
                              )}
                              {entry.is_makeup && (
                                <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800">
                                  Makeup ({entry.group_name})
                                </span>
                              )}
                              {entry.is_trial && (
                                <span className="px-2 py-1 text-xs rounded-full bg-purple-100 text-purple-800">
                                  Trial Player
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${className}`}>
                          <span className="mr-1">{icon}</span>
                          {formatAttendanceStatus(entry.attendance_status)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-pre-wrap">
                        <div className="text-sm text-gray-500">{entry.notes || '-'}</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-6 text-center text-gray-500">
            No attendance entries found.
          </div>
        )}
      </div>
    </div>
  );
};

export default RegisterDetailView;