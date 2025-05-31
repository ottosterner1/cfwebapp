import React, { useState, useEffect, useRef } from 'react';

interface TeachingPeriod {
  id: number;
  name: string;
}

interface Group {
  id: number;
  name: string;
}

interface TimeSlot {
  id: number;
  day: string;
  start_time: string;
  end_time: string;
}

interface Coach {
  id: number;
  name: string;
}

interface Player {
  id: number;
  student_id: number;
  student_name: string;
  contact_number: string | null;
  contact_email: string | null;
  emergency_contact_number: string | null;
  medical_information: string | null;
  walk_home: boolean | null;
  attendance_status: 'present' | 'absent' | 'sick' | 'away_with_notice';
  notes: string;
  predicted_attendance: boolean;
  date_of_birth: string | null;
  group_name?: string; // For makeup players
  is_makeup?: boolean; // Flag to identify makeup players
}

interface CreateRegisterProps {
  onNavigate: (path: string) => void;
  onCreateSuccess: (registerId: string) => void;
}

// API response types
interface SessionResponse {
  id: number;
  day: string;
  group_id?: number;
  group_name: string;
  start_time: string;
  end_time: string;
  player_count?: number;
  coach_player_count?: number;
  [key: string]: any;
}

const CreateRegister: React.FC<CreateRegisterProps> = ({ onNavigate, onCreateSuccess }) => {
  // Core filter state
  const [teachingPeriods, setTeachingPeriods] = useState<TeachingPeriod[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState<number | ''>('');
  const [availableDays, setAvailableDays] = useState<string[]>([]);
  const [selectedDay, setSelectedDay] = useState<string>('');
  const [availableGroups, setAvailableGroups] = useState<Group[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<number | ''>('');
  const [availableTimeSlots, setAvailableTimeSlots] = useState<TimeSlot[]>([]);
  const [selectedTimeSlotId, setSelectedTimeSlotId] = useState<number | ''>('');
  const [selectedDate, setSelectedDate] = useState<string>('');
  
  // Existing state for assistant coaches
  const [availableCoaches, setAvailableCoaches] = useState<Coach[]>([]);
  const [selectedAssistantCoachIds, setSelectedAssistantCoachIds] = useState<number[]>([]);
  const [loadingCoaches, setLoadingCoaches] = useState<boolean>(false);
  const [isCoachDropdownOpen, setIsCoachDropdownOpen] = useState<boolean>(false);
  const coachDropdownRef = useRef<HTMLDivElement>(null);
  
  // Existing state
  const [isMakeupClass, setIsMakeupClass] = useState<boolean>(false);
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [showAllSessions, setShowAllSessions] = useState<boolean>(false);
  
  // Session data
  const [players, setPlayers] = useState<Player[]>([]);
  const [notes, setNotes] = useState<string>('');
  
  // NEW: Makeup players state
  const [makeupPlayers, setMakeupPlayers] = useState<Player[]>([]);
  const [makeupPlayerSearch, setMakeupPlayerSearch] = useState<string>('');
  const [availableMakeupPlayers, setAvailableMakeupPlayers] = useState<Player[]>([]);
  const [loadingMakeupPlayers, setLoadingMakeupPlayers] = useState<boolean>(false);
  const [showMakeupSection, setShowMakeupSection] = useState<boolean>(false);
  
  // UI state
  const [loading, setLoading] = useState<{[key: string]: boolean}>({
    periods: true,
    days: false,
    groups: false,
    timeSlots: false,
    players: false,
    coaches: false,
    creating: false
  });
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [expandedPlayerInfo, setExpandedPlayerInfo] = useState<{[key: number]: boolean}>({});
  const [showAllPlayerInfo, setShowAllPlayerInfo] = useState<boolean>(true);

  const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  
  // Handle clicking outside of coach dropdown to close it
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (coachDropdownRef.current && !coachDropdownRef.current.contains(event.target as Node)) {
        setIsCoachDropdownOpen(false);
      }
    }
    
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);
  
  // Fetch teaching periods on component mount
  useEffect(() => {
    const fetchTeachingPeriods = async () => {
      try {
        setLoading(prev => ({ ...prev, periods: true }));
        const response = await fetch('/clubs/api/teaching-periods');
        
        if (!response.ok) {
          throw new Error(`Error fetching teaching periods: ${response.statusText}`);
        }
        
        const data = await response.json();
        if (Array.isArray(data) && data.every(item => 
          typeof item === 'object' && 
          item !== null &&
          'id' in item && 
          'name' in item
        )) {
          setTeachingPeriods(data as TeachingPeriod[]);
          
          if (data.length > 0 && typeof data[0].id === 'number') {
            setSelectedPeriodId(data[0].id);
          }
        } else {
          throw new Error('Invalid teaching period data received');
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An error occurred';
        setError(errorMessage);
        console.error('Error fetching teaching periods:', err);
      } finally {
        setLoading(prev => ({ ...prev, periods: false }));
      }
    };
    
    fetchTeachingPeriods();
  }, []);

  // Fetch available coaches on component mount
  useEffect(() => {
    const fetchCoaches = async () => {
      try {
        setLoading(prev => ({ ...prev, coaches: true }));
        setLoadingCoaches(true);
        
        const response = await fetch('/api/coaches');
        
        if (!response.ok) {
          throw new Error(`Error fetching coaches: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (Array.isArray(data)) {
          setAvailableCoaches(data);
        } else {
          throw new Error('Invalid coach data received');
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An error occurred';
        console.error('Error fetching coaches:', errorMessage);
      } finally {
        setLoading(prev => ({ ...prev, coaches: false }));
        setLoadingCoaches(false);
      }
    };
    
    fetchCoaches();
  }, []);

  // Fetch available days when teaching period changes
  useEffect(() => {
    const fetchAvailableDays = async () => {
      if (!selectedPeriodId) return;
      
      try {
        setLoading(prev => ({ ...prev, days: true }));
        setError(null);
        
        const today = new Date();
        const currentDayIndex = today.getDay();
        const adjustedCurrentDayIndex = currentDayIndex === 0 ? 6 : currentDayIndex - 1;
        const currentDay = daysOfWeek[adjustedCurrentDayIndex];
        
        const allDays = new Set<string>();
        const fetchPromises = daysOfWeek.map(day => 
          fetch(`/api/coach-sessions?day_of_week=${day}&teaching_period_id=${selectedPeriodId}&show_all=${showAllSessions}`)
            .then(response => {
              if (!response.ok) {
                return [];
              }
              return response.json();
            })
            .then(data => {
              if (Array.isArray(data) && data.length > 0) {
                allDays.add(day);
              }
              return data;
            })
            .catch(() => {
              return [];
            })
        );
        
        await Promise.all(fetchPromises);
        
        const availableDaysList = Array.from(allDays).sort((a, b) => 
          daysOfWeek.indexOf(a) - daysOfWeek.indexOf(b)
        );
        
        setAvailableDays(availableDaysList);
        
        if (availableDaysList.includes(currentDay)) {
          setSelectedDay(currentDay);
        } else if (availableDaysList.length > 0) {
          setSelectedDay(availableDaysList[0]);
        } else {
          setSelectedDay('');
        }
        
        setSelectedGroupId('');
        setSelectedTimeSlotId('');
        setSelectedDate('');
        setPlayers([]);
        setMakeupPlayers([]); // Clear makeup players when changing period
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An error occurred';
        setError(errorMessage);
        console.error('Error fetching available days:', err);
      } finally {
        setLoading(prev => ({ ...prev, days: false }));
      }
    };
    
    fetchAvailableDays();
  }, [selectedPeriodId, showAllSessions]);

  // Fetch available groups when day changes
  useEffect(() => {
    const fetchAvailableGroups = async () => {
      if (!selectedPeriodId || !selectedDay) return;
      
      try {
        setLoading(prev => ({ ...prev, groups: true }));
        setError(null);
        
        const response = await fetch(`/api/coach-sessions?day_of_week=${selectedDay}&teaching_period_id=${selectedPeriodId}&show_all=${showAllSessions}`);
        
        if (!response.ok) {
          throw new Error('Error fetching available groups');
        }
        
        const data = await response.json();
        
        const sessions: SessionResponse[] = Array.isArray(data) ? data as SessionResponse[] : [];
        
        const uniqueGroups: Record<string, Group> = {};
        sessions.forEach(session => {
          if (typeof session.group_name === 'string' && !uniqueGroups[session.group_name]) {
            const groupId = typeof session.group_id === 'number' ? session.group_id : 0;
            uniqueGroups[session.group_name] = {
              id: groupId,
              name: session.group_name
            };
          }
        });
        
        const groups = Object.values(uniqueGroups);
        setAvailableGroups(groups);
        
        setSelectedGroupId('');
        
        setSelectedTimeSlotId('');
        setSelectedDate('');
        setPlayers([]);
        setMakeupPlayers([]); // Clear makeup players when changing group
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An error occurred';
        setError(errorMessage);
        console.error('Error fetching available groups:', err);
      } finally {
        setLoading(prev => ({ ...prev, groups: false }));
      }
    };
    
    fetchAvailableGroups();
  }, [selectedPeriodId, selectedDay, showAllSessions]);

  // Fetch available time slots when group changes
  useEffect(() => {
    const fetchAvailableTimeSlots = async () => {
      if (!selectedPeriodId || !selectedDay || !selectedGroupId) return;
      
      try {
        setLoading(prev => ({ ...prev, timeSlots: true }));
        setError(null);
        
        const response = await fetch(`/api/coach-sessions?day_of_week=${selectedDay}&teaching_period_id=${selectedPeriodId}&show_all=${showAllSessions}`);
        
        if (!response.ok) {
          throw new Error('Error fetching available time slots');
        }
        
        const data = await response.json();
        
        const sessions: SessionResponse[] = Array.isArray(data) ? data as SessionResponse[] : [];
        
        const timeSlots: TimeSlot[] = [];
        
        for (const session of sessions) {
          const sessionGroupId = typeof session.group_id === 'number' ? session.group_id : 0;
          const groupIdMatch = sessionGroupId === selectedGroupId;
          const groupNameMatch = typeof session.group_name === 'string' && 
                                session.group_name.includes(`ID: ${selectedGroupId}`);
          
          if ((groupIdMatch || groupNameMatch) && 
              typeof session.id === 'number' && 
              typeof session.day === 'string' && 
              typeof session.start_time === 'string' && 
              typeof session.end_time === 'string') {
            timeSlots.push({
              id: session.id,
              day: session.day,
              start_time: session.start_time,
              end_time: session.end_time
            });
          }
        }
        
        setAvailableTimeSlots(timeSlots);
        
        if (timeSlots.length === 1) {
          setSelectedTimeSlotId(timeSlots[0].id);
        } else {
          setSelectedTimeSlotId('');
        }
        
        setSelectedDate('');
        setPlayers([]);
        setMakeupPlayers([]); // Clear makeup players when changing time slot
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An error occurred';
        setError(errorMessage);
        console.error('Error fetching available time slots:', err);
      } finally {
        setLoading(prev => ({ ...prev, timeSlots: false }));
      }
    };
    
    fetchAvailableTimeSlots();
  }, [selectedPeriodId, selectedDay, selectedGroupId, showAllSessions]);

  // Generate available dates for the selected day of week
  useEffect(() => {
    if (!selectedDay) {
      setAvailableDates([]);
      return;
    }

    const today = new Date();
    
    const dayToIndex: {[key: string]: number} = {
      'Monday': 1,
      'Tuesday': 2, 
      'Wednesday': 3, 
      'Thursday': 4, 
      'Friday': 5, 
      'Saturday': 6, 
      'Sunday': 0
    };
    
    const targetDayIndex = dayToIndex[selectedDay];
    if (targetDayIndex === undefined) {
      console.error(`Invalid day selected: ${selectedDay}`);
      return;
    }
    
    const matchingDates: string[] = [];
    
    let previousDate = new Date(today);
    for (let i = 0; i < 7; i++) {
      previousDate = new Date(previousDate.getTime() - 24 * 60 * 60 * 1000);
      if (previousDate.getDay() === targetDayIndex) {
        matchingDates.push(previousDate.toISOString().split('T')[0]);
        break;
      }
    }
    
    if (today.getDay() === targetDayIndex) {
      matchingDates.push(today.toISOString().split('T')[0]);
    } else {
      let nextDate = new Date(today);
      while (nextDate.getDay() !== targetDayIndex) {
        nextDate = new Date(nextDate.getTime() + 24 * 60 * 60 * 1000);
      }
      matchingDates.push(nextDate.toISOString().split('T')[0]);
    }
    
    let futureDate = new Date(matchingDates[matchingDates.length - 1]);
    for (let i = 0; i < 1; i++) {
      futureDate = new Date(futureDate.getTime() + 7 * 24 * 60 * 60 * 1000);
      matchingDates.push(futureDate.toISOString().split('T')[0]);
    }
    
    matchingDates.sort();
    setAvailableDates(matchingDates);
  }, [selectedDay, selectedTimeSlotId]);

  // Fetch players when all required criteria are set
  useEffect(() => {
    if (!selectedTimeSlotId || !selectedPeriodId || !selectedGroupId || !selectedDay) {
      setPlayers([]);
      return;
    }
    
    const fetchPlayers = async () => {
      try {
        setLoading(prev => ({ ...prev, players: true }));
        const response = await fetch(`/api/group-time-players?group_time_id=${selectedTimeSlotId}&teaching_period_id=${selectedPeriodId}`);
        
        if (!response.ok) {
          throw new Error(`Error fetching players: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (Array.isArray(data)) {
          const validatedPlayers = data.filter(player => 
            typeof player === 'object' && 
            player !== null &&
            'id' in player &&
            'student_name' in player
          ) as Player[];
          
          setPlayers(validatedPlayers);
          
          const expandedState: {[key: number]: boolean} = {};
          validatedPlayers.forEach(player => {
            expandedState[player.id] = showAllPlayerInfo;
          });
          setExpandedPlayerInfo(expandedState);
        } else {
          throw new Error('Invalid player data received');
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An error occurred';
        setError(errorMessage);
        console.error('Error fetching players:', err);
      } finally {
        setLoading(prev => ({ ...prev, players: false }));
      }
    };
    
    fetchPlayers();
  }, [selectedTimeSlotId, selectedPeriodId, selectedGroupId, selectedDay, showAllPlayerInfo]);

  // NEW: Fetch available makeup players when teaching period and time slot are selected
  useEffect(() => {
    const fetchMakeupPlayers = async () => {
      if (!selectedPeriodId || !selectedTimeSlotId) {
        setAvailableMakeupPlayers([]);
        return;
      }
      
      try {
        setLoadingMakeupPlayers(true);
        const query = makeupPlayerSearch ? `&query=${encodeURIComponent(makeupPlayerSearch)}` : '';
        const response = await fetch(
          `/api/players/search?teaching_period_id=${selectedPeriodId}&exclude_group_time_id=${selectedTimeSlotId}${query}`
        );
        
        if (!response.ok) {
          throw new Error(`Error fetching makeup players: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (Array.isArray(data)) {
          // Filter out players already added as makeup players
          const alreadyAddedIds = makeupPlayers.map(p => p.id);
          const filteredData = data.filter(player => !alreadyAddedIds.includes(player.id));
          setAvailableMakeupPlayers(filteredData);
        } else {
          throw new Error('Invalid makeup players data received');
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An error occurred';
        console.error('Error fetching makeup players:', errorMessage);
        setAvailableMakeupPlayers([]);
      } finally {
        setLoadingMakeupPlayers(false);
      }
    };
    
    fetchMakeupPlayers();
  }, [selectedPeriodId, selectedTimeSlotId, makeupPlayerSearch, makeupPlayers]);

  // Handle toggle show all sessions
  const handleToggleShowAllSessions = () => {
    setShowAllSessions(prev => !prev);
    setSelectedDay('');
    setSelectedGroupId('');
    setSelectedTimeSlotId('');
  };

  // Handle makeup class toggle
  const handleMakeupClassToggle = () => {
    setIsMakeupClass(prev => !prev);
    setSelectedDate('');
  };

  // Handle toggle all player info
  const handleToggleAllPlayerInfo = () => {
    const newShowAllValue = !showAllPlayerInfo;
    setShowAllPlayerInfo(newShowAllValue);
    
    const updatedExpandedState: {[key: number]: boolean} = {};
    [...players, ...makeupPlayers].forEach(player => {
      updatedExpandedState[player.id] = newShowAllValue;
    });
    setExpandedPlayerInfo(updatedExpandedState);
  };

  // Toggle coach dropdown
  const toggleCoachDropdown = () => {
    setIsCoachDropdownOpen(!isCoachDropdownOpen);
  };

  // Handle toggle assistant coach selection
  const toggleAssistantCoach = (coachId: number, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    
    setSelectedAssistantCoachIds(prev => {
      if (prev.includes(coachId)) {
        return prev.filter(id => id !== coachId);
      } else {
        return [...prev, coachId];
      }
    });
  };

  // Get selected coaches for display
  const getSelectedCoachDisplay = (): string => {
    if (selectedAssistantCoachIds.length === 0) {
      return "No assistant coaches";
    }
    
    const selectedCoaches = availableCoaches.filter(
      coach => selectedAssistantCoachIds.includes(coach.id)
    );
    
    if (selectedCoaches.length === 1) {
      return selectedCoaches[0].name;
    } else if (selectedCoaches.length === 2) {
      return `${selectedCoaches[0].name} and ${selectedCoaches[1].name}`;
    } else {
      return `${selectedCoaches[0].name} and ${selectedCoaches.length - 1} others`;
    }
  };

  // Handle updating player attendance status (works for both regular and makeup players)
  const updatePlayerAttendance = (playerId: number, status: 'present' | 'absent' | 'sick' | 'away_with_notice', isRegular: boolean = true) => {
    if (isRegular) {
      setPlayers(prevPlayers => 
        prevPlayers.map(player => 
          player.id === playerId 
            ? { ...player, attendance_status: status } 
            : player
        )
      );
    } else {
      setMakeupPlayers(prevPlayers => 
        prevPlayers.map(player => 
          player.id === playerId 
            ? { ...player, attendance_status: status } 
            : player
        )
      );
    }
  };

  // Handle updating player notes (works for both regular and makeup players)
  const updatePlayerNotes = (playerId: number, notes: string, isRegular: boolean = true) => {
    if (isRegular) {
      setPlayers(prevPlayers => 
        prevPlayers.map(player => 
          player.id === playerId 
            ? { ...player, notes } 
            : player
        )
      );
    } else {
      setMakeupPlayers(prevPlayers => 
        prevPlayers.map(player => 
          player.id === playerId 
            ? { ...player, notes } 
            : player
        )
      );
    }
  };

  // Toggle player info expansion
  const togglePlayerInfo = (playerId: number) => {
    setExpandedPlayerInfo(prev => ({
      ...prev,
      [playerId]: !prev[playerId]
    }));
  };

  // Quick actions for attendance (applies to both regular and makeup players)
  const handleMarkAllPresent = () => {
    setPlayers(prevPlayers => 
      prevPlayers.map(player => ({ ...player, attendance_status: 'present' }))
    );
    setMakeupPlayers(prevPlayers => 
      prevPlayers.map(player => ({ ...player, attendance_status: 'present' }))
    );
  };

  const handleMarkAllAbsent = () => {
    setPlayers(prevPlayers => 
      prevPlayers.map(player => ({ ...player, attendance_status: 'absent' }))
    );
    setMakeupPlayers(prevPlayers => 
      prevPlayers.map(player => ({ ...player, attendance_status: 'absent' }))
    );
  };

  // NEW: Add makeup player
  const addMakeupPlayer = (player: Player) => {
    const makeupPlayer = {
      ...player,
      attendance_status: 'present' as const, // Default makeup players to present
      notes: '',
      is_makeup: true
    };
    
    setMakeupPlayers(prev => [...prev, makeupPlayer]);
    
    // Add to expanded info
    setExpandedPlayerInfo(prev => ({
      ...prev,
      [player.id]: showAllPlayerInfo
    }));
  };

  // NEW: Remove makeup player
  const removeMakeupPlayer = (playerId: number) => {
    setMakeupPlayers(prev => prev.filter(player => player.id !== playerId));
    
    // Remove from expanded info
    setExpandedPlayerInfo(prev => {
      const { [playerId]: removed, ...rest } = prev;
      return rest;
    });
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedPeriodId || !selectedTimeSlotId || !selectedDate) {
      setError('Please select all required fields');
      return;
    }
    
    try {
      setLoading(prev => ({ ...prev, creating: true }));
      setError(null);
      
      // Combine regular players and makeup players for submission
      const allPlayers = [...players, ...makeupPlayers];
      
      // First create the register
      const createResponse = await fetch('/api/registers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          teaching_period_id: selectedPeriodId,
          group_time_id: selectedTimeSlotId,
          date: selectedDate,
          notes: notes,
          assistant_coach_ids: selectedAssistantCoachIds,
          makeup_player_ids: makeupPlayers.map(p => p.id) // NEW: Send makeup player IDs
        }),
      });
      
      const data = await createResponse.json();
      
      // Handle conflict (register already exists)
      if (createResponse.status === 409 && data.register_id) {
        setLoading(prev => ({ ...prev, creating: false }));
        
        const groupInfo = availableGroups.find(g => g.id === selectedGroupId)?.name || 'this group';
        const message = `A register already exists for ${groupInfo} on ${new Date(selectedDate).toLocaleDateString()}`;
        
        if (window.confirm(`${message}. Would you like to view the existing register?`)) {
          onNavigate(`/registers/${data.register_id}`);
        }
        
        return;
      }
      
      if (!createResponse.ok) {
        throw new Error(data.error || `Error creating register: ${createResponse.statusText}`);
      }
      
      const registerId = data.register_id;
      
      // If we have players with attendance data, update the register entries
      if (allPlayers.length > 0) {
        try {
          await updateRegisterEntries(registerId, allPlayers);
        } catch (error) {
          console.error('Error updating register entries:', error);
          
          setSuccessMessage('Register created, but there was an error updating attendance data.');
          setTimeout(() => {
            onCreateSuccess(registerId.toString());
          }, 1500);
          
          return;
        }
      }
      
      setSuccessMessage('Register created and attendance recorded successfully');
      
      setTimeout(() => {
        onCreateSuccess(registerId.toString());
      }, 1500);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An error occurred';
      setError(errorMessage);
      console.error('Error creating register:', err);
    } finally {
      setLoading(prev => ({ ...prev, creating: false }));
    }
  };

  // Update register entries with attendance data (modified to handle both regular and makeup players)
  const updateRegisterEntries = async (registerId: number, allPlayers: Player[]) => {
    const entries = allPlayers.map(player => ({
      player_id: player.id,
      attendance_status: player.attendance_status,
      notes: player.notes,
      predicted_attendance: player.predicted_attendance,
      is_makeup: player.is_makeup || false // NEW: Flag for makeup players
    }));
    
    const response = await fetch(`/api/registers/${registerId}/entries`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ entries }),
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to update attendance');
    }
    
    return response.json();
  };

  // NEW: Render player card (works for both regular and makeup players)
  const renderPlayerCard = (player: Player, isRegular: boolean = true) => (
    <div key={`${isRegular ? 'regular' : 'makeup'}-${player.id}`} className="border rounded-md p-3">
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-2">
          <div className="font-medium">{player.student_name}</div>
          {!isRegular && (
            <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800">
              Makeup ({player.group_name})
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button 
            type="button"
            onClick={() => togglePlayerInfo(player.id)}
            className="text-xs text-blue-600 hover:text-blue-800"
          >
            {expandedPlayerInfo[player.id] ? 'Hide Info' : 'Show Info'}
          </button>
          {!isRegular && (
            <button
              type="button"
              onClick={() => removeMakeupPlayer(player.id)}
              className="text-xs text-red-600 hover:text-red-800"
            >
              Remove
            </button>
          )}
        </div>
      </div>
      
      {/* Contact Information */}
      {expandedPlayerInfo[player.id] && (
        <div className="mt-2 p-2 bg-gray-50 rounded-md text-xs">
          <div className="grid grid-cols-1 gap-y-1">
            {player.date_of_birth && (
              <div>
                <span className="font-semibold">DOB:</span>{" "}
                {new Date(player.date_of_birth).toLocaleDateString()}
              </div>
            )}
            {player.contact_number && (
              <div>
                <span className="font-semibold">Contact:</span>{" "}
                <a href={`tel:${player.contact_number}`} className="text-blue-600 hover:underline">
                  {player.contact_number}
                </a>
              </div>
            )}
            {player.emergency_contact_number && (
              <div>
                <span className="font-semibold">Emergency:</span>{" "}
                <a href={`tel:${player.emergency_contact_number}`} className="text-blue-600 hover:underline">
                  {player.emergency_contact_number}
                </a>
              </div>
            )}
            {player.contact_email && (
              <div>
                <span className="font-semibold">Email:</span>{" "}
                <a href={`mailto:${player.contact_email}`} className="text-blue-600 hover:underline">
                  {player.contact_email}
                </a>
              </div>
            )}
            {player.medical_information && (
              <div>
                <span className="font-semibold">Medical:</span> {player.medical_information}
              </div>
            )}
            {player.walk_home !== null && (
              <div>
                <span className="font-semibold">Walk home:</span> {player.walk_home ? 'Yes' : 'No'}
              </div>
            )}
          </div>
        </div>
      )}
      
      <div className="mt-2 grid grid-cols-2 gap-1">
        <button
          type="button"
          className={`border rounded-md py-1.5 px-1 text-xs font-medium ${
            player.attendance_status === 'present' 
              ? 'bg-green-100 border-green-500 text-green-800' 
              : 'bg-gray-100 border-gray-300 text-gray-800'
          }`}
          onClick={() => updatePlayerAttendance(player.id, 'present', isRegular)}
        >
          Present
        </button>
        <button
          type="button"
          className={`border rounded-md py-1.5 px-1 text-xs font-medium ${
            player.attendance_status === 'absent' 
              ? 'bg-red-100 border-red-500 text-red-800' 
              : 'bg-gray-100 border-gray-300 text-gray-800'
          }`}
          onClick={() => updatePlayerAttendance(player.id, 'absent', isRegular)}
        >
          Absent
        </button>
        <button
          type="button"
          className={`border rounded-md py-1.5 px-1 text-xs font-medium ${
            player.attendance_status === 'away_with_notice' 
              ? 'bg-yellow-100 border-yellow-500 text-yellow-800' 
              : 'bg-gray-100 border-gray-300 text-gray-800'
          }`}
          onClick={() => updatePlayerAttendance(player.id, 'away_with_notice', isRegular)}
        >
          Away With Notice
        </button>
        <button
          type="button"
          className={`border rounded-md py-1.5 px-1 text-xs font-medium ${
            player.attendance_status === 'sick' 
              ? 'bg-blue-100 border-blue-500 text-blue-800' 
              : 'bg-gray-100 border-gray-300 text-gray-800'
          }`}
          onClick={() => updatePlayerAttendance(player.id, 'sick', isRegular)}
        >
          Sick
        </button>
      </div>
      
      <div className="mt-2">
        <input
          type="text"
          value={player.notes || ''}
          onChange={(e) => updatePlayerNotes(player.id, e.target.value, isRegular)}
          className="w-full text-sm border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
          placeholder="Notes"
        />
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center flex-wrap">
        <h1 className="text-2xl font-bold">Create New Register</h1>
        <button
          onClick={() => onNavigate('/registers')}
          className="px-4 py-2 mt-2 sm:mt-0 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
        >
          Back to Registers
        </button>
      </div>

      {error && (
        <div className="bg-red-50 p-4 rounded-md text-red-700">
          {error}
        </div>
      )}

      {successMessage && (
        <div className="bg-green-50 p-4 rounded-md text-green-700">
          {successMessage}
        </div>
      )}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <form onSubmit={handleSubmit} className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-medium">Select Session</h2>
            
            {/* Show All Sessions Toggle */}
            <div className="flex items-center">
              <label htmlFor="showAllSessions" className="mr-2 text-sm text-gray-700">
                {showAllSessions ? 'Showing all sessions' : 'Showing my sessions'}
              </label>
              <button
                type="button"
                id="showAllSessions"
                onClick={handleToggleShowAllSessions}
                className={`relative inline-flex h-6 w-11 items-center rounded-full ${
                  showAllSessions ? 'bg-blue-600' : 'bg-gray-300'
                } transition-colors duration-300 focus:outline-none`}
              >
                <span 
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-300 ${
                    showAllSessions ? 'translate-x-6' : 'translate-x-1'
                  }`} 
                />
              </button>
            </div>
          </div>
          
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
            {/* Teaching Period Selector */}
            <div>
              <label htmlFor="teachingPeriod" className="block text-sm font-medium text-gray-700 mb-1">
                Term*
              </label>
              <select
                id="teachingPeriod"
                value={selectedPeriodId}
                onChange={(e) => setSelectedPeriodId(e.target.value ? Number(e.target.value) : '')}
                className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                required
                disabled={loading.periods}
              >
                <option value="">Select Term</option>
                {teachingPeriods.map((period) => (
                  <option key={period.id} value={period.id}>{period.name}</option>
                ))}
              </select>
              {loading.periods && (
                <div className="mt-1 text-xs text-gray-500">Loading terms...</div>
              )}
            </div>
            
            {/* Day Selector */}
            <div>
              <label htmlFor="daySelect" className="block text-sm font-medium text-gray-700 mb-1">
                Day*
              </label>
              <select
                id="daySelect"
                value={selectedDay}
                onChange={(e) => setSelectedDay(e.target.value)}
                className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                required
                disabled={loading.days || availableDays.length === 0}
              >
                <option value="">Select Day</option>
                {availableDays.map((day) => (
                  <option key={day} value={day}>{day}</option>
                ))}
              </select>
              {loading.days && (
                <div className="mt-1 text-xs text-gray-500">Loading days...</div>
              )}
            </div>
            
            {/* Group Selector */}
            <div>
              <label htmlFor="groupSelect" className="block text-sm font-medium text-gray-700 mb-1">
                Group*
              </label>
              <select
                id="groupSelect"
                value={selectedGroupId}
                onChange={(e) => setSelectedGroupId(e.target.value ? Number(e.target.value) : '')}
                className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                required
                disabled={loading.groups || availableGroups.length === 0}
              >
                <option value="">Select Group</option>
                {availableGroups.map((group) => (
                  <option key={group.id} value={group.id}>{group.name}</option>
                ))}
              </select>
              {loading.groups && (
                <div className="mt-1 text-xs text-gray-500">Loading groups...</div>
              )}
            </div>
            
            {/* Time Slot Selector */}
            <div>
              <label htmlFor="timeSlotSelect" className="block text-sm font-medium text-gray-700 mb-1">
                Session Time*
              </label>
              <select
                id="timeSlotSelect"
                value={selectedTimeSlotId}
                onChange={(e) => setSelectedTimeSlotId(e.target.value ? Number(e.target.value) : '')}
                className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                required
                disabled={loading.timeSlots || availableTimeSlots.length === 0}
              >
                <option value="">Select Time</option>
                {availableTimeSlots.map((timeSlot) => (
                  <option key={timeSlot.id} value={timeSlot.id}>
                    {timeSlot.start_time} - {timeSlot.end_time}
                  </option>
                ))}
              </select>
              {loading.timeSlots && (
                <div className="mt-1 text-xs text-gray-500">Loading times...</div>
              )}
            </div>
          </div>
          
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 mb-6">
            {/* Date Selector */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <label htmlFor="date" className="block text-sm font-medium text-gray-700">
                  Date*
                </label>
                <div className="flex items-center">
                  <label htmlFor="makeupClass" className="text-xs text-gray-600 mr-2">
                    Makeup Class
                  </label>
                  <button
                    type="button"
                    id="makeupClass"
                    onClick={handleMakeupClassToggle}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full ${
                      isMakeupClass ? 'bg-blue-600' : 'bg-gray-300'
                    } transition-colors duration-300 focus:outline-none`}
                  >
                    <span 
                      className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform duration-300 ${
                        isMakeupClass ? 'translate-x-5' : 'translate-x-1'
                      }`} 
                    />
                  </button>
                </div>
              </div>
              
              {isMakeupClass ? (
                <input
                  type="date"
                  id="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  required
                />
              ) : (
                <select
                  id="dateSelect"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  required
                  disabled={availableDates.length === 0}
                >
                  <option value="">Select Date</option>
                  {availableDates.map((date) => {
                    const dateObj = new Date(date);
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    
                    const isPast = dateObj < today;
                    
                    return (
                      <option 
                        key={date} 
                        value={date}
                        className={isPast ? 'text-gray-500 italic' : ''}
                      >
                        {dateObj.toLocaleDateString('en-US', { 
                          weekday: 'long',
                          day: 'numeric',
                          month: 'long'
                        })}
                        {isPast ? ' (Past)' : ''}
                      </option>
                    );
                  })}
                </select>
              )}
              
              {selectedDay && availableDates.length === 0 && !isMakeupClass && (
                <div className="mt-1 text-xs text-orange-500">
                  No dates available for {selectedDay}. Enable "Makeup Class" to select any date.
                </div>
              )}
            </div>
            
            {/* Session Notes */}
            <div>
              <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
                Session Notes
              </label>
              <textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                rows={1}
                placeholder="Add notes about this session (optional)"
              />
            </div>
          </div>
          
          {/* Assistant Coaches Dropdown */}
          <div className="mt-4 mb-6">
            <label htmlFor="assistant-coaches" className="block text-sm font-medium text-gray-700 mb-1">
              Assistant Coaches
            </label>
            
            {loadingCoaches ? (
              <div className="flex h-10 items-center">
                <div className="animate-spin h-5 w-5 border-b-2 border-blue-700 rounded-full"></div>
                <span className="ml-2 text-sm text-gray-500">Loading coaches...</span>
              </div>
            ) : (
              <div className="relative" ref={coachDropdownRef}>
                <button
                  type="button"
                  className="w-full cursor-pointer bg-white border border-gray-300 rounded-md py-2 px-3 shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  onClick={toggleCoachDropdown}
                  aria-haspopup="listbox"
                  aria-expanded={isCoachDropdownOpen}
                >
                  <div className="flex justify-between items-center">
                    <span className="block truncate">
                      {getSelectedCoachDisplay()}
                    </span>
                    <svg className="h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                      <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </div>
                </button>
                
                {isCoachDropdownOpen && (
                  <div 
                    className="absolute z-10 mt-1 w-full bg-white shadow-lg rounded-md py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto max-h-60 focus:outline-none sm:text-sm"
                    role="listbox"
                  >
                    {availableCoaches.length === 0 ? (
                      <div className="text-sm text-gray-500 py-2 px-4">No coaches available</div>
                    ) : (
                      availableCoaches.map(coach => (
                        <div
                          key={coach.id}
                          className={`cursor-pointer select-none relative py-2 pl-3 pr-9 hover:bg-gray-100 ${
                            selectedAssistantCoachIds.includes(coach.id) ? 'bg-blue-50' : ''
                          }`}
                          onClick={() => toggleAssistantCoach(coach.id)}
                          role="option"
                          aria-selected={selectedAssistantCoachIds.includes(coach.id)}
                          tabIndex={0}
                        >
                          <div className="flex items-center">
                            <input
                              type="checkbox"
                              className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                              checked={selectedAssistantCoachIds.includes(coach.id)}
                              onChange={(e) => {
                                e.stopPropagation();
                                toggleAssistantCoach(coach.id);
                              }}
                              onClick={(e) => e.stopPropagation()}
                            />
                            <span className="ml-3 block truncate font-medium">
                              {coach.name}
                            </span>
                          </div>
                          
                          {selectedAssistantCoachIds.includes(coach.id) && (
                            <span className="absolute inset-y-0 right-0 flex items-center pr-4 text-blue-600">
                              <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                            </span>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
            
            {selectedAssistantCoachIds.length > 0 && (
              <div className="mt-2 text-xs text-gray-600">
                <span className="font-medium">Selected:</span>{" "}
                {availableCoaches
                  .filter(coach => selectedAssistantCoachIds.includes(coach.id))
                  .map(coach => coach.name)
                  .join(', ')}
              </div>
            )}
            
            {!selectedAssistantCoachIds.length && !loadingCoaches && (
              <div className="mt-1 text-xs text-gray-500">
                Select any assistant coaches who helped with this session.
              </div>
            )}
          </div>

          {/* NEW: Makeup Players Section */}
          {selectedPeriodId && selectedTimeSlotId && (
            <div className="mt-8 mb-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium">Makeup Players</h3>
                <button
                  type="button"
                  onClick={() => setShowMakeupSection(!showMakeupSection)}
                  className="px-3 py-1.5 text-sm rounded-md shadow-sm text-blue-600 border border-blue-600 hover:bg-blue-50"
                >
                  {showMakeupSection ? 'Hide Makeup Section' : 'Add Makeup Players'}
                </button>
              </div>
              
              {showMakeupSection && (
                <div className="border rounded-md p-4 bg-gray-50">
                  <div className="mb-4">
                    <label htmlFor="makeupSearch" className="block text-sm font-medium text-gray-700 mb-1">
                      Search for players from other groups
                    </label>
                    <input
                      type="text"
                      id="makeupSearch"
                      value={makeupPlayerSearch}
                      onChange={(e) => setMakeupPlayerSearch(e.target.value)}
                      className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      placeholder="Search by player name..."
                    />
                  </div>
                  
                  {loadingMakeupPlayers ? (
                    <div className="flex justify-center items-center h-20">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-700"></div>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {availableMakeupPlayers.length === 0 ? (
                        <div className="text-sm text-gray-500 py-4 text-center">
                          {makeupPlayerSearch ? 'No players found matching your search.' : 'No other players available for makeup classes.'}
                        </div>
                      ) : (
                        availableMakeupPlayers.map((player) => (
                          <div key={player.id} className="flex justify-between items-center p-2 bg-white rounded border">
                            <div>
                              <div className="font-medium">{player.student_name}</div>
                              <div className="text-sm text-gray-500">{player.group_name}</div>
                            </div>
                            <button
                              type="button"
                              onClick={() => addMakeupPlayer(player)}
                              className="px-2 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                            >
                              Add
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          
          {/* Player Attendance Section */}
          {(players.length > 0 || makeupPlayers.length > 0) && (
            <div className="mt-8">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium">Attendance</h3>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleToggleAllPlayerInfo}
                    className={`px-3 py-1.5 text-xs rounded-md shadow-sm text-white ${
                      showAllPlayerInfo ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-600 hover:bg-gray-700'
                    }`}
                  >
                    {showAllPlayerInfo ? 'Hide All Info' : 'Show All Info'}
                  </button>
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
              
              {loading.players ? (
                <div className="flex justify-center items-center h-24">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-700"></div>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-sm text-gray-700">
                    {players.length} regular players
                    {makeupPlayers.length > 0 && `, ${makeupPlayers.length} makeup players`}
                  </p>
                  
                  <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                    {/* Regular Players */}
                    {players.map((player) => renderPlayerCard(player, true))}
                    
                    {/* Makeup Players */}
                    {makeupPlayers.map((player) => renderPlayerCard(player, false))}
                  </div>
                </div>
              )}
            </div>
          )}
          
          <div className="flex justify-end mt-6">
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 shadow"
              disabled={loading.creating}
            >
              {loading.creating ? (
                <span className="flex items-center">
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  {(players.length > 0 || makeupPlayers.length > 0) ? 'Save Attendance' : 'Create Register'}
                </span>
              ) : ((players.length > 0 || makeupPlayers.length > 0) ? 'Save Attendance' : 'Create Register')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateRegister;