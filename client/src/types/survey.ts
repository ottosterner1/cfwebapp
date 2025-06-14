// Survey Types for TypeScript

export interface SurveyQuestionType {
    value: string;
    name: string;
    display_name: string;
    description: string;
    default_options: any;
  }
  
  export interface SurveyQuestion {
    id?: number;
    question_text: string;
    question_type: string;
    is_required: boolean;
    order_index: number;
    options?: any;
    help_text?: string;
    default_options?: any;
  }
  
  export interface SurveyTemplate {
    id?: number;
    name: string;
    description?: string;
    purpose_statement: string;
    retention_days: number;
    max_frequency_days: number;
    allow_anonymous: boolean;
    collect_contact_info: boolean;
    send_reminder: boolean;
    reminder_days: number;
    questions: SurveyQuestion[];
    question_count?: number;
    created_at?: string;
    created_by?: string;
  }
  
  export interface SurveyLibraryTemplate {
    name: string;
    description: string;
    purpose_statement: string;
    questions: Array<{
      question_text: string;
      question_type: string;
      is_required: boolean;
      order_index: number;
      options?: any;
    }>;
  }
  
  export interface SurveyCampaign {
    id: number;
    name: string;
    template_name: string;
    status: string;
    trigger_type: string;
    total_recipients: number;
    emails_sent: number;
    emails_delivered: number;
    emails_bounced?: number;
    responses_received: number;
    response_rate: number;
    scheduled_send_date?: string;
    actual_send_date?: string;
    reminder_send_date?: string;
    close_date?: string;
    created_at: string;
    created_by: string;
    teaching_period?: string;
    group?: string;
    template?: {
      id: number;
      name: string;
      question_count: number;
    };
    targeting?: {
      teaching_period?: string;
      group?: string;
      coach?: string;
    };
    statistics?: {
      total_recipients: number;
      emails_sent: number;
      emails_delivered: number;
      emails_bounced: number;
      responses_received: number;
      response_rate: number;
    };
    schedule?: {
      scheduled_send_date?: string;
      actual_send_date?: string;
      reminder_send_date?: string;
      close_date?: string;
    };
  }
  
  export interface SurveyRecipient {
    id: number;
    email: string;
    recipient_name: string;
    student_name: string;
    email_sent_at?: string;
    email_delivered_at?: string;
    email_bounced_at?: string;
    survey_opened_at?: string;
    survey_completed_at?: string;
    reminder_sent_at?: string;
    expires_at: string;
    is_expired: boolean;
  }
  
  export interface SurveyResponse {
    id: number;
    campaign_name: string;
    template_name: string;
    submitted_at: string;
    completion_time_seconds?: number;
    responses: Record<string, any>;
    respondent_type?: string;
    student_age_group?: string;
  }
  
  export interface SurveyContext {
    recipient_name: string;
    student_name: string;
    club_name: string;
  }
  
  export interface RecipientPreview {
    total_eligible: number;
    after_opt_outs: number;
    after_frequency_limits: number;
    final_recipients: number;
    sample_recipients: Array<{
      email: string;
      recipient_name: string;
      student_name: string;
    }>;
    opt_out_count: number;
    frequency_blocked_count: number;
  }
  
  export interface ComplianceStatus {
    lia_completed: boolean;
    lia_completed_at?: string;
    privacy_policy_updated: boolean;
    privacy_policy_updated_at?: string;
    surveys_enabled: boolean;
    surveys_enabled_at?: string;
    is_compliant: boolean;
    compliance_percentage: number;
    requires_review: boolean;
  }
  
  export interface LIATemplate {
    purpose_statement: {
      label: string;
      help_text: string;
      example: string;
      required: boolean;
    };
    balancing_assessment: {
      label: string;
      help_text: string;
      example: string;
      required: boolean;
    };
    safeguards: {
      label: string;
      help_text: string;
      options: string[];
      required: boolean;
    };
  }
  
  export interface DashboardStats {
    surveys_enabled: boolean;
    compliance_status?: number;
    pending_compliance?: boolean;
    stats?: {
      total_templates: number;
      total_campaigns: number;
      active_campaigns: number;
      recent_responses: number;
      total_responses: number;
      opt_out_count: number;
    };
    recent_campaigns?: SurveyCampaign[];
  }
  
  export interface QuestionAnalysis {
    question_id: string;
    question_text: string;
    question_type: string;
    response_count: number;
    analysis: {
      rating_average?: number;
      rating_distribution?: Record<string, number>;
      text_responses?: string[];
      choice_distribution?: Record<string, number>;
      nps_score?: number;
      nps_breakdown?: {
        promoters: number;
        passives: number;
        detractors: number;
      };
    };
  }
  
  // Supporting types from existing system
  export interface TeachingPeriod {
    id: number;
    name: string;
    start_date: string;
    end_date: string;
  }
  
  export interface TennisGroup {
    id: number;
    name: string;
    description?: string;
  }
  
  export interface Coach {
    id: number;
    name: string;
    email: string;
  }
  
  // Form types
  export interface LIAFormData {
    purpose_statement: string;
    balancing_assessment: string;
    safeguards: string[];
    admin_confirmation: boolean;
  }
  
  export interface PrivacyPolicyFormData {
    privacy_policy_updated: boolean;
    privacy_policy_url: string;
  }
  
  export interface NewCampaignFormData {
    name: string;
    template_id: string;
    trigger_type: string;
    teaching_period_id: string;
    group_id: string;
    coach_id: string;
    scheduled_send_date: string;
    close_date: string;
  }
  
  // API Response types
  export interface APIResponse<T = any> {
    message?: string;
    error?: string;
    data?: T;
  }
  
  export interface PaginatedResponse<T> {
    items: T[];
    pagination: {
      page: number;
      pages: number;
      per_page: number;
      total: number;
      has_next: boolean;
      has_prev: boolean;
    };
  }
  
  export interface CampaignListResponse {
    campaigns: SurveyCampaign[];
    pagination: {
      page: number;
      pages: number;
      per_page: number;
      total: number;
      has_next: boolean;
      has_prev: boolean;
    };
  }
  
  export interface TemplateListResponse {
    templates: SurveyTemplate[];
    total: number;
  }
  
  export interface RecipientListResponse {
    recipients: SurveyRecipient[];
    pagination: {
      page: number;
      pages: number;
      per_page: number;
      total: number;
      has_next: boolean;
      has_prev: boolean;
    };
  }
  
  export interface QuestionTypesResponse {
    question_types: SurveyQuestionType[];
  }
  
  export interface LibraryTemplatesResponse {
    templates: SurveyLibraryTemplate[];
  }
  
  export interface ExportDataResponse {
    export_type: string;
    data: any[];
    total_records: number;
  }
  
  // Enums
  export enum SurveyStatus {
    DRAFT = 'draft',
    ACTIVE = 'active',
    PAUSED = 'paused',
    COMPLETED = 'completed',
    ARCHIVED = 'archived'
  }
  
  export enum SurveyTriggerType {
    MANUAL = 'manual',
    END_OF_TERM = 'end_of_term',
    NEW_STUDENT = 'new_student',
    PERIODIC = 'periodic'
  }
  
  export enum QuestionType {
    TEXT = 'text',
    TEXTAREA = 'textarea',
    RATING = 'rating',
    MULTIPLE_CHOICE = 'multiple_choice',
    YES_NO = 'yes_no',
    NPS = 'nps'
  }
  
  // Constants
  export const SURVEY_CONSTANTS = {
    DEFAULT_RETENTION_DAYS: 730, // 2 years
    DEFAULT_MAX_FREQUENCY_DAYS: 90, // Quarterly
    DEFAULT_REMINDER_DAYS: 7,
    MIN_QUESTIONS: 1,
    MAX_QUESTIONS: 50,
    MIN_RATING: 1,
    MAX_RATING: 10,
    NPS_MIN: 0,
    NPS_MAX: 10
  } as const;
  
  // Utility types
  export type SurveyViewMode = 'overview' | 'responses' | 'questions';
  export type DashboardViewMode = 'dashboard' | 'compliance' | 'templates' | 'template-editor' | 'campaigns' | 'results';
  export type ComplianceStep = 1 | 2 | 3 | 4;
  
  // Error types
  export interface SurveyError {
    field?: string;
    message: string;
    code?: string;
  }
  
  // Event types for analytics
  export interface SurveyAnalyticsEvent {
    event_name: string;
    properties?: Record<string, any>;
    timestamp?: string;
  }