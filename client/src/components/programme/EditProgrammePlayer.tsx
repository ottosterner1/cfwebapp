import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '../../components/ui/card';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { Coach, Group, TeachingPeriod } from '../../types/programme';
import { ChevronDown, ChevronUp, Save, X, Trash2, Loader2 } from 'lucide-react';

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

interface FormSectionProps {
  title: string;
  isOpen: boolean;
  toggleOpen: () => void;
  children: React.ReactNode;
}

const FormSection: React.FC<FormSectionProps> = ({ title, isOpen, toggleOpen, children }) => (
  <div className="mb-6 border rounded-lg overflow-hidden bg-white shadow-sm">
    <button 
      type="button"
      onClick={toggleOpen}
      className="w-full flex justify-between items-center p-4 text-left font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
    >
      <span className="text-lg">{title}</span>
      {isOpen ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
    </button>
    {isOpen && (
      <div className="p-4 border-t">
        {children}
      </div>
    )}
  </div>
);

const FormField = ({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) => (
  <div className="mb-4">
    <label className="block text-sm font-medium text-gray-700 mb-1">
      {label}{required && <span className="text-red-500 ml-1">*</span>}
    </label>
    {children}
  </div>
);

const EditProgrammePlayer: React.FC = () => {
  const urlParts = window.location.pathname.split('/');
  const clubId = urlParts[3];
  const playerId = urlParts[5];

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
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

  // Sections open state
  const [sections, setSections] = useState({
    personalInfo: true,
    contactInfo: true,
    programmeInfo: true
  });

  const toggleSection = (section: keyof typeof sections) => {
    setSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

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
        setError('Failed to load player data');
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
    setSubmitting(true);
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
        student_name: formData.player_name,
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

      // Redirect back to programme management
      window.location.href = returnUrl;
    } catch (err) {
      console.error('Error updating player:', err);
      setError(err instanceof Error ? err.message : 'Failed to update player');
      setSubmitting(false);
    }
  };

  const handleDelete = async (): Promise<void> => {
    if (!confirm('Are you sure you want to delete this player? This action cannot be undone.')) {
      return;
    }

    setSubmitting(true);
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
      setSubmitting(false);
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

  if (loading) {
    return (
      <div className="px-4 py-6 md:px-6 mx-auto max-w-3xl">
        <Card className="shadow-lg">
          <CardContent>
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-indigo-500 mx-auto"></div>
              <p className="mt-4 text-gray-600">Loading player data...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-4 py-6 md:px-6 mx-auto max-w-3xl">
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  const inputClasses = "w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500";
  const selectClasses = "w-full p-3 pr-10 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500";

  return (
    <div className="px-4 py-6 md:px-6 mx-auto max-w-3xl">
      <Card className="shadow-lg">
        <CardContent>
          <div className="sticky top-0 z-10 bg-white p-4 border-b rounded-t-lg shadow-sm">
            <h1 className="text-xl md:text-2xl font-bold text-gray-800">Edit Player</h1>
          </div>

          <form onSubmit={handleSubmit} className="p-4">
            {/* Personal Information Section */}
            <FormSection 
              title="Player Information" 
              isOpen={sections.personalInfo}
              toggleOpen={() => toggleSection('personalInfo')}
            >
              <FormField label="Player Name" required>
                <input
                  id="player_name"
                  name="player_name"
                  type="text"
                  value={formData.player_name}
                  onChange={handleInputChange}
                  required
                  className={inputClasses}
                  placeholder="Enter player's full name"
                />
              </FormField>

              <FormField label="Date of Birth" required>
                <input
                  id="date_of_birth"
                  name="date_of_birth"
                  type="date"
                  value={formData.date_of_birth}
                  onChange={handleInputChange}
                  required
                  className={inputClasses}
                />
              </FormField>

              <FormField label="Medical Information">
                <textarea
                  id="medical_information"
                  name="medical_information"
                  rows={3}
                  value={formData.medical_information}
                  onChange={handleInputChange}
                  className={inputClasses}
                  placeholder="Enter any relevant medical information, allergies, or special needs"
                />
              </FormField>

              <FormField label="Notes">
                <textarea
                  id="notes"
                  name="notes"
                  rows={3}
                  value={formData.notes}
                  onChange={handleInputChange}
                  className={inputClasses}
                  placeholder="Add any additional notes about this player"
                />
              </FormField>

              <FormField label="Walk Home Permission">
                <select
                  id="walk_home"
                  name="walk_home"
                  value={formData.walk_home}
                  onChange={handleInputChange}
                  className={selectClasses}
                >
                  <option value="na">Not Applicable</option>
                  <option value="yes">Yes - Allowed to walk home unaccompanied</option>
                  <option value="no">No - Must be collected by guardian</option>
                </select>
              </FormField>
            </FormSection>

            {/* Contact Information Section */}
            <FormSection 
              title="Contact Information" 
              isOpen={sections.contactInfo}
              toggleOpen={() => toggleSection('contactInfo')}
            >
              <FormField label="Contact Email" required>
                <input
                  id="contact_email"
                  name="contact_email"
                  type="email"
                  value={formData.contact_email}
                  onChange={handleInputChange}
                  required
                  className={inputClasses}
                  placeholder="Enter parent/guardian email"
                />
              </FormField>

              <FormField label="Contact Number">
                <input
                  id="contact_number"
                  name="contact_number"
                  type="tel"
                  value={formData.contact_number}
                  onChange={handleInputChange}
                  className={inputClasses}
                  placeholder="Enter contact phone number"
                />
              </FormField>

              <FormField label="Emergency Contact Number">
                <input
                  id="emergency_contact_number"
                  name="emergency_contact_number"
                  type="tel"
                  value={formData.emergency_contact_number}
                  onChange={handleInputChange}
                  className={inputClasses}
                  placeholder="Enter emergency contact number"
                />
              </FormField>
            </FormSection>

            {/* Programme Assignment Section */}
            <FormSection 
              title="Programme Assignment" 
              isOpen={sections.programmeInfo}
              toggleOpen={() => toggleSection('programmeInfo')}
            >
              <FormField label="Teaching Period" required>
                <select
                  id="teaching_period_id"
                  name="teaching_period_id"
                  value={formData.teaching_period_id}
                  onChange={handleInputChange}
                  required
                  className={selectClasses}
                >
                  <option value="">Select a teaching period</option>
                  {periods.map(period => (
                    <option key={period.id} value={period.id}>
                      {period.name}
                    </option>
                  ))}
                </select>
              </FormField>

              <FormField label="Coach" required>
                <select
                  id="coach_id"
                  name="coach_id"
                  value={formData.coach_id}
                  onChange={handleInputChange}
                  required
                  className={selectClasses}
                >
                  <option value="">Select a coach</option>
                  {coaches.map(coach => (
                    <option key={coach.id} value={coach.id}>
                      {coach.name}
                    </option>
                  ))}
                </select>
              </FormField>

              <FormField label="Group" required>
                <select
                  id="group_id"
                  name="group_id"
                  value={formData.group_id}
                  onChange={handleInputChange}
                  required
                  className={selectClasses}
                >
                  <option value="">Select a group</option>
                  {groups.map(group => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </select>
              </FormField>

              <FormField label="Group Time" required>
                <select
                  id="group_time_id"
                  name="group_time_id"
                  value={formData.group_time_id}
                  onChange={handleInputChange}
                  required
                  className={selectClasses}
                  disabled={!formData.group_id || groupTimes.length === 0}
                >
                  <option value="">
                    {!formData.group_id 
                      ? "Select a group first" 
                      : groupTimes.length === 0 
                        ? "No time slots available" 
                        : "Select a time slot"}
                  </option>
                  {groupTimes.map(time => (
                    <option key={time.id} value={time.id}>
                      {time.day_of_week} {formatTime(time.start_time)} - {formatTime(time.end_time)}
                    </option>
                  ))}
                </select>
                {formData.group_id && groupTimes.length === 0 && (
                  <p className="mt-1 text-sm text-amber-600">
                    No time slots found for this group. Please select a different group or add time slots.
                  </p>
                )}
              </FormField>
            </FormSection>

            {/* Action buttons */}
            <div className="sticky bottom-0 left-0 right-0 mt-6 flex flex-col gap-3 pt-4 border-t bg-white md:flex-row">
              <button
                type="button"
                onClick={handleDelete}
                className="py-3 px-4 border border-red-500 rounded-lg text-red-500 font-medium hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors"
              >
                <span className="flex items-center justify-center">
                  <Trash2 size={18} className="mr-2" />
                  Delete Player
                </span>
              </button>
              <div className="flex flex-1 gap-3">
                <button
                  type="button"
                  onClick={handleCancel}
                  className="flex-1 py-3 px-4 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-colors"
                >
                  <span className="flex items-center justify-center">
                    <X size={18} className="mr-2" />
                    Cancel
                  </span>
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-3 px-4 bg-indigo-600 border border-transparent rounded-lg text-white font-medium hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors disabled:opacity-50"
                >
                  <span className="flex items-center justify-center">
                    {submitting ? (
                      <>
                        <Loader2 size={18} className="mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save size={18} className="mr-2" />
                        Save Changes
                      </>
                    )}
                  </span>
                </button>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default EditProgrammePlayer;