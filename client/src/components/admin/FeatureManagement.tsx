import React, { useState, useEffect } from 'react';
import { Settings, Save, ToggleLeft, ToggleRight } from 'lucide-react';

interface Feature {
  name: string;
  display_name: string;
  description: string;
  icon: string;
  is_enabled: boolean;
}

interface TennisClub {
  id: number;
  name: string;
  subdomain: string;
  organisation?: {
    id: number;
    name: string;
    slug: string;
  };
  user_count: number;
  group_count: number;
}

interface Notification {
  type: 'success' | 'error' | 'warning';
  message: string;
}

interface FeatureManagementProps {
  selectedClub: TennisClub;
  onNotification: (notification: Notification) => void;
}

const FeatureManagement: React.FC<FeatureManagementProps> = ({ selectedClub, onNotification }) => {
  const [features, setFeatures] = useState<Feature[]>([]);
  const [isLoadingFeatures, setIsLoadingFeatures] = useState(false);
  const [isUpdatingFeatures, setIsUpdatingFeatures] = useState(false);

  // Function to fetch features for the selected club
  const fetchClubFeatures = async () => {
    setIsLoadingFeatures(true);
    
    try {
      const response = await fetch(`/clubs/api/super-admin/clubs/${selectedClub.id}/features`, {
        credentials: 'include',
        headers: {
          'Accept': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        
        // Handle the correct response format
        if (data && Array.isArray(data.features)) {
          setFeatures(data.features);
        } else if (Array.isArray(data)) {
          // Fallback in case backend returns direct array
          setFeatures(data);
        } else {
          console.warn('Unexpected response format for features:', data);
          setFeatures([]);
        }
      } else {
        console.error('Failed to fetch club features:', response.status);
        setFeatures([]);
        
        if (response.status === 403) {
          onNotification({
            type: 'error',
            message: 'Access denied. Super admin privileges required.'
          });
        } else if (response.status === 404) {
          onNotification({
            type: 'error',
            message: 'Club not found or features not configured.'
          });
        } else {
          onNotification({
            type: 'error',
            message: 'Failed to load club features. Please try again.'
          });
        }
      }
    } catch (error) {
      console.error('Error fetching club features:', error);
      setFeatures([]);
      onNotification({
        type: 'error',
        message: 'Network error while loading features.'
      });
    } finally {
      setIsLoadingFeatures(false);
    }
  };

  // Function to handle feature toggle
  const handleToggleFeature = (featureName: string) => {
    setFeatures(prevFeatures => {
      if (!Array.isArray(prevFeatures)) {
        console.warn('Features is not an array, resetting to empty array');
        return [];
      }
      
      return prevFeatures.map(feature => 
        feature.name === featureName 
          ? { ...feature, is_enabled: !feature.is_enabled } 
          : feature
      );
    });
  };

  // Function to save feature settings
  const handleSaveFeatures = async () => {
    setIsUpdatingFeatures(true);
    
    try {
      const response = await fetch(`/clubs/api/super-admin/clubs/${selectedClub.id}/features`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: JSON.stringify(features), // Send the features array directly
        credentials: 'include'
      });
      
      if (response.ok) {
        const data = await response.json();
        onNotification({
          type: 'success',
          message: data.message || 'Features updated successfully'
        });
        
        // Refresh features to get the latest state
        fetchClubFeatures();
      } else {
        let errorMessage = 'Failed to update features';
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch (e) {
          console.error('Error parsing response:', e);
        }
        onNotification({
          type: 'error',
          message: errorMessage
        });
      }
    } catch (error) {
      console.error('Error updating features:', error);
      onNotification({
        type: 'error',
        message: 'Network error while updating features'
      });
    } finally {
      setIsUpdatingFeatures(false);
    }
  };

  // Get feature icon
  const getFeatureIcon = (iconString: string) => {
    // Default to gear icon if no specific icon
    return iconString || '⚙️';
  };

  // Fetch features when selected club changes
  useEffect(() => {
    if (selectedClub) {
      fetchClubFeatures();
    }
  }, [selectedClub]);

  return (
    <div className="border rounded-lg p-6 bg-gradient-to-r from-purple-50 to-pink-50">
      <h2 className="text-xl font-semibold mb-4 flex items-center">
        <Settings className="h-6 w-6 mr-3 text-purple-600" />
        Feature Management for {selectedClub.name}
      </h2>
      
      {isLoadingFeatures ? (
        <div className="flex justify-center p-4">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-purple-600"></div>
        </div>
      ) : (
        <>
          <div className="space-y-3 mb-6">
            {Array.isArray(features) && features.length > 0 ? (
              features.map(feature => (
                <div 
                  key={feature.name} 
                  className="flex items-center justify-between p-4 bg-white rounded-md border hover:shadow-sm transition-shadow"
                >
                  <div className="flex items-center space-x-3">
                    <div className="text-2xl">{getFeatureIcon(feature.icon)}</div>
                    <div>
                      <h4 className="font-medium text-gray-800">{feature.display_name}</h4>
                      <p className="text-sm text-gray-600">{feature.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3">
                    <span className={`text-sm font-medium ${feature.is_enabled ? 'text-green-600' : 'text-gray-400'}`}>
                      {feature.is_enabled ? 'Enabled' : 'Disabled'}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleToggleFeature(feature.name)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 ${
                        feature.is_enabled ? 'bg-purple-600' : 'bg-gray-200'
                      }`}
                    >
                      <span
                        className={`${
                          feature.is_enabled ? 'translate-x-6' : 'translate-x-1'
                        } inline-block h-4 w-4 transform rounded-full bg-white transition-transform`}
                      />
                    </button>
                    {feature.is_enabled ? (
                      <ToggleRight className="h-5 w-5 text-purple-600" />
                    ) : (
                      <ToggleLeft className="h-5 w-5 text-gray-400" />
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-gray-500 bg-white rounded-md border">
                <Settings className="h-12 w-12 mx-auto text-gray-300 mb-4" />
                <p>No features available to configure</p>
                <p className="text-sm text-gray-400 mt-1">Features may not be set up for this club yet.</p>
              </div>
            )}
          </div>
          
          {features.length > 0 && (
            <div className="flex justify-end border-t pt-4">
              <button 
                type="button"
                className={`px-6 py-2 rounded-md text-white ${
                  isUpdatingFeatures ? 'bg-purple-400' : 'bg-purple-600 hover:bg-purple-700'
                } flex items-center`}
                onClick={handleSaveFeatures}
                disabled={isUpdatingFeatures}
              >
                <Save className="h-4 w-4 mr-2" />
                {isUpdatingFeatures ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default FeatureManagement;