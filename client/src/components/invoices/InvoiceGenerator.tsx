import React, { useState, useEffect } from 'react';
import { InvoiceMonthSummary, InvoiceGenerateResponse } from '../../types/invoice';

interface InvoiceGeneratorProps {
  onBack: () => void;
  onSuccess: (invoiceId: number) => void;
}

const InvoiceGenerator: React.FC<InvoiceGeneratorProps> = ({ onBack, onSuccess }) => {
  const [availableMonths, setAvailableMonths] = useState<InvoiceMonthSummary[]>([]);
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [yearsLoading, setYearsLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Fetch years with invoices
  useEffect(() => {
    const fetchYearsWithInvoices = async () => {
      try {
        setYearsLoading(true);
        const response = await fetch('/api/invoices/years-with-invoices');
        
        if (!response.ok) {
          throw new Error('Failed to fetch years with invoices');
        }
        
        const years = await response.json();
        setAvailableYears(years);
      } catch (err) {
        console.error('Error fetching years with invoices:', err);
        // Fallback to current year if fetch fails
        const currentYear = new Date().getFullYear();
        setAvailableYears([currentYear]);
        setSelectedYear(currentYear);
      } finally {
        setYearsLoading(false);
      }
    };
    
    fetchYearsWithInvoices();
  }, []);
  
  // Fetch available months
  useEffect(() => {
    const fetchMonthSummaries = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/invoices/month-summaries?year=${selectedYear}`);
        
        if (!response.ok) {
          throw new Error('Failed to fetch month summaries');
        }
        
        const data = await response.json();
        setAvailableMonths(data);
        
        // Auto-select current month if in current year
        if (selectedYear === new Date().getFullYear() && !selectedMonth) {
          const currentMonth = new Date().getMonth() + 1; // JS months are 0-indexed
          if (data.some((m: InvoiceMonthSummary) => m.month === currentMonth && !m.has_invoice)) {
            setSelectedMonth(currentMonth);
          }
        }
      } catch (err) {
        console.error('Error fetching month summaries:', err);
        setError('Failed to load available months. Please try again.');
      } finally {
        setLoading(false);
      }
    };
    
    fetchMonthSummaries();
  }, [selectedYear, selectedMonth]);
  
  // Handle month selection
  const handleSelectMonth = (month: number) => {
    setSelectedMonth(month === selectedMonth ? null : month);
  };
  
  // Generate invoice
  const handleGenerateInvoice = async () => {
    if (!selectedMonth) {
      setError('Please select a month first');
      return;
    }
    
    try {
      setGenerating(true);
      setError(null);
      
      const response = await fetch(`/api/invoices/generate/${selectedYear}/${selectedMonth}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate invoice');
      }
      
      const data: InvoiceGenerateResponse = await response.json();
      
      // If invoice already exists, show message and navigate to it
      if (data.message.includes('already exists')) {
        onSuccess(data.invoice_id);
        return;
      }
      
      // Success - navigate to the new invoice
      onSuccess(data.invoice_id);
    } catch (err) {
      console.error('Error generating invoice:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate invoice');
    } finally {
      setGenerating(false);
    }
  };
  
  // Get month summary data
  const getSelectedMonthSummary = () => {
    if (!selectedMonth) return null;
    return availableMonths.find(m => m.month === selectedMonth);
  };
  
  const selectedMonthSummary = getSelectedMonthSummary();
  
  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Generate Invoice</h1>
        <button 
          onClick={onBack}
          className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50 transition-colors"
        >
          Back to Invoices
        </button>
      </div>
      
      {/* Error message */}
      {error && (
        <div className="mb-4 p-3 bg-red-100 text-red-700 rounded">
          {error}
        </div>
      )}
      
      <div className="bg-white p-6 rounded-lg shadow-sm mb-6">
        <h2 className="text-lg font-semibold mb-4">Select Month and Year</h2>
        
        {/* Year selector */}
        <div className="mb-4">
          <label htmlFor="year" className="block text-sm font-medium text-gray-700 mb-1">
            Year
          </label>
          {yearsLoading ? (
            <div className="flex items-center">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
              <span>Loading years...</span>
            </div>
          ) : (
            <select
              id="year"
              value={selectedYear}
              onChange={(e) => {
                setSelectedYear(Number(e.target.value));
                setSelectedMonth(null);
              }}
              className="px-3 py-2 border border-gray-300 rounded w-full"
              disabled={loading || generating}
            >
              {availableYears.map(year => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          )}
        </div>
        
        {/* Month selection */}
        {loading ? (
          <div className="flex justify-center py-4">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
          </div>
        ) : (
          <>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Month
            </label>
            <div className="grid grid-cols-3 gap-2 mb-4">
              {availableMonths.map(month => {
                const isSelected = month.month === selectedMonth;
                const hasInvoice = month.has_invoice;
                const hasRegisters = month.total_registers > 0;
                
                // Determine button style
                let buttonStyle = '';
                if (hasInvoice) {
                  buttonStyle = 'bg-gray-100 text-gray-400 cursor-not-allowed';
                } else if (isSelected) {
                  buttonStyle = 'bg-blue-100 border-blue-500 text-blue-700';
                } else if (!hasRegisters) {
                  buttonStyle = 'bg-gray-50 text-gray-500 hover:bg-gray-100'; // Changed to make it selectable
                } else {
                  buttonStyle = 'bg-white hover:bg-gray-50 text-gray-700';
                }
                
                return (
                  <button
                    key={month.month}
                    onClick={() => !hasInvoice && handleSelectMonth(month.month)}
                    disabled={hasInvoice || generating}
                    className={`p-3 border rounded ${buttonStyle}`}
                  >
                    <div className="font-medium">{month.month_name}</div>
                    <div className="text-xs mt-1">
                      {hasInvoice ? (
                        <span className="text-gray-500">Invoice exists</span>
                      ) : hasRegisters ? (
                        <span>{month.total_registers} registers</span>
                      ) : (
                        <span>No registers</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}
        
        {/* Summary and generation button */}
        {selectedMonthSummary && (
          <div className="mt-6 p-4 bg-gray-50 rounded border">
            <h3 className="font-medium text-gray-800 mb-2">
              Summary for {selectedMonthSummary.month_name} {selectedYear}
            </h3>
            <ul className="text-sm space-y-1 mb-4">
              <li>Total registers: {selectedMonthSummary.total_registers}</li>
            </ul>
            
            <button
              onClick={handleGenerateInvoice}
              disabled={generating}
              className={`w-full px-4 py-2 rounded text-white ${
                generating
                  ? 'bg-blue-300 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700'
              } transition-colors`}
            >
              {generating ? (
                <span className="flex items-center justify-center">
                  <span className="animate-spin mr-2 h-4 w-4 border-2 border-white border-t-transparent rounded-full"></span>
                  Generating...
                </span>
              ) : (
                'Generate Invoice'
              )}
            </button>
            
            {!selectedMonthSummary.total_registers && (
              <p className="text-sm text-gray-600 mt-2">
                No registers found for this month. An empty invoice will be created.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default InvoiceGenerator;