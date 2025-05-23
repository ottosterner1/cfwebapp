import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { PencilIcon, Calendar, AlertTriangle, CheckCircle, XCircle, Bell } from 'lucide-react';

// Update AccreditationType to include bcta_accreditation
type AccreditationType = 'dbs' | 'first_aid' | 'safeguarding' | 'pediatric_first_aid' | 'accreditation' | 'bcta_accreditation';

interface Coach {
  id: number;
  name: string;
  email: string;
  accreditations: {
    [key in AccreditationType]: {
      expiry_date: string | null;
      status: 'valid' | 'warning' | 'expired';
      days_remaining: number | null;
    };
  };
  is_current_user: boolean;
}

interface CurrentUser {
  is_admin: boolean;
  is_super_admin: boolean;
}

const AccreditationDashboard = () => {
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sendingReminders, setSendingReminders] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  useEffect(() => {
    // Fetch current user info first
    const fetchCurrentUser = async () => {
      try {
        const response = await fetch('/api/current-user');
        if (!response.ok) throw new Error('Failed to fetch current user');
        const data = await response.json();
        setCurrentUser({
          is_admin: data.is_admin,
          is_super_admin: data.is_super_admin
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch user data');
      }
    };

    fetchCurrentUser().then(() => fetchCoachesData());
  }, []);

  const fetchCoachesData = async () => {
    try {
      const response = await fetch('/api/coaches/accreditations');
      if (!response.ok) throw new Error('Failed to fetch coach data');
      const data = await response.json();
      setCoaches(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const getDetailedReminderInfo = () => {
    // Track coaches and their specific reminders
    const reminderDetails: {
      coachName: string;
      reminders: { type: string; status: string; daysRemaining: number | null }[];
    }[] = [];
    
    // Track types of emails
    let reminderCount = 0;
    let noticeCount = 0;
    let totalCoaches = 0;
    
    coaches.forEach(coach => {
      const coachReminders: { type: string; status: string; daysRemaining: number | null }[] = [];
      let hasWarnings = false;
      let hasExpired = false;
      
      accreditationTypes.forEach(({ key, label }) => {
        const accreditation = coach.accreditations[key];
        // Only include if it has a valid date (days_remaining is not null)
        // and it's either warning or expired status
        if (accreditation?.days_remaining !== null && 
            (accreditation.status === 'warning' || accreditation.status === 'expired')) {
          coachReminders.push({
            type: label,
            status: accreditation.status,
            daysRemaining: accreditation.days_remaining
          });
          
          if (accreditation.status === 'warning') {
            hasWarnings = true;
          } else if (accreditation.status === 'expired') {
            hasExpired = true;
          }
        }
      });
      
      // Only add coach if they have reminders
      if (coachReminders.length > 0) {
        reminderDetails.push({
          coachName: coach.name,
          reminders: coachReminders
        });
        
        // Count different types of emails
        if (hasWarnings) reminderCount++;
        if (hasExpired) noticeCount++;
        totalCoaches++;
      }
    });
    
    return {
      details: reminderDetails,
      reminderCount,
      noticeCount,
      totalCoaches
    };
  };

  const sendReminders = async () => {
    setSendingReminders(true);
    try {
      const response = await fetch('/api/coaches/send-accreditation-reminders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) throw new Error('Failed to send reminders');
      
      const result = await response.json();
      alert(`Reminders sent successfully! ${result.emails_sent} emails sent.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send reminders');
    } finally {
      setSendingReminders(false);
      setShowConfirmDialog(false);
    }
  };

  const handleSendReminders = () => {
    const { totalCoaches } = getDetailedReminderInfo();
    if (totalCoaches === 0) {
      alert('No reminders need to be sent at this time.');
      return;
    }
    setShowConfirmDialog(true);
  };

  const navigateToEditCoach = (coachId: number) => {
    window.location.href = `/clubs/manage/1/coaches/${coachId}/edit`;
  };

  const getStatusColor = (status: string, days: number | null) => {
    if (days === null) {
      return 'bg-gray-100 border-gray-200 text-gray-800';
    }
    
    switch (status) {
      case 'valid':
        return 'bg-green-100 border-green-200 text-green-800';
      case 'warning':
        return 'bg-yellow-100 border-yellow-200 text-yellow-800';
      case 'expired':
        return 'bg-red-100 border-red-200 text-red-800';
      default:
        return 'bg-gray-100 border-gray-200 text-gray-800';
    }
  };

  const formatDaysRemaining = (days: number | null, status: string) => {
    if (days === null) return 'Not Set';
    if (status === 'expired') return `Expired ${Math.abs(days)} days ago`;
    return `${days} days remaining`;
  };

  const getStatusIcon = (status: string, days: number | null) => {
    if (days === null) return <Calendar className="h-4 w-4" />;
    
    switch (status) {
      case 'valid':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-yellow-600" />;
      case 'expired':
        return <XCircle className="h-4 w-4 text-red-600" />;
      default:
        return <Calendar className="h-4 w-4" />;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  // Add bcta_accreditation to the list of accreditation types
  const accreditationTypes: { key: AccreditationType; label: string }[] = [
    { key: 'dbs', label: 'DBS Check' },
    { key: 'first_aid', label: 'First Aid' },
    { key: 'safeguarding', label: 'Safeguarding' },
    { key: 'pediatric_first_aid', label: 'Pediatric First Aid' },
    { key: 'accreditation', label: 'LTA Accreditation' },
    { key: 'bcta_accreditation', label: 'BCTA Accreditation' },
  ];

  const { details: reminderDetails, reminderCount, noticeCount, totalCoaches } = getDetailedReminderInfo();

  // Filter coaches based on user role
  const visibleCoaches = currentUser?.is_admin || currentUser?.is_super_admin 
    ? coaches 
    : coaches.filter(coach => coach.is_current_user);

  return (
    <>
      <Card className="w-full">
        <CardHeader className="flex flex-col sm:flex-row items-center justify-between">
          <CardTitle>Coach Accreditation Status</CardTitle>
          {(currentUser?.is_admin || currentUser?.is_super_admin) && (
            <button
              onClick={handleSendReminders}
              disabled={sendingReminders}
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 mt-4 sm:mt-0"
            >
              <Bell className="h-4 w-4 mr-2" />
              {sendingReminders ? 'Sending...' : 'Send Reminders'}
            </button>
          )}
        </CardHeader>

        <CardContent>
          {error && (
            <Alert className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {visibleCoaches.map((coach) => (
              <div key={coach.id} className="border rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow duration-200">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="font-semibold text-lg">
                      {coach.name}
                      {coach.is_current_user && (
                        <span className="ml-2 px-2 py-0.5 text-xs bg-blue-100 text-blue-800 rounded-full">
                          You
                        </span>
                      )}
                    </h3>
                    <p className="text-sm text-gray-500">{coach.email}</p>
                  </div>
                  {(currentUser?.is_admin || currentUser?.is_super_admin) && (
                    <button
                      onClick={() => navigateToEditCoach(coach.id)}
                      className="text-blue-600 hover:text-blue-900 focus:outline-none flex items-center p-2 rounded-full hover:bg-blue-50"
                      aria-label={`Edit ${coach.name}`}
                    >
                      <PencilIcon className="h-5 w-5" />
                    </button>
                  )}
                </div>
                <div className="space-y-2">
                  {accreditationTypes.map(({ key, label }) => {
                    const accreditation = coach.accreditations[key];
                    if (!accreditation) return null;
                    
                    return (
                      <div key={key} className="flex justify-between items-center p-2 hover:bg-gray-50 rounded-md">
                        <span className="text-sm font-medium">{label}</span>
                        <span className={`px-2 py-1 inline-flex items-center text-xs leading-5 font-semibold rounded-full ${getStatusColor(accreditation.status, accreditation.days_remaining)}`}>
                          {getStatusIcon(accreditation.status, accreditation.days_remaining)}
                          <span className="ml-1">{formatDaysRemaining(accreditation.days_remaining, accreditation.status)}</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {visibleCoaches.length === 0 && (
            <div className="text-center py-8">
              <p className="text-gray-500">No coach accreditation data available.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Confirmation Dialog - Only shown to admins */}
      {(currentUser?.is_admin || currentUser?.is_super_admin) && showConfirmDialog && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3 text-center">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-yellow-100">
                <Bell className="h-6 w-6 text-yellow-600" />
              </div>
              <h3 className="text-lg leading-6 font-medium text-gray-900 mt-4">
                Send Accreditation Reminders
              </h3>
              <div className="mt-2 px-7 py-3">
                <p className="text-sm text-gray-500">
                  You are about to send <strong>{totalCoaches}</strong> email(s) to the following coaches:
                  {reminderCount > 0 && noticeCount > 0 ? (
                    <span className="block mt-1">
                      <span className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-full bg-yellow-100 text-yellow-800 mr-2">
                        {reminderCount} reminder{reminderCount !== 1 ? 's' : ''}
                      </span>
                      <span className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-800">
                        {noticeCount} notice{noticeCount !== 1 ? 's' : ''}
                      </span>
                    </span>
                  ) : reminderCount > 0 ? (
                    <span className="block mt-1">
                      <span className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-full bg-yellow-100 text-yellow-800">
                        {reminderCount} reminder{reminderCount !== 1 ? 's' : ''} for expiring accreditations
                      </span>
                    </span>
                  ) : (
                    <span className="block mt-1">
                      <span className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-800">
                        {noticeCount} notice{noticeCount !== 1 ? 's' : ''} for expired accreditations
                      </span>
                    </span>
                  )}
                </p>
                <div className="mt-3 text-left">
                  <ul className="text-sm text-gray-600 space-y-3">
                    {reminderDetails.map((coach, index) => (
                      <li key={index} className="border-b pb-2 last:border-b-0">
                        <div className="font-medium">{coach.coachName}</div>
                        <ul className="ml-4 mt-1 space-y-1">
                          {coach.reminders.map((reminder, rIndex) => (
                            <li key={rIndex} className="flex items-start">
                              <span className={`w-2 h-2 mt-1.5 rounded-full mr-2 ${
                                reminder.status === 'expired' ? 'bg-red-500' : 'bg-yellow-500'
                              }`}></span>
                              <span>
                                <strong>{reminder.type}</strong>: {reminder.status === 'expired' 
                                  ? `Expired ${Math.abs(reminder.daysRemaining || 0)} days ago` 
                                  : `Expires in ${reminder.daysRemaining} days`}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <div className="items-center px-4 py-3">
                <button
                  onClick={sendReminders}
                  disabled={sendingReminders}
                  className="px-4 py-2 bg-blue-500 text-white text-base font-medium rounded-md w-24 mr-2 shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:opacity-50"
                >
                  {sendingReminders ? 'Sending...' : 'Send'}
                </button>
                <button
                  onClick={() => setShowConfirmDialog(false)}
                  className="px-4 py-2 bg-gray-500 text-white text-base font-medium rounded-md w-24 shadow-sm hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-300"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default AccreditationDashboard;