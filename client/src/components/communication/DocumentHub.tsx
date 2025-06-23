import React, { useState, useEffect, useRef } from 'react';
import { Upload, FileText, Download, Trash2, Plus, Folder, User, Search, ArrowLeft, X, AlertCircle } from 'lucide-react';

interface Document {
  id: number;
  name: string;
  type: string;
  size: string;
  uploadedAt: string;
  category: string;
  description?: string;
  uploadedBy?: string;
}

interface Coach {
  id: number;
  name: string;
  email: string;
  documents: Document[];
}

interface DocumentHubProps {
  onBack: () => void;
}

interface CurrentUser {
  id: number;
  role: string;
  is_admin: boolean;
}

const DocumentHub: React.FC<DocumentHubProps> = ({ onBack }) => {
  const [selectedCoach, setSelectedCoach] = useState<number | null>(null);
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [deletingDocumentId, setDeletingDocumentId] = useState<number | null>(null);
  
  // Upload form refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const categoryRef = useRef<HTMLSelectElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);

  // Fetch initial data
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        setLoading(true);
        
        // Fetch current user info first
        const userResponse = await fetch('/api/current-user');
        if (userResponse.ok) {
          const userData = await userResponse.json();
          setCurrentUser(userData);
          
          // Fetch coaches after we have user data
          const coachesResponse = await fetch('/api/coaches');
          if (coachesResponse.ok) {
            const coachData = await coachesResponse.json();
            
            // Filter coaches based on permissions
            let filteredCoaches = coachData;
            if (!userData.is_admin) {
              // Non-admin users can only see themselves
              filteredCoaches = coachData.filter((coach: any) => coach.id === userData.id);
            }
            
            const coachesWithDocuments = filteredCoaches.map((coach: any) => ({
              ...coach,
              documents: []
            }));
            
            setCoaches(coachesWithDocuments);
            
            // Fetch documents for all coaches to show counts immediately
            await fetchDocumentsForAllCoaches(coachesWithDocuments);
          }
        }
        
        // Fetch categories
        const categoriesResponse = await fetch('/communication/api/documents/categories');
        if (categoriesResponse.ok) {
          const categoriesData = await categoriesResponse.json();
          setCategories(categoriesData);
        }
        
      } catch (error) {
        console.error('Error fetching initial data:', error);
        setError('Failed to load data');
      } finally {
        setLoading(false);
      }
    };

    fetchInitialData();
  }, []);

  // Auto-hide success messages after 3 seconds
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => {
        setSuccess(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  // Fetch documents for all coaches to show counts
  const fetchDocumentsForAllCoaches = async (coachList: Coach[]) => {
    try {
      const updatedCoaches = await Promise.all(
        coachList.map(async (coach) => {
          try {
            const response = await fetch(`/communication/api/documents?coach_id=${coach.id}`);
            if (response.ok) {
              const documents = await response.json();
              return { ...coach, documents };
            } else {
              return coach;
            }
          } catch (error) {
            return coach;
          }
        })
      );
      
      setCoaches(updatedCoaches);
    } catch (error) {
      console.error('Error fetching documents for all coaches:', error);
    }
  };

  const fetchDocumentsForCoach = async (coachId: number) => {
    try {
      const response = await fetch(`/communication/api/documents?coach_id=${coachId}`);
      if (response.ok) {
        const documents = await response.json();
        
        // Update the specific coach's documents
        setCoaches(prevCoaches => 
          prevCoaches.map(coach => 
            coach.id === coachId 
              ? { ...coach, documents }
              : coach
          )
        );
      } else {
        setError('Failed to load documents');
      }
    } catch (error) {
      console.error('Error fetching documents:', error);
      setError('Failed to load documents');
    }
  };

  const handleCoachSelect = (coachId: number) => {
    setSelectedCoach(coachId);
    setError(null);
    setSuccess(null);
  };

  const handleUploadClick = () => {
    if (!selectedCoach) {
      setError('Please select a coach first');
      return;
    }
    
    // Check permissions - only allow upload if admin or uploading for self
    if (!currentUser?.is_admin && selectedCoach !== currentUser?.id) {
      setError('You can only upload documents for yourself');
      return;
    }
    
    setUploadModalOpen(true);
    setError(null);
    setSuccess(null);
  };

  const handleFileUpload = async () => {
    if (!selectedCoach || !fileInputRef.current || !categoryRef.current || !descriptionRef.current) return;
    
    const file = fileInputRef.current.files?.[0];
    const category = categoryRef.current.value;
    const description = descriptionRef.current.value;
    
    if (!file) {
      setError('Please select a file');
      return;
    }
    
    const formData = new FormData();
    formData.append('file', file);
    formData.append('category', category);
    formData.append('description', description);
    formData.append('coach_id', selectedCoach.toString());
    
    try {
      setUploading(true);
      setError(null);
      
      const response = await fetch('/communication/api/documents', {
        method: 'POST',
        body: formData,
      });
      
      if (response.ok) {
        
        // Close modal and refresh documents
        setUploadModalOpen(false);
        await fetchDocumentsForCoach(selectedCoach);
        
        // Reset form
        if (fileInputRef.current) fileInputRef.current.value = '';
        if (categoryRef.current) categoryRef.current.value = categories[0] || '';
        if (descriptionRef.current) descriptionRef.current.value = '';
        
        // Show success message
        setSuccess(`Document "${file.name}" uploaded successfully!`);
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Upload failed');
      }
    } catch (error) {
      console.error('Upload error:', error);
      setError('Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleDocumentAction = async (action: string, document: Document) => {
    try {
      if (action === 'download') {
        const response = await fetch(`/communication/api/documents/${document.id}/download`);
        if (response.ok) {
          const result = await response.json();
          // Open download URL in new tab
          window.open(result.download_url, '_blank');
        } else {
          setError('Failed to generate download link');
        }
      } else if (action === 'delete') {
        // Check permissions - only allow delete if admin or own document
        if (!currentUser?.is_admin && document.uploadedBy !== currentUser?.id?.toString()) {
          setError('You can only delete your own documents');
          return;
        }
        
        // Simple two-step delete confirmation
        const firstConfirm = confirm(`Are you sure you want to delete "${document.name}"?`);
        
        if (firstConfirm) {
          const userInput = prompt('Type "DELETE" in the box below to confirm deletion:');
          
          if (userInput === 'DELETE') {
            setDeletingDocumentId(document.id);
            setError(null);
            
            const response = await fetch(`/communication/api/documents/${document.id}`, {
              method: 'DELETE',
            });
            
            if (response.ok) {
              // Refresh documents for the selected coach
              if (selectedCoach) {
                await fetchDocumentsForCoach(selectedCoach);
              }
              setSuccess(`Document "${document.name}" has been permanently deleted.`);
            } else {
              const errorData = await response.json();
              setError(errorData.error || 'Failed to delete document');
            }
            
            setDeletingDocumentId(null);
          } else if (userInput !== null) {
            // User typed something other than DELETE
            setError('Deletion cancelled - please type "DELETE" exactly to confirm.');
          }
        }
        // If firstConfirm is false, user cancelled the first dialog, so do nothing
      }
    } catch (error) {
      console.error(`Error with ${action}:`, error);
      setError(`Failed to ${action} document`);
      setDeletingDocumentId(null);
    }
  };

  // Fixed search functionality with proper selected coach handling and null safety
  const filteredCoaches = coaches.filter(coach => {
    const name = coach.name || '';
    const email = coach.email || '';
    const searchLower = searchTerm.toLowerCase();
    
    return name.toLowerCase().includes(searchLower) ||
           email.toLowerCase().includes(searchLower);
  });

  // Check if selected coach is still in filtered results
  const selectedCoachData = coaches.find(coach => coach.id === selectedCoach);
  const isSelectedCoachVisible = filteredCoaches.some(coach => coach.id === selectedCoach);

  // Clear selection if selected coach is not visible in search results
  useEffect(() => {
    if (selectedCoach && !isSelectedCoachVisible && searchTerm) {
      setSelectedCoach(null);
    }
  }, [selectedCoach, isSelectedCoachVisible, searchTerm]);

  const DocumentCard: React.FC<{ document: Document }> = ({ document }) => (
    <div className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow duration-200">
      <div className="flex items-start justify-between">
        <div className="flex items-start space-x-3 flex-1">
          <div className="bg-blue-50 p-2 rounded-lg flex-shrink-0">
            <FileText className="h-5 w-5 text-blue-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-medium text-gray-900 truncate">{document.name}</h3>
            <p className="text-xs text-gray-500 mt-1">
              {document.size} • {document.type} • {document.uploadedAt}
            </p>
            {document.uploadedBy && (
              <p className="text-xs text-gray-400">by {document.uploadedBy}</p>
            )}
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium mt-2 ${
              document.category === 'Certificates' ? 'bg-green-100 text-green-800' :
              document.category === 'Meeting Notes' ? 'bg-red-100 text-red-800' :
              document.category === 'Policies' ? 'bg-yellow-100 text-yellow-800' :
              document.category === 'General' ? 'bg-purple-100 text-purple-800' :
              'bg-blue-100 text-blue-800'
            }`}>
              {document.category}
            </span>
            {document.description && (
              <p className="text-xs text-gray-600 mt-2">{document.description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center space-x-1 flex-shrink-0">
          <button 
            onClick={() => handleDocumentAction('download', document)}
            className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
            title="Download document"
          >
            <Download className="h-4 w-4" />
          </button>
          {/* Show delete button if admin or own document */}
          {(currentUser?.is_admin || document.uploadedBy === currentUser?.id?.toString()) && (
            <button 
              onClick={() => handleDocumentAction('delete', document)}
              disabled={deletingDocumentId === document.id}
              className="p-1 text-gray-400 hover:text-red-600 transition-colors disabled:opacity-50"
              title="Delete document"
            >
              {deletingDocumentId === document.id ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-red-600 border-t-transparent"></div>
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );

  const CoachListItem: React.FC<{ coach: Coach }> = ({ coach }) => {
    const name = coach.name || 'Unknown Coach';
    const email = coach.email || 'No email';
    const initials = name.split(' ').map(n => n[0] || '').join('').substring(0, 2) || 'UC';
    
    return (
      <button
        onClick={() => handleCoachSelect(coach.id)}
        className={`w-full text-left p-4 rounded-lg transition-all duration-200 ${
          selectedCoach === coach.id 
            ? 'bg-blue-50 border-2 border-blue-200' 
            : 'bg-white border border-gray-200 hover:bg-gray-50'
        }`}
      >
        <div className="flex items-center space-x-3">
          <div className="bg-gradient-to-br from-blue-400 to-blue-600 h-10 w-10 rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-medium text-gray-900 truncate">{name}</h3>
            <p className="text-xs text-gray-500 truncate">{email}</p>
            <p className="text-xs text-blue-600 mt-1">
              {coach.documents.length} document{coach.documents.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
      </button>
    );
  };

  const UploadModal: React.FC = () => (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">Upload Document</h3>
          <button 
            onClick={() => setUploadModalOpen(false)}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              File *
            </label>
            <input
              ref={fileInputRef}
              type="file"
              required
              className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.jpg,.jpeg,.png,.gif,.mp4,.mp3,.zip"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Category
            </label>
            <select
              ref={categoryRef}
              className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              defaultValue={categories[0] || ''}
            >
              {categories.map(category => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Description
            </label>
            <textarea
              ref={descriptionRef}
              rows={3}
              className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Optional description..."
            />
          </div>
          
          {error && (
            <div className="flex items-center space-x-2 text-red-600 bg-red-50 p-3 rounded-lg">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm">{error}</span>
            </div>
          )}
          
          <div className="flex space-x-3">
            <button
              type="button"
              onClick={() => setUploadModalOpen(false)}
              className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleFileUpload}
              disabled={uploading}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {uploading ? 'Uploading...' : 'Upload'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading coaches and documents...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header with Back Button */}
        <div className="mb-8">
          <div className="flex items-center space-x-4 mb-4">
            <button
              onClick={onBack}
              className="flex items-center text-blue-600 hover:text-blue-800 transition-colors"
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back to Communication Hub
            </button>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Document Hub</h1>
          <p className="text-gray-600">
            {currentUser?.is_admin 
              ? 'Share and manage documents with your coaching team' 
              : 'View and manage your documents'
            }
          </p>
        </div>

        {/* Success Alert */}
        {success && (
          <div className="mb-6 flex items-center space-x-2 text-green-600 bg-green-50 p-4 rounded-lg">
            <div className="flex-shrink-0">
              <div className="h-5 w-5 rounded-full bg-green-100 flex items-center justify-center">
                <div className="h-2 w-2 bg-green-600 rounded-full"></div>
              </div>
            </div>
            <span>{success}</span>
            <button 
              onClick={() => setSuccess(null)}
              className="ml-auto text-green-400 hover:text-green-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div className="mb-6 flex items-center space-x-2 text-red-600 bg-red-50 p-4 rounded-lg">
            <AlertCircle className="h-5 w-5" />
            <span>{error}</span>
            <button 
              onClick={() => setError(null)}
              className="ml-auto text-red-400 hover:text-red-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Coach List Sidebar - Only show if there are coaches */}
          {coaches.length > 0 && (
            <div className="lg:col-span-1">
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-gray-900">
                    {currentUser?.is_admin ? 'Coaches' : 'Your Documents'}
                  </h2>
                  <span className="text-sm text-gray-500">{coaches.length} total</span>
                </div>
                
                {/* Search - Show for admins and when there are multiple coaches */}
                {(currentUser?.is_admin && coaches.length > 1) && (
                  <div className="relative mb-4">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search coaches..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                )}

                {/* Coach List */}
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {filteredCoaches.length > 0 ? (
                    filteredCoaches.map(coach => (
                      <CoachListItem key={coach.id} coach={coach} />
                    ))
                  ) : (
                    <div className="text-center py-4">
                      <p className="text-gray-500 text-sm">
                        {searchTerm ? 'No coaches match your search' : 'No coaches found'}
                      </p>
                      {searchTerm && (
                        <button
                          onClick={() => setSearchTerm('')}
                          className="text-xs text-blue-600 hover:text-blue-800 mt-2"
                        >
                          Clear search
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Document Area */}
          <div className={`${coaches.length > 0 ? 'lg:col-span-2' : 'lg:col-span-3'}`}>
            {selectedCoachData && isSelectedCoachVisible ? (
              <div>
                {/* Selected Coach Header */}
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div className="bg-gradient-to-br from-blue-400 to-blue-600 h-12 w-12 rounded-full flex items-center justify-center text-white font-semibold">
                        {(selectedCoachData.name || 'Unknown').split(' ').map(n => n[0] || '').join('').substring(0, 2) || 'UC'}
                      </div>
                      <div>
                        <h2 className="text-xl font-semibold text-gray-900">{selectedCoachData.name || 'Unknown Coach'}</h2>
                        <p className="text-gray-600">{selectedCoachData.email || 'No email'}</p>
                      </div>
                    </div>
                    {/* Only show upload button if admin or viewing own documents */}
                    {(currentUser?.is_admin || selectedCoach === currentUser?.id) && (
                      <button 
                        onClick={handleUploadClick}
                        className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
                      >
                        <Upload className="h-4 w-4 mr-2" />
                        Upload Document
                      </button>
                    )}
                  </div>
                </div>

                {/* Documents */}
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-semibold text-gray-900">
                      Documents ({selectedCoachData.documents.length})
                    </h3>
                    <div className="flex items-center space-x-2">
                      <button className="p-2 text-gray-400 hover:text-gray-600 transition-colors">
                        <Folder className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {selectedCoachData.documents.length > 0 ? (
                    <div className="grid grid-cols-1 gap-4">
                      {selectedCoachData.documents.map(doc => (
                        <DocumentCard key={doc.id} document={doc} />
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                      <h3 className="text-lg font-medium text-gray-900 mb-2">No documents yet</h3>
                      <p className="text-gray-600 mb-4">
                        {currentUser?.is_admin || selectedCoach === currentUser?.id
                          ? `Upload the first document for ${selectedCoachData.name || 'this coach'}`
                          : 'No documents have been shared with this coach yet'
                        }
                      </p>
                      {(currentUser?.is_admin || selectedCoach === currentUser?.id) && (
                        <button 
                          onClick={handleUploadClick}
                          className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Upload Document
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
                <User className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  {coaches.length > 0 ? 'Select a Coach' : 'No Access'}
                </h3>
                <p className="text-gray-600">
                  {coaches.length > 0 
                    ? (currentUser?.is_admin 
                        ? 'Choose a coach from the list to view and manage their documents'
                        : 'Click on your name to view your documents')
                    : 'You don\'t have access to any documents yet'
                  }
                </p>
                {searchTerm && filteredCoaches.length === 0 && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="mt-4 text-sm text-blue-600 hover:text-blue-800"
                  >
                    Clear search to see all coaches
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Upload Modal */}
      {uploadModalOpen && <UploadModal />}
    </div>
  );
};

export default DocumentHub;