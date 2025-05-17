import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '../../components/ui/card';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { Coach, Group, TeachingPeriod } from '../../types/programme';
import { ChevronDown, ChevronUp, Save, X, Loader2 } from 'lucide-react';

interface GroupTime {
  id: number;
  day_of_week: string;
  start_time: string;
  end_time: string;
}

interface FormData {
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
  walk_home: string;
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

const AddProgrammePlayer: React.FC = () => {
  const urlParts = window.location.pathname.split('/');
  const clubId = urlParts[3];

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState<FormData>({
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
        student_name: formData.player_name,
        date_of_birth: formData.date_of_birth,
        contact_email: formData.contact_email,
        contact_number: formData.contact_number || null,
        emergency_contact_number: formData.emergency_contact_number || null,
        medical_information: formData.medical_information || null,
        coach_id: parseInt(formData.coach_id),
        group_id: parseInt(formData.group_id),
        group_time_id: parseInt(formData.group_time_id),
        teaching_period_id: parseInt(formData.teaching_period_id),
        walk_home: walkHomeValue,
        notes: formData.notes || null
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
      <Alert variant="destructive" className="mb-4">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  const inputClasses = "w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500";
  const selectClasses = "w-full p-3 pr-10 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500";

  return (
    <div className="px-4 py-6 md:px-6 mx-auto max-w-3xl">
      <Card className="shadow-lg">
        <CardContent>
          <div className="sticky top-0 z-10 bg-white p-4 border-b rounded-t-lg shadow-sm">
            <h1 className="text-xl md:text-2xl font-bold text-gray-800">Add New Player</h1>
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

            {/* Fixed action buttons */}
            <div className="sticky bottom-0 left-0 right-0 mt-6 flex gap-3 pt-4 border-t bg-white">
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
                disabled={loading}
                className="flex-1 py-3 px-4 bg-indigo-600 border border-transparent rounded-lg text-white font-medium hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors disabled:opacity-50"
              >
                <span className="flex items-center justify-center">
                  {loading ? (
                    <>
                      <Loader2 size={18} className="mr-2 animate-spin" />
                      Adding...
                    </>
                  ) : (
                    <>
                      <Save size={18} className="mr-2" />
                      Add Player
                    </>
                  )}
                </span>
              </button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default AddProgrammePlayer;