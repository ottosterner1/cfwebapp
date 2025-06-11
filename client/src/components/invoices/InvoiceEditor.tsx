import React, { useState, useEffect } from 'react';
import { InvoiceDetail, InvoiceLineItem, CoachRate } from '../../types/invoice';

interface InvoiceEditorProps {
  invoiceId: number;
  onBack: () => void;
  onSaveSuccess: () => void;
}

const InvoiceEditor: React.FC<InvoiceEditorProps> = ({ 
  invoiceId, 
  onBack, 
  onSaveSuccess 
}) => {
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>([]);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [coachRates, setCoachRates] = useState<CoachRate[]>([]);
  const [selectedRate, setSelectedRate] = useState<number | null>(null);
  
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
        setLineItems(data.line_items);
        setNotes(data.notes || '');
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
  
  // Fetch coach rates
  useEffect(() => {
    const fetchCoachRates = async () => {
      try {
        const response = await fetch('/api/invoices/rates');
        
        if (!response.ok) {
          throw new Error('Failed to fetch coach rates');
        }
        
        const data = await response.json();
        setCoachRates(data);
      } catch (err) {
        console.error('Error fetching coach rates:', err);
      }
    };
    
    fetchCoachRates();
  }, []);
  
  // Calculate totals
  const calculateTotals = () => {
    const subtotal = lineItems
      .filter(item => !item.is_deduction)
      .reduce((sum, item) => sum + item.amount, 0);
      
    const deductions = lineItems
      .filter(item => item.is_deduction)
      .reduce((sum, item) => sum + item.amount, 0);
      
    const total = subtotal - deductions;
    
    return { subtotal, deductions, total };
  };
  
  // Handle save
  const handleSave = async () => {
    if (!invoice) return;
    
    try {
      setSaving(true);
      
      const response = await fetch(`/api/invoices/${invoiceId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          notes,
          line_items: lineItems
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save invoice');
      }
      
      // Success
      onSaveSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save invoice');
      console.error('Error saving invoice:', err);
    } finally {
      setSaving(false);
    }
  };
  
  // Handle adding new line item
  const handleAddLineItem = () => {
    const today = new Date().toISOString().split('T')[0];
    
    const newItem: InvoiceLineItem = {
      item_type: '',
      is_deduction: false,
      description: '',
      date: today,
      hours: 1,
      rate: selectedRate || 0,
      amount: (selectedRate || 0) * 1
    };
    
    setLineItems([...lineItems, newItem]);
  };
  
  // Handle adding new deduction
  const handleAddDeduction = () => {
    const today = new Date().toISOString().split('T')[0];
    
    const newItem: InvoiceLineItem = {
      item_type: 'deduction',
      is_deduction: true,
      description: '',
      date: today,
      hours: 0,
      rate: 0,
      amount: 0
    };
    
    setLineItems([...lineItems, newItem]);
  };
  
  // Handle updating line item
  const handleUpdateLineItem = (index: number, field: keyof InvoiceLineItem, value: any) => {
    const updatedItems = [...lineItems];
    
    // Update the field
    updatedItems[index] = {
      ...updatedItems[index],
      [field]: value
    };
    
    // Recalculate amount if hours or rate changed
    if (field === 'hours' || field === 'rate') {
      updatedItems[index].amount = 
        parseFloat(updatedItems[index].hours as any) * 
        parseFloat(updatedItems[index].rate as any);
    }
    
    setLineItems(updatedItems);
  };
  
  // Handle removing line item
  const handleRemoveLineItem = (index: number) => {
    const updatedItems = lineItems.filter((_, i) => i !== index);
    setLineItems(updatedItems);
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
          <h1 className="text-2xl font-bold text-gray-800">Edit Invoice</h1>
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
          <h1 className="text-2xl font-bold text-gray-800">Edit Invoice</h1>
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
  
  const { subtotal, deductions, total } = calculateTotals();
  
  return (
    <div className="bg-white p-4 sm:p-6 rounded-lg shadow-sm">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-800">
          Edit Invoice #{invoice.invoice_number}
        </h1>
        <div className="flex space-x-2 w-full sm:w-auto">
          <button 
            onClick={onBack}
            className="flex-1 sm:flex-none px-4 py-2 border border-gray-300 rounded hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={handleSave}
            disabled={saving}
            className={`flex-1 sm:flex-none px-4 py-2 rounded text-white ${
              saving ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
            } transition-colors`}
          >
            {saving ? 'Saving...' : 'Save Invoice'}
          </button>
        </div>
      </div>
      
      {/* Invoice details */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6 p-4 bg-gray-50 rounded">
        <div>
          <p className="text-sm font-medium text-gray-700">Coach:</p>
          <p className="text-base sm:text-lg">{invoice.coach_name}</p>
        </div>
        <div>
          <p className="text-sm font-medium text-gray-700">Period:</p>
          <p className="text-base sm:text-lg">{invoice.month_name} {invoice.year}</p>
        </div>
        <div>
          <p className="text-sm font-medium text-gray-700">Status:</p>
          <p className="text-base sm:text-lg capitalize">{invoice.status}</p>
        </div>
      </div>
      
      {/* Controls Section */}
      <div className="mb-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
          <h2 className="text-lg font-semibold">Line Items</h2>
          
          {/* Single responsive controls section */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
            {/* Rate selector */}
            {coachRates.length > 0 && (
              <div className="flex items-center gap-2">
                <label htmlFor="rate" className="text-sm font-medium text-gray-700 whitespace-nowrap">
                  Rate:
                </label>
                <select
                  id="rate"
                  value={selectedRate || ''}
                  onChange={(e) => setSelectedRate(e.target.value ? parseFloat(e.target.value) : null)}
                  className="px-3 py-2 border border-gray-300 rounded text-sm min-w-0 flex-1 sm:flex-none sm:min-w-[200px]"
                >
                  <option value="">Select rate...</option>
                  {coachRates.map(rate => (
                    <option key={rate.id} value={rate.hourly_rate}>
                      {rate.rate_name}: £{rate.hourly_rate.toFixed(2)}/hr
                    </option>
                  ))}
                </select>
              </div>
            )}
            
            {/* Action buttons */}
            <div className="flex gap-2">
              <button
                onClick={handleAddLineItem}
                className="flex-1 sm:flex-none px-3 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors text-sm"
              >
                Add Item
              </button>
              <button
                onClick={handleAddDeduction}
                className="flex-1 sm:flex-none px-3 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors text-sm"
              >
                Add Deduction
              </button>
            </div>
          </div>
        </div>
        
        {/* Rate selection reminder */}
        {selectedRate === null && coachRates.length > 0 && (
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded text-sm text-blue-700">
            Select a rate above before adding items. If no rate is selected, items will be added with £0.00 rate.
          </div>
        )}
        
        {/* Responsive Line Items */}
        {lineItems.length === 0 ? (
          <div className="text-center py-8 text-gray-500 border border-gray-200 rounded">
            No line items yet. Add an item using the buttons above.
          </div>
        ) : (
          <>
            {/* Desktop Table View - Hidden on Mobile */}
            <div className="hidden lg:block overflow-x-auto rounded border">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Hours</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rate (£)</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount (£)</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {lineItems.map((item, index) => (
                    <tr key={index} className={item.is_deduction ? 'bg-red-50' : ''}>
                      <td className="px-4 py-2">
                        <select
                          value={item.is_deduction ? 'deduction' : item.item_type}
                          onChange={(e) => {
                            const isDeduction = e.target.value === 'deduction';
                            handleUpdateLineItem(index, 'is_deduction', isDeduction);
                            handleUpdateLineItem(index, 'item_type', isDeduction ? 'deduction' : e.target.value);
                          }}
                          className="px-2 py-1 border border-gray-300 rounded w-full text-sm"
                        >
                          <option value="">Select Type</option>
                          <option value="group">Group</option>
                          <option value="camp">Camp</option>
                          <option value="admin">Admin</option>
                          <option value="other">Other</option>
                          <option value="deduction">Deduction</option>
                        </select>
                      </td>
                      <td className="px-4 py-2">
                        <input
                          type="text"
                          value={item.description}
                          onChange={(e) => handleUpdateLineItem(index, 'description', e.target.value)}
                          className="px-2 py-1 border border-gray-300 rounded w-full text-sm"
                          placeholder="Enter description"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input
                          type="date"
                          value={item.date}
                          onChange={(e) => handleUpdateLineItem(index, 'date', e.target.value)}
                          className="px-2 py-1 border border-gray-300 rounded w-full text-sm"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input
                          type="number"
                          min="0.25"
                          step="0.25"
                          value={item.hours}
                          onChange={(e) => handleUpdateLineItem(index, 'hours', parseFloat(e.target.value))}
                          className="px-2 py-1 border border-gray-300 rounded w-full text-sm"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.rate}
                          onChange={(e) => handleUpdateLineItem(index, 'rate', parseFloat(e.target.value))}
                          className="px-2 py-1 border border-gray-300 rounded w-full text-sm"
                        />
                      </td>
                      <td className="px-4 py-2 font-medium text-sm">
                        {item.is_deduction ? (
                          <span className="text-red-600">-£{item.amount.toFixed(2)}</span>
                        ) : (
                          `£${item.amount.toFixed(2)}`
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <button
                          onClick={() => handleRemoveLineItem(index)}
                          className="text-red-600 hover:text-red-800 transition-colors text-sm"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            {/* Mobile Card View - Shown on Mobile */}
            <div className="lg:hidden space-y-4">
              {lineItems.map((item, index) => (
                <div key={index} className={`border rounded-lg p-4 ${item.is_deduction ? 'bg-red-50 border-red-200' : 'bg-white'}`}>
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex-1">
                      <div className="font-medium text-gray-900 mb-1">
                        {item.description || "Enter description..."}
                      </div>
                      <div className={`text-lg font-bold ${item.is_deduction ? 'text-red-600' : 'text-gray-900'}`}>
                        {item.is_deduction ? '-' : ''}£{item.amount.toFixed(2)}
                      </div>
                    </div>
                    <button
                      onClick={() => handleRemoveLineItem(index)}
                      className="text-red-600 hover:text-red-800 transition-colors text-sm ml-2"
                    >
                      Remove
                    </button>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Type</label>
                      <select
                        value={item.is_deduction ? 'deduction' : item.item_type}
                        onChange={(e) => {
                          const isDeduction = e.target.value === 'deduction';
                          handleUpdateLineItem(index, 'is_deduction', isDeduction);
                          handleUpdateLineItem(index, 'item_type', isDeduction ? 'deduction' : e.target.value);
                        }}
                        className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                      >
                        <option value="">Select Type</option>
                        <option value="group">Group</option>
                        <option value="camp">Camp</option>
                        <option value="admin">Admin</option>
                        <option value="other">Other</option>
                        <option value="deduction">Deduction</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Date</label>
                      <input
                        type="date"
                        value={item.date}
                        onChange={(e) => handleUpdateLineItem(index, 'date', e.target.value)}
                        className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                      />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Hours</label>
                      <input
                        type="number"
                        min="0.25"
                        step="0.25"
                        value={item.hours}
                        onChange={(e) => handleUpdateLineItem(index, 'hours', parseFloat(e.target.value))}
                        className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Rate (£)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.rate}
                        onChange={(e) => handleUpdateLineItem(index, 'rate', parseFloat(e.target.value))}
                        className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                      />
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
                    <input
                      type="text"
                      value={item.description}
                      onChange={(e) => handleUpdateLineItem(index, 'description', e.target.value)}
                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                      placeholder="Enter description"
                    />
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
        
        {/* Totals Summary */}
        {lineItems.length > 0 && (
          <div className="mt-4 p-4 bg-gray-100 rounded-lg">
            <div className="flex justify-between text-sm mb-1">
              <span>Subtotal:</span>
              <span className="font-medium">£{subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm mb-1">
              <span>Deductions:</span>
              <span className="font-medium text-red-600">-£{deductions.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-base font-bold pt-2 border-t border-gray-300">
              <span>Total:</span>
              <span>£{total.toFixed(2)}</span>
            </div>
          </div>
        )}
      </div>
      
      {/* Notes */}
      <div className="mb-6">
        <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
          Notes
        </label>
        <textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          className="w-full px-3 py-2 border border-gray-300 rounded"
          placeholder="Add any notes or comments about this invoice..."
        />
      </div>
      
      {/* Save button */}
      <div className="flex justify-end">
        <button 
          onClick={handleSave}
          disabled={saving}
          className={`w-full sm:w-auto px-6 py-2 rounded text-white ${
            saving ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
          } transition-colors`}
        >
          {saving ? 'Saving...' : 'Save Invoice'}
        </button>
      </div>
    </div>
  );
};

export default InvoiceEditor;