// client/src/components/invoices/InvoiceDetail.tsx

import React, { useState, useEffect } from 'react';
import { InvoiceDetail, InvoiceStatus } from '../../types/invoice';

interface InvoiceDetailProps {
  invoiceId: number;
  onBack: () => void;
  onEdit: () => void;
  isAdmin: boolean;
}

const InvoiceDetailView: React.FC<InvoiceDetailProps> = ({ 
  invoiceId, 
  onBack, 
  onEdit,
  isAdmin
}) => {
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [showRejectionForm, setShowRejectionForm] = useState(false);
  
  // Fetch invoice details
  useEffect(() => {
    const fetchInvoiceDetails = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/invoices/${invoiceId}`);
        
        if (!response.ok) {
          throw new Error('Failed to fetch invoice details');
        }
        
        const data = await response.json();
        setInvoice(data);
        setError(null);
      } catch (err) {
        setError('Error loading invoice details. Please try again.');
        console.error('Error fetching invoice details:', err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchInvoiceDetails();
  }, [invoiceId]);
  
  // Handle invoice submission
  const handleSubmit = async () => {
    if (!invoice || invoice.status !== 'draft') return;
    
    try {
      setSubmitting(true);
      const response = await fetch(`/api/invoices/${invoiceId}/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to submit invoice');
      }
      
      const data = await response.json();
      setInvoice({
        ...invoice,
        status: data.status as InvoiceStatus
      });
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit invoice');
    } finally {
      setSubmitting(false);
    }
  };
  
  // Handle invoice approval
  const handleApprove = async () => {
    if (!invoice || invoice.status !== 'submitted' || !isAdmin) return;
    
    try {
      setApproving(true);
      const response = await fetch(`/api/invoices/${invoiceId}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to approve invoice');
      }
      
      const data = await response.json();
      setInvoice({
        ...invoice,
        status: data.status as InvoiceStatus
      });
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve invoice');
    } finally {
      setApproving(false);
    }
  };
  
  // Handle invoice rejection
  const handleReject = async () => {
    if (!invoice || invoice.status !== 'submitted' || !isAdmin) return;
    
    if (!rejectionReason.trim()) {
      setError('Please provide a reason for rejection');
      return;
    }
    
    try {
      setRejecting(true);
      const response = await fetch(`/api/invoices/${invoiceId}/reject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ reason: rejectionReason })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to reject invoice');
      }
      
      const data = await response.json();
      setInvoice({
        ...invoice,
        status: data.status as InvoiceStatus
      });
      setShowRejectionForm(false);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject invoice');
    } finally {
      setRejecting(false);
    }
  };
  
  // Handle export
  const handleExport = async (format: 'pdf' | 'excel') => {
    if (!invoice) return;
    
    try {
      window.open(`/api/invoices/export/${invoiceId}?format=${format}`, '_blank');
    } catch (err) {
      setError(`Failed to export invoice as ${format.toUpperCase()}`);
      console.error('Export error:', err);
    }
  };
  
  // Get status badge color
  const getStatusBadgeColor = (status: InvoiceStatus) => {
    switch (status) {
      case 'draft': return 'bg-gray-100 text-gray-800';
      case 'submitted': return 'bg-blue-100 text-blue-800';
      case 'approved': return 'bg-green-100 text-green-800';
      case 'rejected': return 'bg-red-100 text-red-800';
      case 'paid': return 'bg-purple-100 text-purple-800';
    }
  };
  
  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="bg-white p-6 rounded-lg shadow-sm">
        <div className="flex justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-800">Invoice Details</h1>
          <button 
            onClick={onBack}
            className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50 transition-colors"
          >
            Back to Invoices
          </button>
        </div>
        <div className="p-4 bg-red-100 text-red-700 rounded">
          {error}
        </div>
      </div>
    );
  }
  
  if (!invoice) {
    return (
      <div className="bg-white p-6 rounded-lg shadow-sm">
        <div className="flex justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-800">Invoice Details</h1>
          <button 
            onClick={onBack}
            className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50 transition-colors"
          >
            Back to Invoices
          </button>
        </div>
        <div className="text-center py-8 text-gray-500">
          Invoice not found.
        </div>
      </div>
    );
  }
  
  return (
    <div className="bg-white p-6 rounded-lg shadow-sm">
      {/* Header */}
      <div className="flex flex-wrap justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Invoice #{invoice.invoice_number}</h1>
          <div className="text-sm text-gray-500 mt-1">
            {invoice.month_name} {invoice.year}
          </div>
        </div>
        
        <div className="flex space-x-2">
          <button 
            onClick={onBack}
            className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50 transition-colors"
          >
            Back
          </button>
          
          {invoice.status === 'draft' && (
            <button 
              onClick={onEdit}
              className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
            >
              Edit
            </button>
          )}
          
          <div className="relative inline-block text-left">
            <button
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
              onClick={() => handleExport('pdf')}
            >
              Export as PDF
            </button>
          </div>
        </div>
      </div>
      
      {/* Status and actions */}
      <div className="flex flex-wrap justify-between items-center p-4 bg-gray-50 rounded-lg mb-6">
        <div className="flex items-center">
          <span className="mr-2 text-sm font-medium text-gray-700">Status:</span>
          <span className={`px-2 py-1 text-xs rounded-full ${getStatusBadgeColor(invoice.status)}`}>
            {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
          </span>
        </div>
        
        <div className="flex space-x-2 mt-2 sm:mt-0">
          {invoice.status === 'draft' && (
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className={`px-4 py-2 rounded text-white ${
                submitting ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
              } transition-colors`}
            >
              {submitting ? 'Submitting...' : 'Submit for Approval'}
            </button>
          )}
          
          {invoice.status === 'submitted' && isAdmin && (
            <>
              <button
                onClick={handleApprove}
                disabled={approving}
                className={`px-4 py-2 rounded text-white ${
                  approving ? 'bg-green-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'
                } transition-colors`}
              >
                {approving ? 'Approving...' : 'Approve'}
              </button>
              
              <button
                onClick={() => setShowRejectionForm(true)}
                disabled={rejecting}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
              >
                Reject
              </button>
            </>
          )}
        </div>
      </div>
      
      {/* Rejection form */}
      {showRejectionForm && (
        <div className="mb-6 p-4 border border-red-300 bg-red-50 rounded">
          <h3 className="text-lg font-medium text-red-800 mb-2">Reject Invoice</h3>
          <div className="mb-3">
            <label htmlFor="rejectionReason" className="block text-sm font-medium text-gray-700 mb-1">
              Reason for rejection
            </label>
            <textarea
              id="rejectionReason"
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded"
              rows={3}
              placeholder="Please provide a reason for rejection"
            />
          </div>
          <div className="flex justify-end space-x-2">
            <button
              onClick={() => setShowRejectionForm(false)}
              className="px-3 py-1 border border-gray-300 rounded hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleReject}
              disabled={rejecting || !rejectionReason.trim()}
              className={`px-3 py-1 rounded text-white ${
                rejecting || !rejectionReason.trim() 
                  ? 'bg-red-400 cursor-not-allowed' 
                  : 'bg-red-600 hover:bg-red-700'
              } transition-colors`}
            >
              {rejecting ? 'Rejecting...' : 'Confirm Rejection'}
            </button>
          </div>
        </div>
      )}
      
      {/* Invoice details */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div>
          <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-2">Invoice Details</h3>
          <table className="min-w-full">
            <tbody className="divide-y divide-gray-200">
              <tr>
                <td className="py-2 text-sm font-medium text-gray-700">Coach</td>
                <td className="py-2 text-sm text-gray-900">{invoice.coach_name}</td>
              </tr>
              <tr>
                <td className="py-2 text-sm font-medium text-gray-700">Period</td>
                <td className="py-2 text-sm text-gray-900">{invoice.month_name} {invoice.year}</td>
              </tr>
              <tr>
                <td className="py-2 text-sm font-medium text-gray-700">Created</td>
                <td className="py-2 text-sm text-gray-900">{new Date(invoice.created_at).toLocaleDateString()}</td>
              </tr>
              {invoice.submitted_at && (
                <tr>
                  <td className="py-2 text-sm font-medium text-gray-700">Submitted</td>
                  <td className="py-2 text-sm text-gray-900">{new Date(invoice.submitted_at).toLocaleDateString()}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        
        <div>
          <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-2">Financial Summary</h3>
          <table className="min-w-full">
            <tbody className="divide-y divide-gray-200">
              <tr>
                <td className="py-2 text-sm font-medium text-gray-700">Subtotal</td>
                <td className="py-2 text-sm text-gray-900">£{invoice.subtotal.toFixed(2)}</td>
              </tr>
              <tr>
                <td className="py-2 text-sm font-medium text-gray-700">Deductions</td>
                <td className="py-2 text-sm text-gray-900">£{invoice.deductions.toFixed(2)}</td>
              </tr>
              <tr>
                <td className="py-2 text-sm font-medium text-gray-700">Total</td>
                <td className="py-2 text-sm font-medium text-gray-900">£{invoice.total.toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      
      {/* Line items */}
      <div className="mb-6">
        <h3 className="text-lg font-medium text-gray-800 mb-3">Line Items</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Description
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Hours
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Rate
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {invoice.line_items
                .sort((a, b) => {
                  // First by date
                  const dateComparison = new Date(a.date).getTime() - new Date(b.date).getTime();
                  if (dateComparison !== 0) return dateComparison;
                  
                  // Then by deduction status (non-deductions first)
                  if (a.is_deduction !== b.is_deduction) {
                    return a.is_deduction ? 1 : -1;
                  }
                  
                  // Then by description
                  return a.description.localeCompare(b.description);
                })
                .map((item, index) => (
                  <tr key={index} className={item.is_deduction ? 'bg-red-50' : ''}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {item.is_deduction && <span className="text-red-600 font-medium">[Deduction] </span>}
                      {item.description}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {new Date(item.date).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {item.hours.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      £{item.rate.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {item.is_deduction ? (
                        <span className="text-red-600">-£{item.amount.toFixed(2)}</span>
                      ) : (
                        `£${item.amount.toFixed(2)}`
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
            <tfoot className="bg-gray-50">
              <tr>
                <td colSpan={4} className="px-6 py-4 text-sm font-medium text-gray-900 text-right">
                  Total:
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">
                  £{invoice.total.toFixed(2)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
      
      {/* Notes */}
      {invoice.notes && (
        <div className="mb-6">
          <h3 className="text-lg font-medium text-gray-800 mb-2">Notes</h3>
          <div className="p-4 bg-gray-50 rounded border">
            {invoice.notes}
          </div>
        </div>
      )}
    </div>
  );
};

export default InvoiceDetailView;