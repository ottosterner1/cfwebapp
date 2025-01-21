// src/entry/navigation.tsx
import React from 'react'
import { createRoot } from 'react-dom/client'
import NavigationBar from '../components/layout/NavigationBar'
import '../index.css'

const NavApp = () => {
  const [currentUser, setCurrentUser] = React.useState<any>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    const fetchCurrentUser = async () => {
      try {
        const response = await fetch('/api/current-user', {
          credentials: 'include', 
          headers: {
            'Accept': 'application/json',
            'X-Requested-With': 'XMLHttpRequest'
          }
        });
        if (response.ok) {
          const userData = await response.json();
          setCurrentUser(userData);
        }
      } catch (error) {
        console.error('Error fetching user data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchCurrentUser();
  }, []);

  if (isLoading || !currentUser) return null;

  return <NavigationBar currentUser={currentUser} />;
};

const navRoot = document.getElementById('nav-root')
if (!navRoot) throw new Error('Failed to find the nav-root element')

const root = createRoot(navRoot)

root.render(
  <React.StrictMode>
    <NavApp />
  </React.StrictMode>,
)