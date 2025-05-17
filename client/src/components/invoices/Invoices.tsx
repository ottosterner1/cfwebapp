// client/src/components/invoices/Invoices.tsx

import React, { useState, useEffect } from 'react';
import InvoiceList from './InvoiceList';
import InvoiceDetail from './InvoiceDetail';
import InvoiceGenerator from './InvoiceGenerator';
import InvoiceEditor from './InvoiceEditor';


export enum InvoiceView {
  LIST = 'list',
  DETAIL = 'detail',
  GENERATE = 'generate',
  EDIT = 'edit'
}

interface UserInfo {
  is_admin: boolean;
  coach_id?: number;
}

const Invoices: React.FC = () => {
  const [currentView, setCurrentView] = useState<InvoiceView>(InvoiceView.LIST);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<number | null>(null);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  
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
  
  // Render the appropriate view
  const renderView = () => {
    switch (currentView) {
      case InvoiceView.LIST:
        return (
          <InvoiceList 
            onViewInvoice={navigateToDetail}
            onEditInvoice={navigateToEdit}
            onGenerateInvoice={navigateToGenerate}
            isAdmin={userInfo?.is_admin || false}
          />
        );
      
      case InvoiceView.DETAIL:
        return selectedInvoiceId ? (
          <InvoiceDetail 
            invoiceId={selectedInvoiceId}
            onBack={navigateToList}
            onEdit={() => navigateToEdit(selectedInvoiceId)}
            isAdmin={userInfo?.is_admin || false}
          />
        ) : <>{navigateToList()}</>;
      
      case InvoiceView.EDIT:
        return selectedInvoiceId ? (
          <InvoiceEditor 
            invoiceId={selectedInvoiceId}
            onBack={navigateToList}
            onSaveSuccess={() => navigateToDetail(selectedInvoiceId)}
          />
        ) : <>{navigateToList()}</>;
      
      case InvoiceView.GENERATE:
        return (
          <InvoiceGenerator 
            onBack={navigateToList}
            onSuccess={(newInvoiceId) => navigateToDetail(newInvoiceId)}
          />
        );
      
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

export default Invoices;