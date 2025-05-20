// client/src/components/invoices/Invoices.tsx

import React, { useState, useEffect } from 'react';
import InvoiceList from './InvoiceList';
import InvoiceDetail from './InvoiceDetail';
import InvoiceGenerator from './InvoiceGenerator';
import InvoiceEditor from './InvoiceEditor';
import CoachingRates from './CoachingRates'; // Import the new component

export enum InvoiceView {
  LIST = 'list',
  DETAIL = 'detail',
  GENERATE = 'generate',
  EDIT = 'edit',
  MANAGE_RATES = 'manage_rates' // Add new view type
}

export type UserRole = 'coach' | 'admin' | 'super_admin';

interface UserInfo {
  id: number;
  is_admin: boolean;
  is_super_admin: boolean;
  coach_id?: number;
  name: string;
  tennis_club_id: number;
}

const Invoices: React.FC = () => {
  const [currentView, setCurrentView] = useState<InvoiceView>(InvoiceView.LIST);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<number | null>(null);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [userInfoLoading, setUserInfoLoading] = useState(true);
  
  // Fetch user info on component mount
  useEffect(() => {
    const fetchUserInfo = async () => {
      try {
        setUserInfoLoading(true);
        const response = await fetch('/api/user/info');
        if (!response.ok) {
          throw new Error(`Failed to fetch user info: ${response.statusText}`);
        }
        
        const data = await response.json();

        setUserInfo(data);
      } catch (err) {
        console.error('Error fetching user info:', err);
      } finally {
        setUserInfoLoading(false);
      }
    };
    
    fetchUserInfo();
  }, []);
  
  // Helper function to determine user role from boolean flags
  const getUserRole = (): UserRole => {
    if (!userInfo) return 'coach'; // Default to coach if no user info
    
    if (userInfo.is_super_admin === true) {
      return 'super_admin';
    } else if (userInfo.is_admin === true) {
      return 'admin';
    } else {
      return 'coach';
    }
  };
  
  // Navigation handlers
  const navigateToList = () => {
    setCurrentView(InvoiceView.LIST);
    setSelectedInvoiceId(null);
    return null;
  };
  
  const navigateToDetail = (invoiceId: number) => {
    setSelectedInvoiceId(invoiceId);
    setCurrentView(InvoiceView.DETAIL);
  };
  
  const navigateToEdit = (invoiceId: number) => {
    setSelectedInvoiceId(invoiceId);
    setCurrentView(InvoiceView.EDIT);
  };
  
  const navigateToGenerate = () => {
    setCurrentView(InvoiceView.GENERATE);
  };
  
  // New navigation handler for coaching rates
  const navigateToRates = () => {
    setCurrentView(InvoiceView.MANAGE_RATES);
  };
  
  // Handler after saving invoice edits
  const handleSaveSuccess = (savedInvoiceId: number) => {
    navigateToDetail(savedInvoiceId);
  };
  
  // Directly get the role here - don't rely on it being computed in the renderView
  const userRole = getUserRole();
  
  // Render the appropriate view
  const renderView = () => {
    switch (currentView) {
      case InvoiceView.LIST:
        return (
          <InvoiceList 
            onViewInvoice={navigateToDetail}
            onEditInvoice={navigateToEdit}
            onGenerateInvoice={navigateToGenerate}
            onManageRates={navigateToRates} // Pass the new handler
            userRole={userRole}
          />
        );
      
      case InvoiceView.DETAIL:
        return selectedInvoiceId ? (
          <InvoiceDetail 
            invoiceId={selectedInvoiceId}
            onBack={navigateToList}
            onEdit={() => navigateToEdit(selectedInvoiceId)}
            userRole={userRole} // Using userRole for InvoiceDetail
          />
        ) : <>{navigateToList()}</>;
      
      case InvoiceView.EDIT:
        return selectedInvoiceId ? (
          <InvoiceEditor 
            invoiceId={selectedInvoiceId}
            onBack={navigateToList}
            onSaveSuccess={() => handleSaveSuccess(selectedInvoiceId)}
          />
        ) : <>{navigateToList()}</>;
      
      case InvoiceView.GENERATE:
        return (
          <InvoiceGenerator 
            onBack={navigateToList}
            onSuccess={(newInvoiceId) => navigateToDetail(newInvoiceId)}
          />
        );
      
      // Add the new case for managing rates
      case InvoiceView.MANAGE_RATES:
        return (
          <CoachingRates
            onBack={navigateToList}
            userRole={userRole}
          />
        );
      
      default:
        return <>{navigateToList()}</>;
    }
  };
  
  // Show loading state while fetching user info
  if (userInfoLoading) {
    return (
      <div className="container mx-auto px-4 py-6">
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="container mx-auto px-4 py-6">
      {renderView()}
    </div>
  );
};

export default Invoices;