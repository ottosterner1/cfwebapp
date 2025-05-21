// client/src/types/invoice.ts

export type InvoiceStatus = 'draft' | 'submitted' | 'approved' | 'rejected' | 'paid';
export type RateType = 'lead' | 'assistant' | 'admin' | 'other';

export interface CoachRate {
  id: number;
  rate_name: string;
  hourly_rate: number;
}

export interface InvoiceLineItem {
  id?: number;
  register_id?: number;
  item_type: string;
  is_deduction: boolean;
  description: string;
  date: string;
  hours: number;
  rate: number;
  amount: number;
  notes?: string;
}

export interface Invoice {
  id: number;
  invoice_number: string;
  coach_id: number;
  coach_name: string;
  month: number;
  month_name: string;
  year: number;
  status: InvoiceStatus;
  subtotal: number;
  deductions: number;
  total: number;
  notes?: string;
  created_at: string;
  submitted_at?: string;
  approved_at?: string;
  paid_at?: string;  // Add this line
}

export interface InvoiceDetail extends Invoice {
  line_items: InvoiceLineItem[];
}

export interface InvoiceGenerateResponse {
  invoice_id: number;
  status: InvoiceStatus;
  message: string;
}

export interface InvoiceMonthSummary {
  year: number;
  month: number;
  month_name: string;
  has_invoice: boolean;
  total_lead_sessions: number;
  total_assist_sessions: number;
}

export interface CoachingRate {
  id: number;
  coach_id: number;
  rate_name: string;
  rate_type?: RateType;
  hourly_rate: number;
}

export interface Coach {
  id: number;
  name: string;
  email: string;
}