// client/src/components/registers/Registers.tsx

import React, { useState, useEffect } from 'react';
import RegisterList from './RegisterList';
import RegisterDetail from './RegisterDetail';
import RegisterEdit from './RegisterEdit';
import CreateRegister from './CreateRegister';
import AttendanceStats from './AttendanceStats';

export enum RegisterView {
  LIST = 'list',
  DETAIL = 'detail',
  EDIT = 'edit',
  CREATE = 'create',
  STATS = 'stats'
}

interface UserInfo {
  is_admin: boolean;
  coach_id?: number;
}

const Registers: React.FC = () => {
  const [currentView, setCurrentView] = useState<RegisterView>(RegisterView.LIST);
  const [selectedRegisterId, setSelectedRegisterId] = useState<string | null>(null);
  const [, setUserInfo] = useState<UserInfo | null>(null);
  
  // Fetch user info on component mount
  useEffect(() => {
    const fetchUserInfo = async () => {
      try {
        const response = await fetch('/api/user/info');
        if (!response.ok) {
          throw new Error(`Failed to fetch user info: ${response.statusText}`);
        }
        
        const data = await response.json();
        setUserInfo(data);
      } catch (err) {
        console.error('Error fetching user info:', err);
      }
    };
    
    fetchUserInfo();
  }, []);
  
  // Navigation handlers
  const navigateToList = () => {
    setCurrentView(RegisterView.LIST);
    setSelectedRegisterId(null);
    return null; // Explicitly return null to avoid void return
  };
  
  const navigateToDetail = (registerId: string) => {
    setSelectedRegisterId(registerId);
    setCurrentView(RegisterView.DETAIL);
  };
  
  const navigateToEdit = (registerId: string) => {
    setSelectedRegisterId(registerId);
    setCurrentView(RegisterView.EDIT);
  };
  
  const navigateToCreate = () => {
    setCurrentView(RegisterView.CREATE);
  };
  
  const navigateToStats = () => {
    setCurrentView(RegisterView.STATS);
  };
  
  // For navigation within the AttendanceStats component
  const handleStatsNavigate = (path: string) => {
    if (path === '/registers') {
      navigateToList();
    } else if (path.startsWith('/registers/')) {
      const registerId = path.replace('/registers/', '');
      navigateToDetail(registerId);
    }
  };
  
  // Render the appropriate view
  const renderView = () => {
    switch (currentView) {
      case RegisterView.LIST:
        return (
          <RegisterList 
            onNavigate={navigateToDetail} 
            onEdit={navigateToEdit} // Pass direct edit handler
            onCreateNew={navigateToCreate} 
            onViewStats={navigateToStats} 
          />
        );
      
      case RegisterView.DETAIL:
        return selectedRegisterId ? (
          <RegisterDetail 
            registerId={selectedRegisterId}
            onNavigate={navigateToList}
            onEdit={() => navigateToEdit(selectedRegisterId)}
          />
        ) : <>{navigateToList()}</>;
      
      case RegisterView.EDIT:
        return selectedRegisterId ? (
          <RegisterEdit 
            registerId={selectedRegisterId}
            onNavigate={navigateToList}
            onSaveSuccess={() => navigateToDetail(selectedRegisterId)}
          />
        ) : <>{navigateToList()}</>;
      
      case RegisterView.CREATE:
        return (
          <CreateRegister 
            onNavigate={navigateToList}
            onCreateSuccess={(newRegisterId) => navigateToDetail(newRegisterId)}
          />
        );
      
      case RegisterView.STATS:
        return <AttendanceStats onNavigate={handleStatsNavigate} />;
      
      default:
        return <>{navigateToList()}</>;
    }
  };
  
  return (
    <div className="container mx-auto px-4 py-6">
      {renderView()}
    </div>
  );
};

export default Registers;