// client/src/components/session-plan/SessionPlanEdit.tsx

import React, { useState, useEffect } from 'react';
import { UserRole } from './SessionPlan';

interface SessionPlanEditProps {
  planId: number;
  onBack: () => void;
  onSaveSuccess: () => void;
  userRole: UserRole;
}

interface SessionPlanData {
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
  notes: string;
  is_active: boolean;
}

const SessionPlanEdit: React.FC<SessionPlanEditProps> = ({
  planId,
  onBack,
  onSaveSuccess
}) => {
  const [plan, setPlan] = useState<SessionPlanData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    date: '',
    notes: '',
    is_active: true
  });

  // Load session plan data
  useEffect(() => {
    const fetchPlan = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const response = await fetch(`/api/session-plans/${planId}`);
        if (!response.ok) {
          throw new Error(`Failed to fetch session plan: ${response.statusText}`);
        }
        
        const data = await response.json();
        setPlan(data);
        
        // Set form data
        setFormData({
          date: data.date,
          notes: data.notes || '',
          is_active: data.is_active
        });
        
      } catch (err) {
        console.error('Error fetching session plan:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch session plan');
      } finally {
        setLoading(false);
      }
    };
    
    fetchPlan();
  }, [planId]);

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      setSaving(true);
      setError(null);
      
      const response = await fetch(`/api/session-plans/${planId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update session plan');
      }
      
      onSaveSuccess();
      
    } catch (err) {
      console.error('Error updating session plan:', err);
      setError(err instanceof Error ? err.message : 'Failed to update session plan');
    } finally {
      setSaving(false);
    }
  };

  // Handle delete
  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this session plan? This action cannot be undone.')) {
      return;
    }
    
    try {
      setSaving(true);
      setError(null);
      
      const response = await fetch(`/api/session-plans/${planId}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete session plan');
      }
      
      onBack(); // Go back to list after deletion
      
    } catch (err) {
      console.error('Error deleting session plan:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete session plan');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error && !plan) {
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
                <p>{error}</p>
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
      <div className="flex items-center space-x-4">
        <button
          onClick={onBack}
          className="text-gray-600 hover:text-gray-800"
        >
          ← Back to Session Plans
        </button>
        <h1 className="text-2xl font-bold text-gray-900">Edit Session Plan</h1>
      </div>

      {/* Plan Information */}
      {plan && (
        <div className="bg-gray-50 border border-gray-200 rounded-md p-4">
          <h2 className="text-lg font-medium text-gray-900">{plan.group.name}</h2>
          <p className="text-sm text-gray-600">
            {plan.time_slot.day} {plan.time_slot.start_time.slice(0, 5)}-{plan.time_slot.end_time.slice(0, 5)}
          </p>
          <p className="text-sm text-gray-600">
            Teaching Period: {plan.teaching_period.name}
          </p>
        </div>
      )}

      {/* Form */}
      <div className="bg-white shadow rounded-lg p-6">
        <form onSubmit={handleSubmit} className="space-y-6">
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

          {/* Date */}
          <div>
            <label htmlFor="date" className="block text-sm font-medium text-gray-700">
              Date *
            </label>
            <input
              type="date"
              id="date"
              value={formData.date}
              onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
            />
          </div>

          {/* Notes */}
          <div>
            <label htmlFor="notes" className="block text-sm font-medium text-gray-700">
              Notes
            </label>
            <textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Optional notes about this session plan..."
            />
          </div>

          {/* Active Status */}
          <div className="flex items-center">
            <input
              id="is_active"
              type="checkbox"
              checked={formData.is_active}
              onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <label htmlFor="is_active" className="ml-2 block text-sm text-gray-900">
              Active (inactive plans won't be used for register creation)
            </label>
          </div>

          {/* Submit Buttons */}
          <div className="flex justify-between">
            <button
              type="button"
              onClick={handleDelete}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Deleting...' : 'Delete Plan'}
            </button>
            
            <div className="flex space-x-3">
              <button
                type="button"
                onClick={onBack}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SessionPlanEdit;