// client/src/components/invoices/InvoiceList.tsx

import React, { useState, useEffect } from 'react';
import { Invoice, InvoiceMonthSummary } from '../../types/invoice';

interface InvoiceListProps {
  onViewInvoice: (invoiceId: number) => void;
  onEditInvoice: (invoiceId: number) => void;
  onGenerateInvoice: () => void;
  userRole: 'coach' | 'admin' | 'super_admin';
}

const InvoiceList: React.FC<InvoiceListProps> = ({ 
  onViewInvoice, 
  onEditInvoice, 
  onGenerateInvoice,
  userRole
}) => {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [monthSummaries, setMonthSummaries] = useState<InvoiceMonthSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [invoiceToDelete, setInvoiceToDelete] = useState<Invoice | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  
  // Compute authorization flags
  const isAdmin = userRole === 'admin' || userRole === 'super_admin';
  const isSuperAdmin = userRole === 'super_admin';
  
  // Fetch invoices
  useEffect(() => {
    const fetchInvoices = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/invoices/list?year=${selectedYear}`);
        
        if (!response.ok) {
          throw new Error('Failed to fetch invoices');
        }
        
        const data = await response.json();
        setInvoices(data);
        setError(null);
      } catch (err) {
        setError('Error loading invoices. Please try again.');
        console.error('Error fetching invoices:', err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchInvoices();
  }, [selectedYear]);
  
  // Fetch month summaries (for potential invoice generation)
  useEffect(() => {
    const fetchMonthSummaries = async () => {
      try {
        const response = await fetch(`/api/invoices/month-summaries?year=${selectedYear}`);
        
        if (!response.ok) {
          throw new Error('Failed to fetch month summaries');
        }
        
        const data = await response.json();
        setMonthSummaries(data);
      } catch (err) {
        console.error('Error fetching month summaries:', err);
      }
    };
    
    fetchMonthSummaries();
  }, [selectedYear]);
  
  // Auto-hide success message after 5 seconds
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => {
        setSuccessMessage(null);
      }, 5000);
      
      return () => clearTimeout(timer);
    }
  }, [successMessage]);
  
  // Filter invoices based on status
  const filteredInvoices = filterStatus === 'all' 
    ? invoices 
    : invoices.filter(invoice => invoice.status === filterStatus);
  
  // Get available years for filter
  const currentYear = new Date().getFullYear();
  const availableYears = Array.from(
    { length: 3 }, 
    (_, i) => currentYear - i
  );
  
  // Get status badge color
  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'draft': return 'bg-gray-100 text-gray-800';
      case 'submitted': return 'bg-blue-100 text-blue-800';
      case 'approved': return 'bg-green-100 text-green-800';
      case 'rejected': return 'bg-red-100 text-red-800';
      case 'paid': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };
  
  // Check if an invoice is editable
  const isInvoiceEditable = (status: string) => {
    // Admin can edit any invoice except paid ones
    if (isAdmin && status !== 'paid') return true;
    
    // Regular users can only edit draft or rejected invoices
    return status === 'draft' || status === 'rejected';
  };
  
  // Check if an invoice is deletable based on user role and invoice status
  const canDeleteInvoice = (invoice: Invoice) => {
    if (invoice.status === 'draft') {
      // Anyone can delete draft invoices
      return true;
    } else if (['submitted', 'approved', 'rejected'].includes(invoice.status)) {
      // Only admins can delete submitted, approved, or rejected invoices
      return isAdmin;
    } else if (invoice.status === 'paid') {
      // Only super admins can delete paid invoices
      return isSuperAdmin;
    }
    return false;
  };
  
  // Handle opening delete confirmation dialog
  const handleOpenDeleteConfirm = (invoice: Invoice) => {
    setInvoiceToDelete(invoice);
    setDeleteConfirmOpen(true);
  };
  
  // Handle closing delete confirmation dialog
  const handleCloseDeleteConfirm = () => {
    setDeleteConfirmOpen(false);
    setInvoiceToDelete(null);
  };
  
  // Handle delete invoice
  const handleDeleteInvoice = async () => {
    if (!invoiceToDelete) return;
    
    try {
      setDeleting(true);
      const response = await fetch(`/api/invoices/${invoiceToDelete.id}/delete`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete invoice');
      }
      
      // Remove deleted invoice from state
      setInvoices(prevInvoices => 
        prevInvoices.filter(invoice => invoice.id !== invoiceToDelete.id)
      );
      
      // Show success message
      setSuccessMessage(`Invoice #${invoiceToDelete.invoice_number} has been deleted.`);
      
      // Close the confirmation dialog
      handleCloseDeleteConfirm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete invoice');
    } finally {
      setDeleting(false);
    }
  };
  
  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Invoices</h1>
        <button
          onClick={onGenerateInvoice}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
        >
          Generate New Invoice
        </button>
      </div>
      
      {/* Filters */}
      <div className="flex gap-4 mb-6">
        <select
          value={selectedYear}
          onChange={(e) => setSelectedYear(Number(e.target.value))}
          className="px-3 py-2 border border-gray-300 rounded"
        >
          {availableYears.map(year => (
            <option key={year} value={year}>{year}</option>
          ))}
        </select>
        
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded"
        >
          <option value="all">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="submitted">Submitted</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="paid">Paid</option>
        </select>
      </div>
      
      {/* Success message */}
      {successMessage && (
        <div className="mb-4 p-3 bg-green-100 text-green-700 rounded flex justify-between items-center">
          <span>{successMessage}</span>
          <button 
            onClick={() => setSuccessMessage(null)}
            className="text-green-700 hover:text-green-900"
          >
            &times;
          </button>
        </div>
      )}
      
      {/* Error message */}
      {error && (
        <div className="mb-4 p-3 bg-red-100 text-red-700 rounded flex justify-between items-center">
          <span>{error}</span>
          <button 
            onClick={() => setError(null)}
            className="text-red-700 hover:text-red-900"
          >
            &times;
          </button>
        </div>
      )}
      
      {/* Loading indicator */}
      {loading ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : (
        <>
          {/* Month summaries (if no invoice exists for a month with registers) */}
          {monthSummaries.length > 0 && (
            <div className="mb-6">
              <h2 className="text-lg font-semibold mb-2">Available Months for Invoice Generation</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {monthSummaries
                  .filter(summary => !summary.has_invoice && summary.total_registers > 0)
                  .map(summary => (
                    <div key={`${summary.year}-${summary.month}`} className="border p-4 rounded shadow-sm hover:shadow-md transition-shadow">
                      <h3 className="font-medium">{summary.month_name} {summary.year}</h3>
                      <p className="text-sm text-gray-600">
                        {summary.total_registers} registers
                      </p>
                      <button 
                        onClick={onGenerateInvoice}
                        className="mt-2 text-sm px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                      >
                        Generate Invoice
                      </button>
                    </div>
                  ))}
              </div>
            </div>
          )}
          
          {/* Invoice list */}
          {filteredInvoices.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No invoices found for the selected filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full bg-white border border-gray-200">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Invoice #
                    </th>
                    {isAdmin && (
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Coach
                      </th>
                    )}
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Period
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Total
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Created
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredInvoices.map(invoice => (
                    <tr key={invoice.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {invoice.invoice_number}
                      </td>
                      {isAdmin && (
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {invoice.coach_name}
                        </td>
                      )}
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {invoice.month_name} {invoice.year}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs rounded-full ${getStatusBadgeColor(invoice.status)}`}>
                          {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        £{invoice.total.toFixed(2)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(invoice.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex space-x-2">
                          <button
                            onClick={() => onViewInvoice(invoice.id)}
                            className="text-blue-600 hover:text-blue-900"
                          >
                            View
                          </button>
                          
                          {isInvoiceEditable(invoice.status) && (
                            <button
                              onClick={() => onEditInvoice(invoice.id)}
                              className={`${
                                isAdmin && invoice.status === 'approved' 
                                  ? 'text-amber-600 hover:text-amber-900' 
                                  : invoice.status === 'rejected' 
                                    ? 'text-red-600 hover:text-red-900' 
                                    : 'text-gray-600 hover:text-gray-900'
                              }`}
                            >
                              {isAdmin && invoice.status === 'approved' 
                                ? 'Edit' 
                                : invoice.status === 'rejected' 
                                  ? 'Edit & Resubmit' 
                                  : 'Edit'
                              }
                            </button>
                          )}
                          
                          {/* Delete button */}
                          {canDeleteInvoice(invoice) && (
                            <button
                              onClick={() => handleOpenDeleteConfirm(invoice)}
                              className="text-red-600 hover:text-red-900"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      
      {/* Delete confirmation dialog */}
      {deleteConfirmOpen && invoiceToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Confirm Delete</h3>
            <p className="mb-4">
              Are you sure you want to delete invoice #{invoiceToDelete.invoice_number} for {invoiceToDelete.month_name} {invoiceToDelete.year}?
            </p>
            
            {invoiceToDelete.status === 'paid' && (
              <div className="p-3 bg-yellow-100 text-yellow-800 rounded mb-4">
                <strong>Warning:</strong> This is a paid invoice. Deleting it will permanently remove the payment record.
              </div>
            )}
            
            <div className="flex justify-end space-x-2">
              <button
                onClick={handleCloseDeleteConfirm}
                className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50 transition-colors"
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteInvoice}
                className={`px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors ${
                  deleting ? 'opacity-70 cursor-not-allowed' : ''
                }`}
                disabled={deleting}
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InvoiceList;