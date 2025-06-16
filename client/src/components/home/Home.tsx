import React, { useState, useEffect } from 'react';
import { 
  ChartLine, 
  Users, 
  Award, 
  ClipboardCheck, 
  Receipt, 
  MessageSquareText 
} from 'lucide-react';
import { HomeUser, TennisClub } from '../../types/home';

interface FeatureCardProps {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  gradientFrom: string;
  gradientTo: string;
}

interface HomeProps {
  currentUser: HomeUser;
  tennisClub: TennisClub;
}

const FeatureCard: React.FC<FeatureCardProps> = ({
  href,
  icon,
  title,
  description,
  gradientFrom,
  gradientTo
}) => (
  <a
    href={href}
    className="block p-8 bg-white rounded-xl shadow-md hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 group"
  >
    <div className="text-center">
      <div className={`w-16 h-16 mx-auto mb-4 bg-gradient-to-br ${gradientFrom} ${gradientTo} rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300`}>
        {icon}
      </div>
      <h2 className="text-xl font-bold mb-3 text-gray-800">{title}</h2>
      <p className="text-gray-600">{description}</p>
    </div>
  </a>
);

const Home: React.FC<HomeProps> = ({ currentUser, tennisClub }) => {
  const [logoError, setLogoError] = useState(false);
  const [logoLoading, setLogoLoading] = useState(true);
  const [currentLogoUrl, setCurrentLogoUrl] = useState(tennisClub.logo_url);

  // Debug logging to understand the data structure
  useEffect(() => {
    console.log('Home component props:', { currentUser, tennisClub });
    console.log('Tennis club features:', tennisClub.features);
  }, [currentUser, tennisClub]);

  const handleImageError = async () => {
    try {
      const response = await fetch(`/api/clubs/${currentUser.tennis_club_id}/logo-url`);
      if (response.ok) {
        const data = await response.json();
        if (data.url) {
          setCurrentLogoUrl(data.url);
          setLogoError(false);
        }
      }
    } catch (error) {
      console.error('Error refreshing logo URL:', error);
      setLogoError(true);
    }
  };

  // Refresh URL periodically before it expires
  useEffect(() => {
    if (!currentLogoUrl) return;

    const interval = setInterval(async () => {
      await handleImageError();
    }, 3000000); // Refresh every 50 minutes

    return () => clearInterval(interval);
  }, [currentUser.tennis_club_id, currentLogoUrl]);

  const isAdmin = currentUser.is_admin || currentUser.is_super_admin;

  // Safely access features with fallback
  const features = tennisClub.features || {};
  
  // Helper function to safely check if a feature is enabled
  const hasFeature = (featureName: string): boolean => {
    return Boolean(features[featureName as keyof typeof features]);
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Logo and Header Section */}
      <div className="bg-gradient-to-b from-sky-100 to-white pt-8 pb-16">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex flex-col items-center">
            {currentLogoUrl && !logoError && (
              <div className="relative h-28 mb-4">
                {/* Loading placeholder */}
                {logoLoading && (
                  <div className="absolute inset-0 bg-gray-100 animate-pulse rounded-xl" />
                )}
                <img
                  src={currentLogoUrl}
                  alt={tennisClub.name}
                  className="h-28 w-auto rounded-xl shadow-lg"
                  onLoad={() => setLogoLoading(false)}
                  onError={() => {
                    setLogoLoading(false);
                    handleImageError();
                  }}
                />
              </div>
            )}
            <h1 className="text-3xl font-semibold text-gray-800 mb-2">
              Welcome to {tennisClub.name}
            </h1>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 -mt-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Coaching Reports */}
          {hasFeature('coaching_reports') && (
            <FeatureCard
              href="/dashboard"
              icon={<ChartLine className="w-8 h-8 text-white" />}
              title="Coaching Reports"
              description="View and manage player progress reports"
              gradientFrom="from-sky-400"
              gradientTo="to-sky-600"
            />
          )}

          {/* Manage Programme */}
          {isAdmin && currentUser.tennis_club_id && hasFeature('manage_programme') && (
            <FeatureCard
              href={`/club-management/${currentUser.tennis_club_id}/players`}
              icon={<Users className="w-8 h-8 text-white" />}
              title="Manage Programme"
              description="Assign players to coaches and groups"
              gradientFrom="from-green-400"
              gradientTo="to-green-600"
            />
          )}

          {/* LTA Accreditation */}
          {currentUser.tennis_club_id && hasFeature('lta_accreditation') && (
            <FeatureCard
              href="/lta-accreditation"
              icon={<Award className="w-8 h-8 text-white" />}
              title="LTA Accreditation"
              description="Track coach qualifications and certifications"
              gradientFrom="from-purple-400"
              gradientTo="to-purple-600"
            />
          )}

          {/* Registers */}
          {hasFeature('registers') && (
            <FeatureCard
              href="/registers"
              icon={<ClipboardCheck className="w-8 h-8 text-white" />}
              title="Registers"
              description="Track player attendance for groups"
              gradientFrom="from-orange-400"
              gradientTo="to-orange-600"
            />
          )}

          {/* Invoices */}
          {hasFeature('invoices') && (
            <FeatureCard
              href="/invoices"
              icon={<Receipt className="w-8 h-8 text-white" />}
              title="Invoices"
              description="Generate and manage coaching invoices"
              gradientFrom="from-indigo-400"
              gradientTo="to-indigo-600"
            />
          )}

          {/* Surveys */}
          {isAdmin && hasFeature('surveys_basic') && (
            <FeatureCard
              href="/survey-dashboard"
              icon={<MessageSquareText className="w-8 h-8 text-white" />}
              title="Surveys"
              description="Create and manage feedback forms"
              gradientFrom="from-teal-400"
              gradientTo="to-teal-600"
            />
          )}
        </div>

        {/* Debug info - remove this in production */}
        {process.env.NODE_ENV === 'development' && (
          <div className="mt-8 p-4 bg-gray-100 rounded-lg">
            <h3 className="font-bold mb-2">Debug Info:</h3>
            <pre className="text-sm text-gray-600">
              {JSON.stringify({ 
                features, 
                isAdmin, 
                tennis_club_id: currentUser.tennis_club_id 
              }, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};

export default Home;