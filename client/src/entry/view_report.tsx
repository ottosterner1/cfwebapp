// src/entry/view_report.tsx
import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import ReportPreview from '../components/reports/ReportPreview';
import '../index.css';

const ViewReportApp = () => {
  const [report, setReport] = useState<any>(null);
  const [template, setTemplate] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Get report ID from the DOM
  const rootElement = document.getElementById('view-report-root');
  const reportId = rootElement?.dataset.reportId;

  useEffect(() => {
    const fetchReport = async () => {
      try {
        const response = await fetch(`/api/reports/${reportId}`);
        if (!response.ok) throw new Error('Failed to fetch report');
        const data = await response.json();
        setReport(data.report);
        setTemplate(data.template);
      } catch (err) {
        setError((err as Error).message);
        console.error('Error fetching report:', err);
      } finally {
        setLoading(false);
      }
    };

    if (reportId) {
      fetchReport();
    }
  }, [reportId]);

  if (loading) return <div className="flex justify-center items-center p-8">Loading...</div>;
  if (error) return <div className="text-red-500 p-4">Error: {error}</div>;
  if (!report || !template) return <div className="p-4">No report available</div>;

  return (
    <div className="p-4">
      <div className="mb-4 flex justify-end space-x-4">
        <button
          onClick={() => window.location.href = '/dashboard'}
          className="px-4 py-2 border rounded-md hover:bg-gray-50"
        >
          Back to Dashboard
        </button>
        {report.canEdit && (
          <a
            href={`/api/reports/${reportId}/edit`}
            className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
          >
            Edit Report
          </a>
        )}
      </div>
      <ReportPreview report={report} template={template} />
    </div>
  );
};

const container = document.getElementById('view-report-root');
if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <ViewReportApp />
    </React.StrictMode>
  );
}