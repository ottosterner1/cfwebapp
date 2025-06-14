// Compliance Types for GDPR Survey Feature

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
  
  export interface ComplianceSettings {
    default_retention_days: number;
    privacy_policy_url?: string;
    data_retention_policy_url?: string;
    surveys_enabled: boolean;
    requires_review: boolean;
    compliance_notes?: string;
  }
  
  export interface ComplianceStep {
    id: number;
    title: string;
    description: string;
    completed: boolean;
    current: boolean;
  }
  
  export enum ComplianceStepType {
    LIA = 1,
    PRIVACY_POLICY = 2,
    ENABLE_SURVEYS = 3,
    COMPLETED = 4
  }
  
  export const COMPLIANCE_STEPS: Record<ComplianceStepType, ComplianceStep> = {
    [ComplianceStepType.LIA]: {
      id: 1,
      title: 'Legitimate Interest Assessment',
      description: 'Complete the legal assessment for data collection',
      completed: false,
      current: false
    },
    [ComplianceStepType.PRIVACY_POLICY]: {
      id: 2,
      title: 'Privacy Policy Update',
      description: 'Update your privacy policy to include survey data collection',
      completed: false,
      current: false
    },
    [ComplianceStepType.ENABLE_SURVEYS]: {
      id: 3,
      title: 'Enable Survey Feature',
      description: 'Activate the survey feature for your club',
      completed: false,
      current: false
    },
    [ComplianceStepType.COMPLETED]: {
      id: 4,
      title: 'Surveys Enabled',
      description: 'Survey feature is fully compliant and active',
      completed: true,
      current: false
    }
  };
  
  export const SAFEGUARD_OPTIONS = [
    'Easy opt-out mechanism provided',
    'Anonymous response option available',
    'Limited frequency (maximum quarterly)',
    'Clear purpose statement in all communications',
    'Automatic data deletion after retention period',
    'No sharing of individual responses',
    'Secure data storage and transmission'
  ] as const;
  
  export type SafeguardOption = typeof SAFEGUARD_OPTIONS[number];