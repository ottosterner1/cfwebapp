import React, { useState, useEffect, useRef } from 'react';
import { InvoiceDetail as InvoiceDetailType, InvoiceStatus } from '../../types/invoice';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

// Define interfaces for the export data structure
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
  }, [invoiceId, isAdmin]);
  
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
  
  // PDF export method
  const handleExport = async () => {
    if (!invoice) return;
    
    try {
      setLoading(true);
      
      // First fetch the full export data
      const response = await fetch(`/api/invoices/export/${invoiceId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch invoice data for export');
      }
      
      const exportData: ExportData = await response.json();
      
      // Create a temporary div styled for PDF export
      const pdfContent = document.createElement('div');
      pdfContent.className = 'pdf-export-content';
      pdfContent.style.width = '210mm';
      pdfContent.style.padding = '20mm';
      pdfContent.style.backgroundColor = 'white';
      pdfContent.style.position = 'absolute';
      pdfContent.style.left = '-9999px';
      pdfContent.style.fontSize = '12pt';
      pdfContent.style.fontFamily = 'Arial, sans-serif';
      
      // Populate the PDF content with properly formatted data
      pdfContent.innerHTML = `
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="font-size: 24pt; margin-bottom: 5px;">INVOICE #${exportData.invoice_number}</h1>
          <p style="font-size: 16pt; margin-top: 5px;">${exportData.month_name} ${exportData.year}</p>
          ${exportData.status === 'paid' ? `<p style="font-size: 14pt; color: #047857; font-weight: bold; margin-top: 10px;">PAID</p>` : ''}
        </div>
        
        <div style="display: flex; justify-content: space-between; margin-bottom: 30px;">
          <div style="width: 48%;">
            <h3 style="border-bottom: 1px solid #ccc; padding-bottom: 5px; text-transform: uppercase; color: #666;">Invoice Details</h3>
            <table style="width: 100%;">
              <tr>
                <td style="padding: 8px 0; font-weight: bold;">Coach</td>
                <td style="padding: 8px 0;">${exportData.coach.name}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: bold;">Period</td>
                <td style="padding: 8px 0;">${exportData.month_name} ${exportData.year}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: bold;">Created</td>
                <td style="padding: 8px 0;">${exportData.dates.created_at}</td>
              </tr>
              ${exportData.dates.submitted_at ? `
              <tr>
                <td style="padding: 8px 0; font-weight: bold;">Submitted</td>
                <td style="padding: 8px 0;">${exportData.dates.submitted_at}</td>
              </tr>` : ''}
              ${exportData.dates.approved_at ? `
              <tr>
                <td style="padding: 8px 0; font-weight: bold;">Approved</td>
                <td style="padding: 8px 0;">${exportData.dates.approved_at}</td>
              </tr>` : ''}
              ${exportData.dates.paid_at ? `
              <tr>
                <td style="padding: 8px 0; font-weight: bold;">Paid</td>
                <td style="padding: 8px 0;">${exportData.dates.paid_at}</td>
              </tr>` : ''}
            </table>
          </div>
          
          <div style="width: 48%;">
            <h3 style="border-bottom: 1px solid #ccc; padding-bottom: 5px; text-transform: uppercase; color: #666;">Financial Summary</h3>
            <table style="width: 100%;">
              <tr>
                <td style="padding: 8px 0; font-weight: bold;">Subtotal</td>
                <td style="padding: 8px 0;">£${exportData.financial.subtotal.toFixed(2)}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: bold;">Deductions</td>
                <td style="padding: 8px 0;">£${exportData.financial.deductions.toFixed(2)}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: bold;">Total</td>
                <td style="padding: 8px 0; font-weight: bold;">£${exportData.financial.total.toFixed(2)}</td>
              </tr>
            </table>
          </div>
        </div>
        
        <div>
          <h3 style="margin-bottom: 15px; font-size: 16pt;">Line Items</h3>
          <table style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr style="background-color: #f3f4f6;">
                <th style="padding: 10px; text-align: left; border-bottom: 1px solid #ddd;">Description</th>
                <th style="padding: 10px; text-align: left; border-bottom: 1px solid #ddd;">Date</th>
                <th style="padding: 10px; text-align: left; border-bottom: 1px solid #ddd;">Hours</th>
                <th style="padding: 10px; text-align: left; border-bottom: 1px solid #ddd;">Rate</th>
                <th style="padding: 10px; text-align: left; border-bottom: 1px solid #ddd;">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${exportData.line_items.map((item: ExportLineItem, index: number) => `
                <tr style="${item.is_deduction ? 'background-color: #fee2e2;' : index % 2 === 1 ? 'background-color: #f9fafb;' : ''}">
                  <td style="padding: 12px 10px; border-bottom: 1px solid #ddd;">
                    ${item.is_deduction ? '<span style="color: #dc2626; font-weight: 500;">[Deduction] </span>' : ''}
                    ${item.description}
                    ${item.register_id ? '<span style="color: #047857; font-size: 0.9em;"> (Register)</span>' : ''}
                  </td>
                  <td style="padding: 12px 10px; border-bottom: 1px solid #ddd;">${item.date}</td>
                  <td style="padding: 12px 10px; border-bottom: 1px solid #ddd;">${item.hours.toFixed(2)}</td>
                  <td style="padding: 12px 10px; border-bottom: 1px solid #ddd;">£${item.rate.toFixed(2)}</td>
                  <td style="padding: 12px 10px; border-bottom: 1px solid #ddd; ${item.is_deduction ? 'color: #dc2626;' : ''}">
                    ${item.is_deduction ? '-' : ''}£${item.amount.toFixed(2)}
                  </td>
                </tr>
              `).join('')}
            </tbody>
            <tfoot>
              <tr style="background-color: #f3f4f6;">
                <td colspan="4" style="padding: 12px 10px; text-align: right; font-weight: bold; border-top: 2px solid #ddd;">Total:</td>
                <td style="padding: 12px 10px; font-weight: bold; border-top: 2px solid #ddd;">£${exportData.financial.total.toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        
        ${exportData.notes ? `
        <div style="margin-top: 30px;">
          <h3 style="margin-bottom: 10px;">Notes</h3>
          <div style="padding: 15px; background-color: #f9fafb; border: 1px solid #ddd; border-radius: 4px;">
            ${exportData.notes}
          </div>
        </div>
        ` : ''}
      `;
      
      // Add to the body temporarily for rendering
      document.body.appendChild(pdfContent);
      
      // Render with html2canvas
      const canvas = await html2canvas(pdfContent, {
        scale: 2,
        useCORS: true,
        logging: false
      });
      
      // Remove the temporary content
      document.body.removeChild(pdfContent);
      
      // Create PDF
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });
      
      // Calculate dimensions
      const imgWidth = 210;
      const pageHeight = 297;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      
      // Add image to PDF
      pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);
      
      // Handle multiple pages if needed
      let heightLeft = imgHeight;
      let position = 0;
      
      while (heightLeft > pageHeight) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }
      
      // Save the PDF
      pdf.save(`Invoice-${exportData.invoice_number}.pdf`);
      
    } catch (err) {
      console.error('Error generating PDF:', err);
      setError('Failed to generate PDF. Please try again.');
    } finally {
      setLoading(false);
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
  
  // Check if invoice can be edited
  const canEditInvoice = () => {
    if (!invoice) return false;
    
    // Admin can edit any invoice except paid ones
    if (isAdmin && invoice.status !== 'paid') return true;
    
    // Regular users can only edit draft or rejected invoices
    return invoice.status === 'draft' || invoice.status === 'rejected';
  };
  
  // Render loading state
  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }
  
  // Render error state
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
  
  // Render empty state
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
      
      {/* Header - NOT included in print area */}
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
          
          {canEditInvoice() && (
            <button 
              onClick={onEdit}
              className={`px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors ${
                invoice.status === 'approved' ? 'bg-amber-600 hover:bg-amber-700' : ''
              }`}
            >
              {invoice.status === 'approved' ? 'Edit' : 'Edit'}
            </button>
          )}
          
          <div className="relative inline-block text-left">
          <button
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
            onClick={handleExport}
          >
            Export as PDF
          </button>
          </div>
        </div>
      </div>
      
      {/* Content for PDF - wrapped in printRef */}
      <div ref={printRef} className="pdf-content">
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
                {invoice.approved_at && (
                  <tr>
                    <td className="py-2 text-sm font-medium text-gray-700">Approved</td>
                    <td className="py-2 text-sm text-gray-900">{new Date(invoice.approved_at).toLocaleDateString()}</td>
                  </tr>
                )}
                {invoice.paid_at && (
                  <tr>
                    <td className="py-2 text-sm font-medium text-gray-700">Paid</td>
                    <td className="py-2 text-sm text-gray-900">{new Date(invoice.paid_at).toLocaleDateString()}</td>
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
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Source
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {invoice.line_items
                  .sort((a, b) => {
                    const dateComparison = new Date(a.date).getTime() - new Date(b.date).getTime();
                    if (dateComparison !== 0) return dateComparison;
                    if (a.is_deduction !== b.is_deduction) {
                      return a.is_deduction ? 1 : -1;
                    }
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
                  ))}
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
          <div className="mb-6">
            <h3 className="text-lg font-medium text-gray-800 mb-2">Notes</h3>
            <div className="p-4 bg-gray-50 rounded border">
              {invoice.notes}
            </div>
          </div>
        )}
      </div>
      
      {/* Rejection form - outside of print area */}
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
      
      {/* Status and actions - outside of print area */}
      <div className="flex flex-wrap justify-between items-center p-4 bg-gray-50 rounded-lg mt-8">
        <div className="flex items-center">
          <span className="mr-2 text-sm font-medium text-gray-700">Status:</span>
          <span className={`px-2 py-1 text-xs rounded-full ${getStatusBadgeColor(invoice.status)}`}>
            {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
          </span>
        </div>
        
        <div className="flex space-x-2 mt-2 sm:mt-0">
          {/* Submit/Resubmit button */}
          {(invoice.status === 'draft' || invoice.status === 'rejected') && (
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className={`px-4 py-2 rounded text-white ${
                submitting ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
              } transition-colors`}
            >
              {submitting ? 'Submitting...' : invoice.status === 'rejected' ? 'Resubmit for Approval' : 'Submit for Approval'}
            </button>
          )}
          
          {/* Admin approval buttons */}
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
          
          {/* Mark as Paid button (admin only) */}
          {invoice.status.toLowerCase() === 'approved' && isAdmin && (
            <button
              onClick={handleMarkAsPaid}
              disabled={markingAsPaid}
              className={`px-4 py-2 rounded text-white ${
                markingAsPaid ? 'bg-purple-400 cursor-not-allowed' : 'bg-purple-600 hover:bg-purple-700'
              } transition-colors`}
            >
              {markingAsPaid ? 'Processing...' : 'Mark as Paid'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default InvoiceDetail;