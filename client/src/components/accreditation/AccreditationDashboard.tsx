import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { PencilIcon, Calendar, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';

type AccreditationType = 'dbs' | 'first_aid' | 'safeguarding' | 'pediatric_first_aid' | 'accreditation';

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
}

const AccreditationDashboard = () => {
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // const [sendingReminders, setSendingReminders] = useState(false);

  useEffect(() => {
    fetchCoachesData();
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

  // const sendReminders = async () => {
  //   setSendingReminders(true);
  //   try {
  //     const response = await fetch('/api/coaches/send-accreditation-reminders', {
  //       method: 'POST',
  //     });
      
  //     if (!response.ok) throw new Error('Failed to send reminders');
  //     alert('Reminders sent successfully!');
  //   } catch (err) {
  //     setError(err instanceof Error ? err.message : 'Failed to send reminders');
  //   } finally {
  //     setSendingReminders(false);
  //   }
  // };

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

  const accreditationTypes: { key: AccreditationType; label: string }[] = [
    { key: 'dbs', label: 'DBS Check' },
    { key: 'first_aid', label: 'First Aid' },
    { key: 'safeguarding', label: 'Safeguarding' },
    { key: 'pediatric_first_aid', label: 'Pediatric First Aid' },
    { key: 'accreditation', label: 'LTA Accreditation' },
  ];

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-col sm:flex-row items-center justify-between">
        <CardTitle>Coach Accreditation Status</CardTitle>
        {/* <button
          onClick={sendReminders}
          disabled={sendingReminders}
          className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 mt-4 sm:mt-0"
        >
          <Bell className="h-4 w-4 mr-2" />
          {sendingReminders ? 'Sending...' : 'Send Reminders'}
        </button> */}
      </CardHeader>

      <CardContent>
        {error && (
          <Alert className="mb-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {coaches.map((coach) => (
            <div key={coach.id} className="border rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow duration-200">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="font-semibold text-lg">{coach.name}</h3>
                  <p className="text-sm text-gray-500">{coach.email}</p>
                </div>
                <button
                  onClick={() => navigateToEditCoach(coach.id)}
                  className="text-blue-600 hover:text-blue-900 focus:outline-none flex items-center p-2 rounded-full hover:bg-blue-50"
                  aria-label={`Edit ${coach.name}`}
                >
                  <PencilIcon className="h-5 w-5" />
                </button>
              </div>
              <div className="space-y-2">
                {accreditationTypes.map(({ key, label }) => {
                  const accreditation = coach.accreditations[key];
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
      </CardContent>
    </Card>
  );
};

export default AccreditationDashboard;