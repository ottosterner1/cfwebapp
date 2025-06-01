import React, { useState, useEffect } from 'react';
import { Alert, AlertDescription, AlertTitle } from '../../components/ui/alert';
import { 
  Info, 
  AlertTriangle, 
  CheckCircle, 
  XCircle, 
  Clock, 
  Download, 
  Copy, 
  ChevronDown, 
  ChevronUp,
  Calendar,
  AlarmClock,
  RefreshCw,
  FileText,
  Play,
  RotateCcw,
  Users,
  UserCheck
} from 'lucide-react';

interface ChartData {
  name: string;
  value: number;
}

interface BulkUploadSectionProps {
  periodId: number | null;
  periodName?: string;
  onSuccess: () => void;
  onCancel: () => void;
}

interface UploadError {
  error: string;
  details?: string | string[];
  warnings?: string[];
  errors?: string[];
}

interface ValidationResult {
  validation_token: string;
  total_rows: number;
  filename: string;
  file_size: number;
  status: string;
  is_valid: boolean;
  errors: string[];
  warnings: string[];
  can_proceed: boolean;
  message: string;
}

interface UploadSuccess {
  message: string;
  students_created: number;
  students_updated?: number;
  players_created: number;
  players_updated?: number;
  warnings?: string[];
  errors?: string[];
  skipped_duplicates?: number;
  skipped_missing_time_slot?: number;
  skipped_validation_errors?: number;
  total_processed?: number;
}

interface UploadStatus {
  status: string;
  processed_rows: number;
  total_rows: number;
  students_created: number;
  students_updated?: number;
  players_created: number;
  players_updated?: number;
  progress_percentage: number;
  warnings: string[];
  errors: string[];
  has_more?: boolean;
  elapsed_time?: number;
  skipped_duplicates?: number;
  skipped_missing_time_slot?: number;
  skipped_validation_errors?: number;
}

interface TimeSlotError {
  group: string;
  day: string;
  time: string;
  availableTimes: string[];
}

const COLORS = ['#4ade80', '#facc15', '#f87171', '#93c5fd', '#c084fc'];

const BulkUploadSection: React.FC<BulkUploadSectionProps> = ({
  periodId,
  periodName = "Current Period",
  onSuccess,
  onCancel
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<UploadError | null>(null);
  const [success, setSuccess] = useState<UploadSuccess | null>(null);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [processingToken, setProcessingToken] = useState<string | null>(null);
  const [status, setStatus] = useState<UploadStatus | null>(null);
  const [processingBatch, setProcessingBatch] = useState(false);
  const [originalRowCount, setOriginalRowCount] = useState(0);
  const [processingComplete, setProcessingComplete] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [showWarnings, setShowWarnings] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [showTimeSlotErrors, setShowTimeSlotErrors] = useState(false);
  const [showUpdateInfo, setShowUpdateInfo] = useState(false);
  const [showValidationWarnings, setShowValidationWarnings] = useState(false);
  const [showValidationErrors, setShowValidationErrors] = useState(false);
  const [timeSlotErrors, setTimeSlotErrors] = useState<TimeSlotError[]>([]);
  const [persistedErrors, setPersistedErrors] = useState<string[]>([]);

  // When we get a processing token, start processing batches
  useEffect(() => {
    if (processingToken && !processingBatch && !processingComplete) {
      processBatch();
    }
  }, [processingToken, processingBatch, processingComplete]);

  // Format elapsed time as mm:ss
  const formatTime = (seconds?: number): string => {
    if (!seconds) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Format file size
  const formatFileSize = (bytes: number): string => {
    const kb = bytes / 1024;
    if (kb < 1024) {
      return `${kb.toFixed(1)} KB`;
    }
    const mb = kb / 1024;
    return `${mb.toFixed(1)} MB`;
  };

  // Extract time slot errors from error messages
  const extractTimeSlotErrors = (errors: string[]) => {
    const timeSlotErrorRegex = /Row \d+: Group time slot not found for (.+) on (.+) at (.+)\. Available times: (.+)/;
    
    const extracted: TimeSlotError[] = [];
    const remainingErrors: string[] = [];

    errors.forEach(errorMsg => {
      const match = errorMsg.match(timeSlotErrorRegex);
      if (match) {
        extracted.push({
          group: match[1],
          day: match[2],
          time: match[3],
          availableTimes: match[4].split(', ')
        });
      } else {
        remainingErrors.push(errorMsg);
      }
    });

    return { timeSlotErrors: extracted, remainingErrors };
  };

  // Reset all state
  const resetState = () => {
    setFile(null);
    setUploading(false);
    setError(null);
    setSuccess(null);
    setValidationResult(null);
    setProcessingToken(null);
    setStatus(null);
    setProcessingBatch(false);
    setOriginalRowCount(0);
    setProcessingComplete(false);
    setShowAnalytics(false);
    setShowWarnings(false);
    setShowErrors(false);
    setShowTimeSlotErrors(false);
    setShowUpdateInfo(false);
    setShowValidationWarnings(false);
    setShowValidationErrors(false);
    setTimeSlotErrors([]);
    setPersistedErrors([]);
  };

  // Handle the initial file upload and validation
  const handleSubmit = async () => {
    if (!file || !periodId) return;

    setUploading(true);
    setError(null);
    setValidationResult(null);

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
        setError({
          error: result.error || 'Upload failed',
          details: result.details || '',
          warnings: result.warnings || [],
          errors: result.errors || []
        });
        setUploading(false);
        return;
      }

      // Validation completed - show results
      setValidationResult(result);
      setUploading(false);
      
    } catch (err) {
      console.error('Upload error:', err);
      setError({
        error: err instanceof Error ? err.message : 'Failed to upload file',
        details: 'There was a problem communicating with the server.'
      });
      setUploading(false);
    }
  };

  // Handle user decision to proceed with processing
  const handleProceedWithProcessing = async () => {
    if (!validationResult) return;

    setUploading(true);
    setError(null);

    try {
      const response = await fetch(`/clubs/api/players/bulk-upload/${validationResult.validation_token}/start`, {
        method: 'POST',
      });

      const result = await response.json();

      if (!response.ok) {
        setError({
          error: result.error || 'Failed to start processing',
          details: result.details || ''
        });
        setUploading(false);
        return;
      }

      // Start processing
      setProcessingToken(result.processing_token);
      setOriginalRowCount(validationResult.total_rows);
      setValidationResult(null); // Clear validation result
      setStatus({
        status: 'ready',
        processed_rows: 0,
        total_rows: validationResult.total_rows,
        students_created: 0,
        students_updated: 0,
        players_created: 0,
        players_updated: 0,
        progress_percentage: 0,
        warnings: validationResult.warnings || [],
        errors: [],
        has_more: true
      });
      
    } catch (err) {
      console.error('Processing start error:', err);
      setError({
        error: err instanceof Error ? err.message : 'Failed to start processing',
        details: 'There was a problem communicating with the server.'
      });
      setUploading(false);
    }
  };

  // Handle user decision to reject and re-upload
  const handleRejectAndReupload = async () => {
    if (!validationResult) return;

    try {
      await fetch(`/clubs/api/players/bulk-upload/${validationResult.validation_token}/reject`, {
        method: 'POST',
      });
    } catch (err) {
      console.error('Reject error:', err);
    }

    // Reset state regardless of API result
    resetState();
  };

  // Process a batch of rows
  const processBatch = async () => {
    if (!processingToken || processingBatch) return;
    
    setProcessingBatch(true);
    
    try {
      const response = await fetch(`/clubs/api/players/bulk-upload/${processingToken}/process`, {
        method: 'POST',
      });
      
      if (!response.ok) {
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
        
        const mergedErrors = [...prev.errors, ...(result.errors || [])];
        
        setPersistedErrors(currentErrors => [...currentErrors, ...(result.errors || [])]);
        
        const { timeSlotErrors: newTimeSlotErrors } = extractTimeSlotErrors(result.errors || []);
        if (newTimeSlotErrors.length > 0) {
          setTimeSlotErrors(current => [...current, ...newTimeSlotErrors]);
        }
        
        return {
          ...result,
          warnings: [...prev.warnings, ...(result.warnings || [])],
          errors: mergedErrors
        };
      });
      
      // Check if processing is complete
      if (result.status === 'completed' || !result.has_more) {
        setUploading(false);
        setProcessingComplete(true);
        
        const finalSuccess = {
          message: 'Upload successful',
          students_created: result.students_created,
          students_updated: result.students_updated || 0,
          players_created: result.players_created,
          players_updated: result.players_updated || 0,
          warnings: result.warnings || [],
          errors: persistedErrors,
          skipped_duplicates: result.skipped_duplicates || 0,
          skipped_missing_time_slot: result.skipped_missing_time_slot || timeSlotErrors.length,
          skipped_validation_errors: result.skipped_validation_errors || 0,
          total_processed: result.total_processed || originalRowCount
        };
        
        setSuccess(finalSuccess);
        setShowAnalytics(true);
        
        if (timeSlotErrors.length > 0) {
          setShowTimeSlotErrors(true);
        }
        
        if ((result.students_updated || 0) > 0 || (result.players_updated || 0) > 0) {
          setShowUpdateInfo(true);
        }
      } else {
        setProcessingBatch(false);
      }
    } catch (err) {
      console.error('Batch processing error:', err);
      setProcessingBatch(false);
      
      if (status && status.processed_rows > 0) {
        setTimeout(() => setProcessingBatch(false), 2000);
      } else {
        setUploading(false);
        setError({
          error: err instanceof Error ? err.message : 'Failed to process data',
          details: 'There was a problem communicating with the server.'
        });
      }
    }
  };

  // Group time slot errors by group and day for better organization
  const groupTimeSlotErrors = () => {
    const grouped: Record<string, Record<string, TimeSlotError[]>> = {};
    
    timeSlotErrors.forEach(error => {
      if (!grouped[error.group]) {
        grouped[error.group] = {};
      }
      
      if (!grouped[error.group][error.day]) {
        grouped[error.group][error.day] = [];
      }
      
      grouped[error.group][error.day].push(error);
    });
    
    return grouped;
  };

  // Render a list of errors/warnings
  const renderList = (items: string[] = []) => {
    if (!items || items.length === 0) return null;
    
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

  // Render validation results
  const renderValidationResults = () => {
    if (!validationResult) return null;

    const hasErrors = validationResult.errors.length > 0;
    const hasWarnings = validationResult.warnings.length > 0;

    return (
      <div className="bg-white border rounded-lg shadow-sm p-6 mb-6">
        <div className="flex items-center mb-4">
          <FileText className="h-6 w-6 text-blue-500 mr-3" />
          <div>
            <h3 className="text-lg font-semibold text-gray-900">File Validation Results</h3>
            <p className="text-sm text-gray-600">
              {validationResult.filename} • {formatFileSize(validationResult.file_size)} • {validationResult.total_rows} rows
            </p>
          </div>
        </div>

        {/* Validation Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className={`border rounded-lg p-4 ${hasErrors ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
            <div className="flex items-center">
              {hasErrors ? (
                <XCircle className="h-5 w-5 text-red-500 mr-2" />
              ) : (
                <CheckCircle className="h-5 w-5 text-green-500 mr-2" />
              )}
              <span className={`font-medium ${hasErrors ? 'text-red-800' : 'text-green-800'}`}>
                Validation Status
              </span>
            </div>
            <div className="mt-2">
              <span className={`text-lg font-bold ${hasErrors ? 'text-red-700' : 'text-green-700'}`}>
                {hasErrors ? 'Failed' : 'Passed'}
              </span>
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <div className="flex items-center">
              <AlertTriangle className="h-5 w-5 text-amber-500 mr-2" />
              <span className="font-medium text-amber-800">Warnings</span>
            </div>
            <div className="mt-2">
              <span className="text-lg font-bold text-amber-700">{validationResult.warnings.length}</span>
              {validationResult.warnings.length > 0 && (
                <button 
                  onClick={() => setShowValidationWarnings(!showValidationWarnings)}
                  className="text-amber-600 text-sm hover:underline ml-2"
                >
                  View
                </button>
              )}
            </div>
          </div>

          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-center">
              <XCircle className="h-5 w-5 text-red-500 mr-2" />
              <span className="font-medium text-red-800">Errors</span>
            </div>
            <div className="mt-2">
              <span className="text-lg font-bold text-red-700">{validationResult.errors.length}</span>
              {validationResult.errors.length > 0 && (
                <button 
                  onClick={() => setShowValidationErrors(!showValidationErrors)}
                  className="text-red-600 text-sm hover:underline ml-2"
                >
                  View
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Collapsible validation warnings */}
        {hasWarnings && showValidationWarnings && (
          <div className="border border-amber-200 rounded-lg overflow-hidden mb-4">
            <div 
              className="flex justify-between items-center p-3 bg-amber-50 cursor-pointer"
              onClick={() => setShowValidationWarnings(!showValidationWarnings)}
            >
              <div className="flex items-center">
                <AlertTriangle className="h-5 w-5 text-amber-500 mr-2" />
                <h4 className="font-medium text-amber-800">Validation Warnings ({validationResult.warnings.length})</h4>
              </div>
              {showValidationWarnings ? (
                <ChevronUp className="h-5 w-5 text-amber-500" />
              ) : (
                <ChevronDown className="h-5 w-5 text-amber-500" />
              )}
            </div>
            
            <div className="p-4 bg-white border-t border-amber-100">
              <p className="mb-2 text-amber-700">The following warnings were found but won't prevent processing:</p>
              {renderList(validationResult.warnings)}
            </div>
          </div>
        )}

        {/* Collapsible validation errors */}
        {hasErrors && showValidationErrors && (
          <div className="border border-red-200 rounded-lg overflow-hidden mb-4">
            <div 
              className="flex justify-between items-center p-3 bg-red-50 cursor-pointer"
              onClick={() => setShowValidationErrors(!showValidationErrors)}
            >
              <div className="flex items-center">
                <XCircle className="h-5 w-5 text-red-500 mr-2" />
                <h4 className="font-medium text-red-800">Validation Errors ({validationResult.errors.length})</h4>
              </div>
              {showValidationErrors ? (
                <ChevronUp className="h-5 w-5 text-red-500" />
              ) : (
                <ChevronDown className="h-5 w-5 text-red-500" />
              )}
            </div>
            
            <div className="p-4 bg-white border-t border-red-100">
              <p className="mb-2 text-red-700">The following errors must be fixed before the file can be processed:</p>
              {renderList(validationResult.errors)}
            </div>
          </div>
        )}

        {/* Show errors if any and not in collapsible view */}
        {hasErrors && !showValidationErrors && (
          <Alert variant="destructive" className="mb-4">
            <XCircle className="h-4 w-4" />
            <AlertTitle>Validation Errors Found</AlertTitle>
            <AlertDescription>
              <p className="mb-2">The following errors must be fixed before the file can be processed:</p>
              {renderList(validationResult.errors.slice(0, 3))}
              {validationResult.errors.length > 3 && (
                <p className="text-sm italic mt-1">
                  ...and {validationResult.errors.length - 3} more errors. 
                  <button 
                    onClick={() => setShowValidationErrors(true)}
                    className="text-red-600 hover:underline ml-1"
                  >
                    View all
                  </button>
                </p>
              )}
            </AlertDescription>
          </Alert>
        )}

        {/* Show warnings if any and not in collapsible view */}
        {hasWarnings && !showValidationWarnings && (
          <Alert className="mb-4 bg-yellow-50 border-yellow-200 text-yellow-800">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Validation Warnings</AlertTitle>
            <AlertDescription>
              <p className="mb-2">The following warnings were found but won't prevent processing:</p>
              {renderList(validationResult.warnings.slice(0, 3))}
              {validationResult.warnings.length > 3 && (
                <p className="text-sm italic mt-1">
                  ...and {validationResult.warnings.length - 3} more warnings. 
                  <button 
                    onClick={() => setShowValidationWarnings(true)}
                    className="text-yellow-600 hover:underline ml-1"
                  >
                    View all
                  </button>
                </p>
              )}
            </AlertDescription>
          </Alert>
        )}

        {/* Action buttons */}
        <div className="flex justify-end space-x-3 pt-4 border-t">
          <button
            onClick={handleRejectAndReupload}
            className="inline-flex items-center px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors"
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            Reject and Re-upload
          </button>
          
          {validationResult.can_proceed ? (
            <button
              onClick={handleProceedWithProcessing}
              className="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
            >
              <Play className="h-4 w-4 mr-2" />
              Continue and Process File
            </button>
          ) : (
            <button
              disabled
              className="inline-flex items-center px-4 py-2 bg-gray-300 text-gray-500 rounded-md cursor-not-allowed"
            >
              <XCircle className="h-4 w-4 mr-2" />
              Cannot Process (Fix Errors First)
            </button>
          )}
        </div>
      </div>
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
          <span className="text-indigo-700">Starting processing...</span>
        </div>
      );
    }
    
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
        
        {(status.students_created > 0 || status.players_created > 0) && (
          <div className="mt-1 text-sm text-gray-600">
            Created so far: {status.students_created} students, {status.players_created} player assignments
            {((status.students_updated || 0) > 0 || (status.players_updated || 0) > 0) && (
              <span className="ml-2">
                | Updated: {status.students_updated || 0} students, {status.players_updated || 0} assignments
              </span>
            )}
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

  // Render pie chart with canvas
  const renderPieChart = (data: ChartData[], title: string) => {
    return (
      <div className="border rounded-lg p-4">
        <h4 className="font-medium text-gray-700 mb-3">{title}</h4>
        <div className="h-64">
          <div className="flex flex-col items-center">
            <div className="w-full h-48 relative rounded-full">
              {data.map((item, index) => {
                const totalValue = data.reduce((sum, item) => sum + item.value, 0);
                const percentage = Math.round((item.value / totalValue) * 100);
                
                return (
                  <div key={index} className="flex items-center mb-2">
                    <div 
                      className="w-4 h-4 mr-2 rounded-sm" 
                      style={{ backgroundColor: COLORS[index % COLORS.length] }}
                    ></div>
                    <span className="text-sm">
                      {item.name}: {item.value} ({percentage}%)
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Render analytics for successful upload
  const renderAnalytics = () => {
    if (!success || !showAnalytics) return null;

    const warningsCount = success.warnings?.length || 0;
    const errorsCount = success.errors?.length || 0;
    
    const skippedDuplicates = success.skipped_duplicates || 0;
    const skippedMissingTimeSlot = success.skipped_missing_time_slot || timeSlotErrors.length;
    const skippedValidationErrors = success.skipped_validation_errors || 0;
    const studentsUpdated = success.students_updated || 0;
    const playersUpdated = success.players_updated || 0;
    
    const skippedCount = originalRowCount - success.players_created;
    
    const resultData: ChartData[] = [
      { name: 'Players Created', value: success.players_created },
      { name: 'Players Updated', value: playersUpdated },
      { name: 'Duplicates', value: skippedDuplicates },
      { name: 'Missing Time Slots', value: skippedMissingTimeSlot },
      { name: 'Validation Errors', value: skippedValidationErrors }
    ].filter(item => item.value > 0);

    const studentData: ChartData[] = [
      { name: 'New Students', value: success.students_created },
      { name: 'Updated Records', value: studentsUpdated }
    ].filter(item => item.value > 0);

    const getPercentText = (value: number): string => {
      return originalRowCount > 0 ? `(${Math.round((value / originalRowCount) * 100)}%)` : '';
    };

    const getSummaryText = () => {
      const lines = [
        `Upload Summary for ${periodName}`,
        `Total rows: ${originalRowCount}`,
        `Players successfully created: ${success.players_created} ${getPercentText(success.players_created)}`,
        `Players updated: ${playersUpdated} ${getPercentText(playersUpdated)}`,
        `New student records: ${success.students_created}`,
        `Updated student records: ${studentsUpdated}`,
        ``,
        `Skipped records: ${skippedCount} ${getPercentText(skippedCount)}`,
        `- Duplicates: ${skippedDuplicates}`,
        `- Missing time slots: ${skippedMissingTimeSlot}`,
        `- Validation errors: ${skippedValidationErrors}`,
        ``,
        `Warnings: ${warningsCount}`,
        `Errors: ${errorsCount}`
      ].join('\n');
      
      return lines;
    };

    const copySummary = () => {
      navigator.clipboard.writeText(getSummaryText())
        .then(() => alert('Summary copied to clipboard!'))
        .catch(err => console.error('Failed to copy text: ', err));
    };

    const handleDownloadReport = () => {
      if (!success) return;
      
      const lines = [
        "Status,Details",
        `Success,${success.players_created} players created successfully`,
        `Players Updated,${playersUpdated} existing player assignments updated`,
        `Students,${success.students_created} new student records created`,
        `Students Updated,${studentsUpdated} existing student records updated`,
        `Duplicates Skipped,${skippedDuplicates} duplicate players skipped`,
        `Missing Time Slots,${skippedMissingTimeSlot} players skipped due to missing time slots`,
        `Validation Errors,${skippedValidationErrors} players skipped due to validation errors`
      ];
      
      if (timeSlotErrors.length > 0) {
        lines.push("");
        lines.push("Missing Time Slots:");
        timeSlotErrors.forEach(error => {
          lines.push(`"${error.group}","${error.day}","${error.time}","Available times: ${error.availableTimes.join(', ')}"`);
        });
      }
      
      if (success.warnings && success.warnings.length > 0) {
        lines.push("");
        lines.push("Warnings:");
        success.warnings.forEach(warning => {
          lines.push(`Warning,"${warning.replace(/"/g, '""')}"`);
        });
      }
      
      if (success.errors && success.errors.length > 0) {
        lines.push("");
        lines.push("Errors:");
        success.errors.forEach(error => {
          if (!error.includes("Group time slot not found")) {
            lines.push(`Error,"${error.replace(/"/g, '""')}"`);
          }
        });
      }
      
      const csvContent = lines.join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.setAttribute('hidden', '');
      a.setAttribute('href', url);
      a.setAttribute('download', `upload_report_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    };

    const groupedTimeSlotErrors = groupTimeSlotErrors();

    return (
      <div className="bg-white border rounded-lg shadow-sm p-6 mb-8">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="text-xl font-semibold text-gray-900">Upload Results</h3>
            <p className="text-gray-600">Analysis for {periodName}</p>
          </div>
          <div className="flex space-x-2">
            <button
              onClick={copySummary}
              className="inline-flex items-center px-3 py-1.5 bg-gray-50 text-gray-700 rounded-md hover:bg-gray-100 transition-colors"
              title="Copy summary to clipboard"
            >
              <Copy className="h-4 w-4 mr-1" />
              Copy
            </button>
            <button
              onClick={handleDownloadReport}
              className="inline-flex items-center px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-md hover:bg-indigo-100 transition-colors"
            >
              <Download className="h-4 w-4 mr-1" />
              Download Report
            </button>
            <button
              onClick={() => {
                setShowAnalytics(false);
                onSuccess();
              }}
              className="inline-flex items-center px-3 py-1.5 bg-green-50 text-green-700 rounded-md hover:bg-green-100 transition-colors"
            >
              <CheckCircle className="h-4 w-4 mr-1" />
              Done
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-green-50 border border-green-100 rounded-lg p-4">
            <div className="flex items-center">
              <CheckCircle className="h-5 w-5 text-green-500 mr-2" />
              <span className="font-medium text-green-800">Successfully Added</span>
            </div>
            <div className="mt-2">
              <span className="text-2xl font-bold text-green-700">{success.players_created}</span>
              <span className="text-green-600 ml-2">players</span>
            </div>
            <p className="text-sm text-green-600 mt-1">
              New students: {success.students_created}
            </p>
          </div>
          
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
            <div className="flex items-center">
              <RefreshCw className="h-5 w-5 text-blue-500 mr-2" />
              <span className="font-medium text-blue-800">Updated</span>
            </div>
            <div className="mt-2">
              <span className="text-2xl font-bold text-blue-700">{playersUpdated}</span>
              <span className="text-blue-600 ml-2">assignments</span>
              {(studentsUpdated > 0 || playersUpdated > 0) && (
                <button 
                  onClick={() => setShowUpdateInfo(!showUpdateInfo)}
                  className="text-blue-600 text-sm hover:underline ml-2"
                >
                  Details
                </button>
              )}
            </div>
            <p className="text-sm text-blue-600 mt-1">
              Updated students: {studentsUpdated}
            </p>
          </div>
          
          <div className="bg-amber-50 border border-amber-100 rounded-lg p-4">
            <div className="flex items-center">
              <Info className="h-5 w-5 text-amber-500 mr-2" />
              <span className="font-medium text-amber-800">Not Added</span>
            </div>
            <div className="mt-2">
              <span className="text-2xl font-bold text-amber-700">{skippedDuplicates}</span>
              <span className="text-amber-600 ml-2">duplicates</span>
            </div>
            <p className="text-sm text-amber-600 mt-1">
              And {skippedMissingTimeSlot} missing time slots
              {skippedMissingTimeSlot > 0 && (
                <button 
                  onClick={() => setShowTimeSlotErrors(!showTimeSlotErrors)}
                  className="text-blue-600 hover:underline ml-2"
                >
                  View details
                </button>
              )}
            </p>
          </div>
          
          <div className="bg-red-50 border border-red-100 rounded-lg p-4">
            <div className="flex items-center">
              <XCircle className="h-5 w-5 text-red-500 mr-2" />
              <span className="font-medium text-red-800">Errors</span>
            </div>
            <div className="mt-2">
              <span className="text-2xl font-bold text-red-700">{skippedValidationErrors}</span>
              <span className="text-red-600 ml-2">validation errors</span>
            </div>
            <p className="text-sm text-red-600 mt-1">
              {errorsCount} detailed error messages
              {errorsCount > 0 && (
                <button 
                  onClick={() => setShowErrors(!showErrors)}
                  className="text-blue-600 hover:underline ml-2"
                >
                  View all
                </button>
              )}
            </p>
          </div>
        </div>
        
        {/* Update Information Section */}
        {(studentsUpdated > 0 || playersUpdated > 0) && (
          <div className="border border-blue-200 rounded-lg overflow-hidden mb-6">
            <div 
              className="flex justify-between items-center p-3 bg-blue-50 cursor-pointer"
              onClick={() => setShowUpdateInfo(!showUpdateInfo)}
            >
              <div className="flex items-center">
                <RefreshCw className="h-5 w-5 text-blue-500 mr-2" />
                <h4 className="font-medium text-blue-800">Update Details</h4>
              </div>
              {showUpdateInfo ? (
                <ChevronUp className="h-5 w-5 text-blue-500" />
              ) : (
                <ChevronDown className="h-5 w-5 text-blue-500" />
              )}
            </div>
            
            {showUpdateInfo && (
              <div className="p-4 bg-white border-t border-blue-100">
                <p className="mb-3 text-gray-700">
                  The upload process updated existing records when more recent information was provided in your CSV.
                </p>
                
                <div className="space-y-3">
                  {studentsUpdated > 0 && (
                    <div className="bg-blue-50 p-3 rounded-md">
                      <h5 className="font-medium text-blue-800 mb-1 flex items-center">
                        <Users className="h-4 w-4 mr-1" />
                        Student Records Updated: {studentsUpdated}
                      </h5>
                      <p className="text-sm text-gray-600">
                        Updated contact information, medical details, and other student data where newer information was provided.
                      </p>
                    </div>
                  )}
                  
                  {playersUpdated > 0 && (
                    <div className="bg-blue-50 p-3 rounded-md">
                      <h5 className="font-medium text-blue-800 mb-1 flex items-center">
                        <UserCheck className="h-4 w-4 mr-1" />
                        Player Assignments Updated: {playersUpdated}
                      </h5>
                      <p className="text-sm text-gray-600">
                        Updated coach assignments, walk-home preferences, and notes for existing player assignments.
                      </p>
                    </div>
                  )}
                </div>
                
                <div className="mt-3 text-sm text-gray-600 px-4 py-2 bg-white rounded border">
                  <p className="font-medium">Note:</p>
                  <p className="mt-1">
                    Updates only occur when uploading the same student to the same group and time slot in the same teaching period. 
                    This allows you to make corrections or updates to existing data by re-uploading your CSV.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
        
        {/* Time Slot Errors Section */}
        {timeSlotErrors.length > 0 && (
          <div className="border border-orange-200 rounded-lg overflow-hidden mb-6">
            <div 
              className="flex justify-between items-center p-3 bg-orange-50 cursor-pointer"
              onClick={() => setShowTimeSlotErrors(!showTimeSlotErrors)}
            >
              <div className="flex items-center">
                <AlarmClock className="h-5 w-5 text-orange-500 mr-2" />
                <h4 className="font-medium text-orange-800">Missing Time Slots ({timeSlotErrors.length})</h4>
              </div>
              {showTimeSlotErrors ? (
                <ChevronUp className="h-5 w-5 text-orange-500" />
              ) : (
                <ChevronDown className="h-5 w-5 text-orange-500" />
              )}
            </div>
            
            {showTimeSlotErrors && (
              <div className="p-4 bg-white border-t border-orange-100">
                <p className="mb-3 text-gray-700">
                  The following time slots specified in your CSV don't exist for their respective groups. 
                  You need to either create these time slots in the system or update your CSV.
                </p>
                
                <div className="space-y-4">
                  {Object.entries(groupedTimeSlotErrors).map(([group, days]) => (
                    <div key={group} className="bg-orange-50 p-3 rounded-md">
                      <h5 className="font-medium text-orange-800 mb-2">{group}</h5>
                      
                      {Object.entries(days).map(([day, errors]) => (
                        <div key={day} className="ml-4 mb-3">
                          <h6 className="font-medium text-gray-700 flex items-center">
                            <Calendar className="h-4 w-4 mr-1 text-gray-500" />
                            {day}
                          </h6>
                          
                          <div className="ml-6 mt-1">
                            {errors.map((error, idx) => (
                              <div key={idx} className="mb-2">
                                <p className="text-red-600 flex items-center">
                                  <XCircle className="h-4 w-4 mr-1" />
                                  <strong>{error.time}</strong> - not available
                                </p>
                                
                                <p className="text-sm text-gray-600 ml-5 mt-1">
                                  Available times: 
                                </p>
                                <ul className="list-disc ml-9 text-sm text-gray-600">
                                  {error.availableTimes.map((time, timeIdx) => (
                                    <li key={timeIdx}>{time}</li>
                                  ))}
                                </ul>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                      
                      <div className="mt-2 text-sm text-gray-600 px-4 py-2 bg-white rounded">
                        <p className="font-medium">Solution:</p>
                        <ul className="list-disc ml-5 mt-1">
                          <li>Go to Groups management and add the missing time slots for this group</li>
                          <li>Or modify your CSV to use one of the available time slots</li>
                        </ul>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Charts showing breakdown of uploads */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {renderPieChart(resultData, "Upload Results")}
          {renderPieChart(studentData, "Student Records")}
        </div>

        {/* Collapsible warnings section */}
        {warningsCount > 0 && (
          <div className="border rounded-lg overflow-hidden mb-4">
            <div 
              className="flex justify-between items-center p-3 bg-yellow-50 cursor-pointer"
              onClick={() => setShowWarnings(!showWarnings)}
            >
              <div className="flex items-center">
                <AlertTriangle className="h-5 w-5 text-yellow-500 mr-2" />
                <h4 className="font-medium text-yellow-800">Processing Warnings ({warningsCount})</h4>
              </div>
              {showWarnings ? (
                <ChevronUp className="h-5 w-5 text-yellow-500" />
              ) : (
                <ChevronDown className="h-5 w-5 text-yellow-500" />
              )}
            </div>
            
            {showWarnings && (
              <div className="p-4 bg-white border-t border-yellow-100">
                {renderList(success.warnings)}
              </div>
            )}
          </div>
        )}

        {/* Collapsible errors section */}
        {errorsCount > 0 && (
          <div className="border rounded-lg overflow-hidden">
            <div 
              className="flex justify-between items-center p-3 bg-red-50 cursor-pointer"
              onClick={() => setShowErrors(!showErrors)}
            >
              <div className="flex items-center">
                <XCircle className="h-5 w-5 text-red-500 mr-2" />
                <h4 className="font-medium text-red-800">Processing Errors ({errorsCount})</h4>
              </div>
              {showErrors ? (
                <ChevronUp className="h-5 w-5 text-red-500" />
              ) : (
                <ChevronDown className="h-5 w-5 text-red-500" />
              )}
            </div>
            
            {showErrors && (
              <div className="p-4 bg-white border-t border-red-100">
                {renderList(success.errors)}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // Show simple success message with option to view analytics
  const renderSimpleSuccess = () => {
    if (!success || showAnalytics) return null;

    const hasUpdates = (success.students_updated || 0) > 0 || (success.players_updated || 0) > 0;

    return (
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
            {hasUpdates && (
              <span className="ml-1">
                Updated {success.students_updated || 0} students and {success.players_updated || 0} assignments.
              </span>
            )}
          </p>
          
          {timeSlotErrors.length > 0 && (
            <p className="text-orange-700 mt-1">
              <AlertTriangle className="h-4 w-4 inline mr-1" />
              {timeSlotErrors.length} rows had missing time slots. You might need to add these time slots to your groups.
            </p>
          )}
          
          <button
            onClick={() => setShowAnalytics(true)}
            className="mt-2 text-blue-600 hover:text-blue-800 font-medium"
          >
            Show Detailed Analysis
          </button>
          
          <button
            onClick={() => onSuccess()}
            className="mt-2 ml-4 text-green-600 hover:text-green-800 font-medium"
          >
            Continue
          </button>
        </AlertDescription>
      </Alert>
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
                <p className="font-medium mt-2">Validation Errors:</p>
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
      
      {/* Show validation results */}
      {validationResult && renderValidationResults()}
      
      {/* Show simple success message */}
      {renderSimpleSuccess()}
      
      {/* Show analytics */}
      {showAnalytics && renderAnalytics()}
      
      {/* Show processing progress */}
      {(uploading && processingToken) && renderProgress()}
      
      {/* Only show the upload section if we're not in validation or processing mode */}
      {!validationResult && !showAnalytics && !processingComplete && !processingToken && (
        <div className="space-y-4">
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
                    <li>contact_number (UK format with leading zero)</li>
                    <li>emergency_contact_number</li>
                    <li>medical_information</li>
                    <li>walk_home (Y, N, or blank)</li>
                    <li>notes</li>
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
                  <div className="mt-2 bg-amber-100 text-amber-800 p-2 rounded text-sm">
                    <strong>✨ New Features:</strong>
                    <ul className="mt-1 space-y-1">
                      <li>• Pre-validation prevents upload if there are format errors</li>
                      <li>• Review validation results before proceeding</li>
                      <li>• Re-uploading will update existing player assignments</li>
                      <li>• Walk home uses Y/N/Blank format</li>
                      <li>• Phone numbers preserve leading zeros</li>
                    </ul>
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
              type="button"
              onClick={handleSubmit}
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
                  Validating...
                </>
              ) : (
                'Validate and Upload'
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default BulkUploadSection;