// client/src/components/registers/Registers.tsx

import React, { useState } from 'react';
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

const Registers: React.FC = () => {
  const [currentView, setCurrentView] = useState<RegisterView>(RegisterView.LIST);
  const [selectedRegisterId, setSelectedRegisterId] = useState<string | null>(null);
  
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
  
  // Render the appropriate view
  const renderView = () => {
    switch (currentView) {
      case RegisterView.LIST:
        return <RegisterList onNavigate={navigateToDetail} onCreateNew={navigateToCreate} onViewStats={navigateToStats} />;
      
      case RegisterView.DETAIL:
        return selectedRegisterId ? (
          <RegisterDetail 
            registerId={selectedRegisterId}
            onNavigate={navigateToList}
            onEdit={() => navigateToEdit(selectedRegisterId)}
          />
        ) : <>{navigateToList()}</>; // Use fragment to wrap the function call to ensure JSX element is returned
      
      case RegisterView.EDIT:
        return selectedRegisterId ? (
          <RegisterEdit 
            registerId={selectedRegisterId}
            onNavigate={navigateToList}
            onSaveSuccess={() => navigateToDetail(selectedRegisterId)}
          />
        ) : <>{navigateToList()}</>; // Use fragment to wrap the function call
      
      case RegisterView.CREATE:
        return (
          <CreateRegister 
            onNavigate={navigateToList}
            onCreateSuccess={(newRegisterId) => navigateToDetail(newRegisterId)}
          />
        );
      
      case RegisterView.STATS:
        return <AttendanceStats onNavigate={navigateToList} />;
      
      default:
        return <>{navigateToList()}</>; // Use fragment to wrap the function call
    }
  };
  
  return (
    <div className="container mx-auto px-4 py-6">
      {renderView()}
    </div>
  );
};

export default Registers;