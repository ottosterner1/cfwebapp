import React, { useState, useEffect, useRef, useMemo } from 'react';
import { InvoiceDetail as InvoiceDetailType, InvoiceStatus } from '../../types/invoice';
import { 
  ArrowLeft, Download, Edit, Send, Check, X, 
  FileText, User, Calendar, PoundSterling, Clock,
  CheckCircle, XCircle, ChevronDown, ChevronRight
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

// Types for grouped line items
type LineItem = InvoiceDetailType['line_items'][0];

interface GroupedLineItem {
  groupKey: string;
  groupName: string;
  timeSlot: string;
  roleType: 'lead' | 'assistant';
  sessions: LineItem[];
  totalHours: number;
  totalAmount: number;
  sessionCount: number;
  rate: number;
  dateRange: string;
  isExpanded: boolean;
}

interface InvoiceDetailProps {
  invoiceId: number;
  onBack: () => void;
  onEdit: () => void;
  userRole: 'coach' | 'admin' | 'super_admin';
}

// Custom hook for grouping line items with Monday-Sunday ordering
const useGroupedLineItems = (lineItems: LineItem[]) => {
  return useMemo(() => {
    const manualEntries: LineItem[] = [];
    const deductions: LineItem[] = [];
    const registerItems: LineItem[] = [];

    lineItems.forEach(item => {
      if (item.is_deduction) {
        deductions.push(item);
      } else if (!item.register_id) {
        manualEntries.push(item);
      } else {
        registerItems.push(item);
      }
    });

    // Group register items by session type and role
    const groups: { [key: string]: GroupedLineItem } = {};

    registerItems.forEach(item => {
      const roleType = item.description.includes('Lead Coach') ? 'lead' : 
                      item.description.includes('Assistant Coach') ? 'assistant' : 'lead';
      
      const descParts = item.description.split(',');
      const groupName = descParts[0]?.trim() || 'Unknown Group';
      const timeSlot = descParts[1]?.trim().replace(/\s*\((Lead|Assistant)\s*Coach\)/, '') || 'Unknown Time';
      
      const groupKey = `${groupName}-${timeSlot}-${roleType}`;

      if (!groups[groupKey]) {
        groups[groupKey] = {
          groupKey,
          groupName,
          timeSlot,
          roleType,
          sessions: [],
          totalHours: 0,
          totalAmount: 0,
          sessionCount: 0,
          rate: item.rate,
          dateRange: '',
          isExpanded: false
        };
      }

      groups[groupKey].sessions.push(item);
      groups[groupKey].totalHours += item.hours;
      groups[groupKey].totalAmount += item.amount;
      groups[groupKey].sessionCount += 1;
    });

    // Calculate date ranges for each group
    Object.values(groups).forEach(group => {
      const dates = group.sessions
        .map(s => new Date(s.date))
        .sort((a, b) => a.getTime() - b.getTime());
      
      if (dates.length === 1) {
        group.dateRange = dates[0].toLocaleDateString();
      } else if (dates.length > 1) {
        const firstDate = dates[0].toLocaleDateString();
        const lastDate = dates[dates.length - 1].toLocaleDateString();
        group.dateRange = `${firstDate} - ${lastDate}`;
      }
    });

    // Order groups by day of week, then by time
    const dayOrder = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    
    const sortedGroups = Object.values(groups).sort((a, b) => {
      // Extract day from timeSlot
      const dayA = dayOrder.findIndex(day => a.timeSlot.toLowerCase().includes(day));
      const dayB = dayOrder.findIndex(day => b.timeSlot.toLowerCase().includes(day));
      
      // If both have days, sort by day order first
      if (dayA !== -1 && dayB !== -1) {
        if (dayA !== dayB) return dayA - dayB;
        
        // Same day - now sort by time
        // Extract start time from timeSlot (format: "Monday 13:30-14:20")
        const extractStartTime = (timeSlot: string) => {
          const timeMatch = timeSlot.match(/(\d{1,2}):(\d{2})/);
          if (timeMatch) {
            const hours = parseInt(timeMatch[1]);
            const minutes = parseInt(timeMatch[2]);
            return hours * 60 + minutes; // Convert to minutes for easy comparison
          }
          return 0;
        };
        
        const timeA = extractStartTime(a.timeSlot);
        const timeB = extractStartTime(b.timeSlot);
        
        if (timeA !== timeB) return timeA - timeB;
      }
      
      // Fallback: sort by group name, then time slot
      if (a.groupName !== b.groupName) {
        return a.groupName.localeCompare(b.groupName);
      }
      
      return a.timeSlot.localeCompare(b.timeSlot);
    });

    return {
      groupedItems: sortedGroups,
      manualEntries: manualEntries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
      deductions: deductions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    };
  }, [lineItems]);
};

// Component for displaying a grouped line item - MOBILE ONLY
const GroupedLineItemComponent: React.FC<{
  group: GroupedLineItem;
  onToggleExpand: (groupKey: string) => void;
  isLast: boolean;
}> = ({ group, onToggleExpand }) => {
  return (
    <div className={`p-4 border-b last:border-b-0 ${group.isExpanded ? 'bg-gray-50' : 'bg-white'}`}>
      <div 
        className="cursor-pointer"
        onClick={() => onToggleExpand(group.groupKey)}
      >
        <div className="space-y-3">
          <div>
            <div className="flex items-start justify-between mb-1">
              <h4 className="text-sm font-medium text-gray-900 flex-1 mr-2">
                {group.groupName} - {group.timeSlot}
              </h4>
              <div className="flex flex-col items-end gap-1">
                <div className="flex items-center gap-1">
                  {group.isExpanded ? (
                    <ChevronDown className="h-4 w-4 text-gray-500" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-gray-500" />
                  )}
                  <span className={`px-2 py-1 text-xs rounded-full font-medium ${
                    group.roleType === 'lead' 
                      ? 'bg-green-100 text-green-800' 
                      : 'bg-blue-100 text-blue-800'
                  }`}>
                    {group.roleType === 'lead' ? 'Lead' : 'Assistant'}
                  </span>
                </div>
                <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-800 font-medium">
                  Register
                </span>
              </div>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-gray-600">Sessions:</span>
              <div className="font-medium text-gray-900">
                {group.sessionCount} session{group.sessionCount !== 1 ? 's' : ''}
              </div>
            </div>
            <div>
              <span className="text-gray-600">Hours:</span>
              <div className="font-medium text-gray-900">
                {group.totalHours.toFixed(2)}
              </div>
            </div>
            <div>
              <span className="text-gray-600">Rate:</span>
              <div className="font-medium text-gray-900">
                £{group.rate.toFixed(2)}
              </div>
            </div>
            <div>
              <span className="text-gray-600">Amount:</span>
              <div className="font-bold text-gray-900">
                £{group.totalAmount.toFixed(2)}
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Expanded Sessions for Mobile */}
      {group.isExpanded && (
        <div className="mt-4 pt-4 border-t border-gray-200">
          <div className="space-y-2">
            {group.sessions.map((session, index) => (
              <div key={index} className="bg-white p-3 rounded border">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-gray-600">Date:</span>
                    <div className="font-medium text-gray-900">
                      {new Date(session.date).toLocaleDateString()}
                    </div>
                  </div>
                  <div>
                    <span className="text-gray-600">Hours:</span>
                    <div className="font-medium text-gray-900">
                      {session.hours.toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <span className="text-gray-600">Rate:</span>
                    <div className="font-medium text-gray-900">
                      £{session.rate.toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <span className="text-gray-600">Amount:</span>
                    <div className="font-bold text-gray-900">
                      £{session.amount.toFixed(2)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// Component for rendering grouped items in desktop table
const GroupedTableRows: React.FC<{
  group: GroupedLineItem;
  onToggleExpand: (groupKey: string) => void;
}> = ({ group, onToggleExpand }) => {
  return (
    <>
      <tr className={group.isExpanded ? 'bg-gray-50' : ''}>
        <td 
          className="px-6 py-4 text-sm text-gray-900 cursor-pointer"
          onClick={() => onToggleExpand(group.groupKey)}
        >
          <div className="flex items-center">
            {group.isExpanded ? (
              <ChevronDown className="h-4 w-4 text-gray-500 mr-2" />
            ) : (
              <ChevronRight className="h-4 w-4 text-gray-500 mr-2" />
            )}
            {group.groupName} - {group.timeSlot}
            <span className={`ml-2 px-1.5 py-0.5 text-xs rounded ${
              group.roleType === 'lead'
                ? 'bg-green-100 text-green-800'
                : 'bg-blue-100 text-blue-800'
            }`}>
              {group.roleType === 'lead' ? 'Lead' : 'Assistant'}
            </span>
          </div>
          <div className="text-xs text-gray-600 mt-1">
            {group.sessionCount} session{group.sessionCount !== 1 ? 's' : ''} • {group.dateRange}
          </div>
        </td>
        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
          {group.dateRange}
        </td>
        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
          {group.totalHours.toFixed(2)}
        </td>
        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
          £{group.rate.toFixed(2)}
        </td>
        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
          £{group.totalAmount.toFixed(2)}
        </td>
        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
          <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">
            Register
          </span>
        </td>
      </tr>
      
      {/* Expanded Sessions for Desktop */}
      {group.isExpanded && group.sessions.map((session, index) => (
        <tr key={index} className="bg-gray-50">
          <td className="px-6 py-3 text-sm text-gray-700 pl-12">
            <div className="flex items-center">
              <div className="w-4 h-4 mr-2"></div>
              {new Date(session.date).toLocaleDateString()}
            </div>
          </td>
          <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-600">
            {new Date(session.date).toLocaleDateString()}
          </td>
          <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-600">
            {session.hours.toFixed(2)}
          </td>
          <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-600">
            £{session.rate.toFixed(2)}
          </td>
          <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-900">
            £{session.amount.toFixed(2)}
          </td>
          <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-600">
            <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">
              Register
            </span>
          </td>
        </tr>
      ))}
    </>
  );
};

// Component for individual table rows
const IndividualTableRow: React.FC<{ item: LineItem }> = ({ item }) => {
  const isLeadSession = item.item_type === 'group' && 
                       (item.description && item.description.includes('Lead Coach'));
  const isAssistantSession = item.item_type === 'group' && 
                            (item.description && item.description.includes('Assistant Coach'));

  return (
    <tr className={item.is_deduction ? 'bg-red-50' : ''}>
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
};

// Component for displaying individual line items - MOBILE ONLY
const IndividualLineItem: React.FC<{
  item: LineItem;
  isLast: boolean;
  showType?: boolean;
}> = ({ item, isLast }) => {
  const isLeadSession = item.item_type === 'group' && 
                       (item.description && item.description.includes('Lead Coach'));
  const isAssistantSession = item.item_type === 'group' && 
                            (item.description && item.description.includes('Assistant Coach'));

  return (
    <div className={`p-4 border-b last:border-b-0 ${item.is_deduction ? 'bg-red-50' : isLast ? '' : 'bg-gray-50'}`}>
      <div className="space-y-3">
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
};

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
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  
  const isAdmin = userRole === 'admin' || userRole === 'super_admin';
  const printRef = useRef<HTMLDivElement>(null);
  
  // Group line items
  const { groupedItems, manualEntries, deductions } = useGroupedLineItems(
    invoice?.line_items || []
  );
  
  // Calculate total counts for display
  const totalOriginalItems = invoice?.line_items?.length || 0;
  const totalGroupedSections = groupedItems.length + 
    (manualEntries.length > 0 ? 1 : 0) + 
    (deductions.length > 0 ? 1 : 0);
  
  // Handle group expansion
  const handleToggleExpand = (groupKey: string) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(groupKey)) {
      newExpanded.delete(groupKey);
    } else {
      newExpanded.add(groupKey);
    }
    setExpandedGroups(newExpanded);
  };

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
  
  // Fetch the export data
  const fetchExportData = async (id: number): Promise<ExportData> => {
    const response = await fetch(`/api/invoices/export/${id}`);
    if (!response.ok) {
      throw new Error('Failed to fetch invoice data for export');
    }
    return await response.json();
  };

  // Handle PDF export with proper error handling
  const handleExport = async () => {
    if (!invoice) return;
    
    try {
      setExportLoading(true);
      console.log('Starting PDF export...');
      
      // Fetch export data
      const exportData = await fetchExportData(invoiceId);
      console.log('Export data received:', exportData);
      
      // Dynamic import of jsPDF
      const jsPDFModule = await import('jspdf');
      const jsPDF = jsPDFModule.default;
      
      // Create new PDF document
      const pdf = new jsPDF();
      
      // Set up variables
      let yPosition = 20;
      const pageWidth = pdf.internal.pageSize.getWidth();
      const margin = 20;
      
      // Helper function to add text and increment position
      const addText = (text: string, x: number, y: number, options?: any) => {
        pdf.text(text, x, y, options);
      };
      
      // Helper function to check page break
      const checkPageBreak = () => {
        if (yPosition > 250) {
          pdf.addPage();
          yPosition = 20;
        }
      };
      
      // Add header
      pdf.setFontSize(20);
      pdf.setFont('helvetica', 'bold');
      addText(`INVOICE #${exportData.invoice_number}`, pageWidth / 2, yPosition, { align: 'center' });
      yPosition += 15;
      
      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'normal');
      addText(`${exportData.month_name} ${exportData.year}`, pageWidth / 2, yPosition, { align: 'center' });
      yPosition += 10;
      
      // Add status if paid
      if (exportData.status === 'paid') {
        pdf.setFontSize(12);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(0, 128, 0);
        addText('PAID', pageWidth / 2, yPosition, { align: 'center' });
        pdf.setTextColor(0, 0, 0);
        yPosition += 15;
      } else {
        yPosition += 10;
      }
      
      // Add coach information
      pdf.setFontSize(12);
      pdf.setFont('helvetica', 'bold');
      addText('Coach:', margin, yPosition);
      pdf.setFont('helvetica', 'normal');
      addText(exportData.coach.name, margin + 35, yPosition);
      yPosition += 10;
      
      // Add period
      pdf.setFont('helvetica', 'bold');
      addText('Period:', margin, yPosition);
      pdf.setFont('helvetica', 'normal');
      addText(`${exportData.month_name} ${exportData.year}`, margin + 35, yPosition);
      yPosition += 15;
      
      // Add financial summary
      pdf.setFont('helvetica', 'bold');
      addText('FINANCIAL SUMMARY', margin, yPosition);
      yPosition += 10;
      
      pdf.setFont('helvetica', 'normal');
      addText(`Subtotal: £${exportData.financial.subtotal.toFixed(2)}`, margin, yPosition);
      yPosition += 8;
      addText(`Deductions: £${exportData.financial.deductions.toFixed(2)}`, margin, yPosition);
      yPosition += 8;
      
      pdf.setFont('helvetica', 'bold');
      addText(`Total: £${exportData.financial.total.toFixed(2)}`, margin, yPosition);
      yPosition += 20;
      
      // Add line items header
      pdf.setFont('helvetica', 'bold');
      addText('LINE ITEMS', margin, yPosition);
      yPosition += 10;
      
      // Add grouped items if available
      if (groupedItems.length > 0) {
        groupedItems.forEach(group => {
          checkPageBreak();
          
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(10);
          addText(`${group.groupName} - ${group.timeSlot}`, margin, yPosition);
          
          // Add role badge
          const roleText = `(${group.roleType === 'lead' ? 'Lead' : 'Assistant'})`;
          addText(roleText, margin + 120, yPosition);
          yPosition += 6;
          
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(9);
          addText(`${group.sessionCount} sessions • ${group.dateRange}`, margin + 5, yPosition);
          addText(`£${group.totalAmount.toFixed(2)}`, pageWidth - margin, yPosition, { align: 'right' });
          yPosition += 8;
        });
        
        // Add manual entries
        manualEntries.forEach(item => {
          checkPageBreak();
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(9);
          addText(`Manual: ${item.description}`, margin, yPosition);
          addText(`£${item.amount.toFixed(2)}`, pageWidth - margin, yPosition, { align: 'right' });
          yPosition += 6;
        });
        
        // Add deductions
        deductions.forEach(item => {
          checkPageBreak();
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(9);
          pdf.setTextColor(200, 0, 0);
          addText(`Deduction: ${item.description}`, margin, yPosition);
          addText(`-£${item.amount.toFixed(2)}`, pageWidth - margin, yPosition, { align: 'right' });
          pdf.setTextColor(0, 0, 0);
          yPosition += 6;
        });
      } else {
        // Fallback to individual items
        exportData.line_items.forEach(item => {
          checkPageBreak();
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(9);
          
          if (item.is_deduction) {
            pdf.setTextColor(200, 0, 0);
            addText(`[Deduction] ${item.description}`, margin, yPosition);
            addText(`-£${item.amount.toFixed(2)}`, pageWidth - margin, yPosition, { align: 'right' });
            pdf.setTextColor(0, 0, 0);
          } else {
            addText(item.description, margin, yPosition);
            addText(`£${item.amount.toFixed(2)}`, pageWidth - margin, yPosition, { align: 'right' });
          }
          yPosition += 6;
        });
      }
      
      // Add total line
      yPosition += 10;
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(12);
      addText('TOTAL:', pageWidth - margin - 50, yPosition, { align: 'right' });
      addText(`£${exportData.financial.total.toFixed(2)}`, pageWidth - margin, yPosition, { align: 'right' });
      
      // Add notes if present
      if (exportData.notes) {
        yPosition += 20;
        checkPageBreak();
        pdf.setFont('helvetica', 'bold');
        addText('NOTES:', margin, yPosition);
        yPosition += 10;
        
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(10);
        const splitNotes = pdf.splitTextToSize(exportData.notes, pageWidth - 2 * margin);
        splitNotes.forEach((line: string) => {
          checkPageBreak();
          addText(line, margin, yPosition);
          yPosition += 6;
        });
      }
      
      // Save the PDF
      pdf.save(`Invoice-${exportData.invoice_number}.pdf`);
      console.log('PDF generated successfully');
      
    } catch (err) {
      console.error('Error generating PDF:', err);
      setError('Failed to generate PDF. Please try again.');
    } finally {
      setExportLoading(false);
    }
  };

  // Invoice action handlers
  const handleSubmit = async () => {
    if (!invoice || (invoice.status !== 'draft' && invoice.status !== 'rejected')) return;
    
    try {
      setSubmitting(true);
      const response = await fetch(`/api/invoices/${invoiceId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to submit invoice');
      }
      
      const data = await response.json();
      setInvoice({ ...invoice, status: data.status as InvoiceStatus });
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit invoice');
    } finally {
      setSubmitting(false);
    }
  };
  
  const handleApprove = async () => {
    if (!invoice || invoice.status !== 'submitted' || !isAdmin) return;
    
    try {
      setApproving(true);
      const response = await fetch(`/api/invoices/${invoiceId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to approve invoice');
      }
      
      const data = await response.json();
      setInvoice({ ...invoice, status: data.status as InvoiceStatus });
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve invoice');
    } finally {
      setApproving(false);
    }
  };
  
  const handleMarkAsPaid = async () => {
    if (!invoice || invoice.status !== 'approved' || !isAdmin) return;
    
    try {
      setMarkingAsPaid(true);
      const response = await fetch(`/api/invoices/${invoiceId}/mark_paid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to mark invoice as paid');
      }
      
      const data = await response.json();
      setInvoice({ ...invoice, status: data.status as InvoiceStatus });
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mark invoice as paid');
    } finally {
      setMarkingAsPaid(false);
    }
  };
  
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: rejectionReason })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to reject invoice');
      }
      
      const data = await response.json();
      setInvoice({ ...invoice, status: data.status as InvoiceStatus });
      setShowRejectionForm(false);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject invoice');
    } finally {
      setRejecting(false);
    }
  };
  
  // Status info
  const getStatusInfo = (status: InvoiceStatus) => {
    switch (status) {
      case 'draft': 
        return { color: 'bg-gray-100 text-gray-800 border-gray-200', icon: <FileText className="h-4 w-4" /> };
      case 'submitted': 
        return { color: 'bg-blue-100 text-blue-800 border-blue-200', icon: <Send className="h-4 w-4" /> };
      case 'approved': 
        return { color: 'bg-green-100 text-green-800 border-green-200', icon: <CheckCircle className="h-4 w-4" /> };
      case 'rejected': 
        return { color: 'bg-red-100 text-red-800 border-red-200', icon: <XCircle className="h-4 w-4" /> };
      case 'paid': 
        return { color: 'bg-purple-100 text-purple-800 border-purple-200', icon: <PoundSterling className="h-4 w-4" /> };
      default: 
        return { color: 'bg-gray-100 text-gray-800 border-gray-200', icon: <FileText className="h-4 w-4" /> };
    }
  };
  
  const canEditInvoice = () => {
    if (!invoice) return false;
    if (isAdmin && invoice.status !== 'paid') return true;
    return invoice.status === 'draft' || invoice.status === 'rejected';
  };
  
  // Loading state
  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-600"></div>
      </div>
    );
  }
  
  // Error state
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
  
  // Empty state
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
    <div className="space-y-4 lg:space-y-6 overflow-hidden">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="min-w-0 flex-1 overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mb-2">
            <h1 className="text-lg sm:text-xl lg:text-2xl font-bold text-gray-800 min-w-0 break-all leading-tight">
              Invoice #{invoice.invoice_number}
            </h1>
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border ${statusInfo.color} self-start sm:flex-shrink-0`}>
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
                    <PoundSterling className="h-4 w-4 mr-2" />
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
              <PoundSterling className="h-5 w-5 mr-2 text-green-600" />
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
              
              {invoice.status === 'approved' && isAdmin && (
                <button
                  onClick={handleMarkAsPaid}
                  disabled={markingAsPaid}
                  className={`w-full sm:w-auto px-4 py-2 rounded-lg text-white transition-colors flex items-center justify-center ${
                    markingAsPaid ? 'bg-purple-400 cursor-not-allowed' : 'bg-purple-600 hover:bg-purple-700'
                  }`}
                >
                  <PoundSterling className="h-4 w-4 mr-1" />
                  {markingAsPaid ? 'Processing...' : 'Mark as Paid'}
                </button>
              )}
            </div>
          </div>
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
        
        {/* Line items - Grouped view only */}
        <div className="bg-white rounded-lg border shadow-sm">
          <div className="p-4 lg:p-6 border-b">
            <div>
              <h3 className="text-lg font-medium text-gray-900 flex items-center">
                <FileText className="h-5 w-5 mr-2 text-indigo-600" />
                Line Items ({totalOriginalItems})
              </h3>
              <p className="text-sm text-gray-600 mt-1">
                {totalGroupedSections} group{totalGroupedSections !== 1 ? 's' : ''} ({totalOriginalItems} original items)
              </p>
            </div>
          </div>
          
          {/* Mobile Card Layout */}
          <div className="block lg:hidden">
            {groupedItems.map((group, index) => (
              <GroupedLineItemComponent
                key={group.groupKey}
                group={{ ...group, isExpanded: expandedGroups.has(group.groupKey) }}
                onToggleExpand={handleToggleExpand}
                isLast={index === groupedItems.length - 1 && manualEntries.length === 0 && deductions.length === 0}
              />
            ))}
            
            {manualEntries.length > 0 && (
              <div className="p-4 bg-blue-50 border-b">
                <h4 className="text-sm font-medium text-blue-900 flex items-center">
                  <FileText className="h-4 w-4 mr-2" />
                  Manual Entries ({manualEntries.length})
                </h4>
              </div>
            )}
            {manualEntries.map((item, index) => (
              <IndividualLineItem
                key={`manual-${index}`}
                item={item}
                isLast={index === manualEntries.length - 1 && deductions.length === 0}
                showType={false}
              />
            ))}
            
            {deductions.length > 0 && (
              <div className="p-4 bg-red-50 border-b">
                <h4 className="text-sm font-medium text-red-900 flex items-center">
                  <X className="h-4 w-4 mr-2" />
                  Deductions ({deductions.length})
                </h4>
              </div>
            )}
            {deductions.map((item, index) => (
              <IndividualLineItem
                key={`deduction-${index}`}
                item={item}
                isLast={index === deductions.length - 1}
                showType={false}
              />
            ))}
            
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
                {groupedItems.map((group) => (
                  <GroupedTableRows
                    key={group.groupKey}
                    group={{ ...group, isExpanded: expandedGroups.has(group.groupKey) }}
                    onToggleExpand={handleToggleExpand}
                  />
                ))}
                
                {manualEntries.map((item, index) => (
                  <IndividualTableRow key={`manual-${index}`} item={item} />
                ))}
                
                {deductions.map((item, index) => (
                  <IndividualTableRow key={`deduction-${index}`} item={item} />
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
    </div>
  );
};

export default InvoiceDetail;