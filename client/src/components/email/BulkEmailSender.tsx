import React, { useState, useEffect } from 'react';
import { AlertCircle, Send, X, Eye, ArrowLeft, Mail, AlertTriangle, CheckCircle, ChevronDown } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '../../components/ui/alert';
import { getClubConfig } from '../../types/clubs';
import { Loader2 } from 'lucide-react';

interface EmailRecipient {
  student_name: string;
  contact_email: string;
  report_id: number;
  email_sent: boolean;
  email_sent_at?: string;
  last_email_status?: string;
  group_name?: string;
  recommended_group?: string;
  booking_date?: string;
  coach_name?: string;
  term_name?: string;
  tennis_club?: string;
  email_attempts?: number;
}

interface BulkEmailSenderProps {
  periodId: number;
  clubName: string;
  onClose: () => void;
}

const BulkEmailSender: React.FC<BulkEmailSenderProps> = ({ periodId, clubName, onClose }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [emailSubject, setEmailSubject] = useState('');
  const [emailMessage, setEmailMessage] = useState('');
  const [successCount, setSuccessCount] = useState(0);
  const [errorCount, setErrorCount] = useState(0);
  const [recipients, setRecipients] = useState<EmailRecipient[]>([]);
  const [currentStep, setCurrentStep] = useState<'compose' | 'preview' | 'confirm' | 'sending'>('compose');
  const [selectedReport, setSelectedReport] = useState<number | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [sendingProgress, setSendingProgress] = useState(0);
  const [totalToSend, setTotalToSend] = useState(0);
  const [skippedEmails, setSkippedEmails] = useState<string[]>([]);

  // Get club-specific templates with better error handling
  const clubConfig = getClubConfig(clubName || '');
  const emailTemplates = clubConfig?.emailTemplates || [];
  
  // Debug log to verify which templates are being loaded
  console.log('Club Name:', clubName);
  console.log('Club Config:', clubConfig);
  console.log('Email Templates:', emailTemplates);
  console.log('Is Wilton:', clubName?.toLowerCase().includes('wilton'));

  useEffect(() => {
    const fetchRecipients = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/reports/email-status/${periodId}`);
        if (!response.ok) throw new Error('Failed to fetch report status');
        const data = await response.json();
        setRecipients(data.reports);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load recipients');
      } finally {
        setLoading(false);
      }
    };

    if (periodId) {
      fetchRecipients();
    }
  }, [periodId]);

  const handleSelectTemplate = (template: typeof emailTemplates[0]) => {
    setEmailSubject(template.subject);
    setEmailMessage(template.message);
    setShowTemplates(false);
  };

  const handlePreview = (reportId: number) => {
    setSelectedReport(reportId);
    setCurrentStep('preview');
  };

  const handleSendSingle = async (reportId: number) => {
    try {
        setLoading(true);
        const response = await fetch(`/api/reports/send-email/${reportId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                subject: emailSubject,
                message: emailMessage,
            }),
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to send email');
        }

        const data = await response.json();
        
        // Update the recipients list with new email status
        setRecipients((prev) =>
            prev.map((r) => {
                if (r.report_id === reportId) {
                    return {
                        ...r,
                        email_sent: true,
                        email_sent_at: data.email_sent_at,
                        last_email_status: data.last_email_status,
                        email_attempts: data.email_attempts
                    };
                }
                return r;
            })
        );

        setSuccessCount((prev) => prev + 1);
    } catch (err) {
        setErrorCount((prev) => prev + 1);
        setError(err instanceof Error ? err.message : 'Failed to send email');
    } finally {
        setLoading(false);
        setSelectedReport(null);
        setCurrentStep('compose');
    }
  };

  const handleSendAll = async () => {
    try {
      setLoading(true);
      setCurrentStep('sending');
      setSkippedEmails([]);
  
      // Only get recipients that haven't been sent emails
      const unsentRecipients = recipients.filter((r) => !r.email_sent);
      setTotalToSend(unsentRecipients.length);
      setSendingProgress(0);
      
      let successCount = 0;
      let errorCount = 0;
      const skippedEmailsList: string[] = [];
  
      for (let i = 0; i < unsentRecipients.length; i++) {
        try {
          const response = await fetch(`/api/reports/send-email/${unsentRecipients[i].report_id}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              subject: emailSubject,
              message: emailMessage,
            }),
          });
  
          const data = await response.json();
  
          if (response.ok) {
            successCount++;
            // Update the recipients list to mark this email as sent
            setRecipients(prev => prev.map(r => {
              if (r.report_id === unsentRecipients[i].report_id) {
                return {
                  ...r,
                  email_sent: true,
                  email_sent_at: new Date().toISOString(),
                  last_email_status: 'Success'
                };
              }
              return r;
            }));
          } else {
            if (data.error && data.error.includes('not verified')) {
              skippedEmailsList.push(unsentRecipients[i].student_name);
              setRecipients(prev => prev.map(r => {
                if (r.report_id === unsentRecipients[i].report_id) {
                  return {
                    ...r,
                    last_email_status: 'Skipped: Email not verified'
                  };
                }
                return r;
              }));
            } else {
              errorCount++;
              setRecipients(prev => prev.map(r => {
                if (r.report_id === unsentRecipients[i].report_id) {
                  return {
                    ...r,
                    last_email_status: `Failed: ${data.error || 'Unknown error'}`
                  };
                }
                return r;
              }));
            }
          }
        } catch (error) {
          errorCount++;
          const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
          setRecipients(prev => prev.map(r => {
            if (r.report_id === unsentRecipients[i].report_id) {
              return {
                ...r,
                last_email_status: `Failed: ${errorMessage}`
              };
            }
            return r;
          }));
        } finally {
          setSendingProgress(i + 1);
        }
      }
  
      setSuccess(true);
      setSuccessCount(successCount);
      setErrorCount(errorCount);
      setSkippedEmails(skippedEmailsList);
    } finally {
      setLoading(false);
    }
  };

  const validateEmail = () => {
    if (!emailSubject.trim()) {
      setError('Please enter an email subject');
      return false;
    }
    if (!emailMessage.trim()) {
      setError('Please enter an email message');
      return false;
    }
    return true;
  };

  const handleConfirmSend = () => {
    if (!validateEmail()) return;
    setCurrentStep('confirm');
  };

  const renderPreviewWithPlaceholders = () => {
    const selectedRecipient = recipients.find(r => r.report_id === selectedReport);
    
    // Helper function to safely format dates
    const formatDate = (date: string | undefined | null) => {
      if (!date) return '';
      try {
        return new Date(date).toLocaleDateString('en-GB', { 
          weekday: 'long',
          day: '2-digit',
          month: 'long'
        });
      } catch {
        return '';
      }
    };
  
    // Replace all placeholders with actual values or empty strings
    const previewMessage = emailMessage
      .replace(/\{student_name\}/g, selectedRecipient?.student_name || '')
      .replace(/\{group_name\}/g, selectedRecipient?.group_name || '')
      .replace(/\{recommended_group\}/g, selectedRecipient?.recommended_group || '')
      .replace(/\{booking_date\}/g, formatDate(selectedRecipient?.booking_date))
      .replace(/\{coach_name\}/g, selectedRecipient?.coach_name || '')
      .replace(/\{term_name\}/g, selectedRecipient?.term_name || '')
      .replace(/\{tennis_club\}/g, selectedRecipient?.tennis_club || '');
  
    return (
      <div className="mt-4 p-4 bg-yellow-50 rounded-lg">
        <h4 className="font-medium text-yellow-900">Preview with Placeholders</h4>
        <div className="mt-2 text-sm text-yellow-800">
          <p>Message with replaced placeholders:</p>
          <div className="mt-2 p-3 bg-white rounded whitespace-pre-wrap font-mono">
            {previewMessage}
          </div>
          <div className="mt-4 text-xs">
            <p className="font-medium mb-2">Available Placeholders:</p>
            <ul className="space-y-1 list-disc pl-4">
              <li>{'{student_name}'} - {selectedRecipient?.student_name || '(not set)'}</li>
              <li>{'{group_name}'} - {selectedRecipient?.group_name || '(not set)'}</li>
              <li>{'{recommended_group}'} - {selectedRecipient?.recommended_group || '(not set)'}</li>
              <li>{'{booking_date}'} - {formatDate(selectedRecipient?.booking_date) || '(not set)'}</li>
              <li>{'{coach_name}'} - {selectedRecipient?.coach_name || '(not set)'}</li>
              <li>{'{term_name}'} - {selectedRecipient?.term_name || '(not set)'}</li>
              <li>{'{tennis_club}'} - {selectedRecipient?.tennis_club || '(not set)'}</li>
            </ul>
          </div>
        </div>
      </div>
    );
  };
  
  // Update the renderPreview function to include the new preview component
  const renderPreview = () => (
    <div className="space-y-6">
        <button
            onClick={() => setCurrentStep('compose')}
            className="flex items-center text-gray-600 hover:text-gray-900"
        >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Compose
        </button>

        <div className="bg-white rounded-lg border p-6 space-y-4">
            <div>
                <h3 className="text-lg font-medium mb-4">Email Preview</h3>

                {/* Recipient Details */}
                {selectedReport && (
                    <div className="mb-4 p-4 bg-blue-50 rounded-lg">
                        <h4 className="font-medium text-blue-900">Recipient</h4>
                        <div className="text-sm text-blue-800">
                            {recipients.find(r => r.report_id === selectedReport)?.email_sent && (
                                <div className="mt-2">
                                    <p>Previously sent: {new Date(recipients.find(r => r.report_id === selectedReport)?.email_sent_at!).toLocaleDateString()}</p>
                                    <p>Status: {recipients.find(r => r.report_id === selectedReport)?.last_email_status}</p>
                                    <p>Attempts: {recipients.find(r => r.report_id === selectedReport)?.email_attempts}</p>
                                </div>
                            )}
                            <p className="mt-1">
                                {recipients.find(r => r.report_id === selectedReport)?.student_name}
                                <br />
                                {recipients.find(r => r.report_id === selectedReport)?.contact_email}
                            </p>
                        </div>
                    </div>
                )}
  
          {/* Email Content */}
          <div className="space-y-4">
            <div>
              <span className="font-medium">Subject:</span>
              <p className="mt-1 p-3 bg-gray-50 rounded-md text-gray-700">
                {emailSubject}
              </p>
            </div>
            <div>
              <span className="font-medium">Message:</span>
              <div className="mt-1 p-4 bg-gray-50 rounded-md whitespace-pre-wrap">
                {emailMessage}
              </div>
            </div>
  
            {/* Render new placeholder preview */}
            {renderPreviewWithPlaceholders()}
          </div>
        </div>
  
        <div className="flex justify-end space-x-3 mt-6">
          <button
            onClick={() => setCurrentStep('compose')}
            className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
          >
            Back
          </button>
          <button
            onClick={() => {
              if (selectedReport) {
                handleSendSingle(selectedReport);
              }
            }}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
          >
            <Send className="w-4 h-4" />
            {loading ? 'Sending...' : 'Send Email'}
          </button>
        </div>
      </div>
    </div>
  );

  const renderEmailTemplates = () => (
    <div className="relative mt-2">
      <div className="absolute z-10 w-full mt-1 bg-white border rounded-md shadow-lg">
        <div className="py-2">
          {emailTemplates.map((template, index) => (
            <button
              key={index}
              className="w-full px-4 py-2 text-left hover:bg-gray-100"
              onClick={() => handleSelectTemplate(template)}
            >
              <div className="font-medium">{template.name}</div>
              <div className="text-sm text-gray-500 truncate">{template.subject}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  const renderCompose = () => (
    <div className="space-y-6">
      <div className="relative">
        <button
          onClick={() => setShowTemplates(!showTemplates)}
          className="w-full px-4 py-2 text-left bg-white border rounded-md shadow-sm hover:bg-gray-50 flex justify-between items-center"
        >
          <span>Select Email Template</span>
          <ChevronDown className="w-4 h-4" />
        </button>
        {showTemplates && renderEmailTemplates()}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">
          Email Subject
        </label>
        <input
          type="text"
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          value={emailSubject}
          onChange={(e) => setEmailSubject(e.target.value)}
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">
          Email Message
        </label>
        <textarea
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          rows={6}
          value={emailMessage}
          onChange={(e) => setEmailMessage(e.target.value)}
          required
        />
        <p className="mt-2 text-sm text-gray-500">
          Available placeholders: {'{student_name}, {group_name}, {recommended_group}, {coach_name}, {term_name}, {booking_date}'}
        </p>
      </div>

      <div className="mt-6">
            <h3 className="text-lg font-medium mb-4">Recipients ({recipients.length})</h3>
            <div className="space-y-3 max-h-96 overflow-y-auto">
                {recipients.map((recipient) => (
                    <div
                        key={recipient.report_id}
                        className="flex items-center justify-between p-3 bg-white border rounded-lg"
                    >
                        <div>
                            <p className="font-medium">{recipient.student_name}</p>
                            <p className="text-sm text-gray-500">{recipient.contact_email}</p>
                            {recipient.email_sent && (
                                <div className="text-sm">
                                    <p className="text-green-600">
                                        Last sent: {new Date(recipient.email_sent_at!).toLocaleDateString()}
                                    </p>
                                    <p className="text-gray-600">
                                        Status: {recipient.last_email_status}
                                    </p>
                                    <p className="text-gray-600">
                                        Attempts: {recipient.email_attempts || 0}
                                    </p>
                                </div>
                            )}
                        </div>
                        <button
                            type="button"
                            onClick={() => handlePreview(recipient.report_id)}
                            disabled={loading}
                            className="ml-4 p-2 text-gray-400 hover:text-gray-600 disabled:opacity-50"
                        >
                            <Eye className="w-5 h-5" />
                        </button>
                    </div>
                ))}
            </div>
        </div>

      <div className="flex justify-end space-x-3">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          onClick={handleConfirmSend}
          disabled={loading || !recipients.some((r) => !r.email_sent)}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
        >
          <Mail className="w-4 h-4" />
          Preview & Send All
        </button>
      </div>
    </div>
  );

  const renderConfirmation = () => (
    <div className="space-y-6">
      <Alert>
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Confirm Email Send</AlertTitle>
        </div>
        <AlertDescription>
          You are about to send {recipients.filter(r => !r.email_sent).length} emails. 
          This action cannot be undone. Are you sure you want to continue?
        </AlertDescription>
      </Alert>

      <div className="bg-gray-50 p-4 rounded-lg">
        <h4 className="font-medium text-gray-900 mb-2">Email Summary</h4>
        <div className="space-y-2">
          <p><strong>Subject:</strong> {emailSubject}</p>
          <p><strong>Recipients:</strong> {recipients.filter(r => !r.email_sent).length}</p>
          <div>
            <strong>Message Preview:</strong>
            <div className="mt-2 p-3 bg-white rounded-md whitespace-pre-wrap">
              {emailMessage}
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end space-x-3">
        <button
          onClick={() => setCurrentStep('compose')}
          className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
        >
          Back
        </button>
        <button
          onClick={handleSendAll}
          disabled={loading}
          className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
        >
          <Send className="w-4 h-4" />
          {loading ? 'Sending...' : 'Confirm & Send'}
        </button>
      </div>
    </div>
  );

  const renderSuccess = () => (
    <div className="text-center py-6">
      <div className="mb-4">
        <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100">
          <CheckCircle className="h-6 w-6 text-green-600" />
        </div>
      </div>
      <h3 className="text-lg font-medium text-gray-900 mb-2">Reports Sent!</h3>
      <div className="text-sm text-gray-500 space-y-2">
        <p>Successfully sent: {successCount}</p>
        <p>Failed: {errorCount}</p>
        {skippedEmails.length > 0 && (
          <div className="mt-4">
            <p className="font-medium text-amber-600">Skipped Emails:</p>
            <div className="mt-2 max-h-40 overflow-y-auto">
              {skippedEmails.map((name, index) => (
                <p key={index} className="text-amber-600">
                  {name} - Email not verified
                </p>
              ))}
            </div>
          </div>
        )}
      </div>
      <button
        onClick={onClose}
        className="mt-6 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
      >
        Close
      </button>
    </div>
  );

  const renderSendingProgress = () => (
    <div className="space-y-6">
      <div className="text-center py-8">
        <div className="mb-4">
          <div className="mx-auto flex items-center justify-center h-12 w-12">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          </div>
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-4">
          Sending Reports...
        </h3>
        
        {/* Progress Details */}
        <div className="max-w-md mx-auto">
          <div className="mb-2 flex justify-between text-sm text-gray-600">
            <span>Progress</span>
            <span>{sendingProgress} of {totalToSend}</span>
          </div>
          
          {/* Progress Bar */}
          <div className="w-full bg-gray-200 rounded-full h-2.5">
            <div 
              className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
              style={{ width: `${(sendingProgress / totalToSend) * 100}%` }}
            />
          </div>
          
          {/* Status Message */}
          <p className="mt-4 text-sm text-gray-500">
            Sending email {sendingProgress} of {totalToSend}
          </p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <Card className="w-full max-w-3xl max-h-screen overflow-y-auto">
        <CardHeader className="flex justify-between items-center sticky top-0 bg-white z-10">
          <CardTitle>{`Send ${clubConfig.name} Reports`}</CardTitle>
          <button 
            onClick={onClose} 
            className="text-gray-500 hover:text-gray-700"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {success ? renderSuccess() :
          currentStep === 'confirm' ? renderConfirmation() :
          currentStep === 'preview' ? renderPreview() :
          currentStep === 'sending' ? renderSendingProgress() :
          renderCompose()}
        </CardContent>
      </Card>
    </div>
  );
};

export default BulkEmailSender;