// types/reports.ts
import { ReportTemplate } from './dashboard';

export interface DynamicReportFormProps {
  template?: ReportTemplate;
  studentName?: string;
  groupName?: string;
  onSubmit?: (data: Record<string, any>) => Promise<void>;
  onCancel?: () => void;
}

export interface ReportPreviewProps {
  report: {
    studentName: string;
    groupName: string;
    submissionDate: string;
    content: Record<string, Record<string, any>>;
  };
  template: ReportTemplate;
}