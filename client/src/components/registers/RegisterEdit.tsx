// client/src/components/registers/RegisterEdit.tsx

import React, { useState, useEffect } from 'react';
import { RegisterDetail, RegisterEntry, AttendanceStatus } from '../../types/register';

interface RegisterEditProps {
  registerId: string;
  onNavigate: (path: string) => void;
  onSaveSuccess: () => void;
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
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const fetchRegister = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/registers/${registerId}`);
        
        if (!response.ok) {
          throw new Error(`Error fetching register: ${response.statusText}`);
        }
        
        const data = await response.json();
        setRegister(data);
        setNotes(data.notes || '');
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

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  };

  const updateAttendanceStatus = (entryId: number, status: AttendanceStatus) => {
    if (!register) return;
    
    const updatedEntries = register.entries.map((entry: RegisterEntry) => {
      if (entry.id === entryId) {
        return { ...entry, attendance_status: status };
      }
      return entry;
    });
    
    setRegister({ ...register, entries: updatedEntries });
  };

  const updateNotes = (entryId: number, notes: string) => {
    if (!register) return;
    
    const updatedEntries = register.entries.map((entry: RegisterEntry) => {
      if (entry.id === entryId) {
        return { ...entry, notes };
      }
      return entry;
    });
    
    setRegister({ ...register, entries: updatedEntries });
  };

  const togglePredictedAttendance = (entryId: number) => {
    if (!register) return;
    
    const updatedEntries = register.entries.map((entry: RegisterEntry) => {
      if (entry.id === entryId) {
        return { ...entry, predicted_attendance: !entry.predicted_attendance };
      }
      return entry;
    });
    
    setRegister({ ...register, entries: updatedEntries });
  };

  const handleSave = async (finalStatus: boolean = false) => {
    if (!register) return;
    
    try {
      setIsSaving(true);
      
      // First update the entries
      const entriesResponse = await fetch(`/api/registers/${registerId}/entries`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entries: register.entries.map(entry => ({
            id: entry.id,
            attendance_status: entry.attendance_status,
            notes: entry.notes,
            predicted_attendance: entry.predicted_attendance
          }))
        })
      });
      
      if (!entriesResponse.ok) {
        const errorData = await entriesResponse.json();
        throw new Error(errorData.error || 'Failed to update attendance entries');
      }
      
      // Then update the register notes and status if finalizing
      const registerResponse = await fetch(`/api/registers/${registerId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notes: notes,
          ...(finalStatus && { status: 'SUBMITTED' })
        })
      });
      
      if (!registerResponse.ok) {
        const errorData = await registerResponse.json();
        throw new Error(errorData.error || 'Failed to update register');
      }
      
      setSaveMessage(finalStatus ? 'Register finalized successfully' : 'Register saved successfully');
      
      if (finalStatus) {
        // Redirect after a short delay
        setTimeout(() => {
          onSaveSuccess();
        }, 1500);
      } else {
        // Just refresh the data
        const refreshResponse = await fetch(`/api/registers/${registerId}`);
        if (refreshResponse.ok) {
          const updatedData = await refreshResponse.json();
          setRegister(updatedData);
        }
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
        <h1 className="text-2xl font-bold">
          Edit Register: {register.group.name} - {formatDate(register.date)}
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
        </div>
      </div>

      {saveMessage && (
        <div className="bg-green-50 p-4 rounded-md text-green-700">
          {saveMessage}
        </div>
      )}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="p-6 border-b">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <div>
              <h3 className="text-sm font-medium text-gray-500">Group</h3>
              <p className="mt-1 text-sm text-gray-900">{register.group.name}</p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-500">Session Time</h3>
              <p className="mt-1 text-sm text-gray-900">
                {register.time_slot.day} {register.time_slot.start_time}-{register.time_slot.end_time}
              </p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-500">Coach</h3>
              <p className="mt-1 text-sm text-gray-900">{register.coach.name}</p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-500">Date</h3>
              <p className="mt-1 text-sm text-gray-900">{formatDate(register.date)}</p>
            </div>
            <div className="md:col-span-2">
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

        <div className="p-6">
          <h2 className="text-lg font-medium mb-4">Attendance</h2>
          
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
                    Predicted
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Notes
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {register.entries.map((entry: RegisterEntry) => (
                  <tr key={entry.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {entry.student_name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <select
                        value={entry.attendance_status}
                        onChange={(e) => updateAttendanceStatus(
                          entry.id, 
                          e.target.value as AttendanceStatus
                        )}
                        className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      >
                        <option value="present">Present</option>
                        <option value="absent">Absent</option>
                        <option value="excused">Excused</option>
                        <option value="late">Late</option>
                      </select>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-center">
                      <input
                        type="checkbox"
                        checked={entry.predicted_attendance}
                        onChange={() => togglePredictedAttendance(entry.id)}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      />
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <input
                        type="text"
                        value={entry.notes || ''}
                        onChange={(e) => updateNotes(entry.id, e.target.value)}
                        className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                        placeholder="Optional notes"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          <div className="mt-6 flex justify-end space-x-3">
            <button
              onClick={() => handleSave()}
              disabled={isSaving}
              className="px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
            >
              {isSaving ? 'Saving...' : 'Save Draft'}
            </button>
            <button
              onClick={() => handleSave(true)}
              disabled={isSaving}
              className="px-4 py-2 bg-blue-600 border border-transparent shadow-sm text-sm font-medium rounded-md text-white hover:bg-blue-700"
            >
              {isSaving ? 'Saving...' : 'Finalize Register'}
            </button>
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