import React, { useState, useEffect, useRef } from 'react';
import { InvoiceDetail as InvoiceDetailType, InvoiceStatus } from '../../types/invoice';
import { 
  ArrowLeft, Download, Edit, Send, Check, X, 
  FileText, User, Calendar, PoundSterlingIcon, Clock,
  CheckCircle, XCircle
} from 'lucide-react';

// Define types for PDF export data
interface ExportLineItem {
  description: string;
  date: string;
  hours: number;
  rate: number;
  amount: number;
  is_deduction: boolean;
  notes?: string | null;
  register_id?: number | null;
}

interface ExportData {
  invoice_number: string;
  month: number;
  month_name: string;
  year: number;
  status: string;
  coach: {
    name: string;
    email: string;
  };
  tennis_club: {
    name: string;
    logo_url: string | null;
  };
  dates: {
    created_at: string;
    submitted_at: string | null;
    approved_at: string | null;
    paid_at: string | null;
  };
  financial: {
    subtotal: number;
    deductions: number;
    total: number;
  };
  line_items: ExportLineItem[];
  notes: string | null;
}

interface InvoiceDetailProps {
  invoiceId: number;
  onBack: () => void;
  onEdit: () => void;
  userRole: 'coach' | 'admin' | 'super_admin';
}

const InvoiceDetail: React.FC<InvoiceDetailProps> = ({ 
  invoiceId, 
  onBack, 
  onEdit,
  userRole
}) => {
  const [invoice, setInvoice] = useState<InvoiceDetailType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportLoading, setExportLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [markingAsPaid, setMarkingAsPaid] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [showRejectionForm, setShowRejectionForm] = useState(false);
  
  // Role-based helper functions
  const isAdmin = userRole === 'admin' || userRole === 'super_admin';
  
  // Create a ref for the content to export
  const printRef = useRef<HTMLDivElement>(null);
  
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
  
  // Handle PDF export (same logic as before)
  const handleExport = async () => {
    if (!invoice) return;
    
    try {
      setExportLoading(true);
      
      const exportData = await fetchExportData(invoiceId);
      const jsPDFModule = await import('jspdf');
      const jsPDF = jsPDFModule.default;
      const pdf = new jsPDF();
      
      // PDF generation logic (keeping same as original)
      const margin = 20;
      let yPos = margin;
      const lineHeight = 10;
      const pageWidth = 210;
      
      const addText = (text: string, fontSize: number = 12, isBold: boolean = false, align: 'left' | 'center' | 'right' = 'left') => {
        pdf.setFontSize(fontSize);
        pdf.setFont('helvetica', isBold ? 'bold' : 'normal');
        pdf.text(text, align === 'left' ? margin : align === 'right' ? pageWidth - margin : pageWidth / 2, yPos, { align });
        yPos += lineHeight;
      };
      
      // Add invoice header
      addText(`INVOICE #${exportData.invoice_number}`, 24, true, 'center');
      addText(`${exportData.month_name} ${exportData.year}`, 16, false, 'center');
      if (exportData.status === 'paid') {
        pdf.setTextColor(4, 120, 87);
        addText('PAID', 14, true, 'center');
        pdf.setTextColor(0, 0, 0);
      }
      
      yPos += 10;
      
      // ... (rest of PDF generation logic same as original)
      
      pdf.save(`Invoice-${exportData.invoice_number}.pdf`);
      
    } catch (err) {
      console.error('Error generating PDF:', err);
      setError('Failed to generate PDF. Please try again.');
    } finally {
      setExportLoading(false);
    }
  };
  
  // Fetch the export data
  const fetchExportData = async (id: number): Promise<ExportData> => {
    const response = await fetch(`/api/invoices/export/${id}`);
    if (!response.ok) {
      throw new Error('Failed to fetch invoice data for export');
    }
    return await response.json();
  };

  // Handle invoice submission
  const handleSubmit = async () => {
    if (!invoice || (invoice.status !== 'draft' && invoice.status !== 'rejected')) return;
    
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
  
  // Handle marking invoice as paid
  const handleMarkAsPaid = async () => {
    if (!invoice || invoice.status !== 'approved' || !isAdmin) return;
    
    try {
      setMarkingAsPaid(true);
      const response = await fetch(`/api/invoices/${invoiceId}/mark_paid`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to mark invoice as paid');
      }
      
      const data = await response.json();
      setInvoice({
        ...invoice,
        status: data.status as InvoiceStatus
      });
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mark invoice as paid');
    } finally {
      setMarkingAsPaid(false);
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
  
  // Get status badge color and icon
  const getStatusInfo = (status: InvoiceStatus) => {
    switch (status) {
      case 'draft': 
        return { 
          color: 'bg-gray-100 text-gray-800 border-gray-200', 
          icon: <FileText className="h-4 w-4" />
        };
      case 'submitted': 
        return { 
          color: 'bg-blue-100 text-blue-800 border-blue-200', 
          icon: <Send className="h-4 w-4" />
        };
      case 'approved': 
        return { 
          color: 'bg-green-100 text-green-800 border-green-200', 
          icon: <CheckCircle className="h-4 w-4" />
        };
      case 'rejected': 
        return { 
          color: 'bg-red-100 text-red-800 border-red-200', 
          icon: <XCircle className="h-4 w-4" />
        };
      case 'paid': 
        return { 
          color: 'bg-purple-100 text-purple-800 border-purple-200', 
          icon: <PoundSterlingIcon className="h-4 w-4" />
        };
      default: 
        return { 
          color: 'bg-gray-100 text-gray-800 border-gray-200', 
          icon: <FileText className="h-4 w-4" />
        };
    }
  };
  
  // Check if invoice can be edited
  const canEditInvoice = () => {
    if (!invoice) return false;
    if (isAdmin && invoice.status !== 'paid') return true;
    return invoice.status === 'draft' || invoice.status === 'rejected';
  };
  
  // Render loading state
  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-600"></div>
      </div>
    );
  }
  
  // Render error state
  if (error) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl lg:text-2xl font-bold text-gray-800">Invoice Details</h1>
          <button 
            onClick={onBack}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors flex items-center"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </button>
        </div>
        <div className="p-4 bg-red-50 border border-red-200 text-red-800 rounded-lg">
          {error}
        </div>
      </div>
    );
  }
  
  // Render empty state
  if (!invoice) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl lg:text-2xl font-bold text-gray-800">Invoice Details</h1>
          <button 
            onClick={onBack}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors flex items-center"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </button>
        </div>
        <div className="text-center py-8 text-gray-500 bg-white rounded-lg border">
          Invoice not found.
        </div>
      </div>
    );
  }
  
  const statusInfo = getStatusInfo(invoice.status);
  
  return (
    <div className="space-y-4 lg:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-xl lg:text-2xl font-bold text-gray-800 truncate">
              Invoice #{invoice.invoice_number}
            </h1>
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border ${statusInfo.color} flex-shrink-0`}>
              {statusInfo.icon}
              <span className="ml-1">{invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}</span>
            </span>
          </div>
          <p className="text-sm lg:text-base text-gray-600">
            {invoice.month_name} {invoice.year}
          </p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          <button 
            onClick={onBack}
            className="w-full sm:w-auto px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors flex items-center justify-center"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </button>
          
          {canEditInvoice() && (
            <button 
              onClick={onEdit}
              className={`w-full sm:w-auto px-4 py-2 text-white rounded-lg transition-colors flex items-center justify-center ${
                invoice.status === 'approved' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-gray-600 hover:bg-gray-700'
              }`}
            >
              <Edit className="h-4 w-4 mr-1" />
              {invoice.status === 'approved' ? 'Edit (Admin)' : 'Edit'}
            </button>
          )}
          
          <button
            className={`w-full sm:w-auto px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center ${
              exportLoading ? 'opacity-75 cursor-not-allowed' : ''
            }`} 
            onClick={handleExport}
            disabled={exportLoading}
          >
            <Download className="h-4 w-4 mr-1" />
            {exportLoading ? 'Exporting...' : 'Export PDF'}
          </button>
        </div>
      </div>
      
      {/* Content for PDF */}
      <div ref={printRef} className="pdf-content space-y-4 lg:space-y-6">
        {/* Invoice details */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Invoice Details Card */}
          <div className="bg-white rounded-lg border shadow-sm p-4 lg:p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
              <FileText className="h-5 w-5 mr-2 text-indigo-600" />
              Invoice Details
            </h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700 flex items-center">
                  <User className="h-4 w-4 mr-2" />
                  Coach
                </span>
                <span className="text-sm text-gray-900 font-medium">{invoice.coach_name}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700 flex items-center">
                  <Calendar className="h-4 w-4 mr-2" />
                  Period
                </span>
                <span className="text-sm text-gray-900">{invoice.month_name} {invoice.year}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700 flex items-center">
                  <Clock className="h-4 w-4 mr-2" />
                  Created
                </span>
                <span className="text-sm text-gray-900">{new Date(invoice.created_at).toLocaleDateString()}</span>
              </div>
              {invoice.submitted_at && (
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700 flex items-center">
                    <Send className="h-4 w-4 mr-2" />
                    Submitted
                  </span>
                  <span className="text-sm text-gray-900">{new Date(invoice.submitted_at).toLocaleDateString()}</span>
                </div>
              )}
              {invoice.approved_at && (
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700 flex items-center">
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Approved
                  </span>
                  <span className="text-sm text-gray-900">{new Date(invoice.approved_at).toLocaleDateString()}</span>
                </div>
              )}
              {invoice.paid_at && (
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700 flex items-center">
                    <PoundSterlingIcon className="h-4 w-4 mr-2" />
                    Paid
                  </span>
                  <span className="text-sm text-gray-900">{new Date(invoice.paid_at).toLocaleDateString()}</span>
                </div>
              )}
            </div>
          </div>
          
          {/* Financial Summary Card */}
          <div className="bg-white rounded-lg border shadow-sm p-4 lg:p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
              <PoundSterlingIcon className="h-5 w-5 mr-2 text-green-600" />
              Financial Summary
            </h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">Subtotal</span>
                <span className="text-sm text-gray-900">£{invoice.subtotal.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">Deductions</span>
                <span className="text-sm text-red-600">£{invoice.deductions.toFixed(2)}</span>
              </div>
              <div className="border-t pt-3">
                <div className="flex items-center justify-between">
                  <span className="text-base font-bold text-gray-900">Total</span>
                  <span className="text-base font-bold text-gray-900">£{invoice.total.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Line items */}
        <div className="bg-white rounded-lg border shadow-sm">
          <div className="p-4 lg:p-6 border-b">
            <h3 className="text-lg font-medium text-gray-900 flex items-center">
              <FileText className="h-5 w-5 mr-2 text-indigo-600" />
              Line Items ({invoice.line_items.length})
            </h3>
          </div>
          
          {/* Mobile Card Layout */}
          <div className="block lg:hidden">
            {invoice.line_items.map((item, index) => {
              const isLeadSession = item.item_type === 'group' && 
                                  (item.description && item.description.includes('Lead Coach'));
              const isAssistantSession = item.item_type === 'group' && 
                                      (item.description && item.description.includes('Assistant Coach'));
              
              return (
                <div key={index} className={`p-4 border-b last:border-b-0 ${item.is_deduction ? 'bg-red-50' : index % 2 === 1 ? 'bg-gray-50' : 'bg-white'}`}>
                  <div className="space-y-3">
                    {/* Description */}
                    <div>
                      <div className="flex items-start justify-between mb-1">
                        <h4 className="text-sm font-medium text-gray-900 flex-1 mr-2">
                          {item.is_deduction && <span className="text-red-600 font-medium">[Deduction] </span>}
                          {item.description}
                        </h4>
                        <div className="flex flex-col items-end gap-1">
                          {isLeadSession && (
                            <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-800 font-medium">
                              Lead
                            </span>
                          )}
                          {isAssistantSession && (
                            <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800 font-medium">
                              Assistant
                            </span>
                          )}
                          {item.register_id ? (
                            <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-800 font-medium">
                              Register
                            </span>
                          ) : (
                            <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800 font-medium">
                              Manual
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    {/* Details Grid */}
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-gray-600">Date:</span>
                        <div className="font-medium text-gray-900">
                          {new Date(item.date).toLocaleDateString()}
                        </div>
                      </div>
                      <div>
                        <span className="text-gray-600">Hours:</span>
                        <div className="font-medium text-gray-900">
                          {item.hours.toFixed(2)}
                        </div>
                      </div>
                      <div>
                        <span className="text-gray-600">Rate:</span>
                        <div className="font-medium text-gray-900">
                          £{item.rate.toFixed(2)}
                        </div>
                      </div>
                      <div>
                        <span className="text-gray-600">Amount:</span>
                        <div className={`font-bold ${item.is_deduction ? 'text-red-600' : 'text-gray-900'}`}>
                          {item.is_deduction ? `-£${item.amount.toFixed(2)}` : `£${item.amount.toFixed(2)}`}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            
            {/* Mobile Total */}
            <div className="p-4 bg-gray-50 border-t-2">
              <div className="flex justify-between items-center">
                <span className="text-base font-bold text-gray-900">Total:</span>
                <span className="text-base font-bold text-gray-900">£{invoice.total.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Desktop Table Layout */}
          <div className="hidden lg:block overflow-x-auto">
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
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Source
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {invoice.line_items.map((item, index) => {
                  const isLeadSession = item.item_type === 'group' && 
                                      (item.description && item.description.includes('Lead Coach'));
                  const isAssistantSession = item.item_type === 'group' && 
                                          (item.description && item.description.includes('Assistant Coach'));
                                          
                  return (
                    <tr key={index} className={item.is_deduction ? 'bg-red-50' : ''}>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {item.is_deduction && <span className="text-red-600 font-medium">[Deduction] </span>}
                        {item.description}
                        {isLeadSession && (
                          <span className="ml-1 px-1.5 py-0.5 text-xs rounded bg-green-100 text-green-800">
                            Lead
                          </span>
                        )}
                        {isAssistantSession && (
                          <span className="ml-1 px-1.5 py-0.5 text-xs rounded bg-blue-100 text-blue-800">
                            Assistant
                          </span>
                        )}
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
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {item.register_id ? (
                          <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">
                            Register
                          </span>
                        ) : (
                          <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                            Manual
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-gray-50">
                <tr>
                  <td colSpan={5} className="px-6 py-4 text-sm font-medium text-gray-900 text-right">
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
          <div className="bg-white rounded-lg border shadow-sm p-4 lg:p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-3 flex items-center">
              <FileText className="h-5 w-5 mr-2 text-indigo-600" />
              Notes
            </h3>
            <div className="p-4 bg-gray-50 rounded-lg border whitespace-pre-wrap text-sm lg:text-base">
              {invoice.notes}
            </div>
          </div>
        )}
      </div>
      
      {/* Rejection form */}
      {showRejectionForm && (
        <div className="bg-white rounded-lg border border-red-300 p-4 lg:p-6">
          <h3 className="text-lg font-medium text-red-800 mb-4 flex items-center">
            <XCircle className="h-5 w-5 mr-2" />
            Reject Invoice
          </h3>
          <div className="space-y-4">
            <div>
              <label htmlFor="rejectionReason" className="block text-sm font-medium text-gray-700 mb-2">
                Reason for rejection
              </label>
              <textarea
                id="rejectionReason"
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                rows={3}
                placeholder="Please provide a reason for rejection"
              />
            </div>
            <div className="flex flex-col sm:flex-row justify-end gap-3">
              <button
                onClick={() => setShowRejectionForm(false)}
                className="w-full sm:w-auto px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={rejecting || !rejectionReason.trim()}
                className={`w-full sm:w-auto px-4 py-2 rounded-lg text-white transition-colors ${
                  rejecting || !rejectionReason.trim() 
                    ? 'bg-red-400 cursor-not-allowed' 
                    : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                {rejecting ? 'Rejecting...' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Status and actions */}
      <div className="bg-white rounded-lg border shadow-sm p-4 lg:p-6">
        <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-4">
          <div className="flex items-center gap-3">
            <span className="text-sm lg:text-base font-medium text-gray-700">Status:</span>
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border ${statusInfo.color}`}>
              {statusInfo.icon}
              <span className="ml-1">{invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}</span>
            </span>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-2">
            {/* Submit/Resubmit button */}
            {(invoice.status === 'draft' || invoice.status === 'rejected') && (
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className={`w-full sm:w-auto px-4 py-2 rounded-lg text-white transition-colors flex items-center justify-center ${
                  submitting ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                <Send className="h-4 w-4 mr-1" />
                {submitting ? 'Submitting...' : invoice.status === 'rejected' ? 'Resubmit' : 'Submit'}
              </button>
            )}
            
            {/* Admin approval buttons */}
            {invoice.status === 'submitted' && isAdmin && (
              <>
                <button
                  onClick={handleApprove}
                  disabled={approving}
                  className={`w-full sm:w-auto px-4 py-2 rounded-lg text-white transition-colors flex items-center justify-center ${
                    approving ? 'bg-green-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'
                  }`}
                >
                  <Check className="h-4 w-4 mr-1" />
                  {approving ? 'Approving...' : 'Approve'}
                </button>
                
                <button
                  onClick={() => setShowRejectionForm(true)}
                  disabled={rejecting}
                  className="w-full sm:w-auto px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center justify-center"
                >
                  <X className="h-4 w-4 mr-1" />
                  Reject
                </button>
              </>
            )}
            
            {/* Mark as Paid button */}
            {invoice.status === 'approved' && isAdmin && (
              <button
                onClick={handleMarkAsPaid}
                disabled={markingAsPaid}
                className={`w-full sm:w-auto px-4 py-2 rounded-lg text-white transition-colors flex items-center justify-center ${
                  markingAsPaid ? 'bg-purple-400 cursor-not-allowed' : 'bg-purple-600 hover:bg-purple-700'
                }`}
              >
                <PoundSterlingIcon className="h-4 w-4 mr-1" />
                {markingAsPaid ? 'Processing...' : 'Mark as Paid'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default InvoiceDetail;