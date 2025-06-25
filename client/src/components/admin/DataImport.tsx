import React, { useState, useRef } from 'react';
import { Database, UploadCloud, FileText, Download, CheckCircle, AlertTriangle } from 'lucide-react';

interface TennisClub {
  id: number;
  name: string;
  subdomain: string;
  organisation?: {
    id: number;
    name: string;
    slug: string;
  };
  user_count: number;
  group_count: number;
}

interface Notification {
  type: 'success' | 'error' | 'warning';
  message: string;
}

interface UploadStatus {
  isUploading: boolean;
  progress: number;
  fileName: string;
  result?: {
    groupsCreated: number;
    timeSlotsCreated: number;
    warnings: string[];
    errors: string[];
  };
}

interface DataImportProps {
  selectedClub: TennisClub;
  onNotification: (notification: Notification) => void;
}

const DataImport: React.FC<DataImportProps> = ({ selectedClub, onNotification }) => {
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>({
    isUploading: false,
    progress: 0,
    fileName: ''
  });
  
  // File upload ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Function to handle file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      setUploadStatus({
        ...uploadStatus,
        fileName: files[0].name,
        result: undefined
      });
    }
  };

  // Function to handle CSV upload for groups and time slots
  const handleGroupsUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const fileInput = fileInputRef.current;
    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
      onNotification({
        type: 'error',
        message: 'Please select a CSV file to upload'
      });
      return;
    }
    
    const file = fileInput.files[0];
    if (!file.name.endsWith('.csv')) {
      onNotification({
        type: 'error',
        message: 'Only CSV files are supported'
      });
      return;
    }
    
    setIsActionLoading(true);
    setUploadStatus({
      isUploading: true,
      progress: 10,
      fileName: file.name,
      result: undefined
    });
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('club_id', selectedClub.id.toString());
      
      const response = await fetch('/clubs/api/super-admin/import-groups', {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });
      
      setUploadStatus(prev => ({...prev, progress: 50}));
      
      if (response.ok) {
        const result = await response.json();
        
        setUploadStatus({
          isUploading: false,
          progress: 100,
          fileName: file.name,
          result: {
            groupsCreated: result.groups_created || 0,
            timeSlotsCreated: result.time_slots_created || 0,
            warnings: result.warnings || [],
            errors: result.errors || []
          }
        });
        
        onNotification({
          type: 'success',
          message: `Successfully imported ${result.groups_created} groups and ${result.time_slots_created} time slots`
        });
        
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      } else {
        let errorMessage = 'Failed to upload file';
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch (e) {
          const textError = await response.text();
          console.error('Error response:', textError.substring(0, 200));
        }
        
        setUploadStatus({
          isUploading: false,
          progress: 0,
          fileName: file.name
        });
        
        onNotification({
          type: 'error',
          message: errorMessage
        });
      }
    } catch (error) {
      console.error('Error uploading file:', error);
      
      setUploadStatus({
        isUploading: false,
        progress: 0,
        fileName: file.name
      });
      
      onNotification({
        type: 'error',
        message: error instanceof Error ? error.message : 'An error occurred while uploading the file'
      });
    } finally {
      setIsActionLoading(false);
    }
  };

  // Function to download the CSV template
  const handleDownloadTemplate = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    try {
      const response = await fetch('/clubs/api/super-admin/groups-template', {
        credentials: 'include'
      });
      
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = 'groups_template.csv';
        
        document.body.appendChild(a);
        a.click();
        
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } else {
        onNotification({
          type: 'error',
          message: 'Failed to download template'
        });
      }
    } catch (error) {
      console.error('Error downloading template:', error);
      onNotification({
        type: 'error',
        message: 'Error downloading template file'
      });
    }
  };

  // Clear upload results
  const clearResults = () => {
    setUploadStatus({
      isUploading: false,
      progress: 0,
      fileName: '',
      result: undefined
    });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="border rounded-lg p-6 bg-gradient-to-r from-orange-50 to-red-50">
      <h2 className="text-xl font-semibold mb-4 flex items-center">
        <Database className="h-6 w-6 mr-3 text-orange-600" />
        Import Groups & Time Slots for {selectedClub.name}
      </h2>
      
      <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-md">
        <h3 className="font-medium text-blue-900 mb-2">Instructions</h3>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• Upload a CSV file containing groups and time slots</li>
          <li>• The CSV should include: group name, description, day of week, start time, and end time</li>
          <li>• Download the template below to see the correct format</li>
          <li>• Existing groups with the same name will be skipped</li>
        </ul>
      </div>
      
      <div className="mb-4">
        <button
          type="button"
          onClick={handleDownloadTemplate} 
          className="text-orange-600 hover:text-orange-800 text-sm flex items-center bg-white px-3 py-2 rounded-md border border-orange-200 hover:bg-orange-50"
        >
          <Download className="h-4 w-4 mr-2" />
          Download CSV Template
        </button>
      </div>
      
      <form onSubmit={handleGroupsUpload} className="space-y-4">
        <div className="relative border-2 border-dashed border-gray-300 rounded-md p-6 flex flex-col items-center justify-center bg-white hover:border-orange-400 transition-colors">
          <UploadCloud className="h-8 w-8 text-gray-400 mb-2" />
          <p className="text-sm text-gray-600 mb-2">Click to browse or drag and drop</p>
          <p className="text-xs text-gray-500">CSV files only</p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleFileChange}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
          {uploadStatus.fileName && (
            <div className="mt-2 text-sm text-gray-800 flex items-center">
              <FileText className="h-4 w-4 mr-1" />
              {uploadStatus.fileName}
            </div>
          )}
        </div>
        
        {uploadStatus.isUploading && (
          <div className="mt-2">
            <div className="bg-gray-200 rounded-full h-2.5 mb-2">
              <div 
                className="bg-orange-600 h-2.5 rounded-full transition-all duration-300" 
                style={{ width: `${uploadStatus.progress}%` }}
              ></div>
            </div>
            <p className="text-xs text-gray-600 text-right">
              {uploadStatus.progress}% uploaded
            </p>
          </div>
        )}
        
        {uploadStatus.result && (
          <div className="mt-4 p-4 bg-white rounded-md border text-sm">
            <div className="flex items-center mb-3">
              <CheckCircle className="h-5 w-5 text-green-600 mr-2" />
              <h4 className="font-medium text-gray-900">Import Results</h4>
            </div>
            
            <div className="grid grid-cols-2 gap-4 mb-3">
              <div className="flex justify-between text-gray-700">
                <span>Groups created:</span>
                <span className="font-medium">{uploadStatus.result.groupsCreated}</span>
              </div>
              <div className="flex justify-between text-gray-700">
                <span>Time slots created:</span>
                <span className="font-medium">{uploadStatus.result.timeSlotsCreated}</span>
              </div>
            </div>
            
            {uploadStatus.result.warnings.length > 0 && (
              <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded">
                <div className="flex items-center mb-2">
                  <AlertTriangle className="h-4 w-4 text-yellow-600 mr-1" />
                  <h5 className="text-yellow-800 font-medium text-xs">Warnings ({uploadStatus.result.warnings.length})</h5>
                </div>
                <ul className="text-xs text-yellow-700 pl-4 list-disc max-h-20 overflow-y-auto">
                  {uploadStatus.result.warnings.slice(0, 3).map((warning, i) => (
                    <li key={i}>{warning}</li>
                  ))}
                  {uploadStatus.result.warnings.length > 3 && (
                    <li>...and {uploadStatus.result.warnings.length - 3} more warnings</li>
                  )}
                </ul>
              </div>
            )}
            
            {uploadStatus.result.errors.length > 0 && (
              <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded">
                <div className="flex items-center mb-2">
                  <AlertTriangle className="h-4 w-4 text-red-600 mr-1" />
                  <h5 className="text-red-800 font-medium text-xs">Errors ({uploadStatus.result.errors.length})</h5>
                </div>
                <ul className="text-xs text-red-700 pl-4 list-disc max-h-20 overflow-y-auto">
                  {uploadStatus.result.errors.slice(0, 3).map((error, i) => (
                    <li key={i}>{error}</li>
                  ))}
                  {uploadStatus.result.errors.length > 3 && (
                    <li>...and {uploadStatus.result.errors.length - 3} more errors</li>
                  )}
                </ul>
              </div>
            )}
            
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={clearResults}
                className="text-xs text-gray-500 hover:text-gray-700"
              >
                Clear Results
              </button>
            </div>
          </div>
        )}
        
        <div className="flex justify-end space-x-2">
          {uploadStatus.result && (
            <button
              type="button"
              onClick={clearResults}
              className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Upload Another File
            </button>
          )}
          <button 
            type="submit"
            className={`px-6 py-2 rounded-md text-white flex items-center ${
              isActionLoading ? 'bg-orange-400' : 'bg-orange-600 hover:bg-orange-700'
            }`}
            disabled={isActionLoading || !uploadStatus.fileName || uploadStatus.isUploading}
          >
            <UploadCloud className="h-4 w-4 mr-2" />
            {isActionLoading ? 'Uploading...' : 'Upload File'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default DataImport;