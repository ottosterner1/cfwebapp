// client/src/components/invoices/CoachingRates.tsx

import React, { useState, useEffect } from 'react';
import { CoachingRate, Coach, RateType } from '../../types/invoice';

interface CoachingRatesProps {
  onBack: () => void;
  userRole: 'coach' | 'admin' | 'super_admin';
}

// Rate type options for the dropdown
const RATE_TYPES = [
  { value: "lead", label: "Lead Coach", color: "bg-green-100 text-green-800" },
  { value: "assistant", label: "Assistant Coach", color: "bg-blue-100 text-blue-800" },
  { value: "admin", label: "Administrative", color: "bg-purple-100 text-purple-800" },
  { value: "other", label: "Other", color: "bg-gray-100 text-gray-800" }
];

const CoachingRates: React.FC<CoachingRatesProps> = ({ onBack, userRole }) => {
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [rates, setRates] = useState<CoachingRate[]>([]);
  const [selectedCoach, setSelectedCoach] = useState<number | null>(null);
  const [newRate, setNewRate] = useState({ 
    rate_name: '', 
    hourly_rate: '',
    rate_type: 'lead' as RateType // Default to 'lead' - most common type
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [editingRateId, setEditingRateId] = useState<number | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [rateToDelete, setRateToDelete] = useState<CoachingRate | null>(null);
  
  const isAdmin = userRole === 'admin' || userRole === 'super_admin';
  
  // Fetch coaches for admins, or just the current user for coaches
  useEffect(() => {
    const fetchCoaches = async () => {
      try {
        setLoading(true);
        
        // For admins, fetch all coaches from the club
        if (isAdmin) {
          const response = await fetch('/clubs/api/coaches');
          
          if (!response.ok) {
            throw new Error('Failed to fetch coaches');
          }
          
          const data = await response.json();
          setCoaches(data);
          
          // No default coach selection for admins
        } else {
          // For coaches, just fetch their own info
          const response = await fetch('/api/user/info');
          
          if (!response.ok) {
            throw new Error('Failed to fetch user info');
          }
          
          const data = await response.json();
          setCoaches([{
            id: data.id,
            name: data.name,
            email: data.email
          }]);
          setSelectedCoach(data.id);
        }
        
      } catch (err) {
        console.error('Error fetching coaches:', err);
        setError('Failed to load coaches. Please try again.');
      } finally {
        setLoading(false);
      }
    };
    
    fetchCoaches();
  }, [isAdmin]);
  
  // Fetch rates for the selected coach
  useEffect(() => {
    if (!selectedCoach) return;
    
    const fetchRates = async () => {
      try {
        setLoading(true);
        
        let url = '/api/invoices/rates';
        if (isAdmin) {
          url = `/api/invoices/rates/${selectedCoach}`;
        }
        
        const response = await fetch(url);
        
        if (!response.ok) {
          throw new Error('Failed to fetch rates');
        }
        
        const data = await response.json();
        setRates(data);
        setError(null);
      } catch (err) {
        console.error('Error fetching rates:', err);
        setError('Error loading rates. Please try again.');
      } finally {
        setLoading(false);
      }
    };
    
    fetchRates();
  }, [selectedCoach, isAdmin]);
  
  // Auto-hide success message after 5 seconds
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => {
        setSuccessMessage(null);
      }, 5000);
      
      return () => clearTimeout(timer);
    }
  }, [successMessage]);
  
  // Handle form submission for adding or updating a rate
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newRate.rate_name || !newRate.hourly_rate) {
      setError('Rate name and hourly rate are required');
      return;
    }
    
    if (!selectedCoach) {
      setError('Please select a coach first');
      return;
    }
    
    try {
      setLoading(true);
      
      const url = isAdmin
        ? `/api/invoices/rates/${selectedCoach}`
        : '/api/invoices/rates';
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          rate_name: newRate.rate_name,
          hourly_rate: parseFloat(newRate.hourly_rate),
          rate_type: newRate.rate_type // Include the selected rate type
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save rate');
      }
      
      const data = await response.json();
      
      // Update the rates state
      if (editingRateId) {
        setRates(rates.map(rate => 
          rate.id === editingRateId ? { ...data, coach_id: selectedCoach } : rate
        ));
        setSuccessMessage('Rate updated successfully');
      } else {
        setRates([...rates, { ...data, coach_id: selectedCoach }]);
        setSuccessMessage('Rate added successfully');
      }
      
      // Reset form
      setNewRate({ rate_name: '', hourly_rate: '', rate_type: 'lead' });
      setEditingRateId(null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save rate');
    } finally {
      setLoading(false);
    }
  };
  
  // Handle opening delete confirmation dialog
  const handleOpenDeleteConfirm = (rate: CoachingRate) => {
    setRateToDelete(rate);
    setDeleteConfirmOpen(true);
  };
  
  // Handle closing delete confirmation dialog
  const handleCloseDeleteConfirm = () => {
    setDeleteConfirmOpen(false);
    setRateToDelete(null);
  };
  
  // Handle delete rate
  const handleDeleteRate = async () => {
    if (!rateToDelete) return;
    
    try {
      setLoading(true);
      
      const response = await fetch(`/api/invoices/rates/${rateToDelete.id}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete rate');
      }
      
      // Remove the deleted rate from state
      setRates(rates.filter(rate => rate.id !== rateToDelete.id));
      setSuccessMessage('Rate deleted successfully');
      
      // Close the confirmation dialog
      handleCloseDeleteConfirm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete rate');
    } finally {
      setLoading(false);
    }
  };
  
  // Set up edit mode for a rate
  const handleEditRate = (rate: CoachingRate) => {
    setNewRate({
      rate_name: rate.rate_name,
      hourly_rate: rate.hourly_rate.toString(),
      rate_type: rate.rate_type || 'other' // Use the existing rate_type or default to 'other'
    });
    setEditingRateId(rate.id);
    
    // Ensure the correct coach is selected when editing as admin
    if (isAdmin) {
      setSelectedCoach(rate.coach_id);
    }
  };
  
  // Cancel editing
  const handleCancelEdit = () => {
    setNewRate({ rate_name: '', hourly_rate: '', rate_type: 'lead' });
    setEditingRateId(null);
  };
  
  // Get the selected coach name
  const getSelectedCoachName = () => {
    const coach = coaches.find(c => c.id === selectedCoach);
    return coach ? coach.name : 'No coach selected';
  };

  // Get rate type display info
  const getRateTypeInfo = (rateType: string) => {
    const type = RATE_TYPES.find(t => t.value === rateType) || RATE_TYPES[3]; // Default to 'other'
    return type;
  };
  
  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Manage Coaching Rates</h1>
        <button
          onClick={onBack}
          className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50 transition-colors"
        >
          Back to Invoices
        </button>
      </div>
      
      {/* Success message */}
      {successMessage && (
        <div className="mb-4 p-3 bg-green-100 text-green-700 rounded flex justify-between items-center">
          <span>{successMessage}</span>
          <button 
            onClick={() => setSuccessMessage(null)}
            className="text-green-700 hover:text-green-900"
          >
            &times;
          </button>
        </div>
      )}
      
      {/* Error message */}
      {error && (
        <div className="mb-4 p-3 bg-red-100 text-red-700 rounded flex justify-between items-center">
          <span>{error}</span>
          <button 
            onClick={() => setError(null)}
            className="text-red-700 hover:text-red-900"
          >
            &times;
          </button>
        </div>
      )}
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {/* Coach selection (admin only) */}
        {isAdmin && (
          <div className="bg-white p-6 rounded-lg shadow-sm">
            <h2 className="text-lg font-semibold mb-4">Select Coach</h2>
            
            {loading && coaches.length === 0 ? (
              <div className="flex justify-center py-4">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
              </div>
            ) : (
              <select
                value={selectedCoach || ''}
                onChange={(e) => {
                  setSelectedCoach(Number(e.target.value) || null);
                  setNewRate({ rate_name: '', hourly_rate: '', rate_type: 'lead' });
                  setEditingRateId(null);
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded"
              >
                <option value="">Select a coach</option>
                {coaches.map(coach => (
                  <option key={coach.id} value={coach.id}>
                    {coach.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}
        
        {/* Add/Edit Rate Form */}
        <div className="bg-white p-6 rounded-lg shadow-sm">
          <h2 className="text-lg font-semibold mb-4">
            {editingRateId ? 'Edit Rate' : 'Add New Rate'}
          </h2>
          
          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <label htmlFor="rate_name" className="block text-sm font-medium text-gray-700 mb-1">
                Rate Name
              </label>
              <input
                type="text"
                id="rate_name"
                value={newRate.rate_name}
                onChange={(e) => setNewRate({ ...newRate, rate_name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded"
                placeholder="e.g. Lead Coach, Assistant Coach, Admin Work"
                disabled={loading}
              />
              <p className="mt-1 text-sm text-gray-500">
                Use descriptive names like "Lead Coach", "Group Coaching", etc.
              </p>
            </div>
            
            {/* Rate Type Dropdown */}
            <div className="mb-4">
              <label htmlFor="rate_type" className="block text-sm font-medium text-gray-700 mb-1">
                Rate Type
              </label>
              <select
                id="rate_type"
                value={newRate.rate_type}
                onChange={(e) => setNewRate({ ...newRate, rate_type: e.target.value as RateType })}
                className="w-full px-3 py-2 border border-gray-300 rounded"
                disabled={loading}
              >
                {RATE_TYPES.map(type => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-sm text-gray-500">
                Determines how this rate is applied during invoice generation
              </p>
            </div>
            
            <div className="mb-4">
              <label htmlFor="hourly_rate" className="block text-sm font-medium text-gray-700 mb-1">
                Hourly Rate (£)
              </label>
              <input
                type="number"
                id="hourly_rate"
                value={newRate.hourly_rate}
                onChange={(e) => setNewRate({ ...newRate, hourly_rate: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded"
                step="0.01"
                min="0"
                placeholder="e.g. 25.50"
                disabled={loading}
              />
            </div>
            
            <div className="flex space-x-2">
              <button
                type="submit"
                disabled={loading || !selectedCoach}
                className={`px-4 py-2 rounded text-white ${
                  loading || !selectedCoach
                    ? 'bg-blue-300 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-700'
                } transition-colors`}
              >
                {loading ? 'Saving...' : editingRateId ? 'Update Rate' : 'Add Rate'}
              </button>
              
              {editingRateId && (
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50 transition-colors"
                  disabled={loading}
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
      
      {/* Rates Table */}
      <div className="bg-white p-6 rounded-lg shadow-sm">
        <h2 className="text-lg font-semibold mb-4">
          {isAdmin 
            ? selectedCoach ? `Coaching Rates for ${getSelectedCoachName()}` : 'Select a coach to view rates'
            : 'Your Coaching Rates'
          }
        </h2>
        
        {!selectedCoach && isAdmin ? (
          <div className="text-center py-4 text-gray-500">
            Please select a coach to view their rates.
          </div>
        ) : loading && !editingRateId ? (
          <div className="flex justify-center py-4">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
          </div>
        ) : rates.length === 0 ? (
          <div className="text-center py-4 text-gray-500">
            No rates defined yet. Add your first rate above.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Rate Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Hourly Rate
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {rates.map(rate => {
                  // Get display info for this rate type
                  const rateTypeInfo = getRateTypeInfo(rate.rate_type || 'other');
                  
                  return (
                    <tr key={rate.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {rate.rate_name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        <span className={`px-2 py-1 text-xs rounded-full ${rateTypeInfo.color}`}>
                          {rateTypeInfo.label}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        £{rate.hourly_rate.toFixed(2)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex space-x-2">
                          <button
                            onClick={() => handleEditRate(rate)}
                            className="text-blue-600 hover:text-blue-900"
                            disabled={loading}
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleOpenDeleteConfirm(rate)}
                            className="text-red-600 hover:text-red-900"
                            disabled={loading}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      
      {/* Delete confirmation dialog */}
      {deleteConfirmOpen && rateToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Confirm Delete</h3>
            <p className="mb-4">
              Are you sure you want to delete the rate "{rateToDelete.rate_name}" (£{rateToDelete.hourly_rate.toFixed(2)}/hour)?
            </p>
            <p className="mb-4 text-amber-700">
              This may affect future invoice generation if this rate is used for any sessions.
            </p>
            
            <div className="flex justify-end space-x-2">
              <button
                onClick={handleCloseDeleteConfirm}
                className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50 transition-colors"
                disabled={loading}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteRate}
                className={`px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors ${
                  loading ? 'opacity-70 cursor-not-allowed' : ''
                }`}
                disabled={loading}
              >
                {loading ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CoachingRates;