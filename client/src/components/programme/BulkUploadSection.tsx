import React, { useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '../../components/ui/alert';
import { Info, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';

interface BulkUploadSectionProps {
  periodId: number | null;
  onSuccess: () => void;
  onCancel: () => void;
}

interface UploadError {
  error: string;
  details?: string | string[];
  warnings?: string[];
  errors?: string[];
}

interface UploadSuccess {
  message: string;
  students_created: number;
  players_created: number;
  warnings?: string[];
  errors?: string[];
}

const BulkUploadSection: React.FC<BulkUploadSectionProps> = ({
  periodId,
  onSuccess,
  onCancel
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<UploadError | null>(null);
  const [success, setSuccess] = useState<UploadSuccess | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !periodId) return;

    setUploading(true);
    setError(null);
    setSuccess(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('teaching_period_id', periodId.toString());

    try {
      const response = await fetch('/clubs/api/players/bulk-upload', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();
      
      if (!response.ok) {
        // Handle error response with details
        setError({
          error: result.error || 'Upload failed',
          details: result.details || '',
          warnings: result.warnings || [],
          errors: result.errors || []
        });
      } else {
        // Handle success response
        setSuccess({
          message: result.message || 'Upload successful',
          students_created: result.students_created || 0,
          players_created: result.players_created || 0,
          warnings: result.warnings || [],
          errors: result.errors || []
        });
        
        // If there were no errors, notify parent component
        if (!result.errors || result.errors.length === 0) {
          setTimeout(() => onSuccess(), 2000); // Give user time to see success message
        }
      }
    } catch (err) {
      console.error('Upload error:', err);
      setError({
        error: err instanceof Error ? err.message : 'Failed to upload file',
        details: 'There was a problem communicating with the server.'
      });
    } finally {
      setUploading(false);
    }
  };

  // Render list of errors/warnings
  const renderList = (items: string[]) => {
    if (!items || items.length === 0) return null;
    
    return (
      <ul className="list-disc pl-5 my-2 text-sm">
        {items.map((item, i) => (
          <li key={i} className="mt-1">{item}</li>
        ))}
      </ul>
    );
  };

  return (
    <div className="mb-8 p-6 bg-gray-50 rounded-lg border border-gray-200">
      <h3 className="text-lg font-medium text-gray-900 mb-4">Bulk Upload Players</h3>
      
      {error && (
        <Alert variant="destructive" className="mb-4">
          <XCircle className="h-4 w-4" />
          <AlertTitle>{error.error}</AlertTitle>
          <AlertDescription>
            {typeof error.details === 'string' ? (
              <p>{error.details}</p>
            ) : (
              renderList(error.details as string[])
            )}
            
            {error.errors && error.errors.length > 0 && (
              <>
                <p className="font-medium mt-2">Errors:</p>
                {renderList(error.errors)}
              </>
            )}
            
            {error.warnings && error.warnings.length > 0 && (
              <>
                <p className="font-medium mt-2">Warnings:</p>
                {renderList(error.warnings)}
              </>
            )}
          </AlertDescription>
        </Alert>
      )}
      
      {success && (
        <Alert variant={success.errors?.length ? "default" : "default"} className={`mb-4 ${success.errors?.length ? "bg-yellow-50 border-yellow-200 text-yellow-800" : "bg-green-50 border-green-200 text-green-800"}`}>
          {success.errors?.length ? (
            <AlertTriangle className="h-4 w-4" />
          ) : (
            <CheckCircle className="h-4 w-4" />
          )}
          <AlertTitle>{success.message}</AlertTitle>
          <AlertDescription>
            <p>
              Created {success.students_created} new students and {success.players_created} player assignments.
            </p>
            
            {success.warnings && success.warnings.length > 0 && (
              <>
                <p className="font-medium mt-2">Warnings:</p>
                {renderList(success.warnings)}
              </>
            )}
            
            {success.errors && success.errors.length > 0 && (
              <>
                <p className="font-medium mt-2">Errors:</p>
                {renderList(success.errors)}
              </>
            )}
          </AlertDescription>
        </Alert>
      )}
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Upload CSV File
          </label>
          <input
            type="file"
            accept=".csv"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            required
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 
                     file:rounded-md file:border-0 file:text-sm file:font-semibold 
                     file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
          />
        </div>

        <div className="bg-blue-50 rounded-md p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <Info className="h-5 w-5 text-blue-400" aria-hidden="true" />
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-blue-800">CSV Format Requirements</h3>
              <div className="mt-2 text-sm text-blue-700">
                <p>Required columns:</p>
                <ul className="list-disc pl-5 mt-1">
                  <li>student_name</li>
                  <li>date_of_birth (DD-MMM-YYYY format)</li>
                  <li>contact_email</li>
                  <li>coach_email</li>
                  <li>group_name</li>
                  <li>day_of_week (e.g., Monday, Tuesday)</li>
                  <li>start_time (HH:MM format)</li>
                  <li>end_time (HH:MM format)</li>
                </ul>
                <div className="mt-2">
                  <a
                    href="/clubs/api/template/download"
                    className="text-blue-600 hover:text-blue-800 font-medium"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Download CSV Template
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end space-x-3">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!file || uploading}
            className="inline-flex items-center px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {uploading ? (
              <>
                <svg className="animate-spin h-4 w-4 mr-2" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Uploading...
              </>
            ) : (
              'Upload Players'
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

export default BulkUploadSection;