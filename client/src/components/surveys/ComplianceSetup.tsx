import React, { useState, useEffect } from 'react';
import { Alert, AlertDescription } from '../ui/alert';

interface ComplianceStatus {
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

interface LIATemplate {
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

interface ComplianceSetupProps {
  clubId: number;
  clubName: string;
  onComplete?: () => void;
}

const ComplianceSetup: React.FC<ComplianceSetupProps> = ({ clubId, clubName, onComplete }) => {
  const [compliance, setCompliance] = useState<ComplianceStatus | null>(null);
  const [liaTemplate, setLiaTemplate] = useState<LIATemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [saving, setSaving] = useState(false);

  // LIA Form State
  const [liaForm, setLiaForm] = useState({
    purpose_statement: '',
    balancing_assessment: '',
    safeguards: [] as string[],
    admin_confirmation: false
  });

  // Privacy Policy Form State
  const [privacyForm, setPrivacyForm] = useState({
    privacy_policy_updated: false,
    privacy_policy_url: ''
  });

  useEffect(() => {
    fetchComplianceStatus();
    fetchLiaTemplate();
  }, [clubId]);

  const fetchComplianceStatus = async () => {
    try {
      const response = await fetch(`/api/clubs/${clubId}/compliance/status`);
      if (response.ok) {
        const data = await response.json();
        setCompliance(data.compliance);
        
        // Set current step based on completion status
        if (!data.compliance.lia_completed) {
          setCurrentStep(1);
        } else if (!data.compliance.privacy_policy_updated) {
          setCurrentStep(2);
        } else if (!data.compliance.surveys_enabled) {
          setCurrentStep(3);
        } else {
          setCurrentStep(4); // Completed
        }
      } else {
        throw new Error('Failed to fetch compliance status');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const fetchLiaTemplate = async () => {
    try {
      const response = await fetch(`/api/clubs/${clubId}/compliance/lia-template`);
      if (response.ok) {
        const data = await response.json();
        setLiaTemplate(data.template);
        
        // Pre-fill with examples if empty
        if (!liaForm.purpose_statement) {
          setLiaForm(prev => ({
            ...prev,
            purpose_statement: data.template.purpose_statement.example,
            balancing_assessment: data.template.balancing_assessment.example
          }));
        }
      }
    } catch (err) {
      console.error('Failed to fetch LIA template:', err);
    }
  };

  const submitLIA = async () => {
    if (!liaForm.admin_confirmation) {
      setError('You must confirm completion of the assessment');
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(`/api/clubs/${clubId}/compliance/lia`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(liaForm)
      });

      if (response.ok) {
        await fetchComplianceStatus();
        setCurrentStep(2);
      } else {
        const data = await response.json();
        throw new Error(data.error || 'Failed to submit LIA');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  const updatePrivacyPolicy = async () => {
    if (!privacyForm.privacy_policy_updated) {
      setError('You must confirm that the privacy policy has been updated');
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(`/api/clubs/${clubId}/compliance/privacy-policy`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(privacyForm)
      });

      if (response.ok) {
        await fetchComplianceStatus();
        setCurrentStep(3);
      } else {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update privacy policy status');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  // In the enableSurveys function, add the onComplete call:
  const enableSurveys = async () => {
    setSaving(true);
    try {
      const response = await fetch(`/api/clubs/${clubId}/compliance/enable-surveys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (response.ok) {
        await fetchComplianceStatus();
        setCurrentStep(4);
        onComplete?.(); // Add this line to call the parent callback
      } else {
        const data = await response.json();
        throw new Error(data.error || 'Failed to enable surveys');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  const handleSafeguardToggle = (safeguard: string) => {
    setLiaForm(prev => ({
      ...prev,
      safeguards: prev.safeguards.includes(safeguard)
        ? prev.safeguards.filter(s => s !== safeguard)
        : [...prev.safeguards, safeguard]
    }));
  };

  if (loading) {
    return <div className="flex justify-center p-8">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
    </div>;
  }

  if (!compliance) {
    return <div className="text-red-600 p-4">Failed to load compliance status</div>;
  }

  // If already compliant, show summary
  if (compliance.is_compliant && currentStep === 4) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-green-50 border border-green-200 rounded-lg p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <svg className="h-8 w-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-lg font-medium text-green-800">Surveys Enabled!</h3>
              <p className="text-green-700">
                {clubName} is now fully compliant and can use the survey feature.
              </p>
              <p className="text-sm text-green-600 mt-1">
                Completed on {compliance.surveys_enabled_at && new Date(compliance.surveys_enabled_at).toLocaleDateString()}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Survey Compliance Setup</h1>
        <p className="text-gray-600 mt-2">
          Complete these steps to enable GDPR-compliant surveys for {clubName}
        </p>
      </div>

      {/* Progress Bar */}
      <div className="mb-8">
        <div className="flex items-center">
          {[1, 2, 3].map((step) => (
            <React.Fragment key={step}>
              <div className={`flex items-center justify-center w-8 h-8 rounded-full ${
                currentStep >= step ? 'bg-blue-600 text-white' : 'bg-gray-300 text-gray-600'
              }`}>
                {currentStep > step ? (
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                ) : (
                  step
                )}
              </div>
              {step < 3 && (
                <div className={`flex-auto border-t-2 ${
                  currentStep > step ? 'border-blue-600' : 'border-gray-300'
                }`} />
              )}
            </React.Fragment>
          ))}
        </div>
        <div className="flex justify-between text-xs text-gray-500 mt-2">
          <span>Legal Assessment</span>
          <span>Privacy Policy</span>
          <span>Enable Surveys</span>
        </div>
        <div className="text-center mt-2">
          <span className="text-sm font-medium text-gray-700">
            {compliance.compliance_percentage}% Complete
          </span>
        </div>
      </div>

      {error && (
        <Alert className="mb-6 border-red-200 bg-red-50">
          <AlertDescription className="text-red-700">
            {error}
          </AlertDescription>
        </Alert>
      )}

      {/* Step 1: Legitimate Interest Assessment */}
      {currentStep === 1 && liaTemplate && (
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Step 1: Legitimate Interest Assessment (LIA)
          </h2>
          <p className="text-gray-600 mb-6">
            Complete this assessment to establish the legal basis for collecting customer feedback.
          </p>

          <div className="space-y-6">
            {/* Purpose Statement */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {liaTemplate.purpose_statement.label}
              </label>
              <p className="text-sm text-gray-500 mb-2">{liaTemplate.purpose_statement.help_text}</p>
              <textarea
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={4}
                value={liaForm.purpose_statement}
                onChange={(e) => setLiaForm(prev => ({...prev, purpose_statement: e.target.value}))}
                placeholder={liaTemplate.purpose_statement.example}
              />
            </div>

            {/* Balancing Assessment */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {liaTemplate.balancing_assessment.label}
              </label>
              <p className="text-sm text-gray-500 mb-2">{liaTemplate.balancing_assessment.help_text}</p>
              <textarea
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={4}
                value={liaForm.balancing_assessment}
                onChange={(e) => setLiaForm(prev => ({...prev, balancing_assessment: e.target.value}))}
                placeholder={liaTemplate.balancing_assessment.example}
              />
            </div>

            {/* Safeguards */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {liaTemplate.safeguards.label}
              </label>
              <p className="text-sm text-gray-500 mb-3">{liaTemplate.safeguards.help_text}</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {liaTemplate.safeguards.options.map((safeguard) => (
                  <label key={safeguard} className="flex items-center">
                    <input
                      type="checkbox"
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      checked={liaForm.safeguards.includes(safeguard)}
                      onChange={() => handleSafeguardToggle(safeguard)}
                    />
                    <span className="ml-2 text-sm text-gray-700">{safeguard}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Admin Confirmation */}
            <div className="border-t pt-4">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  checked={liaForm.admin_confirmation}
                  onChange={(e) => setLiaForm(prev => ({...prev, admin_confirmation: e.target.checked}))}
                />
                <span className="ml-2 text-sm text-gray-700">
                  I confirm that I have carefully considered the above assessment and believe it represents a balanced view of our legitimate interests versus individual privacy rights.
                </span>
              </label>
            </div>

            <button
              onClick={submitLIA}
              disabled={saving || !liaForm.admin_confirmation}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving...' : 'Complete Assessment'}
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Privacy Policy Update */}
      {currentStep === 2 && (
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Step 2: Privacy Policy Update
          </h2>
          <p className="text-gray-600 mb-6">
            Update your privacy policy to include information about survey data collection.
          </p>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <h3 className="font-medium text-blue-900 mb-2">Required Privacy Policy Updates:</h3>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• Purpose of survey data collection (customer feedback)</li>
              <li>• Legal basis (legitimate interests)</li>
              <li>• Data retention period ({compliance.requires_review ? '2 years' : 'As configured'})</li>
              <li>• Right to opt-out of surveys</li>
              <li>• Contact information for data protection queries</li>
            </ul>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Privacy Policy URL (Optional)
              </label>
              <input
                type="url"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={privacyForm.privacy_policy_url}
                onChange={(e) => setPrivacyForm(prev => ({...prev, privacy_policy_url: e.target.value}))}
                placeholder="https://your-club-website.com/privacy-policy"
              />
            </div>

            <div className="border-t pt-4">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  checked={privacyForm.privacy_policy_updated}
                  onChange={(e) => setPrivacyForm(prev => ({...prev, privacy_policy_updated: e.target.checked}))}
                />
                <span className="ml-2 text-sm text-gray-700">
                  I confirm that our privacy policy has been updated to include the required information about survey data collection.
                </span>
              </label>
            </div>

            <button
              onClick={updatePrivacyPolicy}
              disabled={saving || !privacyForm.privacy_policy_updated}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving...' : 'Confirm Privacy Policy Update'}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Enable Surveys */}
      {currentStep === 3 && (
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Step 3: Enable Survey Feature
          </h2>
          <p className="text-gray-600 mb-6">
            You're ready to enable the survey feature for {clubName}!
          </p>

          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
            <div className="flex">
              <svg className="h-5 w-5 text-green-400 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-green-800">Compliance Complete</h3>
                <p className="text-sm text-green-700 mt-1">
                  All GDPR requirements have been satisfied. You can now safely collect customer feedback.
                </p>
              </div>
            </div>
          </div>

          <button
            onClick={enableSurveys}
            disabled={saving}
            className="w-full bg-green-600 text-white py-3 px-4 rounded-md hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-medium"
          >
            {saving ? 'Enabling...' : 'Enable Survey Feature'}
          </button>
        </div>
      )}
    </div>
  );
};

export default ComplianceSetup;