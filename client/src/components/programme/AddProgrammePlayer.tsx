import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '../../components/ui/card';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { Coach, Group, TeachingPeriod, AddPlayerFormData } from '../../types/programme';

interface GroupTime {
  id: number;
  day_of_week: string;
  start_time: string;
  end_time: string;
}

interface FormData {
  student_name: string;
  date_of_birth: string;
  contact_email: string;
  coach_id: string;
  group_id: string;
  group_time_id: string;
  teaching_period_id: string;
}

const AddProgrammePlayer: React.FC = () => {
  const urlParts = window.location.pathname.split('/');
  const clubId = urlParts[3];

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState<FormData>({
    student_name: '',
    date_of_birth: '',
    contact_email: '',
    coach_id: '',
    group_id: '',
    group_time_id: '',
    teaching_period_id: ''
  });

  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupTimes, setGroupTimes] = useState<GroupTime[]>([]);
  const [periods, setPeriods] = useState<TeachingPeriod[]>([]);

  useEffect(() => {
    const fetchData = async (): Promise<void> => {
      try {
        const [coachesRes, groupsRes, periodsRes] = await Promise.all([
          fetch('/clubs/api/coaches'),
          fetch('/clubs/api/groups'),
          fetch('/clubs/api/teaching-periods')
        ]);

        if (!coachesRes.ok || !groupsRes.ok || !periodsRes.ok) {
          throw new Error('Failed to fetch data');
        }

        const [coachesData, groupsData, periodsData] = await Promise.all([
          coachesRes.json(),
          groupsRes.json(),
          periodsRes.json()
        ]);

        setCoaches(coachesData);
        setGroups(groupsData);
        setPeriods(periodsData);
      } catch (err) {
        console.error('Error fetching data:', err);
        setError('Failed to load form data');
      }
    };

    fetchData();
  }, [clubId]);

  // Fetch group times when group is selected
  useEffect(() => {
    const fetchGroupTimes = async () => {
      if (!formData.group_id) {
        setGroupTimes([]);
        return;
      }

      try {
        const response = await fetch(`/clubs/api/groups/${formData.group_id}/times`);
        if (!response.ok) throw new Error('Failed to fetch group times');
        const data = await response.json();
        setGroupTimes(data);
      } catch (err) {
        console.error('Error fetching group times:', err);
        setError('Failed to load group times');
      }
    };

    fetchGroupTimes();
  }, [formData.group_id]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>): void => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const submissionData: AddPlayerFormData = {
        student_name: formData.student_name,
        date_of_birth: formData.date_of_birth,
        contact_email: formData.contact_email,
        coach_id: parseInt(formData.coach_id),
        group_id: parseInt(formData.group_id),
        group_time_id: parseInt(formData.group_time_id),
        teaching_period_id: parseInt(formData.teaching_period_id)
      };

      const response = await fetch('/clubs/api/players', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(submissionData)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to add player');
      }

      window.location.href = `/clubs/manage/${clubId}/players`;
    } catch (err) {
      console.error('Error adding player:', err);
      setError(err instanceof Error ? err.message : 'Failed to add player');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = (): void => {
    window.location.href = `/clubs/manage/${clubId}/players`;
  };

  const formatTime = (time: string): string => {
    return new Date(`2000-01-01T${time}`).toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  return (
    <Card>
      <CardContent>
        <h1 className="text-2xl font-bold mb-10">Add New Programme Player</h1>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {/* Existing fields remain the same */}
            <div className="space-y-2">
              <label htmlFor="student_name" className="block text-sm font-medium text-gray-700">
                Student Name
              </label>
              <input
                id="student_name"
                name="student_name"
                type="text"
                value={formData.student_name}
                onChange={handleInputChange}
                required
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="date_of_birth" className="block text-sm font-medium text-gray-700">
                Date of Birth
              </label>
              <input
                id="date_of_birth"
                name="date_of_birth"
                type="date"
                value={formData.date_of_birth}
                onChange={handleInputChange}
                required
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="contact_email" className="block text-sm font-medium text-gray-700">
                Contact Email
              </label>
              <input
                id="contact_email"
                name="contact_email"
                type="email"
                value={formData.contact_email}
                onChange={handleInputChange}
                required
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="coach_id" className="block text-sm font-medium text-gray-700">
                Coach
              </label>
              <select
                id="coach_id"
                name="coach_id"
                value={formData.coach_id}
                onChange={handleInputChange}
                required
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
              >
                <option value="">Select a coach</option>
                {coaches.map(coach => (
                  <option key={coach.id} value={coach.id}>
                    {coach.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label htmlFor="group_id" className="block text-sm font-medium text-gray-700">
                Group
              </label>
              <select
                id="group_id"
                name="group_id"
                value={formData.group_id}
                onChange={handleInputChange}
                required
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
              >
                <option value="">Select a group</option>
                {groups.map(group => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            </div>

            {/* New Group Time Selection */}
            <div className="space-y-2">
              <label htmlFor="group_time_id" className="block text-sm font-medium text-gray-700">
                Group Time
              </label>
              <select
                id="group_time_id"
                name="group_time_id"
                value={formData.group_time_id}
                onChange={handleInputChange}
                required
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
              >
                <option value="">Select a time slot</option>
                {groupTimes.map(time => (
                  <option key={time.id} value={time.id}>
                    {time.day_of_week} {formatTime(time.start_time)} - {formatTime(time.end_time)}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label htmlFor="teaching_period_id" className="block text-sm font-medium text-gray-700">
                Teaching Period
              </label>
              <select
                id="teaching_period_id"
                name="teaching_period_id"
                value={formData.teaching_period_id}
                onChange={handleInputChange}
                required
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
              >
                <option value="">Select a teaching period</option>
                {periods.map(period => (
                  <option key={period.id} value={period.id}>
                    {period.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-6 flex justify-end space-x-3">
            <button
              type="button"
              onClick={handleCancel}
              className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors disabled:opacity-50"
            >
              {loading ? 'Adding...' : 'Add Player'}
            </button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};

export default AddProgrammePlayer;