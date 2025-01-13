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
}

const EditReportApp: React.FC = () => {
  const [report, setReport] = useState<Report | null>(null);
  const [template, setTemplate] = useState<Template | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

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

      window.location.href = `/reports/${reportId}`;
    } catch (err) {
      console.error('Error updating report:', err);
      throw err;
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

  // Structure the form data to match what DynamicReportForm expects
  const initialFormData = {
    content: report.content, // Ensure this is `Record<string, Record<string, string>>`
    recommendedGroupId: report.recommendedGroupId, // Ensure this is a number
  };

  console.log('Initial form data:', initialFormData); // Debug log

  return (
    <div className="p-4">
      <div className="mb-4 flex justify-between items-center">
        <h1 className="text-2xl font-bold">Edit Report</h1>
        <button
          onClick={() => setShowDeleteDialog(true)}
          className="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600"
        >
          Delete Report
        </button>
      </div>

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