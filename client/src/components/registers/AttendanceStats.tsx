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

// New interfaces for notes
interface StudentNote {
  id: number;
  student_id: number;
  student_name: string;
  notes: string;
  player_id: number;
  attendance_status: string;
}

interface RegisterNote {
  id: number;
  date: string;
  group: {
    id: number;
    name: string;
  };
  time_slot: {
    day: string;
    start_time: string;
    end_time: string;
  };
  coach: {
    id: number;
    name: string;
  };
  notes: string;
  entries_with_notes: StudentNote[];
  teaching_period: {
    id: number;
    name: string;
  };
}

interface AttendanceStatsProps {
  onNavigate: (path: string) => void;
  periodId?: number;
  groupId?: number;
}

// Update the NotesListModal component props to include delete handlers
interface NotesListModalProps {
  isOpen: boolean;
  onClose: () => void;
  registerNotes: RegisterNote[];
  onViewRegister: (registerId: number) => void;
  formatDate: (dateString: string) => string;
  onDeleteRegisterNote: (registerId: number) => void;
  onDeleteEntryNote: (registerId: number, entryId: number) => void;
}

const NotesListModal: React.FC<NotesListModalProps> = ({ 
  isOpen, 
  onClose, 
  registerNotes, 
  onViewRegister, 
  formatDate,
  onDeleteRegisterNote,
  onDeleteEntryNote
}) => {
  const [selectedNote, setSelectedNote] = useState<RegisterNote | null>(null);
  const [deletingNoteId, setDeletingNoteId] = useState<number | null>(null);
  const [deletingEntryId, setDeletingEntryId] = useState<number | null>(null);
  
  // Add delete confirmation states
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [noteToDelete, setNoteToDelete] = useState<{type: 'register' | 'entry', registerId: number, entryId?: number} | null>(null);
  
  if (!isOpen) return null;
  
  // Sort the register notes by date in descending order (newest first)
  const sortedRegisterNotes = [...registerNotes].sort((a, b) => {
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });
  
  // Handler for viewing a specific note's details
  const handleViewNoteDetails = (note: RegisterNote) => {
    setSelectedNote(note);
  };
  
  // Handler for going back to the notes list
  const handleBackToList = () => {
    setSelectedNote(null);
  };
  
  // Handler for confirming note deletion
  const handleDeleteNote = async () => {
    if (!noteToDelete) return;
    
    try {
      if (noteToDelete.type === 'register') {
        setDeletingNoteId(noteToDelete.registerId);
        await onDeleteRegisterNote(noteToDelete.registerId);
        setDeletingNoteId(null);
      } else if (noteToDelete.type === 'entry' && noteToDelete.entryId) {
        setDeletingEntryId(noteToDelete.entryId);
        await onDeleteEntryNote(noteToDelete.registerId, noteToDelete.entryId);
        setDeletingEntryId(null);
      }
      
      // Always navigate back to the notes list after deletion
      setSelectedNote(null);
    } catch (err) {
      console.error('Error deleting note:', err);
      alert('Failed to delete note. Please try again.');
    } finally {
      setShowDeleteConfirm(false);
      setNoteToDelete(null);
    }
  };
  
  // Handler for initiating delete
  const initiateDelete = (type: 'register' | 'entry', registerId: number, entryId?: number) => {
    setNoteToDelete({ type, registerId, entryId });
    setShowDeleteConfirm(true);
  };
  
  // Calculate total notes
  const totalRegistersWithNotes = registerNotes.length;
  const sessionNotesCount = registerNotes.filter(note => note.notes?.trim()).length;
  const playerNotesCount = registerNotes.reduce(
    (sum, note) => sum + note.entries_with_notes.length, 0
  );
  const totalNotesCount = sessionNotesCount + playerNotesCount;
  
  return (
    <>
      <div className="fixed inset-0 bg-gray-600 bg-opacity-75 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-screen overflow-hidden">
          {/* Modal header */}
          <div className="px-6 py-4 border-b flex justify-between items-center">
            {selectedNote ? (
              <>
                <div>
                  <button
                    onClick={handleBackToList}
                    className="text-blue-600 hover:text-blue-800 flex items-center"
                  >
                    <svg className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    Back to List
                  </button>
                  <h3 className="text-lg font-medium text-gray-900 mt-1">
                    Notes from {formatDate(selectedNote.date)}
                  </h3>
                  <p className="text-sm text-gray-500">
                    {selectedNote.group.name} • {selectedNote.time_slot.day} {selectedNote.time_slot.start_time}-{selectedNote.time_slot.end_time} • Coach: {selectedNote.coach.name}
                  </p>
                </div>
              </>
            ) : (
              <>
                <div>
                  <h3 className="text-lg font-medium text-gray-900">
                    Coach Notes Summary
                  </h3>
                  <p className="text-sm text-gray-500">
                    {totalNotesCount} notes across {totalRegistersWithNotes} registers
                  </p>
                </div>
              </>
            )}
            
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-500"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          {/* Modal body */}
          <div className="px-6 py-4 max-h-96 overflow-y-auto">
            {selectedNote ? (
              // Show detailed note view with delete buttons
              <>
                {/* Register note */}
                {selectedNote.notes && (
                  <div className="mb-6">
                    <div className="flex justify-between items-start mb-2">
                      <h4 className="text-sm font-medium text-gray-900">Session Notes</h4>
                      <button
                        onClick={() => initiateDelete('register', selectedNote.id)}
                        disabled={deletingNoteId === selectedNote.id}
                        className="text-sm text-red-600 hover:text-red-800 disabled:opacity-50"
                      >
                        {deletingNoteId === selectedNote.id ? 'Deleting...' : 'Delete'}
                      </button>
                    </div>
                    <div className="bg-yellow-50 p-4 rounded-md">
                      <p className="text-sm text-gray-800 whitespace-pre-wrap">{selectedNote.notes}</p>
                    </div>
                  </div>
                )}
                
                {/* Student notes */}
                {selectedNote.entries_with_notes.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-900 mb-2">Player Notes</h4>
                    <div className="space-y-4">
                      {selectedNote.entries_with_notes.map(entry => (
                        <div key={entry.id} className="bg-blue-50 p-4 rounded-md">
                          <div className="flex justify-between">
                            <div>
                              <h5 className="font-medium text-gray-900">{entry.student_name}</h5>
                              <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                                entry.attendance_status === 'present' ? 'bg-green-100 text-green-800' :
                                entry.attendance_status === 'absent' ? 'bg-red-100 text-red-800' :
                                entry.attendance_status === 'sick' ? 'bg-indigo-100 text-indigo-800' :
                                'bg-yellow-100 text-yellow-800'
                              }`}>
                                {entry.attendance_status.replace('_', ' ')}
                              </span>
                            </div>
                            <button
                              onClick={() => initiateDelete('entry', selectedNote.id, entry.id)}
                              disabled={deletingEntryId === entry.id}
                              className="text-sm text-red-600 hover:text-red-800 disabled:opacity-50"
                            >
                              {deletingEntryId === entry.id ? 'Deleting...' : 'Delete'}
                            </button>
                          </div>
                          <p className="mt-2 text-sm text-gray-800 whitespace-pre-wrap">{entry.notes}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* View register button */}
                <div className="mt-6 flex justify-end">
                  <button
                    onClick={() => onViewRegister(selectedNote.id)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                  >
                    View Register
                  </button>
                </div>
              </>
            ) : (
              // Show notes list
              <div className="divide-y divide-gray-200">
                {sortedRegisterNotes.length === 0 ? (
                  <p className="py-4 text-gray-500">No notes found for the selected filters</p>
                ) : (
                  sortedRegisterNotes.map(note => {
                    // Count notes in this register
                    const hasRegisterNote = note.notes && note.notes.trim() !== '';
                    const studentNotes = note.entries_with_notes.length;
                    const notesCount = (hasRegisterNote ? 1 : 0) + studentNotes;
                    
                    return (
                      <div 
                        key={note.id} 
                        className="py-4 cursor-pointer hover:bg-gray-50 transition-colors duration-150"
                        onClick={() => handleViewNoteDetails(note)}
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-medium text-gray-900">
                              {formatDate(note.date)} - {note.group.name}
                            </p>
                            <p className="text-sm text-gray-500">
                              {note.coach.name} • {note.time_slot.day} {note.time_slot.start_time}-{note.time_slot.end_time}
                            </p>
                          </div>
                          <span className="bg-blue-100 text-blue-800 py-1 px-3 rounded-full text-xs font-medium">
                            {notesCount} {notesCount === 1 ? 'Note' : 'Notes'}
                          </span>
                        </div>
                        
                        {/* Preview of notes content */}
                        {hasRegisterNote && (
                          <div className="mt-2 text-sm">
                            <span className="font-medium">Session note:</span>{' '}
                            <span className="text-gray-600">
                              {note.notes.length > 60 ? note.notes.substring(0, 60) + '...' : note.notes}
                            </span>
                          </div>
                        )}
                        
                        {studentNotes > 0 && (
                          <div className="mt-1 text-sm">
                            <span className="font-medium">Player notes:</span>{' '}
                            <span className="text-gray-600">
                              {studentNotes} player{studentNotes !== 1 ? 's' : ''} with notes
                            </span>
                          </div>
                        )}
                        
                        {/* View details button */}
                        <div className="mt-2">
                          <button className="text-sm text-blue-600 hover:text-blue-800 flex items-center">
                            View Details
                            <svg className="h-4 w-4 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
          
          {/* Modal footer */}
          <div className="px-6 py-4 border-t flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
            >
              Close
            </button>
          </div>
        </div>
      </div>
      
      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-75 flex items-center justify-center" style={{ zIndex: 60 }}>
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Confirm Delete</h3>
            <p className="text-gray-600 mb-6">
              Are you sure you want to delete this note? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setNoteToDelete(null);
                }}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteNote}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
              >
                Delete Note
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

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
  
  // New states for notes
  const [registerNotes, setRegisterNotes] = useState<RegisterNote[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [notesError, setNotesError] = useState<string | null>(null);
  const [showNotesListModal, setShowNotesListModal] = useState(false);
  
  // UI states
  const [loading, setLoading] = useState(true);
  const [, setLoadingCoaches] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const previousDay = React.useRef('');

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
        
        const response = await fetch('/api/coaches');
        
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

  // Fetch groups whenever period or coach changes (not just when day changes)
  useEffect(() => {
    const fetchGroups = async () => {
      if (!selectedPeriodId) return;
      
      try {
        setLoading(true);
        
        // Build query parameters
        let url = `/api/groups-by-day?period_id=${selectedPeriodId}`;
        
        // Add day filter if selected
        if (selectedDay) {
          url += `&day_of_week=${selectedDay}`;
        }
        
        // Add coach filter if set
        if (selectedCoachId) {
          url += `&coach_id=${selectedCoachId}`;
        }
        
        console.log("Fetching groups from:", url);
        const response = await fetch(url);
        
        if (!response.ok) {
          throw new Error(`Error fetching groups: ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log("Groups response:", data);
        setGroups(data);
        
        // Only reset group selection if day changes
        if (selectedDay !== previousDay.current) {
          setSelectedGroupId(undefined);
          setSelectedSessionId(undefined);
        }
        
        previousDay.current = selectedDay;
        setError(null);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An error occurred';
        setError(errorMessage);
        console.error('Error fetching groups:', err);
      } finally {
        setLoading(false);
      }
    };
    
    // Always fetch groups when period or coach changes
    fetchGroups();
    
  }, [selectedPeriodId, selectedDay, selectedCoachId]); // Dependencies include period and coach

  // Fetch sessions when group changes
  useEffect(() => {
    const fetchSessions = async () => {
      if (!selectedPeriodId || !selectedGroupId) return;
      
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
  }, [selectedPeriodId, selectedDay, selectedCoachId, selectedGroupId, selectedSessionId, sessions]);

  // NEW: Fetch register notes
  useEffect(() => {
    const fetchRegisterNotes = async () => {
      if (!selectedPeriodId) return;
      
      try {
        setLoadingNotes(true);
        
        // Build query params for notes
        const params = new URLSearchParams();
        params.append('period_id', selectedPeriodId.toString());
        params.append('has_notes_only', 'true'); // Only get registers with notes
        
        if (selectedDay) {
          params.append('day_of_week', selectedDay);
        }
        
        if (selectedCoachId) {
          params.append('coach_id', selectedCoachId.toString());
        }
        
        if (selectedGroupId) {
          params.append('group_id', selectedGroupId.toString());
        }
        
        const response = await fetch(`/api/registers/notes?${params.toString()}`);
        
        if (!response.ok) {
          throw new Error(`Error fetching register notes: ${response.statusText}`);
        }
        
        const data = await response.json();
        setRegisterNotes(data);
        setNotesError(null);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An error occurred';
        setNotesError(errorMessage);
        console.error('Error fetching register notes:', err);
      } finally {
        setLoadingNotes(false);
      }
    };
    
    fetchRegisterNotes();
  }, [selectedPeriodId, selectedDay, selectedCoachId, selectedGroupId]);

  // Add the delete handlers
  const handleDeleteRegisterNote = async (registerId: number) => {
    try {
      const response = await fetch(`/api/registers/${registerId}/clear-notes`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        throw new Error('Failed to delete register note');
      }
      
      // Update the local state to remove the note
      setRegisterNotes(prev => 
        prev.map(note => 
          note.id === registerId 
            ? { ...note, notes: '' } 
            : note
        ).filter(note => note.notes || note.entries_with_notes.length > 0)
      );
      
    } catch (err) {
      console.error('Error deleting register note:', err);
      alert('Failed to delete note. Please try again.');
    }
  };

  const handleDeleteEntryNote = async (registerId: number, entryId: number) => {
    try {
      const response = await fetch(`/api/registers/${registerId}/entries/${entryId}/clear-notes`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        throw new Error('Failed to delete entry note');
      }
      
      // Update the local state to remove the entry note
      setRegisterNotes(prev => 
        prev.map(note => {
          if (note.id === registerId) {
            return {
              ...note,
              entries_with_notes: note.entries_with_notes.filter(entry => entry.id !== entryId)
            };
          }
          return note;
        }).filter(note => note.notes || note.entries_with_notes.length > 0)
      );
      
    } catch (err) {
      console.error('Error deleting entry note:', err);
      alert('Failed to delete note. Please try again.');
    }
  };

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
      
      {/* Filters section */}
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
              disabled={groups.length === 0}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 disabled:bg-gray-100"
            >
              <option value="">All Groups</option>
              {groups.map(group => (
                <option key={group.id} value={group.id}>{group.name}</option>
              ))}
            </select>
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
        <div className="space-y-6">
          {/* Main stats card */}
          {renderStatsCard()}
          
          {/* Coach Notes Summary - Now placed below the main stats */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="p-6">
              <h3 className="text-lg font-medium mb-2">Coach Notes</h3>
              
              {loadingNotes ? (
                <div className="flex justify-center items-center h-24">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-700"></div>
                </div>
              ) : notesError ? (
                <div className="bg-red-50 p-4 rounded-md text-red-700">
                  Error loading notes: {notesError}
                </div>
              ) : registerNotes.length === 0 ? (
                <p className="text-gray-500">No notes found for the selected filters</p>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="bg-blue-50 p-4 rounded-lg text-center">
                      <div className="text-2xl font-bold text-blue-700">{registerNotes.length}</div>
                      <div className="text-sm text-blue-500">Registers with Notes</div>
                    </div>
                    
                    <div className="bg-yellow-50 p-4 rounded-lg text-center">
                      <div className="text-2xl font-bold text-yellow-700">
                        {registerNotes.filter(note => note.notes?.trim()).length + 
                         registerNotes.reduce((sum, note) => sum + note.entries_with_notes.length, 0)}
                      </div>
                      <div className="text-sm text-yellow-500">Total Notes</div>
                    </div>
                  </div>
                  
                  <div className="flex flex-col space-y-2">
                    {registerNotes.filter(note => note.notes?.trim()).length > 0 && (
                      <div className="text-sm">
                        <span className="font-medium">{registerNotes.filter(note => note.notes?.trim()).length}</span> session {registerNotes.filter(note => note.notes?.trim()).length === 1 ? 'note' : 'notes'}
                      </div>
                    )}
                    
                    {registerNotes.reduce((sum, note) => sum + note.entries_with_notes.length, 0) > 0 && (
                      <div className="text-sm">
                        <span className="font-medium">{registerNotes.reduce((sum, note) => sum + note.entries_with_notes.length, 0)}</span> player {registerNotes.reduce((sum, note) => sum + note.entries_with_notes.length, 0) === 1 ? 'note' : 'notes'}
                      </div>
                    )}
                  </div>
                  
                  <button
                    onClick={() => setShowNotesListModal(true)}
                    className="mt-4 w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors duration-150"
                  >
                    View All Notes
                  </button>
                </>
              )}
            </div>
          </div>
          
          {/* Weekly Stats Table */}
          <div>
            {renderWeeklyStats()}
          </div>
          
          {/* Group Stats Table (shown only when multiple groups are in results) */}
          {groupStats.length > 1 && (
            <div>
              {renderGroupStats()}
            </div>
          )}
          
          {/* Individual Register Table */}
          <div>
            {renderRegisterStats()}
          </div>
        </div>
      )}
      
      {/* Notes List Modal with delete functionality */}
      {showNotesListModal && (
        <NotesListModal
          isOpen={showNotesListModal}
          onClose={() => setShowNotesListModal(false)}
          registerNotes={registerNotes}
          onViewRegister={handleViewRegister}
          formatDate={formatDate}
          onDeleteRegisterNote={handleDeleteRegisterNote}
          onDeleteEntryNote={handleDeleteEntryNote}
        />
      )}
    </div>
  );
};

export default AttendanceStats;