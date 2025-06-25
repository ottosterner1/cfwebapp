// src/components/invoices/InvoiceDetail.tsx
import React, { useState, useEffect, useRef } from 'react';
import { InvoiceDetail as InvoiceDetailType, InvoiceStatus } from '../../types/invoice';

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
  
  // Handle PDF export
  const handleExport = async () => {
    if (!invoice) return;
    
    try {
      setExportLoading(true);
      
      // Fetch the export data first
      const exportData = await fetchExportData(invoiceId);
      
      // Import jsPDF
      const jsPDFModule = await import('jspdf');
      const jsPDF = jsPDFModule.default;
      
      // Create a new PDF
      const pdf = new jsPDF();
      
      // PDF settings
      const margin = 20; // margins in mm
      let yPos = margin;
      const lineHeight = 10;
      const pageWidth = 210; // A4 width in mm
      const contentWidth = pageWidth - (2 * margin);
      
      // Helper function for adding text with proper typing
      const addText = (text: string, fontSize: number = 12, isBold: boolean = false, align: 'left' | 'center' | 'right' = 'left') => {
        pdf.setFontSize(fontSize);
        pdf.setFont('helvetica', isBold ? 'bold' : 'normal');
        pdf.text(text, align === 'left' ? margin : align === 'right' ? pageWidth - margin : pageWidth / 2, yPos, { align });
        yPos += lineHeight;
      };
      
      // Helper function for checking page break
      const checkPageBreak = (height: number = lineHeight) => {
        if (yPos + height > 280) { // A4 height is 297mm, leave 17mm for footer
          pdf.addPage();
          yPos = margin;
        }
      };
      
      // Add invoice header
      addText(`INVOICE #${exportData.invoice_number}`, 24, true, 'center');
      addText(`${exportData.month_name} ${exportData.year}`, 16, false, 'center');
      if (exportData.status === 'paid') {
        pdf.setTextColor(4, 120, 87); // Green color
        addText('PAID', 14, true, 'center');
        pdf.setTextColor(0, 0, 0); // Reset to black
      }
      
      yPos += 10; // Add extra space
      
      // Create two columns for invoice details and financial summary
      const colWidth = (contentWidth / 2) - 5;
      
      // Invoice Details heading
      const invoiceDetailsX = margin;
      pdf.setDrawColor(200, 200, 200);
      pdf.setFontSize(12);
      pdf.setFont('helvetica', 'bold');
      pdf.text('INVOICE DETAILS', invoiceDetailsX, yPos);
      yPos += 5;
      pdf.line(invoiceDetailsX, yPos, invoiceDetailsX + colWidth, yPos);
      yPos += 10;
      
      // Financial Summary heading
      const financialX = margin + colWidth + 10;
      pdf.setFontSize(12);
      pdf.text('FINANCIAL SUMMARY', financialX, yPos - 15);
      pdf.line(financialX, yPos - 10, financialX + colWidth, yPos - 10);
      
      // Invoice Details content
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Coach', invoiceDetailsX, yPos);
      pdf.setFont('helvetica', 'normal');
      pdf.text(exportData.coach.name, invoiceDetailsX + 40, yPos);
      yPos += lineHeight;
      
      pdf.setFont('helvetica', 'bold');
      pdf.text('Period', invoiceDetailsX, yPos);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`${exportData.month_name} ${exportData.year}`, invoiceDetailsX + 40, yPos);
      yPos += lineHeight;
      
      pdf.setFont('helvetica', 'bold');
      pdf.text('Created', invoiceDetailsX, yPos);
      pdf.setFont('helvetica', 'normal');
      pdf.text(exportData.dates.created_at, invoiceDetailsX + 40, yPos);
      yPos += lineHeight;
      
      if (exportData.dates.submitted_at) {
        pdf.setFont('helvetica', 'bold');
        pdf.text('Submitted', invoiceDetailsX, yPos);
        pdf.setFont('helvetica', 'normal');
        pdf.text(exportData.dates.submitted_at, invoiceDetailsX + 40, yPos);
        yPos += lineHeight;
      }
      
      if (exportData.dates.approved_at) {
        pdf.setFont('helvetica', 'bold');
        pdf.text('Approved', invoiceDetailsX, yPos);
        pdf.setFont('helvetica', 'normal');
        pdf.text(exportData.dates.approved_at, invoiceDetailsX + 40, yPos);
        yPos += lineHeight;
      }
      
      if (exportData.dates.paid_at) {
        pdf.setFont('helvetica', 'bold');
        pdf.text('Paid', invoiceDetailsX, yPos);
        pdf.setFont('helvetica', 'normal');
        pdf.text(exportData.dates.paid_at, invoiceDetailsX + 40, yPos);
        yPos += lineHeight;
      }
      
      // Financial Summary content
      let finYPos = yPos - (lineHeight * (exportData.dates.submitted_at ? 4 : 3) + 
                          (exportData.dates.approved_at ? lineHeight : 0) + 
                          (exportData.dates.paid_at ? lineHeight : 0));
      
      pdf.setFont('helvetica', 'bold');
      pdf.text('Subtotal', financialX, finYPos);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`£${exportData.financial.subtotal.toFixed(2)}`, financialX + 40, finYPos);
      finYPos += lineHeight;
      
      pdf.setFont('helvetica', 'bold');
      pdf.text('Deductions', financialX, finYPos);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`£${exportData.financial.deductions.toFixed(2)}`, financialX + 40, finYPos);
      finYPos += lineHeight;
      
      pdf.setFont('helvetica', 'bold');
      pdf.text('Total', financialX, finYPos);
      pdf.setFont('helvetica', 'bold');
      pdf.text(`£${exportData.financial.total.toFixed(2)}`, financialX + 40, finYPos);
      
      // Set yPos to the maximum of both columns
      yPos = Math.max(yPos, finYPos + lineHeight);
      yPos += 20; // Add space before line items
      
      // Line Items heading
      checkPageBreak();
      addText('Line Items', 16, true);
      yPos += 5;
      
      // Line Items table
      const colWidths = [80, 30, 20, 25, 25];
      const colPositions = [
        margin, // Description
        margin + colWidths[0], // Date
        margin + colWidths[0] + colWidths[1], // Hours 
        margin + colWidths[0] + colWidths[1] + colWidths[2], // Rate
        margin + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] // Amount
      ];
      
      // Table header
      pdf.setFillColor(243, 244, 246); // Light gray bg
      pdf.rect(margin, yPos, contentWidth, 10, 'F');
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9);
      pdf.text('Description', colPositions[0] + 2, yPos + 7);
      pdf.text('Date', colPositions[1] + 2, yPos + 7);
      pdf.text('Hours', colPositions[2] + 2, yPos + 7);
      pdf.text('Rate', colPositions[3] + 2, yPos + 7);
      pdf.text('Amount', colPositions[4] + 2, yPos + 7);
      yPos += 10;
      
      // Use line items as they come from the backend (already sorted correctly)
      const lineItems = exportData.line_items;
      
      // Table rows
      for (let i = 0; i < lineItems.length; i++) {
        const item = lineItems[i];
        
        // Check if we need a new page
        checkPageBreak(15);
        
        // Set background for deductions
        if (item.is_deduction) {
          pdf.setFillColor(254, 226, 226); // Light red
          pdf.rect(margin, yPos, contentWidth, 12, 'F');
        } else if (i % 2 === 1) {
          pdf.setFillColor(249, 250, 251); // Light gray alternate row
          pdf.rect(margin, yPos, contentWidth, 12, 'F');
        }
        
        // Cell content
        pdf.setFont('helvetica', 'normal');
        
        // Description with possible deduction label
        let description = item.description;
        if (item.is_deduction) {
          pdf.setTextColor(220, 38, 38); // Red for deduction
          description = `[Deduction] ${description}`;
        }
        if (item.register_id) {
          description = `${description} (Register)`;
        }
        
        // Limit description to fit in cell
        if (description.length > 30) {
          description = description.substring(0, 27) + '...';
        }
        
        pdf.text(description, colPositions[0] + 2, yPos + 7);
        
        // Reset color
        pdf.setTextColor(0, 0, 0);
        
        // Other columns
        pdf.text(new Date(item.date).toLocaleDateString(), colPositions[1] + 2, yPos + 7);
        pdf.text(item.hours.toFixed(2), colPositions[2] + 2, yPos + 7);
        pdf.text(`£${item.rate.toFixed(2)}`, colPositions[3] + 2, yPos + 7);
        
        // Amount (with minus sign and red color for deductions)
        if (item.is_deduction) {
          pdf.setTextColor(220, 38, 38); // Red
          pdf.text(`-£${item.amount.toFixed(2)}`, colPositions[4] + 2, yPos + 7);
          pdf.setTextColor(0, 0, 0); // Reset color
        } else {
          pdf.text(`£${item.amount.toFixed(2)}`, colPositions[4] + 2, yPos + 7);
        }
        
        yPos += 12;
      }
      
      // Table footer
      checkPageBreak();
      pdf.setFillColor(243, 244, 246); // Light gray bg
      pdf.rect(margin, yPos, contentWidth, 12, 'F');
      
      // Total row
      pdf.setFont('helvetica', 'bold');
      pdf.text('Total:', colPositions[3] - 5, yPos + 7, { align: 'right' as const });
      pdf.text(`£${exportData.financial.total.toFixed(2)}`, colPositions[4] + 2, yPos + 7);
      
      yPos += 20;
      
      // Notes section if available
      if (exportData.notes) {
        checkPageBreak();
        addText('Notes', 12, true);
        
        // Notes box
        pdf.setFillColor(249, 250, 251); // Light gray bg
        pdf.setDrawColor(221, 221, 221); // Border color
        pdf.roundedRect(margin, yPos, contentWidth, 40, 3, 3, 'FD');
        
        // Notes text (wrapped)
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(10);
        
        // Split notes into lines that fit
        const maxWidth = contentWidth - 10;
        const lines = pdf.splitTextToSize(exportData.notes, maxWidth);
        
        // Add each line
        for (let i = 0; i < lines.length && i < 10; i++) { // Limit to 10 lines
          checkPageBreak();
          pdf.text(lines[i], margin + 5, yPos + 8 + (i * 6));
        }
      }
      
      // Save the PDF
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
              {invoice.status === 'approved' ? 'Edit (Admin Only)' : 'Edit'}
            </button>
          )}
          
          <button
            className={`px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors ${
              exportLoading ? 'opacity-75 cursor-not-allowed' : ''
            }`} 
            onClick={handleExport}
            disabled={exportLoading}
          >
            {exportLoading ? 'Exporting...' : 'Export as PDF'}
          </button>
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
                {/* Remove sorting - use backend order directly */}
                {invoice.line_items.map((item, index) => {
                  // Determine if this is a lead session or assistant session
                  const isLeadSession = item.item_type === 'group' && 
                                      (item.description && item.description.includes('Lead Coach'));
                  const isAssistantSession = item.item_type === 'group' && 
                                          (item.description && item.description.includes('Assistant Coach'));
                                          
                  return (
                    <tr key={index} className={item.is_deduction ? 'bg-red-50' : ''}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
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
        <div className="mb-6">
          <h3 className="text-lg font-medium text-gray-800 mb-2">Notes</h3>
          <div className="p-4 bg-gray-50 rounded border whitespace-pre-wrap">
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
          {invoice.status === 'approved' && isAdmin && (
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