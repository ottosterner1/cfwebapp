import React, { useState, useEffect } from 'react';
import { Alert, AlertDescription, AlertTitle } from '../../components/ui/alert';
import { Info, AlertTriangle, CheckCircle, XCircle, Clock } from 'lucide-react';

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

interface UploadStatus {
  status: string;
  processed_rows: number;
  total_rows: number;
  students_created: number;
  players_created: number;
  progress_percentage: number;
  warnings: string[];
  errors: string[];
  has_more?: boolean;
  elapsed_time?: number;
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
  const [uploadToken, setUploadToken] = useState<string | null>(null);
  const [status, setStatus] = useState<UploadStatus | null>(null);
  const [processingBatch, setProcessingBatch] = useState(false);

  // When we get a token, start processing batches
  useEffect(() => {
    if (uploadToken && uploading && !processingBatch) {
      processBatch();
    }
  }, [uploadToken, uploading, processingBatch]);

  // Format elapsed time as mm:ss
  const formatTime = (seconds?: number): string => {
    if (!seconds) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Handle the initial file upload
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !periodId) return;

    setUploading(true);
    setError(null);
    setSuccess(null);
    setStatus(null);
    setUploadToken(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('teaching_period_id', periodId.toString());

    try {
      const response = await fetch('/clubs/api/players/bulk-upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const result = await response.json();
        setError({
          error: result.error || 'Upload failed',
          details: result.details || '',
          warnings: result.warnings || [],
          errors: result.errors || []
        });
        setUploading(false);
        return;
      }

      // Parse response
      const result = await response.json();
      
      if (result.token) {
        // New chunked API - store token and initialize status
        setUploadToken(result.token);
        setStatus({
          status: 'ready',
          processed_rows: 0,
          total_rows: result.total_rows,
          students_created: 0,
          players_created: 0,
          progress_percentage: 0,
          warnings: [],
          errors: [],
          has_more: true
        });
      } else {
        // Old direct API - handle immediate response
        setSuccess({
          message: result.message || 'Upload successful',
          students_created: result.students_created || 0,
          players_created: result.players_created || 0,
          warnings: result.warnings || [],
          errors: result.errors || []
        });
        setUploading(false);
        
        // If there were no errors, notify parent component
        if (!result.errors || result.errors.length === 0) {
          setTimeout(() => onSuccess(), 2000);
        }
      }
    } catch (err) {
      console.error('Upload error:', err);
      setError({
        error: err instanceof Error ? err.message : 'Failed to upload file',
        details: 'There was a problem communicating with the server.'
      });
      setUploading(false);
    }
  };

  // Process a batch of rows
  const processBatch = async () => {
    if (!uploadToken || !uploading || processingBatch) return;
    
    setProcessingBatch(true);
    
    try {
      const response = await fetch(`/clubs/api/players/bulk-upload/${uploadToken}/process`, {
        method: 'POST',
      });
      
      if (!response.ok) {
        // Handle error
        let errorData;
        try {
          errorData = await response.json();
        } catch (e) {
          errorData = { error: `Server error (${response.status})` };
        }
        
        setError({
          error: errorData.error || 'Processing failed',
          details: errorData.details || 'An error occurred during processing'
        });
        setUploading(false);
        setProcessingBatch(false);
        return;
      }
      
      const result = await response.json();
      
      // Update status with latest info
      setStatus(prev => {
        if (!prev) return result;
        
        // Merge warnings and errors from previous state
        return {
          ...result,
          warnings: [...prev.warnings, ...(result.warnings || [])],
          errors: [...prev.errors, ...(result.errors || [])]
        };
      });
      
      // Check if processing is complete
      if (result.status === 'completed' || !result.has_more) {
        // Processing complete
        setUploading(false);
        setSuccess({
          message: 'Upload successful',
          students_created: result.students_created,
          players_created: result.players_created,
          warnings: result.warnings || [],
          errors: result.errors || []
        });
        
        // If no errors, notify parent
        if (!result.errors || result.errors.length === 0) {
          setTimeout(() => onSuccess(), 2000);
        }
      } else {
        // More batches to process
        setProcessingBatch(false);
      }
    } catch (err) {
      console.error('Batch processing error:', err);
      setProcessingBatch(false);
      
      // Check status to decide whether to retry or fail
      if (status && status.processed_rows > 0) {
        // We've made some progress, wait and retry
        setTimeout(() => setProcessingBatch(false), 2000);
      } else {
        // Initial batch failed, give up
        setUploading(false);
        setError({
          error: err instanceof Error ? err.message : 'Failed to process data',
          details: 'There was a problem communicating with the server.'
        });
      }
    }
  };

  // Render a list of errors/warnings
  const renderList = (items: string[]) => {
    if (!items || items.length === 0) return null;
    
    // Show up to 10 items
    const limit = 10;
    const displayItems = items.slice(0, limit);
    const hasMore = items.length > limit;
    
    return (
      <>
        <ul className="list-disc pl-5 my-2 text-sm">
          {displayItems.map((item, i) => (
            <li key={i} className="mt-1">{item}</li>
          ))}
        </ul>
        {hasMore && (
          <p className="text-sm italic mt-1">
            ...and {items.length - limit} more items not shown
          </p>
        )}
      </>
    );
  };

  // Render upload progress indicator
  const renderProgress = () => {
    if (!status) {
      return (
        <div className="my-4 flex items-center">
          <div className="animate-spin mr-2">
            <svg className="h-5 w-5 text-indigo-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          </div>
          <span className="text-indigo-700">Uploading file...</span>
        </div>
      );
    }
    
    // Determine status message
    let statusMessage = 'Processing data...';
    if (status.status === 'ready') {
      statusMessage = 'Preparing to process...';
    } else if (status.status === 'completed') {
      statusMessage = 'Processing complete';
    }
    
    return (
      <div className="my-4">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center">
            <Clock className="h-4 w-4 mr-2 text-indigo-500" />
            <span className="text-sm font-medium">{statusMessage}</span>
          </div>
          
          {status.elapsed_time !== undefined && (
            <span className="text-sm text-gray-500">
              Time elapsed: {formatTime(status.elapsed_time)}
            </span>
          )}
        </div>
        
        <div className="w-full bg-gray-200 rounded-full h-2.5">
          <div 
            className="bg-indigo-600 h-2.5 rounded-full" 
            style={{ width: `${status.progress_percentage}%` }}
          ></div>
        </div>
        
        <div className="mt-2 text-sm text-gray-600 flex justify-between">
          <span>
            {status.processed_rows} of {status.total_rows} rows processed
          </span>
          <span>
            {status.progress_percentage}%
          </span>
        </div>
        
        {status.students_created > 0 && (
          <div className="mt-1 text-sm text-gray-600">
            Created so far: {status.students_created} students, {status.players_created} player assignments
          </div>
        )}
        
        {status.errors.length > 0 && (
          <div className="mt-3 p-3 border border-amber-200 bg-amber-50 rounded text-amber-800 text-sm">
            <p className="font-medium">Processing errors encountered:</p>
            <ul className="list-disc pl-5 mt-1">
              {status.errors.slice(0, 3).map((error, idx) => (
                <li key={idx}>{error}</li>
              ))}
              {status.errors.length > 3 && (
                <li className="italic">...and {status.errors.length - 3} more errors</li>
              )}
            </ul>
          </div>
        )}
      </div>
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
      
      {uploading && renderProgress()}
      
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
            disabled={uploading}
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 
                     file:rounded-md file:border-0 file:text-sm file:font-semibold 
                     file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100
                     disabled:opacity-50 disabled:cursor-not-allowed"
          />
          {file && !uploading && (
            <div className="mt-1 text-sm text-gray-500">
              Selected file: {file.name} ({(file.size / 1024).toFixed(1)} KB)
            </div>
          )}
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
                <p className="mt-2">Optional columns:</p>
                <ul className="list-disc pl-5 mt-1">
                  <li>contact_number</li>
                  <li>emergency_contact_number</li>
                  <li>medical_information</li>
                  <li>walk_home (true/false)</li>
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
                <div className="mt-2 text-amber-700 font-medium">
                  For large files (400+ rows), consider splitting into multiple smaller files for reliable processing.
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end space-x-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={uploading}
            className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors
                     disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!file || uploading}
            className="inline-flex items-center px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors
                     disabled:opacity-50 disabled:cursor-not-allowed"
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
                Processing...
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