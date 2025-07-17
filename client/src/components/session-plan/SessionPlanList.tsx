// client/src/components/session-plan/SessionPlanList.tsx

import React, { useState, useEffect } from 'react';
import { UserRole } from './SessionPlan';

interface TeachingPeriod {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
}

interface SessionPlanSummary {
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
  session_description: string;
  summary: {
    total_plan_entries: number;
    total_trial_players: number;
    planned_absent: number;
    makeup_players: number;
    has_changes: boolean;
  };
}

interface SessionPlanListProps {
  onViewPlan: (planId: number) => void;
  onEditPlan: (planId: number) => void;
  onCreatePlan: () => void;
  userRole: UserRole;
  selectedPeriodId: number | null;
  onPeriodChange: (periodId: number) => void;
  teachingPeriods: TeachingPeriod[];
  hasAdminPermissions: boolean;
}

const SessionPlanList: React.FC<SessionPlanListProps> = ({
  onViewPlan,
  onEditPlan,
  onCreatePlan,
  selectedPeriodId,
  onPeriodChange,
  teachingPeriods,
  hasAdminPermissions
}) => {
  const [sessionPlans, setSessionPlans] = useState<SessionPlanSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch session plans
  useEffect(() => {
    const fetchSessionPlans = async () => {
      if (!selectedPeriodId) return;
      
      try {
        setLoading(true);
        setError(null);
        
        const response = await fetch(`/api/session-plans?period_id=${selectedPeriodId}`);
        if (!response.ok) {
          throw new Error(`Failed to fetch session plans: ${response.statusText}`);
        }
        
        const data = await response.json();
        setSessionPlans(data);
      } catch (err) {
        console.error('Error fetching session plans:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch session plans');
      } finally {
        setLoading(false);
      }
    };
    
    fetchSessionPlans();
  }, [selectedPeriodId]);

  // Format date for display
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-GB', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  // Format time for display
  const formatTime = (timeString: string) => {
    return timeString.slice(0, 5); // Remove seconds
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Session Planning</h1>
          <p className="text-gray-600 mt-1">Plan session attendance in advance</p>
        </div>
      
      {hasAdminPermissions && (
          <button
            onClick={onCreatePlan}
            className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors"
          >
            Create Session Plan
          </button>
        )}
      </div>

      {/* Teaching Period Filter */}
      <div className="flex items-center space-x-4">
        <label htmlFor="period-select" className="text-sm font-medium text-gray-700">
          Teaching Period:
        </label>
        <select
          id="period-select"
          value={selectedPeriodId || ''}
          onChange={(e) => onPeriodChange(Number(e.target.value))}
          className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Select a period</option>
          {teachingPeriods.map((period) => (
            <option key={period.id} value={period.id}>
              {period.name} {period.is_active && '(Active)'}
            </option>
          ))}
        </select>
      </div>

      {/* Error Message */}
      {error && (
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
                <p>{error}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Session Plans List */}
      {sessionPlans.length === 0 ? (
        <div className="text-center py-12">
          <div className="mx-auto h-12 w-12 text-gray-400">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <h3 className="mt-2 text-sm font-medium text-gray-900">No session plans</h3>
          <p className="mt-1 text-sm text-gray-500">
            {selectedPeriodId ? 'No session plans found for this teaching period.' : 'Select a teaching period to view session plans.'}
          </p>
          {hasAdminPermissions && selectedPeriodId && (
            <div className="mt-6">
              <button
                onClick={onCreatePlan}
                className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors"
              >
                Create your first session plan
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white shadow overflow-hidden sm:rounded-md">
          <ul className="divide-y divide-gray-200">
            {sessionPlans.map((plan) => (
              <li key={plan.id}>
                <div className="px-4 py-4 sm:px-6">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-3">
                        <h3 className="text-lg font-medium text-gray-900 truncate">
                          {plan.group.name}
                        </h3>
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          {plan.time_slot.day} {formatTime(plan.time_slot.start_time)}-{formatTime(plan.time_slot.end_time)}
                        </span>
                      </div>
                      
                      <div className="mt-2 flex items-center text-sm text-gray-500">
                        <svg className="flex-shrink-0 mr-1.5 h-4 w-4 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
                        </svg>
                        <span>{formatDate(plan.date)}</span>
                        
                        <span className="mx-2">•</span>
                        
                        <svg className="flex-shrink-0 mr-1.5 h-4 w-4 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                        </svg>
                        <span>Planned by {plan.planned_by.name}</span>
                      </div>
                      
                      {/* Plan Summary */}
                      <div className="mt-2 flex items-center space-x-4 text-sm text-gray-600">
                        <span>{plan.summary.total_plan_entries} players</span>
                        {plan.summary.planned_absent > 0 && (
                          <span className="text-red-600">{plan.summary.planned_absent} absent</span>
                        )}
                        {plan.summary.makeup_players > 0 && (
                          <span className="text-green-600">{plan.summary.makeup_players} makeup</span>
                        )}
                        {plan.summary.total_trial_players > 0 && (
                          <span className="text-blue-600">{plan.summary.total_trial_players} trial</span>
                        )}
                      </div>
                      
                      {plan.notes && (
                        <div className="mt-2 text-sm text-gray-600">
                          <p className="line-clamp-2">{plan.notes}</p>
                        </div>
                      )}
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => onViewPlan(plan.id)}
                        className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                      >
                        View
                      </button>
                      
                      {hasAdminPermissions && (
                        <button
                          onClick={() => onEditPlan(plan.id)}
                          className="text-gray-600 hover:text-gray-800 text-sm font-medium"
                        >
                          Edit
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default SessionPlanList;