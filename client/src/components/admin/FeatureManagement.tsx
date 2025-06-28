import React, { useState, useEffect } from 'react';
import { Settings, Save, ToggleLeft, ToggleRight, Zap } from 'lucide-react';

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
    <div className="space-y-4 lg:space-y-6">
      {/* Header - Mobile optimized */}
      <div className="p-4 lg:p-6 bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg">
        <h2 className="text-lg lg:text-xl font-semibold flex items-center mb-2">
          <Zap className="h-5 w-5 lg:h-6 lg:w-6 mr-2 lg:mr-3 text-purple-600 flex-shrink-0" />
          Feature Management
        </h2>
        <p className="text-sm lg:text-base text-gray-700">
          Configure features for <span className="font-medium">{selectedClub.name}</span>
        </p>
      </div>
      
      {isLoadingFeatures ? (
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-purple-600"></div>
        </div>
      ) : (
        <>
          {/* Features List - Mobile optimized */}
          <div className="space-y-3 lg:space-y-4">
            {Array.isArray(features) && features.length > 0 ? (
              features.map(feature => (
                <div 
                  key={feature.name} 
                  className="bg-white rounded-lg border shadow-sm p-4 lg:p-6 hover:shadow-md transition-shadow"
                >
                  {/* Mobile: Stack vertically, Desktop: Side by side */}
                  <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                    {/* Feature Info */}
                    <div className="flex items-start gap-3 lg:gap-4 flex-1 min-w-0">
                      <div className="text-2xl lg:text-3xl flex-shrink-0 mt-1">
                        {getFeatureIcon(feature.icon)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="font-medium text-gray-900 text-base lg:text-lg mb-1 lg:mb-2">
                          {feature.display_name}
                        </h4>
                        <p className="text-sm lg:text-base text-gray-600 leading-relaxed">
                          {feature.description}
                        </p>
                      </div>
                    </div>
                    
                    {/* Toggle Controls - Mobile optimized */}
                    <div className="flex items-center justify-between lg:justify-end gap-4 lg:gap-3 pt-3 lg:pt-0 border-t lg:border-t-0 lg:flex-shrink-0">
                      {/* Status Badge */}
                      <div className="flex items-center gap-2">
                        <span className={`text-sm lg:text-base font-medium ${
                          feature.is_enabled ? 'text-green-600' : 'text-gray-500'
                        }`}>
                          {feature.is_enabled ? 'Enabled' : 'Disabled'}
                        </span>
                        {feature.is_enabled ? (
                          <ToggleRight className="h-5 w-5 text-green-600 lg:hidden" />
                        ) : (
                          <ToggleLeft className="h-5 w-5 text-gray-400 lg:hidden" />
                        )}
                      </div>
                      
                      {/* Toggle Switch - Larger for mobile */}
                      <button
                        type="button"
                        onClick={() => handleToggleFeature(feature.name)}
                        className={`relative inline-flex h-7 w-12 lg:h-6 lg:w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 touch-manipulation ${
                          feature.is_enabled ? 'bg-purple-600' : 'bg-gray-300'
                        }`}
                      >
                        <span className="sr-only">
                          {feature.is_enabled ? 'Disable' : 'Enable'} {feature.display_name}
                        </span>
                        <span
                          className={`${
                            feature.is_enabled ? 'translate-x-6 lg:translate-x-6' : 'translate-x-1'
                          } inline-block h-5 w-5 lg:h-4 lg:w-4 transform rounded-full bg-white transition-transform shadow-lg`}
                        />
                      </button>
                      
                      {/* Desktop Icons */}
                      <div className="hidden lg:block">
                        {feature.is_enabled ? (
                          <ToggleRight className="h-5 w-5 text-purple-600" />
                        ) : (
                          <ToggleLeft className="h-5 w-5 text-gray-400" />
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-12 text-gray-500 bg-white rounded-lg border">
                <Settings className="h-16 w-16 lg:h-20 lg:w-20 mx-auto text-gray-300 mb-4" />
                <h3 className="text-lg lg:text-xl font-medium mb-2">No Features Available</h3>
                <p className="text-sm lg:text-base text-gray-400">
                  Features may not be set up for this club yet.
                </p>
              </div>
            )}
          </div>
          
          {/* Save Button - Mobile optimized */}
          {features.length > 0 && (
            <div className="bg-white rounded-lg border p-4 lg:p-6">
              <div className="flex flex-col sm:flex-row sm:justify-end gap-3">
                <button 
                  type="button"
                  className={`w-full sm:w-auto px-6 py-3 lg:py-2 rounded-lg text-white font-medium flex items-center justify-center touch-manipulation transition-colors ${
                    isUpdatingFeatures 
                      ? 'bg-purple-400 cursor-not-allowed' 
                      : 'bg-purple-600 hover:bg-purple-700 focus:ring-2 focus:ring-purple-500 focus:ring-offset-2'
                  }`}
                  onClick={handleSaveFeatures}
                  disabled={isUpdatingFeatures}
                >
                  {isUpdatingFeatures ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white mr-2"></div>
                      Saving Changes...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Save Changes
                    </>
                  )}
                </button>
              </div>
              
              {/* Save hint */}
              <p className="text-xs lg:text-sm text-gray-500 mt-3 text-center sm:text-right">
                Changes will take effect immediately after saving
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default FeatureManagement;