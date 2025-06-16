import React, { useState, useEffect } from 'react';
import Home from './Home';
import { UserResponse, HomeUser, TennisClub } from '../../types/home';

const HomeContainer: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<HomeUser | null>(null);
  const [tennisClub, setTennisClub] = useState<TennisClub | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        setLoading(true);
        setError(null);

        console.log('Fetching user data from /api/current-user...');
        const userResponse = await fetch('/api/current-user');
        
        if (!userResponse.ok) {
          throw new Error(`Failed to fetch user data: ${userResponse.status} ${userResponse.statusText}`);
        }

        const userData: UserResponse = await userResponse.json();
        console.log('Raw API response:', userData);
        
        // Validate required data
        if (!userData.tennis_club) {
          throw new Error('Tennis club data is missing from API response');
        }

        // Extract user and tennis club data
        const user: HomeUser = {
          id: userData.id,
          name: userData.name,
          email: userData.email,
          is_admin: userData.is_admin,
          is_super_admin: userData.is_super_admin,
          tennis_club_id: userData.tennis_club_id,
        };

        // Ensure features object exists, even if empty
        const features = userData.tennis_club.features || {
          coaching_reports: false,
          manage_programme: false,
          lta_accreditation: false,
          registers: false,
          invoices: false,
          surveys_basic: false,
        };

        const club: TennisClub = {
          id: userData.tennis_club.id,
          name: userData.tennis_club.name,
          logo_url: userData.tennis_club.logo_presigned_url || userData.tennis_club.logo_url,
          features: features,
        };

        console.log('Processed user data:', { user, club });

        setCurrentUser(user);
        setTennisClub(club);

      } catch (error) {
        console.error('Error fetching user data:', error);
        setError(error instanceof Error ? error.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchUserData();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-6">
          <div className="text-red-600 mb-4">
            <svg className="w-12 h-12 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Unable to Load</h2>
          <p className="text-red-600 font-medium mb-4">{error}</p>
          <div className="space-y-2">
            <button 
              onClick={() => window.location.reload()} 
              className="w-full px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
            >
              Retry
            </button>
            <p className="text-sm text-gray-500">
              If this problem persists, please contact support.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!currentUser || !tennisClub) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-gray-400 mb-4">
            <svg className="w-12 h-12 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2M4 13h2m8-8v2m0 4v2" />
            </svg>
          </div>
          <p className="text-gray-600">No data available</p>
        </div>
      </div>
    );
  }

  return <Home currentUser={currentUser} tennisClub={tennisClub} />;
};

export default HomeContainer;