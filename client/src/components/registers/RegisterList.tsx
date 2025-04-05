// client/src/components/registers/RegisterList.tsx

import React, { useState, useEffect } from 'react';
import { Register } from '../../types/register';

interface TeachingPeriod {
  id: number;
  name: string;
}

interface Group {
  id: number;
  name: string;
}

interface RegisterListProps {
  onNavigate: (registerId: string) => void;
  onCreateNew: () => void;
  onViewStats: () => void;
  periodId?: number;
  groupId?: number;
}

const RegisterList: React.FC<RegisterListProps> = ({ 
  onNavigate, 
  onCreateNew, 
  onViewStats,
  periodId: initialPeriodId, 
  groupId: initialGroupId 
}) => {
  const [registers, setRegisters] = useState<Register[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [periods, setPeriods] = useState<TeachingPeriod[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<number | undefined>(initialPeriodId);
  const [selectedGroup, setSelectedGroup] = useState<number | undefined>(initialGroupId);

  // Load teaching periods
  useEffect(() => {
    const fetchPeriods = async () => {
      try {
        const response = await fetch('/clubs/api/teaching-periods');
        if (!response.ok) throw new Error('Failed to fetch teaching periods');
        const data = await response.json();
        setPeriods(data);
        
        // If no period was explicitly selected, use the first one
        if (!selectedPeriod && data.length > 0) {
          setSelectedPeriod(data[0].id);
        }
      } catch (err) {
        console.error('Error fetching teaching periods:', err);
      }
    };
    
    fetchPeriods();
  }, []);
  
  // Load groups
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

  // Fetch registers when filters change
  useEffect(() => {
    const fetchRegisters = async () => {
      try {
        setLoading(true);
        
        // Build query params
        const params = new URLSearchParams();
        if (selectedPeriod) params.append('period_id', selectedPeriod.toString());
        if (selectedGroup) params.append('group_id', selectedGroup.toString());
        
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
    
    if (selectedPeriod) {
      fetchRegisters();
    }
  }, [selectedPeriod, selectedGroup]);

  // Format date to a more readable format
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  // Update filters
  const handlePeriodChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    setSelectedPeriod(value ? Number(value) : undefined);
  };
  
  const handleGroupChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    setSelectedGroup(value ? Number(value) : undefined);
  };

  return (
    <div className="space-y-6">
      {/* Header with buttons */}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Attendance Registers</h1>
        <div className="flex gap-2">
          <button
            onClick={onViewStats}
            className="px-4 py-2 bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200"
          >
            View Statistics
          </button>
          <button
            onClick={onCreateNew}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 shadow"
          >
            Create New Register
          </button>
        </div>
      </div>
      
      {/* Filters */}
      <div className="bg-white p-4 rounded-lg shadow">
        <h2 className="text-lg font-semibold mb-3">Filters</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="period" className="block text-sm font-medium text-gray-700 mb-1">
              Teaching Period
            </label>
            <select
              id="period"
              value={selectedPeriod || ''}
              onChange={handlePeriodChange}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            >
              <option value="">All Periods</option>
              {periods.map(period => (
                <option key={period.id} value={period.id}>{period.name}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label htmlFor="group" className="block text-sm font-medium text-gray-700 mb-1">
              Group
            </label>
            <select
              id="group"
              value={selectedGroup || ''}
              onChange={handleGroupChange}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            >
              <option value="">All Groups</option>
              {groups.map(group => (
                <option key={group.id} value={group.id}>{group.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Result display */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading ? (
          <div className="flex justify-center items-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-700"></div>
          </div>
        ) : error ? (
          <div className="p-4 text-red-500">{error}</div>
        ) : registers.length === 0 ? (
          <div className="p-4 text-center text-gray-500">
            No registers found. Use the Create Register button to create a new one.
          </div>
        ) : (
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
                    Time
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Coach
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Attendance
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {registers.map((register) => (
                  <tr key={register.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      {formatDate(register.date)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {register.group_name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {register.time_slot.day} {register.time_slot.start_time}-{register.time_slot.end_time}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {register.coach_name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        register.status === 'draft' ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'
                      }`}>
                        {register.status.charAt(0).toUpperCase() + register.status.slice(1)}
                      </span>
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
                        <span className="text-sm text-gray-700">
                          {register.stats.attendance_rate}%
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap space-x-3">
                      <button 
                        onClick={() => onNavigate(register.id.toString())}
                        className="text-blue-600 hover:text-blue-900"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default RegisterList;