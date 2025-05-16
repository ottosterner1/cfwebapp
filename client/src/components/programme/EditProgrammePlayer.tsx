import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '../../components/ui/card';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { Coach, Group, TeachingPeriod } from '../../types/programme';

interface GroupTime {
  id: number;
  day_of_week: string;
  start_time: string;
  end_time: string;
}

interface FormData {
  id: number;
  player_name: string;
  date_of_birth: string;
  contact_email: string;
  contact_number: string;
  emergency_contact_number: string;
  medical_information: string;
  coach_id: string;
  group_id: string;
  group_time_id: string;
  teaching_period_id: string;
  walk_home: string; // "yes", "no", or "na"
  notes: string;
}

const EditProgrammePlayer: React.FC = () => {
  const urlParts = window.location.pathname.split('/');
  const clubId = urlParts[3];
  const playerId = urlParts[5];

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState<FormData>({
    id: parseInt(playerId),
    player_name: '',
    date_of_birth: '',
    contact_email: '',
    contact_number: '',
    emergency_contact_number: '',
    medical_information: '',
    coach_id: '',
    group_id: '',
    group_time_id: '',
    teaching_period_id: '',
    walk_home: 'na',
    notes: ''
  });

  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupTimes, setGroupTimes] = useState<GroupTime[]>([]);
  const [periods, setPeriods] = useState<TeachingPeriod[]>([]);
  const [returnUrl] = useState<string>(`/clubs/manage/${clubId}/players`);

  useEffect(() => {
    const fetchData = async (): Promise<void> => {
      try {
        // Fetch player, coaches, groups, and periods in parallel
        const [playerRes, coachesRes, groupsRes, periodsRes] = await Promise.all([
          fetch(`/clubs/api/players/${playerId}`),
          fetch('/clubs/api/coaches'),
          fetch('/clubs/api/groups'),
          fetch('/clubs/api/teaching-periods')
        ]);

        if (!playerRes.ok || !coachesRes.ok || !groupsRes.ok || !periodsRes.ok) {
          throw new Error('Failed to fetch data');
        }

        const [playerData, coachesData, groupsData, periodsData] = await Promise.all([
          playerRes.json(),
          coachesRes.json(),
          groupsRes.json(),
          periodsRes.json()
        ]);

        // Convert walk_home boolean to string value
        let walkHomeValue = 'na';
        if (playerData.walk_home === true) {
          walkHomeValue = 'yes';
        } else if (playerData.walk_home === false) {
          walkHomeValue = 'no';
        }

        // Set player data to form
        setFormData({
          id: playerData.id,
          player_name: playerData.student?.name || '', 
          date_of_birth: playerData.student?.date_of_birth || '',
          contact_email: playerData.student?.contact_email || '',
          contact_number: playerData.student?.contact_number || '',
          emergency_contact_number: playerData.student?.emergency_contact_number || '',
          medical_information: playerData.student?.medical_information || '',
          coach_id: playerData.coach_id.toString(),
          group_id: playerData.group_id.toString(),
          group_time_id: playerData.group_time_id ? playerData.group_time_id.toString() : '',
          teaching_period_id: playerData.teaching_period_id.toString(),
          walk_home: walkHomeValue,
          notes: playerData.notes || ''
        });

        // Set other form data
        setCoaches(coachesData);
        setGroups(groupsData);
        setPeriods(periodsData);

        // Also fetch group times for the selected group
        if (playerData.group_id) {
          const groupTimesRes = await fetch(`/clubs/api/groups/${playerData.group_id}/times`);
          if (groupTimesRes.ok) {
            const groupTimesData = await groupTimesRes.json();
            setGroupTimes(groupTimesData);
          }
        }
      } catch (err) {
        console.error('Error fetching data:', err);
        setError('Failed to load form data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [playerId]);

  // Fetch group times when group is selected/changed
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
      }
    };

    fetchGroupTimes();
  }, [formData.group_id]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>): void => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Convert walk_home string value to boolean or null for the API
      let walkHomeValue = null;
      if (formData.walk_home === 'yes') {
        walkHomeValue = true;
      } else if (formData.walk_home === 'no') {
        walkHomeValue = false;
      }

      const submissionData = {
        student_name: formData.player_name, // Backend still uses student_name
        date_of_birth: formData.date_of_birth,
        contact_email: formData.contact_email,
        contact_number: formData.contact_number || null,
        emergency_contact_number: formData.emergency_contact_number || null,
        medical_information: formData.medical_information || null,
        coach_id: parseInt(formData.coach_id),
        group_id: parseInt(formData.group_id),
        group_time_id: formData.group_time_id ? parseInt(formData.group_time_id) : null,
        teaching_period_id: parseInt(formData.teaching_period_id),
        walk_home: walkHomeValue,
        notes: formData.notes || null 
      };

      const response = await fetch(`/clubs/api/players/${playerId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(submissionData)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update player');
      }

      // Redirect back to programme management while preserving scroll position
      window.location.href = returnUrl;
    } catch (err) {
      console.error('Error updating player:', err);
      setError(err instanceof Error ? err.message : 'Failed to update player');
      setLoading(false);
    }
  };

  const handleDelete = async (): Promise<void> => {
    if (!confirm('Are you sure you want to delete this player? This action cannot be undone.')) {
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`/clubs/api/players/${playerId}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete player');
      }

      // Redirect back to programme management
      window.location.href = returnUrl;
    } catch (err) {
      console.error('Error deleting player:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete player');
      setLoading(false);
    }
  };

  const handleCancel = (): void => {
    window.location.href = returnUrl;
  };

  const formatTime = (time: string): string => {
    return new Date(`2000-01-01T${time}`).toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  if (loading && formData.player_name === '') {
    return (
      <div className="text-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-500 mx-auto"></div>
        <p className="mt-2 text-gray-600">Loading player data...</p>
      </div>
    );
  }

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
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold mb-10">Edit Programme Player</h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {/* Player Information */}
            <div className="space-y-2 col-span-2">
              <h2 className="text-lg font-semibold border-b pb-2 text-gray-700">Player Information</h2>
            </div>

            <div className="space-y-2">
              <label htmlFor="player_name" className="block text-sm font-medium text-gray-700">
                Player Name*
              </label>
              <input
                id="player_name"
                name="player_name"
                type="text"
                value={formData.player_name}
                onChange={handleInputChange}
                required
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="date_of_birth" className="block text-sm font-medium text-gray-700">
                Date of Birth*
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
                Contact Email*
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
              <label htmlFor="contact_number" className="block text-sm font-medium text-gray-700">
                Contact Number
              </label>
              <input
                id="contact_number"
                name="contact_number"
                type="tel"
                value={formData.contact_number}
                onChange={handleInputChange}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="emergency_contact_number" className="block text-sm font-medium text-gray-700">
                Emergency Contact Number
              </label>
              <input
                id="emergency_contact_number"
                name="emergency_contact_number"
                type="tel"
                value={formData.emergency_contact_number}
                onChange={handleInputChange}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
              />
            </div>

            <div className="space-y-2 col-span-2">
              <label htmlFor="medical_information" className="block text-sm font-medium text-gray-700">
                Medical Information
              </label>
              <textarea
                id="medical_information"
                name="medical_information"
                rows={3}
                value={formData.medical_information}
                onChange={handleInputChange}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                placeholder="Enter any relevant medical information, allergies, or special needs"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="walk_home" className="block text-sm font-medium text-gray-700">
                Walk Home Permission
              </label>
              <select
                id="walk_home"
                name="walk_home"
                value={formData.walk_home}
                onChange={handleInputChange}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
              >
                <option value="na">Not Applicable</option>
                <option value="yes">Yes - Allowed to walk home unaccompanied</option>
                <option value="no">No - Must be collected by guardian</option>
              </select>
            </div>

            <div className="space-y-2 col-span-2">
              <label htmlFor="notes" className="block text-sm font-medium text-gray-700">
                Notes
              </label>
              <textarea
                id="notes"
                name="notes"
                rows={3}
                value={formData.notes}
                onChange={handleInputChange}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                placeholder="Add any notes about this player (optional)"
              />
            </div>

            {/* Programme Assignment */}
            <div className="space-y-2 col-span-2 mt-4">
              <h2 className="text-lg font-semibold border-b pb-2 text-gray-700">Programme Assignment</h2>
            </div>

            <div className="space-y-2">
              <label htmlFor="coach_id" className="block text-sm font-medium text-gray-700">
                Coach*
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
                Group*
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

            <div className="space-y-2">
              <label htmlFor="group_time_id" className="block text-sm font-medium text-gray-700">
                Group Time*
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
                Teaching Period*
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
              onClick={handleDelete}
              className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
            >
              Delete Player
            </button>
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
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};

export default EditProgrammePlayer;