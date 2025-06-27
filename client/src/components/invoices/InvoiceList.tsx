import React, { useState, useEffect } from 'react';
import { Invoice, InvoiceMonthSummary } from '../../types/invoice';
import { 
  FileText, Plus, Settings, Calendar, 
  Eye, Edit, Trash2, User, X,
  PoundSterlingIcon
} from 'lucide-react';

interface InvoiceListProps {
  onViewInvoice: (invoiceId: number) => void;
  onEditInvoice: (invoiceId: number) => void;
  onGenerateInvoice: () => void;
  onManageRates: () => void;
  userRole: 'coach' | 'admin' | 'super_admin';
}

const InvoiceList: React.FC<InvoiceListProps> = ({ 
  onViewInvoice, 
  onEditInvoice, 
  onGenerateInvoice,
  onManageRates,
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
  
  // Fetch month summaries
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
  
  // Auto-hide success message
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
  
  // Get available years
  const currentYear = new Date().getFullYear();
  const availableYears = Array.from(
    { length: 3 }, 
    (_, i) => currentYear - i
  );
  
  // Get status badge color
  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'draft': return 'bg-gray-100 text-gray-800 border-gray-200';
      case 'submitted': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'approved': return 'bg-green-100 text-green-800 border-green-200';
      case 'rejected': return 'bg-red-100 text-red-800 border-red-200';
      case 'paid': return 'bg-purple-100 text-purple-800 border-purple-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };
  
  // Check if an invoice is editable
  const isInvoiceEditable = (status: string) => {
    if (isAdmin && status !== 'paid') return true;
    return status === 'draft' || status === 'rejected';
  };
  
  // Check if an invoice is deletable
  const canDeleteInvoice = (invoice: Invoice) => {
    if (invoice.status === 'draft') {
      return true;
    } else if (['submitted', 'approved', 'rejected'].includes(invoice.status)) {
      return isAdmin;
    } else if (invoice.status === 'paid') {
      return isSuperAdmin;
    }
    return false;
  };
  
  // Handle delete confirmation
  const handleOpenDeleteConfirm = (invoice: Invoice) => {
    setInvoiceToDelete(invoice);
    setDeleteConfirmOpen(true);
  };
  
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
      
      setInvoices(prevInvoices => 
        prevInvoices.filter(invoice => invoice.id !== invoiceToDelete.id)
      );
      
      setSuccessMessage(`Invoice #${invoiceToDelete.invoice_number} has been deleted.`);
      handleCloseDeleteConfirm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete invoice');
    } finally {
      setDeleting(false);
    }
  };
  
  return (
    <div className="space-y-4 lg:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-xl lg:text-2xl font-bold text-gray-800 flex items-center">
          <FileText className="h-6 w-6 mr-2 text-indigo-600" />
          Invoices
        </h1>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          {isAdmin && (
            <button
              onClick={onManageRates}
              className="w-full sm:w-auto px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center touch-manipulation"
            >
              <Settings className="h-4 w-4 mr-1" />
              <span className="hidden sm:inline">Manage Coaching Rates</span>
              <span className="sm:hidden">Manage Rates</span>
            </button>
          )}
          <button
            onClick={onGenerateInvoice}
            className="w-full sm:w-auto px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center touch-manipulation"
          >
            <Plus className="h-4 w-4 mr-1" />
            <span className="hidden sm:inline">Generate New Invoice</span>
            <span className="sm:hidden">New Invoice</span>
          </button>
        </div>
      </div>
      
      {/* Filters */}
      <div className="bg-white p-4 rounded-lg border shadow-sm">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Year
            </label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              {availableYears.map(year => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          </div>
          
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Status
            </label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="all">All Statuses</option>
              <option value="draft">Draft</option>
              <option value="submitted">Submitted</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="paid">Paid</option>
            </select>
          </div>
        </div>
      </div>
      
      {/* Success Message */}
      {successMessage && (
        <div className="p-4 bg-green-50 border border-green-200 text-green-800 rounded-lg flex justify-between items-center">
          <span className="text-sm lg:text-base">{successMessage}</span>
          <button 
            onClick={() => setSuccessMessage(null)}
            className="text-green-600 hover:text-green-800 ml-2"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      )}
      
      {/* Error Message */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-800 rounded-lg flex justify-between items-center">
          <span className="text-sm lg:text-base">{error}</span>
          <button 
            onClick={() => setError(null)}
            className="text-red-600 hover:text-red-800 ml-2"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      )}
      
      {/* Loading State */}
      {loading ? (
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-600"></div>
        </div>
      ) : (
        <>
          {/* Month Summaries */}
          {monthSummaries.length > 0 && (
            <div className="bg-white rounded-lg border shadow-sm p-4 lg:p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center">
                <Calendar className="h-5 w-5 mr-2 text-indigo-600" />
                Available Months for Invoice Generation
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {monthSummaries
                  .filter(summary => !summary.has_invoice && (summary.total_lead_sessions > 0 || summary.total_assist_sessions > 0))
                  .map(summary => (
                    <div key={`${summary.year}-${summary.month}`} className="border border-gray-200 p-4 rounded-lg hover:shadow-md transition-shadow">
                      <h3 className="font-medium text-gray-900 mb-2">
                        {summary.month_name} {summary.year}
                      </h3>
                      <div className="text-sm text-gray-600 space-y-1 mb-3">
                        <p>Lead Sessions: <span className="font-medium">{summary.total_lead_sessions}</span></p>
                        <p>Assist Sessions: <span className="font-medium">{summary.total_assist_sessions}</span></p>
                      </div>
                      <button 
                        onClick={onGenerateInvoice}
                        className="w-full px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium touch-manipulation"
                      >
                        Generate Invoice
                      </button>
                    </div>
                  ))}
              </div>
            </div>
          )}
          
          {/* Invoice List */}
          {filteredInvoices.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-lg border">
              <FileText className="h-16 w-16 mx-auto text-gray-300 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Invoices Found</h3>
              <p className="text-gray-500">No invoices match the selected filters.</p>
            </div>
          ) : (
            <>
              {/* Mobile Card Layout */}
              <div className="block lg:hidden space-y-4">
                {filteredInvoices.map(invoice => (
                  <div key={invoice.id} className="bg-white rounded-lg border shadow-sm p-4">
                    {/* Invoice Header */}
                    <div className="flex justify-between items-start mb-3">
                      <div className="min-w-0 flex-1">
                        <h3 className="font-medium text-gray-900 text-base mb-1">
                          Invoice #{invoice.invoice_number}
                        </h3>
                        <p className="text-sm text-gray-600">
                          {invoice.month_name} {invoice.year}
                        </p>
                      </div>
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border ${getStatusBadgeColor(invoice.status)}`}>
                        {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
                      </span>
                    </div>
                    
                    {/* Invoice Details */}
                    <div className="space-y-2 mb-4">
                      {isAdmin && (
                        <div className="flex items-center text-sm text-gray-600">
                          <User className="h-4 w-4 mr-2 flex-shrink-0" />
                          <span className="truncate">{invoice.coach_name}</span>
                        </div>
                      )}
                      <div className="flex items-center text-sm text-gray-600">
                        <PoundSterlingIcon className="h-4 w-4 mr-2 flex-shrink-0" />
                        <span className="font-medium">£{invoice.total.toFixed(2)}</span>
                      </div>
                      <div className="flex items-center text-sm text-gray-600">
                        <Calendar className="h-4 w-4 mr-2 flex-shrink-0" />
                        <span>Created {new Date(invoice.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                    
                    {/* Action Buttons */}
                    <div className="flex flex-wrap gap-2 pt-3 border-t">
                      <button
                        onClick={() => onViewInvoice(invoice.id)}
                        className="flex-1 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium flex items-center justify-center touch-manipulation"
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        View
                      </button>
                      
                      {isInvoiceEditable(invoice.status) && (
                        <button
                          onClick={() => onEditInvoice(invoice.id)}
                          className={`flex-1 px-3 py-2 rounded-lg transition-colors text-sm font-medium flex items-center justify-center touch-manipulation ${
                            isAdmin && invoice.status === 'approved' 
                              ? 'bg-amber-600 text-white hover:bg-amber-700' 
                              : invoice.status === 'rejected' 
                                ? 'bg-red-600 text-white hover:bg-red-700' 
                                : 'bg-gray-600 text-white hover:bg-gray-700'
                          }`}
                        >
                          <Edit className="h-4 w-4 mr-1" />
                          {invoice.status === 'rejected' ? 'Fix' : 'Edit'}
                        </button>
                      )}
                      
                      {canDeleteInvoice(invoice) && (
                        <button
                          onClick={() => handleOpenDeleteConfirm(invoice)}
                          className="px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium flex items-center justify-center touch-manipulation"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop Table Layout */}
              <div className="hidden lg:block bg-white rounded-lg border shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
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
                    <tbody className="bg-white divide-y divide-gray-200">
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
                                className="text-blue-600 hover:text-blue-900 transition-colors"
                              >
                                View
                              </button>
                              
                              {isInvoiceEditable(invoice.status) && (
                                <button
                                  onClick={() => onEditInvoice(invoice.id)}
                                  className={`transition-colors ${
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
                              
                              {canDeleteInvoice(invoice) && (
                                <button
                                  onClick={() => handleOpenDeleteConfirm(invoice)}
                                  className="text-red-600 hover:text-red-900 transition-colors"
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
              </div>
            </>
          )}
        </>
      )}
      
      {/* Delete Confirmation Modal */}
      {deleteConfirmOpen && invoiceToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Confirm Delete</h3>
            <p className="mb-4 text-sm lg:text-base">
              Are you sure you want to delete invoice #{invoiceToDelete.invoice_number} for {invoiceToDelete.month_name} {invoiceToDelete.year}?
            </p>
            
            {invoiceToDelete.status === 'paid' && (
              <div className="p-3 bg-yellow-100 text-yellow-800 rounded mb-4 text-sm">
                <strong>Warning:</strong> This is a paid invoice. Deleting it will permanently remove the payment record.
              </div>
            )}
            
            <div className="flex flex-col sm:flex-row justify-end gap-3">
              <button
                onClick={handleCloseDeleteConfirm}
                className="w-full sm:w-auto px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteInvoice}
                className={`w-full sm:w-auto px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors ${
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