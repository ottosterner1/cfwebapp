// client/src/components/session-plan/SessionPlanDetail.tsx

import React, { useState, useEffect } from 'react';
import { UserRole } from './SessionPlan';

interface SessionPlanDetailProps {
  planId: number;
  onBack: () => void;
  onEdit: () => void;
  userRole: UserRole;
  hasAdminPermissions: boolean;
}

interface SessionPlanDetail {
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
  teaching_period: {
    id: number;
    name: string;
  };
  planned_by: {
    id: number;
    name: string;
  };
  notes: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  session_description: string;
  plan_entries: Array<{
    id: number;
    player_id: number;
    student_id: number;
    student_name: string;
    planned_status: string;
    player_type: string;
    notes: string;
    original_group?: string;
  }>;
  trial_players: Array<{
    id: number;
    name: string;
    contact_email?: string;
    contact_number?: string;
    date_of_birth?: string;
    notes: string;
  }>;
  summary: {
    total_plan_entries: number;
    total_trial_players: number;
    planned_absent: number;
    makeup_players: number;
    has_changes: boolean;
  };
}

const SessionPlanDetail: React.FC<SessionPlanDetailProps> = ({
  planId,
  onBack,
  onEdit,
  hasAdminPermissions
}) => {
  const [plan, setPlan] = useState<SessionPlanDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch session plan details
  useEffect(() => {
    const fetchPlanDetails = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const response = await fetch(`/api/session-plans/${planId}`);
        if (!response.ok) {
          throw new Error(`Failed to fetch session plan: ${response.statusText}`);
        }
        
        const data = await response.json();
        setPlan(data);
      } catch (err) {
        console.error('Error fetching session plan:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch session plan');
      } finally {
        setLoading(false);
      }
    };
    
    fetchPlanDetails();
  }, [planId]);

  // Format date for display
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-GB', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  // Format time for display
  const formatTime = (timeString: string) => {
    return timeString.slice(0, 5); // Remove seconds
  };

  // Get status badge color
  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'planned_present':
        return 'bg-green-100 text-green-800';
      case 'planned_absent':
        return 'bg-red-100 text-red-800';
      case 'makeup_player':
        return 'bg-blue-100 text-blue-800';
      case 'trial_player':
        return 'bg-purple-100 text-purple-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  // Get status display text
  const getStatusText = (status: string) => {
    switch (status) {
      case 'planned_present':
        return 'Present';
      case 'planned_absent':
        return 'Absent';
      case 'makeup_player':
        return 'Makeup';
      case 'trial_player':
        return 'Trial';
      default:
        return status;
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error || !plan) {
    return (
      <div className="space-y-6">
        <div className="flex items-center space-x-4">
          <button
            onClick={onBack}
            className="text-gray-600 hover:text-gray-800"
          >
            ← Back to Session Plans
          </button>
        </div>
        
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">Error</h3>
              <div className="mt-2 text-sm text-red-700">
                <p>{error || 'Session plan not found'}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <button
            onClick={onBack}
            className="text-gray-600 hover:text-gray-800"
          >
            ← Back to Session Plans
          </button>
          <h1 className="text-2xl font-bold text-gray-900">Session Plan Details</h1>
        </div>
        
        {hasAdminPermissions && (
          <button
            onClick={onEdit}
            className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors"
          >
            Edit Plan
          </button>
        )}
      </div>

      {/* Session Information */}
      <div className="bg-white shadow rounded-lg p-6">
        <div className="border-b border-gray-200 pb-4 mb-4">
          <h2 className="text-xl font-semibold text-gray-900">{plan.session_description}</h2>
          <div className="mt-2 text-sm text-gray-600">
            <p>{formatDate(plan.date)}</p>
            <p>{plan.time_slot.day} {formatTime(plan.time_slot.start_time)}-{formatTime(plan.time_slot.end_time)}</p>
            <p>Planned by {plan.planned_by.name}</p>
          </div>
        </div>

        {/* Plan Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-900">{plan.summary.total_plan_entries}</div>
            <div className="text-sm text-gray-600">Total Players</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-red-600">{plan.summary.planned_absent}</div>
            <div className="text-sm text-gray-600">Planned Absent</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{plan.summary.makeup_players}</div>
            <div className="text-sm text-gray-600">Makeup Players</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-600">{plan.summary.total_trial_players}</div>
            <div className="text-sm text-gray-600">Trial Players</div>
          </div>
        </div>

        {/* Notes */}
        {plan.notes && (
          <div className="mb-6">
            <h3 className="text-lg font-medium text-gray-900 mb-2">Notes</h3>
            <p className="text-gray-700 bg-gray-50 p-3 rounded-md">{plan.notes}</p>
          </div>
        )}
      </div>

      {/* Plan Entries */}
      {plan.plan_entries.length > 0 && (
        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Planned Players</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Student
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Notes
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {plan.plan_entries.map((entry) => (
                  <tr key={entry.id}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{entry.student_name}</div>
                      {entry.original_group && (
                        <div className="text-sm text-gray-500">From {entry.original_group}</div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusBadgeColor(entry.planned_status)}`}>
                        {getStatusText(entry.planned_status)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {entry.player_type === 'makeup' ? 'Makeup' : 'Regular'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {entry.notes || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Trial Players */}
      {plan.trial_players.length > 0 && (
        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Trial Players</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Contact
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Notes
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {plan.trial_players.map((player) => (
                  <tr key={player.id}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{player.name}</div>
                      {player.date_of_birth && (
                        <div className="text-sm text-gray-500">
                          DOB: {new Date(player.date_of_birth).toLocaleDateString()}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {player.contact_email && <div>{player.contact_email}</div>}
                      {player.contact_number && <div>{player.contact_number}</div>}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {player.notes || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default SessionPlanDetail;