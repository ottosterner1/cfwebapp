import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import DynamicReportForm from '../components/reports/DynamicReportForm';
import '../index.css';

interface FieldOption {
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

interface Section {
  id: number;
  name: string;
  order: number;
  fields: FieldOption[];
}

interface Template {
  id: number;
  name: string;
  description: string;
  sections: Section[];
}

interface Report {
  id: number;
  studentName: string;
  groupName: string;
  recommendedGroupId: number;
  content: Record<string, Record<string, any>>;
  submissionDate: string;
  canEdit: boolean;
  isDraft: boolean;
  lastUpdated?: string;
}

interface SubmissionResult {
  message: string;
  report_id: number;
  status: 'draft' | 'submitted';
}

const EditReportApp: React.FC = () => {
  const [report, setReport] = useState<Report | null>(null);
  const [template, setTemplate] = useState<Template | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionResult, setSubmissionResult] = useState<SubmissionResult | null>(null);

  const rootElement = document.getElementById('edit-report-root');
  const reportId = rootElement?.dataset.reportId;

  // Fetch report and template data
  useEffect(() => {
    const fetchReportData = async () => {
      try {
        if (!reportId) throw new Error('Report ID not found');

        const response = await fetch(`/api/reports/${reportId}`);
        if (!response.ok) throw new Error('Failed to fetch report');
        
        const data = await response.json();
        console.log('Fetched data:', data); // Debug log
        setReport(data.report);
        setTemplate(data.template);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
        console.error('Error fetching report:', err);
      } finally {
        setLoading(false);
      }
    };

    if (reportId) {
      fetchReportData();
    }
  }, [reportId]);

  // Handle form submission
  const handleSubmit = async (formData: Record<string, any>): Promise<void> => {
    try {
      setIsSubmitting(true);
      if (!reportId) throw new Error('Report ID not found');

      const response = await fetch(`/api/reports/${reportId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update report');
      }

      const result = await response.json();
      setSubmissionResult(result);

      // If not a draft, redirect to view page after a short delay
      if (!formData.is_draft) {
        setTimeout(() => {
          window.location.href = `/reports/${reportId}`;
        }, 1500);
      }
    } catch (err) {
      console.error('Error updating report:', err);
      throw err;
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle report deletion
  const handleDelete = async (): Promise<void> => {
    try {
      if (!reportId) throw new Error('Report ID not found');

      const response = await fetch(`/reports/delete/${reportId}`, { 
        method: 'POST' 
      });

      if (!response.ok) {
        throw new Error('Failed to delete report');
      }

      window.location.href = '/dashboard';
    } catch (err) {
      console.error('Error deleting report:', err);
      setError('Failed to delete report');
    }
  };

  if (loading) {
    return <div className="flex justify-center items-center p-8">Loading...</div>;
  }

  if (error) {
    return <div className="text-red-500 p-4">Error: {error}</div>;
  }

  if (!report || !template) {
    return <div className="p-4">No report available</div>;
  }

  // Show success message after submission
  if (submissionResult) {
    return (
      <div className="max-w-4xl mx-auto p-6 bg-white rounded-lg shadow">
        <div className={`p-4 mb-4 rounded-lg ${submissionResult.status === 'draft' ? 'bg-amber-50 border border-amber-200' : 'bg-green-50 border border-green-200'}`}>
          <h2 className={`text-xl font-bold ${submissionResult.status === 'draft' ? 'text-amber-700' : 'text-green-700'}`}>
            {submissionResult.status === 'draft' ? 'Draft Saved Successfully' : 'Report finalised Successfully'}
          </h2>
          <p className="mt-2">{submissionResult.message}</p>
        </div>
        
        <div className="mt-6 flex gap-4">
          <a 
            href={`/reports/${submissionResult.report_id}`} 
            className={`px-4 py-2 rounded-md ${submissionResult.status === 'draft' ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'}`}
          >
            View Report
          </a>
          {submissionResult.status === 'draft' && (
            <a 
              href={`/reports/${submissionResult.report_id}/edit`} 
              className="px-4 py-2 bg-blue-100 text-blue-800 rounded-md"
            >
              Continue Editing
            </a>
          )}
          <a 
            href="/dashboard" 
            className="px-4 py-2 bg-gray-100 text-gray-800 rounded-md"
          >
            Back to Dashboard
          </a>
        </div>
      </div>
    );
  }

  // Structure the form data to match what DynamicReportForm expects
  const initialFormData = {
    content: report.content,
    recommendedGroupId: report.recommendedGroupId,
    isDraft: report.isDraft,
    submissionDate: report.submissionDate,
    id: report.id,
    lastUpdated: report.lastUpdated
  };

  console.log('Initial form data:', initialFormData); // Debug log

  return (
    <div className="p-4">
      <div className="mb-4 flex justify-between items-center">
        <h1 className="text-2xl font-bold">
          {report.isDraft ? 'Edit Draft Report' : 'Edit Report'}
        </h1>
        
        <button
          onClick={() => setShowDeleteDialog(true)}
          className="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600"
        >
          Delete Report
        </button>
      </div>

      {/* Draft Status Banner */}
      {report.isDraft && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-md">
          <p className="text-amber-800">
            <span className="font-medium">Draft Mode:</span> This report has not been finalised and is not visible to students.
            {report.lastUpdated && (
              <span className="block mt-1 text-sm">
                Last saved: {new Date(report.lastUpdated).toLocaleString()}
              </span>
            )}
          </p>
        </div>
      )}

      {showDeleteDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h2 className="text-lg font-semibold mb-4">Delete Report</h2>
            <p className="mb-6">Are you sure you want to delete this report? This action cannot be undone.</p>
            <div className="flex justify-end gap-4">
              <button
                onClick={() => setShowDeleteDialog(false)}
                className="px-4 py-2 border rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      <DynamicReportForm
        template={template}
        studentName={report.studentName}
        groupName={report.groupName}
        initialData={initialFormData}
        onSubmit={handleSubmit}
        onCancel={() => window.location.href = `/dashboard`}
        isSubmitting={isSubmitting}
        isDraftMode={report.isDraft}
      />
    </div>
  );
};

// Initialize the React application
const container = document.getElementById('edit-report-root');
if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <EditReportApp />
    </React.StrictMode>
  );
}

export default EditReportApp;