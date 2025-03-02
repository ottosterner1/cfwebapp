import { useEffect, useState } from 'react';
import Dashboard from './components/dashboard/Dashboard';
import { User } from './types/user';

// Define a type for the debug info
interface DebugInfo {
  status: string;
  error: string | null;
}

const App = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [debugInfo, setDebugInfo] = useState<DebugInfo>({ status: 'Loading...', error: null });

  useEffect(() => {
    // Debug log to verify component mounting
    console.log('App component mounted');
    
    const fetchCurrentUser = async () => {
      try {
        // Use the full URL to ensure it goes to the backend
        const url = `${window.location.protocol}//${window.location.host}/api/current-user`;
        console.log('Fetching from:', url);
        
        const response = await fetch(url, {
          credentials: 'include', // Important for passing cookies
          headers: {
            'Accept': 'application/json'
          }
        });
        
        console.log('Response status:', response.status);
        
        if (response.ok) {
          const text = await response.text();
          console.log('Raw response:', text);
          
          try {
            const userData = JSON.parse(text);
            setCurrentUser(userData);
            setDebugInfo({ status: 'Logged in', error: null });
          } catch (parseError: any) {
            console.error('JSON parse error:', parseError);
            setDebugInfo({ 
              status: 'JSON Error', 
              error: `Failed to parse: ${text.substring(0, 100)}...` 
            });
          }
        } else {
          setDebugInfo({ 
            status: `API Error (${response.status})`, 
            error: response.statusText 
          });
          
          // For redirects or unauthorized, try to load the login page
          if (response.status === 401 || response.status === 302) {
            window.location.href = '/login';
          }
        }
      } catch (error: any) {
        console.error('Error fetching user data:', error);
        setDebugInfo({ status: 'Network Error', error: error.toString() });
      } finally {
        setIsLoading(false);
      }
    };

    fetchCurrentUser();
  }, []);

  // Always show debug info in development
  const renderDebugInfo = () => (
    <div className="fixed bottom-0 right-0 bg-gray-100 p-4 m-4 rounded shadow-lg max-w-md z-50 text-sm">
      <h3 className="font-bold">Debug Info</h3>
      <div>Status: {debugInfo.status}</div>
      {debugInfo.error && <div className="text-red-500">{debugInfo.error}</div>}
      <div>URL: {window.location.href}</div>
    </div>
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
        {renderDebugInfo()}
      </div>
    );
  }

  // Show login button if not logged in
  if (!currentUser) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <p className="mb-4">Please log in to continue</p>
        <a 
          href="/login" 
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Login
        </a>
        {renderDebugInfo()}
      </div>
    );
  }

  // Simply render the Dashboard with debug info
  return (
    <div className="w-full">
      <Dashboard />
      {renderDebugInfo()}
    </div>
  );
};

export default App;