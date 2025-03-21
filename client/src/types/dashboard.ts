// src/types/dashboard.ts

export interface Group {
  id: number;
  name: string;
  description?: string;
}

export interface TemplateField {
  id?: number;
  name: string;
  description?: string;
  fieldType: 'text' | 'textarea' | 'rating' | 'select' | 'progress';
  isRequired: boolean;
  order: number;
  options?: {
    min?: number;
    max?: number;
    options?: string[];
  } | null;
}

export interface TemplateSection {
  id?: number;
  name: string;
  order: number;
  fields: TemplateField[];
}

export interface ReportTemplate {
  id?: number;
  name: string;
  description?: string;
  sections: TemplateSection[];
  isActive: boolean;
  assignedGroups?: { id: number; name: string; }[];
}

export interface GroupTemplate {
  templateId: number;
  groupId: number;
  groupName: string;
  templateName: string;
}

export interface User {
  id: number;
  name: string;
  is_admin: boolean;
  is_super_admin: boolean;
  tennis_club: {
    id: number;
    name: string;
  };
}

export interface TeachingPeriod {
  id: number;
  name: string;
}

interface GroupRecommendation {
  from_group: string;
  to_group: string;
  count: number;
}

export interface DashboardMetrics {
  totalStudents: number;
  totalReports: number;
  submittedReports: number;
  draftReports: number;
  reportCompletion: number;
  currentGroups: GroupProgress[];
  coachSummaries?: CoachSummary[];
  groupRecommendations: GroupRecommendation[];
}

export interface GroupProgress {
  name: string;
  count: number;
  reports_completed: number;
  reports_draft: number;
}

export interface CoachSummary {
  id: number;
  name: string;
  total_assigned: number;
  reports_completed: number;
  reports_draft: number;
}

interface TimeSlot {
  day_of_week: string;
  start_time: string;
  end_time: string;
}

interface TimeSlotInfo {
  day_of_week: string;
  start_time: string;
  end_time: string;
  time_slot_id?: number;
}

interface GroupRecommendation {
  from_group: string;
  to_group: string;
  count: number;
  session?: TimeSlotInfo; 
}

export interface ProgrammePlayer {
  id: number;
  student_name: string;
  group_name: string;
  group_id: number;
  group_time_id: number | null;
  time_slot: TimeSlot | null;
  report_status: 'pending' | 'draft' | 'submitted';
  report_submitted: boolean;
  has_draft: boolean;
  report_id?: number;
  can_edit: boolean;
  has_template: boolean;
  assigned_coach_id: number;
}

export interface Group {
  id: number;
  name: string;
}

export interface FieldOption {
  id: number;
  name: string;
  description?: string;
  fieldType: 'text' | 'number' | 'select' | 'textarea' | 'rating' | 'progress';
  isRequired: boolean;
  options?: {
    min?: number;
    max?: number;
    options?: string[];
  };
  order: number;
}

export interface Section {
  id: number;
  name: string;
  order: number;
  fields: FieldOption[];
}

export interface Template {
  id: number;
  name: string;
  description: string;
  sections: Section[];
}

export interface DynamicReportFormProps {
  template: Template;
  studentName: string;
  dateOfBirth?: string;
  age?: number;
  groupName: string;
  initialData?: {
    content: Record<string, Record<string, string>>;
    recommendedGroupId: number | null;  // Update to allow null
    id?: number;
    submissionDate?: string;
    canEdit?: boolean;
    isDraft?: boolean;
    lastUpdated?: string;
  };
  onSubmit: (data: {
    content: Record<string, Record<string, any>>;
    recommendedGroupId: number | null;  // Update to allow null
    template_id: number;
    is_draft: boolean;
  }) => Promise<void>;
  onCancel: () => void;
  isSubmitting?: boolean;
  onSaveAndNext?: (data: {
    content: Record<string, Record<string, any>>;
    recommendedGroupId: number | null;  // Update to allow null
    template_id: number;
    is_draft: boolean;
  }) => Promise<void>;
  isDraftMode?: boolean;
}


export interface ProgressOptionsProps {
  value: string;
  onChange: (value: string) => void;
  error?: boolean;
  isRequired?: boolean;
  name: string;
}