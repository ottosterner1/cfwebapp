import React, { useState, useEffect } from 'react';
import { AttendanceStatus } from '../../types/register';

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
  trial_entry_id?: number;
  contact_email?: string;
  contact_number?: string;
  date_of_birth?: string;
}

interface RegisterDetail {
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
}

interface Coach {
  id: number;
  name: string;
}

interface RegisterEditProps {
  registerId: string;
  onNavigate: (path: string) => void;
  onSaveSuccess?: () => void;
}

const RegisterEdit: React.FC<RegisterEditProps> = ({ 
  registerId, 
  onNavigate,
  onSaveSuccess 
}) => {
  const [register, setRegister] = useState<RegisterDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  
  // Assistant coaches state
  const [availableCoaches, setAvailableCoaches] = useState<Coach[]>([]);
  const [selectedAssistantCoachIds, setSelectedAssistantCoachIds] = useState<number[]>([]);
  const [loadingCoaches, setLoadingCoaches] = useState<boolean>(false);

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

  // Fetch coaches
  useEffect(() => {
    const fetchCoaches = async () => {
      try {
        setLoadingCoaches(true);
        const response = await fetch('/clubs/api/coaches/organisation');
        
        if (!response.ok) {
          throw new Error(`Error fetching coaches: ${response.statusText}`);
        }
        
        const data = await response.json();
        setAvailableCoaches(data);
      } catch (err) {
        console.error('Error fetching coaches:', err);
      } finally {
        setLoadingCoaches(false);
      }
    };
    
    fetchCoaches();
  }, []);

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
        setNotes(data.notes || '');
        
        // Format date for input field (YYYY-MM-DD)
        if (data.date) {
          const formattedDate = new Date(data.date).toISOString().split('T')[0];
          setDate(formattedDate);
        }
        
        // Set assistant coach IDs if they exist in the data
        if (data.assistant_coaches && Array.isArray(data.assistant_coaches)) {
          setSelectedAssistantCoachIds(data.assistant_coaches.map((coach: any) => coach.id));
        }
        
        setError(null);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An error occurred';
        setError(errorMessage);
        console.error('Error fetching register:', err);
      } finally {
        setLoading(false);
      }
    };
    
    if (registerId) {
      fetchRegister();
    }
  }, [registerId]);

  // Toggle assistant coach selection
  const toggleAssistantCoach = (coachId: number) => {
    setSelectedAssistantCoachIds(prev => {
      if (prev.includes(coachId)) {
        return prev.filter(id => id !== coachId);
      } else {
        return [...prev, coachId];
      }
    });
  };

  const updateAttendanceStatus = (entryId: number | string, status: AttendanceStatus) => {
    if (!register) return;
    
    const updatedEntries = register.entries.map((entry: RegisterEntry) => {
      if (entry.id === entryId) {
        return { ...entry, attendance_status: status };
      }
      return entry;
    });
    
    setRegister({ ...register, entries: updatedEntries });
  };

  const updateNotes = (entryId: number | string, notes: string) => {
    if (!register) return;
    
    const updatedEntries = register.entries.map((entry: RegisterEntry) => {
      if (entry.id === entryId) {
        return { ...entry, notes };
      }
      return entry;
    });
    
    setRegister({ ...register, entries: updatedEntries });
  };

  const handleSave = async () => {
    if (!register) return;
    
    try {
      setIsSaving(true);
      setSaveMessage(null);
      
      // First update the entries - now including trial players
      const entriesResponse = await fetch(`/api/registers/${registerId}/entries`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entries: register.entries.map(entry => ({
            id: typeof entry.id === 'string' ? undefined : entry.id,
            player_id: typeof entry.id === 'number' ? entry.id : undefined,
            trial_player_id: entry.trial_player_id,
            trial_entry_id: entry.trial_entry_id,
            is_trial: entry.is_trial || false,
            attendance_status: entry.attendance_status,
            notes: entry.notes,
            predicted_attendance: entry.predicted_attendance,
            is_makeup: entry.is_makeup || false
          }))
        })
      });
      
      if (!entriesResponse.ok) {
        const errorData = await entriesResponse.json();
        throw new Error(errorData.error || 'Failed to update attendance entries');
      }
      
      // Update assistant coaches
      const assistantCoachesResponse = await fetch(`/api/registers/${registerId}/assistant-coaches`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          coach_ids: selectedAssistantCoachIds
        })
      });
      
      if (!assistantCoachesResponse.ok) {
        const errorData = await assistantCoachesResponse.json();
        throw new Error(errorData.error || 'Failed to update assistant coaches');
      }
      
      // Then update the register notes and date
      const registerResponse = await fetch(`/api/registers/${registerId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notes: notes,
          date: date
        })
      });
      
      if (!registerResponse.ok) {
        const errorData = await registerResponse.json();
        throw new Error(errorData.error || 'Failed to update register');
      }
      
      setSaveMessage('Register saved successfully');
      
      // Just refresh the data
      const refreshResponse = await fetch(`/api/registers/${registerId}`);
      if (refreshResponse.ok) {
        const updatedData = await refreshResponse.json();
        
        // Normalize attendance status values in refreshed data
        if (updatedData.entries) {
          updatedData.entries = updatedData.entries.map((entry: any) => ({
            ...entry,
            attendance_status: normalizeAttendanceStatus(entry.attendance_status)
          }));
        }
        
        setRegister(updatedData);
        
        // Update assistant coach IDs
        if (updatedData.assistant_coaches) {
          setSelectedAssistantCoachIds(updatedData.assistant_coaches.map((coach: any) => coach.id));
        }
      }
      
      if (onSaveSuccess) {
        onSaveSuccess();
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An error occurred while saving';
      setError(errorMessage);
      console.error('Error saving register:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!registerId) return;
    
    try {
      setIsDeleting(true);
      const response = await fetch(`/api/registers/${registerId}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete register');
      }
      
      // Success - redirect to the registers list
      onNavigate('/registers');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An error occurred while deleting';
      setError(errorMessage);
      console.error('Error deleting register:', err);
      setShowDeleteModal(false);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleMarkAllPresent = () => {
    if (!register) return;
    
    const updatedEntries = register.entries.map((entry: RegisterEntry) => ({
      ...entry, 
      attendance_status: 'present' as AttendanceStatus
    }));
    
    setRegister({ ...register, entries: updatedEntries });
  };

  const handleMarkAllAbsent = () => {
    if (!register) return;
    
    const updatedEntries = register.entries.map((entry: RegisterEntry) => ({
      ...entry, 
      attendance_status: 'absent' as AttendanceStatus
    }));
    
    setRegister({ ...register, entries: updatedEntries });
  };

  // Helper function to check if a status is selected
  const isStatusSelected = (entryStatus: AttendanceStatus, buttonStatus: AttendanceStatus): boolean => {
    const normalizedEntryStatus = String(entryStatus).toLowerCase().trim();
    const normalizedButtonStatus = String(buttonStatus).toLowerCase().trim();
    
    if (normalizedButtonStatus === 'away_with_notice') {
      return normalizedEntryStatus === 'away_with_notice' || 
             normalizedEntryStatus.includes('away') || 
             normalizedEntryStatus.includes('notice');
    }
    
    return normalizedEntryStatus === normalizedButtonStatus;
  };

  // Separate entries by type
  const separateEntries = (entries: RegisterEntry[] = []) => {
    const regular = entries.filter(entry => !entry.is_trial && !entry.is_makeup);
    const makeup = entries.filter(entry => entry.is_makeup && !entry.is_trial);
    const trial = entries.filter(entry => entry.is_trial);
    
    return { regular, makeup, trial };
  };

  // Render player card for different types
  const renderPlayerCard = (entry: RegisterEntry, playerType: 'regular' | 'makeup' | 'trial' = 'regular') => (
    <div key={entry.id} className="border rounded-md p-3">
      <div className="flex items-center gap-2 mb-2">
        <div className="font-medium text-gray-900">{entry.student_name}</div>
        {playerType === 'makeup' && (
          <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800">
            Makeup ({entry.group_name})
          </span>
        )}
        {playerType === 'trial' && (
          <span className="px-2 py-1 text-xs rounded-full bg-purple-100 text-purple-800">
            Trial Player
          </span>
        )}
      </div>
      
      <div className="grid grid-cols-2 gap-1 mb-2">
        <button
          type="button"
          className={`border rounded-md py-1.5 px-1 text-xs font-medium ${
            isStatusSelected(entry.attendance_status, 'present')
              ? 'bg-green-100 border-green-500 text-green-800' 
              : 'bg-gray-100 border-gray-300 text-gray-800'
          }`}
          onClick={() => updateAttendanceStatus(entry.id, 'present')}
        >
          Present
        </button>
        <button
          type="button"
          className={`border rounded-md py-1.5 px-1 text-xs font-medium ${
            isStatusSelected(entry.attendance_status, 'absent')
              ? 'bg-red-100 border-red-500 text-red-800' 
              : 'bg-gray-100 border-gray-300 text-gray-800'
          }`}
          onClick={() => updateAttendanceStatus(entry.id, 'absent')}
        >
          Absent
        </button>
        <button
          type="button"
          className={`border rounded-md py-1.5 px-1 text-xs font-medium ${
            isStatusSelected(entry.attendance_status, 'away_with_notice')
              ? 'bg-yellow-100 border-yellow-500 text-yellow-800' 
              : 'bg-gray-100 border-gray-300 text-gray-800'
          }`}
          onClick={() => updateAttendanceStatus(entry.id, 'away_with_notice')}
        >
          Away With Notice
        </button>
        <button
          type="button"
          className={`border rounded-md py-1.5 px-1 text-xs font-medium ${
            isStatusSelected(entry.attendance_status, 'sick')
              ? 'bg-blue-100 border-blue-500 text-blue-800' 
              : 'bg-gray-100 border-gray-300 text-gray-800'
          }`}
          onClick={() => updateAttendanceStatus(entry.id, 'sick')}
        >
          Sick
        </button>
      </div>
      
      <input
        type="text"
        value={entry.notes || ''}
        onChange={(e) => updateNotes(entry.id, e.target.value)}
        className="block w-full text-sm border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
        placeholder="Notes"
      />
    </div>
  );

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-700"></div>
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

  if (!register) {
    return (
      <div className="bg-gray-50 p-4 rounded-md text-gray-700">
        Register not found
      </div>
    );
  }

  const { regular, makeup, trial } = separateEntries(register.entries);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <h1 className="text-2xl font-bold">
          Edit Register
        </h1>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => onNavigate(`/registers/${register.id}`)}
            className="px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={() => setShowDeleteModal(true)}
            className="px-4 py-2 border border-red-300 shadow-sm text-sm font-medium rounded-md text-red-700 bg-white hover:bg-red-50"
            disabled={isSaving || isDeleting}
          >
            Delete
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-4 py-2 bg-blue-600 border border-transparent shadow-sm text-sm font-medium rounded-md text-white hover:bg-blue-700"
          >
            {isSaving ? 'Saving...' : 'Save Register'}
          </button>
        </div>
      </div>

      {saveMessage && (
        <div className="bg-green-50 p-4 rounded-md text-green-700">
          {saveMessage}
        </div>
      )}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="p-6 border-b">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
            <div>
              <h3 className="text-sm font-medium text-gray-500">Group</h3>
              <p className="mt-1 text-base font-medium text-gray-900">{register.group.name}</p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-500">Session Time</h3>
              <p className="mt-1 text-base text-gray-900">
                {register.time_slot.day} {register.time_slot.start_time}-{register.time_slot.end_time}
              </p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-500">Coach</h3>
              <p className="mt-1 text-base text-gray-900">{register.coach.name}</p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-500">Date</h3>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              />
            </div>
            <div className="sm:col-span-2">
              <h3 className="text-sm font-medium text-gray-500">Session Notes</h3>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                rows={2}
                placeholder="Add notes about this session (optional)"
              />
            </div>
          </div>
        </div>
        
        {/* Assistant Coaches Section */}
        <div className="p-6 border-t border-b">
          <h3 className="text-lg font-medium mb-3">Assistant Coaches</h3>
          <p className="text-sm text-gray-600 mb-3">
            Select any assistant coaches who helped with this session.
          </p>
          
          {loadingCoaches ? (
            <div className="flex justify-center items-center h-12">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-700"></div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {availableCoaches.map(coach => (
                <div
                  key={coach.id}
                  onClick={() => toggleAssistantCoach(coach.id)}
                  className={`p-3 border rounded-md cursor-pointer transition-colors duration-150 ${
                    selectedAssistantCoachIds.includes(coach.id)
                      ? 'bg-blue-50 border-blue-300 hover:bg-blue-100'
                      : 'bg-white border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center">
                    <div className="flex h-5 items-center">
                      <input
                        type="checkbox"
                        checked={selectedAssistantCoachIds.includes(coach.id)}
                        onChange={() => toggleAssistantCoach(coach.id)}
                        className="h-5 w-5 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        aria-labelledby={`coach-${coach.id}-label`}
                      />
                    </div>
                    <label 
                      id={`coach-${coach.id}-label`}
                      className="ml-3 block text-sm font-medium text-gray-900 cursor-pointer"
                    >
                      {coach.name}
                    </label>
                  </div>
                </div>
              ))}
            </div>
          )}
          
          {availableCoaches.length === 0 && !loadingCoaches && (
            <p className="text-sm text-gray-500">No other coaches available.</p>
          )}
        </div>

        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-medium">Attendance</h2>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleMarkAllPresent}
                className="px-3 py-1.5 text-xs rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700"
              >
                All Present
              </button>
              <button
                type="button"
                onClick={handleMarkAllAbsent}
                className="px-3 py-1.5 text-xs rounded-md shadow-sm text-white bg-red-600 hover:bg-red-700"
              >
                All Absent
              </button>
            </div>
          </div>
          
          {/* Player count summary */}
          <div className="mb-4 text-sm text-gray-600">
            {regular.length} regular players
            {makeup.length > 0 && `, ${makeup.length} makeup players`}
            {trial.length > 0 && `, ${trial.length} trial players`}
          </div>
          
          <div className="space-y-6">
            {/* Regular Players */}
            {regular.length > 0 && (
              <div>
                <h3 className="text-md font-medium text-gray-900 mb-3">Regular Players</h3>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {regular.map(entry => renderPlayerCard(entry, 'regular'))}
                </div>
              </div>
            )}
            
            {/* Makeup Players */}
            {makeup.length > 0 && (
              <div>
                <h3 className="text-md font-medium text-gray-900 mb-3">Makeup Players</h3>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {makeup.map(entry => renderPlayerCard(entry, 'makeup'))}
                </div>
              </div>
            )}
            
            {/* Trial Players */}
            {trial.length > 0 && (
              <div>
                <h3 className="text-md font-medium text-gray-900 mb-3">Trial Players</h3>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {trial.map(entry => renderPlayerCard(entry, 'trial'))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Delete Register</h3>
            <p className="text-sm text-gray-500 mb-6">
              Are you sure you want to delete this register? This action cannot be undone.
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowDeleteModal(false)}
                disabled={isDeleting}
                className="px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="px-4 py-2 bg-red-600 border border-transparent shadow-sm text-sm font-medium rounded-md text-white hover:bg-red-700"
              >
                {isDeleting ? 'Deleting...' : 'Delete Register'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RegisterEdit;