import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card';
import { Alert, AlertDescription } from '../../components/ui/alert';

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
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Coach Accreditation Status</CardTitle>
        {/* <button
          onClick={sendReminders}
          disabled={sendingReminders}
          className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
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

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr>
                <th className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Coach
                </th>
                {accreditationTypes.map(({ key, label }) => (
                  <th key={key} className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {coaches.map((coach) => (
                <tr key={coach.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900">{coach.name}</div>
                      <div className="text-sm text-gray-500">{coach.email}</div>
                    </div>
                  </td>
                  {accreditationTypes.map(({ key }) => {
                    const accreditation = coach.accreditations[key];
                    return (
                      <td key={key} className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(accreditation.status, accreditation.days_remaining)}`}>
                          {formatDaysRemaining(accreditation.days_remaining, accreditation.status)}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
};

export default AccreditationDashboard;