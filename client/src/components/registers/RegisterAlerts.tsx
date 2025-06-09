import React, { useState, useEffect } from 'react';
import { AlertCircle, Clock, Calendar, CheckCircle, ChevronRight, X } from 'lucide-react';

interface MissingRegister {
  id: string;
  date: string;
  group_name: string;
  time_display: string;
  student_count: number;
  days_overdue: number;
  group_time_id: number;
  teaching_period_id: number;
}

interface RegisterAlertsProps {
  onNavigateToCalendar?: () => void;
  onNavigateToCreate?: (sessionData: any) => void;
  onClose?: () => void;
  compact?: boolean;
}

const RegisterAlerts: React.FC<RegisterAlertsProps> = ({ 
  onNavigateToCalendar,
  onClose,
  compact = false
}) => {
  const [missingRegisters, setMissingRegisters] = useState<MissingRegister[]>([]);
  const [todayRegisters, setTodayRegisters] = useState<MissingRegister[]>([]);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const fetchMissingRegisters = async () => {
      try {
        setLoading(true);
        
        // Get current date and recent dates
        const today = new Date();
        const oneWeekAgo = new Date(today);
        oneWeekAgo.setDate(today.getDate() - 7);
        
        const params = new URLSearchParams({
          start_date: oneWeekAgo.toISOString().split('T')[0],
          end_date: today.toISOString().split('T')[0]
        });
        
        const response = await fetch(`/api/register-calendar?${params}`);
        if (!response.ok) throw new Error('Failed to fetch sessions');
        
        const sessions = await response.json();
        
        // Filter missing registers
        const today_str = today.toISOString().split('T')[0];
        const missing: MissingRegister[] = [];
        const todayMissing: MissingRegister[] = [];
        
        sessions.forEach((session: any) => {
          if (!session.has_register) {
            const sessionDate = new Date(session.date);
            const daysDiff = Math.floor((today.getTime() - sessionDate.getTime()) / (1000 * 60 * 60 * 24));
            
            const missingRegister: MissingRegister = {
              id: session.id,
              date: session.date,
              group_name: session.group_name,
              time_display: session.time_display,
              student_count: session.student_count,
              days_overdue: daysDiff,
              group_time_id: session.group_time_id,
              teaching_period_id: session.teaching_period_id
            };
            
            if (session.date === today_str) {
              todayMissing.push(missingRegister);
            } else if (daysDiff > 0) {
              missing.push(missingRegister);
            }
          }
        });
        
        // Sort by most overdue first
        missing.sort((a, b) => b.days_overdue - a.days_overdue);
        
        setMissingRegisters(missing);
        setTodayRegisters(todayMissing);
        
      } catch (err) {
        console.error('Error fetching missing registers:', err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchMissingRegisters();
  }, []);

  // Quick create register
  const handleQuickCreate = async (register: MissingRegister) => {
    try {
      const response = await fetch('/api/register-calendar/quick-create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          group_time_id: register.group_time_id,
          date: register.date,
          teaching_period_id: register.teaching_period_id
        }),
      });

      if (response.ok) {
        // Remove from missing registers
        setMissingRegisters(prev => prev.filter(r => r.id !== register.id));
        setTodayRegisters(prev => prev.filter(r => r.id !== register.id));
      } else {
        const errorData = await response.json();
        alert(errorData.error || 'Failed to create register');
      }
    } catch (err) {
      console.error('Error creating register:', err);
      alert('Failed to create register');
    }
  };

  const totalMissing = missingRegisters.length + todayRegisters.length;

  if (loading) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="animate-pulse flex space-x-4">
          <div className="rounded-full bg-gray-200 h-10 w-10"></div>
          <div className="flex-1 space-y-2 py-1">
            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2"></div>
          </div>
        </div>
      </div>
    );
  }

  if (dismissed || totalMissing === 0) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
        <div className="flex items-center gap-3">
          <CheckCircle className="text-green-600" size={24} />
          <div className="flex-1">
            <h3 className="font-medium text-green-800">All caught up!</h3>
            <p className="text-sm text-green-600">No missing registers found.</p>
          </div>
          {onNavigateToCalendar && (
            <button
              onClick={onNavigateToCalendar}
              className="text-green-600 hover:text-green-800"
            >
              <ChevronRight size={20} />
            </button>
          )}
        </div>
      </div>
    );
  }

  if (compact) {
    return (
      <div className={`border rounded-lg p-4 ${
        missingRegisters.length > 0 ? 'bg-red-50 border-red-200' : 'bg-yellow-50 border-yellow-200'
      }`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {missingRegisters.length > 0 ? (
              <AlertCircle className="text-red-600" size={24} />
            ) : (
              <Clock className="text-yellow-600" size={24} />
            )}
            <div>
              <h3 className={`font-medium ${
                missingRegisters.length > 0 ? 'text-red-800' : 'text-yellow-800'
              }`}>
                {totalMissing} Missing Register{totalMissing !== 1 ? 's' : ''}
              </h3>
              <p className={`text-sm ${
                missingRegisters.length > 0 ? 'text-red-600' : 'text-yellow-600'
              }`}>
                {missingRegisters.length > 0 
                  ? `${missingRegisters.length} overdue, ${todayRegisters.length} due today`
                  : 'Due today'
                }
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {onNavigateToCalendar && (
              <button
                onClick={onNavigateToCalendar}
                className={`px-3 py-1 rounded text-sm font-medium ${
                  missingRegisters.length > 0 
                    ? 'bg-red-600 text-white hover:bg-red-700' 
                    : 'bg-yellow-600 text-white hover:bg-yellow-700'
                }`}
              >
                View
              </button>
            )}
            {onClose && (
              <button
                onClick={() => setDismissed(true)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={18} />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="p-4 bg-red-50 border-b border-red-200 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <AlertCircle className="text-red-600" size={24} />
          <div>
            <h3 className="font-medium text-red-800">Missing Registers</h3>
            <p className="text-sm text-red-600">
              {totalMissing} session{totalMissing !== 1 ? 's' : ''} need{totalMissing === 1 ? 's' : ''} attention
            </p>
          </div>
        </div>
        {onClose && (
          <button
            onClick={() => setDismissed(true)}
            className="text-red-400 hover:text-red-600"
          >
            <X size={20} />
          </button>
        )}
      </div>

      <div className="divide-y divide-gray-200 max-h-80 overflow-y-auto">
        {/* Today's missing registers */}
        {todayRegisters.map((register) => (
          <div key={register.id} className="p-4 hover:bg-gray-50">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="text-yellow-600" size={16} />
                  <span className="font-medium text-gray-900">{register.group_name}</span>
                  <span className="px-2 py-1 text-xs bg-yellow-100 text-yellow-800 rounded">
                    Due Today
                  </span>
                </div>
                <div className="text-sm text-gray-600">
                  {new Date(register.date).toLocaleDateString('en-GB', { 
                    weekday: 'short', 
                    month: 'short', 
                    day: 'numeric' 
                  })} • {register.time_display} • {register.student_count} students
                </div>
              </div>
              <button
                onClick={() => handleQuickCreate(register)}
                className="ml-3 px-3 py-1 bg-yellow-600 text-white text-sm rounded hover:bg-yellow-700"
              >
                Create
              </button>
            </div>
          </div>
        ))}

        {/* Overdue registers */}
        {missingRegisters.slice(0, 5).map((register) => (
          <div key={register.id} className="p-4 hover:bg-gray-50">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <AlertCircle className="text-red-600" size={16} />
                  <span className="font-medium text-gray-900">{register.group_name}</span>
                  <span className="px-2 py-1 text-xs bg-red-100 text-red-800 rounded">
                    {register.days_overdue} day{register.days_overdue !== 1 ? 's' : ''} overdue
                  </span>
                </div>
                <div className="text-sm text-gray-600">
                  {new Date(register.date).toLocaleDateString('en-GB', { 
                    weekday: 'short', 
                    month: 'short', 
                    day: 'numeric' 
                  })} • {register.time_display} • {register.student_count} students
                </div>
              </div>
              <button
                onClick={() => handleQuickCreate(register)}
                className="ml-3 px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700"
              >
                Create
              </button>
            </div>
          </div>
        ))}

        {missingRegisters.length > 5 && (
          <div className="p-4 bg-gray-50 text-center">
            <button
              onClick={onNavigateToCalendar}
              className="text-blue-600 hover:text-blue-800 text-sm font-medium"
            >
              View {missingRegisters.length - 5} more missing registers
            </button>
          </div>
        )}
      </div>

      {onNavigateToCalendar && (
        <div className="p-4 bg-gray-50 border-t border-gray-200">
          <button
            onClick={onNavigateToCalendar}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            <Calendar size={18} />
            View Register Calendar
          </button>
        </div>
      )}
    </div>
  );
};

export default RegisterAlerts;