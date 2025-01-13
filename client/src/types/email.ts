// src/types/email.ts
  
export interface BulkEmailFormData {
  teachingPeriod: number | null;
  templateId: number;
  bookingDate: string;
  bookingTime: string;
  bookingPassword: string;
}

  export interface EmailTemplate {
    name: string;
    subject: string;
    message: string;
  }
  
  export interface EmailRecipient {
    student_name: string;
    contact_email: string;
    report_id: number;
    email_sent: boolean;
    email_sent_at?: string;
    last_email_status?: string;
    group_name?: string;
  }