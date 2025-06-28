import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Upload, FileText, Download, Trash2, Plus, Folder, User, Search, ArrowLeft, X, 
  AlertCircle, Building, Eye, ZoomIn, ZoomOut, CheckCircle, Clock,
  Users, Calendar, PenTool, Save, Check
} from 'lucide-react';

interface Document {
  id: number;
  name: string;
  type: string;
  size: string;
  uploadedAt: string;
  category: string;
  description?: string;
  uploadedBy?: string;
  coachId: number;
  requiresAcknowledgment: boolean;
  acknowledgmentDeadline?: string;
  isAcknowledged?: boolean;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
  signature?: string;
}

interface Coach {
  id: number;
  name: string;
  email: string;
  club_name: string;
  role: string;
  documents: Document[];
}

interface DocumentHubProps {
  onBack: () => void;
}

interface CurrentUser {
  id: number;
  name: string;
  role: string;
  is_admin: boolean;
}

const DocumentHub: React.FC<DocumentHubProps> = ({ onBack }) => {
  // State management
  const [selectedCoaches, setSelectedCoaches] = useState<Set<number>>(new Set());
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [previewDocument, setPreviewDocument] = useState<Document | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [deletingDocumentId, setDeletingDocumentId] = useState<number | null>(null);
  const [csvData, setCsvData] = useState<any[] | null>(null);
  const [pdfScale, setPdfScale] = useState(1.0);
  const [acknowledging, setAcknowledging] = useState(false);
  
  // Form refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const categoryRef = useRef<HTMLSelectElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const requiresAckRef = useRef<HTMLInputElement>(null);
  const deadlineRef = useRef<HTMLInputElement>(null);
  const signatureRef = useRef<HTMLInputElement>(null);
  const notesRef = useRef<HTMLTextAreaElement>(null);

  // Initialize data on component mount
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        setLoading(true);
        
        // Fetch current user
        const userResponse = await fetch('/api/current-user');
        if (userResponse.ok) {
          const userData = await userResponse.json();
          setCurrentUser(userData);
          
          // Fetch coaches
          const coachesResponse = await fetch('/communication/api/organisation/coaches');
          if (coachesResponse.ok) {
            const coachData = await coachesResponse.json();
            
            let filteredCoaches = coachData;
            if (!userData.is_admin) {
              filteredCoaches = coachData.filter((coach: any) => coach.id === userData.id);
              // Auto-select the current user if not admin
              setSelectedCoaches(new Set([userData.id]));
            }
            
            const coachesWithDocuments = filteredCoaches.map((coach: any) => ({
              ...coach,
              documents: []
            }));
            
            setCoaches(coachesWithDocuments);
            await fetchDocumentsForAllCoaches(coachesWithDocuments);
          }
        }
        
        // Fetch categories
        const categoriesResponse = await fetch('/communication/api/documents/categories');
        if (categoriesResponse.ok) {
          const categoriesData = await categoriesResponse.json();
          setCategories(categoriesData);
        }
        
      } catch (err) {
        console.error('Error fetching initial data:', err);
        setError('Failed to load data');
      } finally {
        setLoading(false);
      }
    };

    fetchInitialData();
  }, []);

  // Auto-hide success messages
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => {
        setSuccess(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  // Fetch documents for all coaches
  const fetchDocumentsForAllCoaches = async (coachList: Coach[]) => {
    try {
      const updatedCoaches = await Promise.all(
        coachList.map(async (coach) => {
          try {
            const response = await fetch(`/communication/api/documents?coach_id=${coach.id}`);
            if (response.ok) {
              const documents = await response.json();
              return { ...coach, documents };
            }
            return coach;
          } catch (err) {
            console.error(`Error fetching documents for coach ${coach.id}:`, err);
            return coach;
          }
        })
      );
      
      setCoaches(updatedCoaches);
    } catch (err) {
      console.error('Error fetching documents for all coaches:', err);
    }
  };

  // Fetch documents for specific coach
  const fetchDocumentsForCoach = async (coachId: number) => {
    try {
      const response = await fetch(`/communication/api/documents?coach_id=${coachId}`);
      if (response.ok) {
        const documents = await response.json();
        
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
    } catch (err) {
      console.error('Error fetching documents:', err);
      setError('Failed to load documents');
    }
  };

  // Handle coach selection (toggle)
  const handleCoachToggle = useCallback((coachId: number) => {
    setSelectedCoaches(prev => {
      const newSet = new Set(prev);
      if (newSet.has(coachId)) {
        newSet.delete(coachId);
      } else {
        newSet.add(coachId);
      }
      return newSet;
    });
    setError(null);
    setSuccess(null);
  }, []);

  // Handle select all coaches
  const handleSelectAllCoaches = useCallback(() => {
    const filteredCoaches = coaches.filter(coach => {
      const name = coach.name || '';
      const email = coach.email || '';
      const clubName = coach.club_name || '';
      const searchLower = searchTerm.toLowerCase();
      
      return name.toLowerCase().includes(searchLower) ||
             email.toLowerCase().includes(searchLower) ||
             clubName.toLowerCase().includes(searchLower);
    });

    if (selectedCoaches.size === filteredCoaches.length) {
      setSelectedCoaches(new Set());
    } else {
      setSelectedCoaches(new Set(filteredCoaches.map(coach => coach.id)));
    }
  }, [coaches, searchTerm, selectedCoaches.size]);

  // Handle upload modal open
  const handleUploadClick = useCallback(() => {
    if (selectedCoaches.size === 0) {
      setError('Please select at least one coach to upload documents to');
      return;
    }
    setUploadModalOpen(true);
    setError(null);
    setSuccess(null);
  }, [selectedCoaches.size]);

  // Handle file upload
  const handleFileUpload = useCallback(async () => {
    if (!fileInputRef.current || !categoryRef.current || !descriptionRef.current) return;
    
    const files = fileInputRef.current.files;
    const category = categoryRef.current.value;
    const description = descriptionRef.current.value;
    const requiresAck = requiresAckRef.current?.checked || false;
    const deadline = deadlineRef.current?.value || '';
    
    if (!files || files.length === 0) {
      setError('Please select at least one file');
      return;
    }
    
    if (selectedCoaches.size === 0) {
      setError('Please select at least one coach');
      return;
    }
    
    const formData = new FormData();
    
    // Add all files to FormData
    Array.from(files).forEach(file => {
      formData.append('files', file);
    });
    
    formData.append('category', category);
    formData.append('description', description);
    formData.append('requires_acknowledgment', requiresAck.toString());
    formData.append('coach_ids', Array.from(selectedCoaches).join(','));
    
    if (deadline) {
      // Convert date to ISO string for backend (will be treated as end of day)
      const deadlineDate = new Date(deadline);
      deadlineDate.setHours(23, 59, 59, 999); // Set to end of day
      formData.append('acknowledgment_deadline', deadlineDate.toISOString());
    }
    
    try {
      setUploading(true);
      setError(null);
      
      const response = await fetch('/communication/api/documents', {
        method: 'POST',
        body: formData,
      });
      
      if (response.ok) {
        const uploadResult = await response.json();
        setUploadModalOpen(false);
        
        // Refresh documents for all selected coaches
        const selectedCoachList = coaches.filter(coach => selectedCoaches.has(coach.id));
        await fetchDocumentsForAllCoaches(selectedCoachList);
        
        // Clear form
        clearUploadForm();
        setSuccess(uploadResult.message);
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Upload failed');
      }
    } catch (err) {
      console.error('Upload error:', err);
      setError('Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  }, [coaches, selectedCoaches]);

  const clearUploadForm = useCallback(() => {
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (categoryRef.current) categoryRef.current.value = categories[0] || '';
    if (descriptionRef.current) descriptionRef.current.value = '';
    if (requiresAckRef.current) requiresAckRef.current.checked = false;
    if (deadlineRef.current) deadlineRef.current.value = '';
  }, [categories]);

  // Handle document acknowledgment
  const handleAcknowledgeDocument = async () => {
    if (!previewDocument || !signatureRef.current) return;
    
    const signature = signatureRef.current.value.trim();
    const notes = notesRef.current?.value || '';
    
    if (!signature) {
      setError('Please provide your signature/name');
      return;
    }
    
    try {
      setAcknowledging(true);
      setError(null);
      
      const response = await fetch(`/communication/api/documents/${previewDocument.id}/acknowledge`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          signature,
          notes
        })
      });
      
      if (response.ok) {
        await response.json();
        
        // Update the document in preview state
        setPreviewDocument(prev => prev ? {
          ...prev,
          isAcknowledged: true,
          acknowledgedAt: new Date().toISOString(),
          acknowledgedBy: currentUser?.name || signature,
          signature
        } : null);
        
        // Refresh documents for the current user
        if (currentUser) {
          await fetchDocumentsForCoach(currentUser.id);
        }
        
        setSuccess('Document acknowledged successfully!');
        
        // Clear acknowledgment form
        if (signatureRef.current) signatureRef.current.value = '';
        if (notesRef.current) notesRef.current.value = '';
        
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to acknowledge document');
      }
    } catch (err) {
      console.error('Acknowledgment error:', err);
      setError('Failed to acknowledge document');
    } finally {
      setAcknowledging(false);
    }
  };

  // Check if document is previewable
  const isPreviewable = (document: Document): boolean => {
    const previewableTypes = ['PDF', 'JPG', 'JPEG', 'PNG', 'GIF', 'WEBP', 'CSV', 'TXT'];
    return previewableTypes.includes(document.type.toUpperCase());
  };

  // Handle document preview
  const handlePreview = async (document: Document) => {
    try {
      setPreviewLoading(true);
      setPreviewDocument(document);
      setPreviewModalOpen(true);
      setCsvData(null);
      setPreviewUrl(null);
      setPdfScale(1.0);

      // Always open modal, but only fetch preview for supported types
      if (isPreviewable(document)) {
        const response = await fetch(`/communication/api/documents/${document.id}/preview`);
        if (response.ok) {
          const result = await response.json();
          
          // Update document with latest acknowledgment status
          if (result.document) {
            setPreviewDocument(result.document);
          }
          
          if (document.type.toUpperCase() === 'CSV') {
            setCsvData(result.content);
          } else {
            setPreviewUrl(result.preview_url);
          }
        } else {
          // Keep modal open but show error in preview area
          console.error('Failed to load preview');
        }
      } else {
        // For non-previewable files, just update document status if needed
        try {
          const response = await fetch(`/communication/api/documents/${document.id}/preview`);
          if (response.ok) {
            const result = await response.json();
            if (result.document) {
              setPreviewDocument(result.document);
            }
          }
        } catch (err) {
          // Ignore errors for non-previewable files, just show the modal
          console.log('Preview status update failed, continuing with modal');
        }
      }
    } catch (err) {
      console.error('Preview error:', err);
      // Still show modal even if there's an error
    } finally {
      setPreviewLoading(false);
    }
  };

  // Handle document actions (download, delete, preview)
  const handleDocumentAction = async (action: string, document: Document) => {
    try {
      if (action === 'preview') {
        await handlePreview(document);
        return;
      }

      if (action === 'download') {
        const response = await fetch(`/communication/api/documents/${document.id}/download`);
        if (response.ok) {
          const result = await response.json();
          window.open(result.download_url, '_blank');
        } else {
          setError('Failed to generate download link');
        }
      } else if (action === 'delete') {
        if (!currentUser?.is_admin && document.uploadedBy !== currentUser?.id?.toString()) {
          setError('You can only delete your own documents');
          return;
        }
        
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
              // Refresh documents for the coach who owned this document
              await fetchDocumentsForCoach(document.coachId);
              setSuccess(`Document "${document.name}" has been permanently deleted.`);
            } else {
              const errorData = await response.json();
              setError(errorData.error || 'Failed to delete document');
            }
            
            setDeletingDocumentId(null);
          } else if (userInput !== null) {
            setError('Deletion cancelled - please type "DELETE" exactly to confirm.');
          }
        }
      }
    } catch (err) {
      console.error(`Error with ${action}:`, err);
      setError(`Failed to ${action} document`);
      setDeletingDocumentId(null);
    }
  };

  // Filter coaches based on search term
  const filteredCoaches = coaches.filter(coach => {
    const name = coach.name || '';
    const email = coach.email || '';
    const clubName = coach.club_name || '';
    const searchLower = searchTerm.toLowerCase();
    
    return name.toLowerCase().includes(searchLower) ||
           email.toLowerCase().includes(searchLower) ||
           clubName.toLowerCase().includes(searchLower);
  });

  // Get documents for selected coaches
  const getDocumentsForSelectedCoaches = () => {
    if (selectedCoaches.size === 0) {
      return [];
    }
    
    const allDocuments: Document[] = [];
    selectedCoaches.forEach(coachId => {
      const coach = coaches.find(c => c.id === coachId);
      if (coach) {
        allDocuments.push(...coach.documents);
      }
    });
    
    // Sort by creation date
    return allDocuments.sort((a, b) => 
      new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
    );
  };

  // Document Card Component
  const DocumentCard: React.FC<{ document: Document }> = ({ document }) => {
    const documentIsPreviewable = isPreviewable(document);
    
    // All documents are now clickable to open preview modal
    const handleCardClick = () => {
      handleDocumentAction('preview', document);
    };

    // Calculate deadline status
    const getDeadlineStatus = () => {
      if (!document.requiresAcknowledgment || !document.acknowledgmentDeadline || document.isAcknowledged) {
        return 'none';
      }
      
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Start of today
      
      const deadline = new Date(document.acknowledgmentDeadline);
      deadline.setHours(0, 0, 0, 0); // Start of deadline day
      
      if (deadline < today) {
        return 'overdue'; // Red
      } else if (deadline.getTime() === today.getTime()) {
        return 'due-today'; // Orange
      }
      return 'upcoming'; // White/normal
    };

    const deadlineStatus = getDeadlineStatus();

    return (
      <div 
        className={`bg-white border border-gray-200 rounded-lg p-4 transition-all duration-200 hover:shadow-md hover:border-blue-300 cursor-pointer ${
          deadlineStatus === 'overdue' ? 'border-red-300 bg-red-50' :
          deadlineStatus === 'due-today' ? 'border-orange-300 bg-orange-50' : ''
        }`}
        onClick={handleCardClick}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-start space-x-3 flex-1">
            <div className={`p-2 rounded-lg flex-shrink-0 ${
              documentIsPreviewable ? 'bg-blue-50' : 'bg-gray-50'
            }`}>
              {documentIsPreviewable ? (
                <Eye className="h-5 w-5 text-blue-600" />
              ) : (
                <FileText className="h-5 w-5 text-gray-600" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center space-x-2">
                <h3 className="text-sm font-medium truncate text-gray-900">
                  {document.name}
                </h3>
                {document.requiresAcknowledgment && (
                  document.isAcknowledged ? (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  ) : (
                    <Clock className={`h-4 w-4 ${
                      deadlineStatus === 'overdue' ? 'text-red-500' :
                      deadlineStatus === 'due-today' ? 'text-orange-500' : 'text-gray-500'
                    }`} />
                  )
                )}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {document.size} • {document.type} • {document.uploadedAt}
              </p>
              {document.uploadedBy && (
                <p className="text-xs text-gray-400">by {document.uploadedBy}</p>
              )}
              
              <div className="flex items-center space-x-2 mt-2">
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  document.category === 'Certificates' ? 'bg-green-100 text-green-800' :
                  document.category === 'Meeting Notes' ? 'bg-red-100 text-red-800' :
                  document.category === 'Policies' ? 'bg-yellow-100 text-yellow-800' :
                  document.category === 'General' ? 'bg-purple-100 text-purple-800' :
                  'bg-blue-100 text-blue-800'
                }`}>
                  {document.category}
                </span>
              </div>
              
              {document.acknowledgmentDeadline && (
                <p className={`text-xs mt-1 ${
                  deadlineStatus === 'overdue' ? 'text-red-600' :
                  deadlineStatus === 'due-today' ? 'text-orange-600' : 'text-gray-600'
                }`}>
                  <Calendar className="h-3 w-3 inline mr-1" />
                  Due: {new Date(document.acknowledgmentDeadline).toLocaleDateString()}
                  {deadlineStatus === 'overdue' && ' (Overdue)'}
                  {deadlineStatus === 'due-today' && ' (Due Today)'}
                </p>
              )}
              
              {document.isAcknowledged && (
                <p className="text-xs text-green-600 mt-1">
                  <CheckCircle className="h-3 w-3 inline mr-1" />
                  Acknowledged by you on {document.acknowledgedAt ? new Date(document.acknowledgedAt).toLocaleDateString() : 'N/A'}
                </p>
              )}
              
              {document.description && (
                <p className="text-xs text-gray-600 mt-2">{document.description}</p>
              )}
            </div>
          </div>
          <div className="flex items-center space-x-1 flex-shrink-0">
            <button 
              onClick={(e) => {
                e.stopPropagation();
                handleDocumentAction('download', document);
              }}
              className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
            >
              <Download className="h-4 w-4" />
            </button>
            {(currentUser?.is_admin || document.uploadedBy === currentUser?.id?.toString()) && (
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  handleDocumentAction('delete', document);
                }}
                disabled={deletingDocumentId === document.id}
                className="p-1 text-gray-400 hover:text-red-600 transition-colors disabled:opacity-50"
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
  };

  // Coach List Item Component
  const CoachListItem: React.FC<{ coach: Coach }> = ({ coach }) => {
    const name = coach.name || 'Unknown Coach';
    const email = coach.email || 'No email';
    const clubName = coach.club_name || 'No club';
    const initials = name.split(' ').map(n => n[0] || '').join('').substring(0, 2) || 'UC';
    const isSelected = selectedCoaches.has(coach.id);
    
    // Count unacknowledged documents
    const unacknowledgedCount = coach.documents.filter(doc => 
      doc.requiresAcknowledgment && !doc.isAcknowledged
    ).length;
    
    return (
      <div
        className={`w-full text-left p-4 rounded-lg transition-all duration-200 border-2 cursor-pointer ${
          isSelected 
            ? 'bg-blue-50 border-blue-200' 
            : 'bg-white border-gray-200 hover:bg-gray-50'
        }`}
        onClick={() => handleCoachToggle(coach.id)}
      >
        <div className="flex items-center space-x-3">
          <div className="flex items-center">
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => {}} // Handled by parent div onClick
              className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 pointer-events-none"
            />
          </div>
          <div className="bg-gradient-to-br from-blue-400 to-blue-600 h-10 w-10 rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-medium text-gray-900 truncate">{name}</h3>
            <p className="text-xs text-gray-500 truncate">{email}</p>
            <div className="flex items-center space-x-1 mt-1">
              <Building className="h-3 w-3 text-gray-400" />
              <p className="text-xs text-gray-500 truncate">{clubName}</p>
            </div>
            <div className="flex items-center space-x-2 mt-1">
              <p className="text-xs text-blue-600">
                {coach.documents.length} document{coach.documents.length !== 1 ? 's' : ''}
              </p>
              {unacknowledgedCount > 0 && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-orange-100 text-orange-800">
                  {unacknowledgedCount} pending
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Preview Modal Component
  const PreviewModal: React.FC = () => {
    if (!previewDocument) return null;

    const needsAcknowledgment = previewDocument.requiresAcknowledgment && !previewDocument.isAcknowledged;

    const renderPreviewContent = () => {
      if (previewLoading) {
        return (
          <div className="flex items-center justify-center h-96">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-4 text-gray-600">Loading preview...</p>
            </div>
          </div>
        );
      }

      const fileType = previewDocument.type.toUpperCase();
      
      // Check if this file type is previewable
      if (!isPreviewable(previewDocument)) {
        return (
          <div className="text-center py-12 bg-gray-50 rounded-lg">
            <FileText className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Preview Not Available</h3>
            <p className="text-gray-600 mb-6 max-w-md mx-auto">
              This file type ({previewDocument.type}) cannot be previewed in the browser. 
              Please download the file to view its contents.
            </p>
            <button
              onClick={() => handleDocumentAction('download', previewDocument)}
              className="inline-flex items-center px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              <Download className="h-5 w-5 mr-2" />
              Download to View
            </button>
            {previewDocument.requiresAcknowledgment && !previewDocument.isAcknowledged && (
              <p className="text-sm text-orange-600 mt-4">
                <Clock className="h-4 w-4 inline mr-1" />
                After downloading and reviewing, please acknowledge this document below.
              </p>
            )}
          </div>
        );
      }

      if (['JPG', 'JPEG', 'PNG', 'GIF', 'WEBP'].includes(fileType)) {
        return (
          <div className="flex justify-center">
            <img 
              src={previewUrl || ''} 
              alt={previewDocument.name}
              className="max-w-full max-h-96 object-contain rounded-lg"
              onError={() => setError('Failed to load image preview')}
            />
          </div>
        );
      }

      if (fileType === 'PDF') {
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-center space-x-4 bg-gray-50 p-3 rounded-lg">
              <button
                onClick={() => setPdfScale(Math.max(0.5, pdfScale - 0.25))}
                className="p-2 bg-white border rounded-lg hover:bg-gray-50"
              >
                <ZoomOut className="h-4 w-4" />
              </button>
              <span className="text-sm text-gray-600">{Math.round(pdfScale * 100)}%</span>
              <button
                onClick={() => setPdfScale(Math.min(3, pdfScale + 0.25))}
                className="p-2 bg-white border rounded-lg hover:bg-gray-50"
              >
                <ZoomIn className="h-4 w-4" />
              </button>
              <button
                onClick={() => setPdfScale(1.0)}
                className="px-3 py-2 bg-white border rounded-lg hover:bg-gray-50 text-sm"
              >
                Reset
              </button>
            </div>
            <div className="border rounded-lg overflow-hidden">
              <iframe
                src={`${previewUrl}#zoom=${Math.round(pdfScale * 100)}`}
                className="w-full h-96"
                title={previewDocument.name}
                onError={() => setError('Failed to load PDF preview')}
              />
            </div>
          </div>
        );
      }

      if (fileType === 'CSV' && csvData) {
        return (
          <div className="overflow-auto max-h-96">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {csvData.length > 0 && Object.keys(csvData[0]).map((header, index) => (
                    <th key={index} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {csvData.slice(0, 100).map((row, rowIndex) => (
                  <tr key={rowIndex} className={rowIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    {Object.values(row).map((cell: any, cellIndex) => (
                      <td key={cellIndex} className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {String(cell || '')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {csvData.length > 100 && (
              <div className="text-center py-4 text-sm text-gray-500">
                Showing first 100 rows of {csvData.length} total rows
              </div>
            )}
          </div>
        );
      }

      if (fileType === 'TXT') {
        return (
          <div className="bg-gray-50 p-4 rounded-lg max-h-96 overflow-auto">
            <pre className="text-sm text-gray-900 whitespace-pre-wrap">{previewUrl}</pre>
          </div>
        );
      }

      return (
        <div className="text-center py-12">
          <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600">Preview not available for this file type</p>
        </div>
      );
    };

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg w-full max-w-4xl mx-4 max-h-[90vh] flex flex-col">
          {/* Fixed Header */}
          <div className="flex-shrink-0 bg-white border-b px-6 py-4 flex justify-between items-center rounded-t-lg">
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-lg font-semibold">{previewDocument.name}</h3>
                {previewDocument.requiresAcknowledgment && (
                  previewDocument.isAcknowledged ? (
                    <CheckCircle className="h-5 w-5 text-green-500" />
                  ) : (
                    <Clock className="h-5 w-5 text-orange-500" />
                  )
                )}
              </div>
              <p className="text-sm text-gray-500">
                {previewDocument.size} • {previewDocument.type} • {previewDocument.category}
              </p>
              {previewDocument.isAcknowledged && (
                <p className="text-sm text-green-600 mt-1">
                  Acknowledged by you on {
                    previewDocument.acknowledgedAt ? new Date(previewDocument.acknowledgedAt).toLocaleDateString() : 'N/A'
                  }
                </p>
              )}
            </div>
            <button 
              onClick={() => {
                setPreviewModalOpen(false);
                setPreviewDocument(null);
                setPreviewUrl(null);
                setCsvData(null);
              }}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="h-6 w-6" />
            </button>
          </div>
          
          {/* Scrollable Content Area */}
          <div className="flex-1 overflow-auto">
            <div className="p-6">
              {renderPreviewContent()}
            </div>
            
            {/* Acknowledgment Section */}
            {needsAcknowledgment && (
              <div className="border-t px-6 py-4 bg-orange-50">
                <div className="flex items-start space-x-3">
                  <PenTool className="h-5 w-5 text-orange-600 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-medium text-orange-900 mb-2">
                      This document requires your acknowledgment
                    </h4>
                    {previewDocument.acknowledgmentDeadline && (
                      <p className="text-sm text-orange-700 mb-3">
                        <Calendar className="h-4 w-4 inline mr-1" />
                        Due: {new Date(previewDocument.acknowledgmentDeadline).toLocaleDateString()}
                      </p>
                    )}
                    
                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Digital Signature (Your Name) *
                        </label>
                        <input
                          ref={signatureRef}
                          type="text"
                          placeholder="Enter your full name"
                          defaultValue={currentUser?.name || ''}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                        />
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Notes (Optional)
                        </label>
                        <textarea
                          ref={notesRef}
                          rows={2}
                          placeholder="Any comments about this document..."
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                        />
                      </div>
                      
                      <button
                        onClick={handleAcknowledgeDocument}
                        disabled={acknowledging}
                        className="flex items-center px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {acknowledging ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                            Acknowledging...
                          </>
                        ) : (
                          <>
                            <Save className="h-4 w-4 mr-2" />
                            Mark as Read & Acknowledged
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
          
          {/* Fixed Footer */}
          <div className="flex-shrink-0 border-t px-6 py-4 bg-gray-50 flex justify-between items-center rounded-b-lg">
            <div className="text-sm text-gray-500">
              {previewDocument.description && (
                <p><strong>Description:</strong> {previewDocument.description}</p>
              )}
            </div>
            <button
              onClick={() => handleDocumentAction('download', previewDocument)}
              className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Download className="h-4 w-4 mr-2" />
              Download
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Upload Modal Component - Isolated state management for checkbox
  const UploadModal: React.FC = () => {
    // LOCAL state for this modal only - isolated from parent re-renders
    const [showDeadlineField, setShowDeadlineField] = useState(false);
    
    const selectedCoachNames = Array.from(selectedCoaches)
      .map(id => coaches.find(c => c.id === id)?.name)
      .filter(Boolean);

    // Handle acknowledgment checkbox - purely local to this modal
    const handleAckCheckboxChange = (checked: boolean) => {
      setShowDeadlineField(checked);
      
      // Update the actual checkbox ref but don't cause parent re-render
      if (requiresAckRef.current) {
        requiresAckRef.current.checked = checked;
      }
      
      // Clear deadline when unchecking
      if (!checked && deadlineRef.current) {
        deadlineRef.current.value = '';
      }
    };

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-auto">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">Upload Document(s)</h3>
            <button 
              onClick={() => setUploadModalOpen(false)}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          
          <div className="space-y-4">
            {/* Upload Destination Info */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <div className="flex items-center space-x-2">
                <Users className="h-4 w-4 text-blue-600" />
                <span className="text-sm font-medium text-blue-900">
                  Upload to {selectedCoaches.size} coach{selectedCoaches.size !== 1 ? 'es' : ''}
                </span>
              </div>
              <p className="text-xs text-blue-700 mt-1">
                Uploading to: {selectedCoachNames.join(', ')}
              </p>
            </div>

            {/* File Input - Completely isolated */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Files * (Multiple files supported)
              </label>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                required
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.jpg,.jpeg,.png,.gif,.mp4,.mp3,.zip,.csv"
              />
              <p className="text-xs text-gray-500 mt-1">
                Select one or more files to upload
              </p>
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
            
            {/* Acknowledgment Section with Local State */}
            <div className="border-t pt-4">
              <div className="flex items-center space-x-2 mb-3">
                <input
                  ref={requiresAckRef}
                  type="checkbox"
                  id="requiresAck"
                  onChange={(e) => handleAckCheckboxChange(e.target.checked)}
                  className="rounded border-gray-300 text-orange-600 focus:ring-orange-500"
                />
                <label htmlFor="requiresAck" className="text-sm font-medium text-gray-700">
                  <CheckCircle className="h-4 w-4 inline mr-1" />
                  Require acknowledgment/signature
                </label>
              </div>
              
              {/* Conditional Date Field - Based on LOCAL state */}
              {showDeadlineField && (
                <div className="ml-6 space-y-2 animate-in slide-in-from-top-2 duration-200">
                  <label className="block text-sm font-medium text-gray-700">
                    Acknowledgment Deadline (Optional)
                  </label>
                  <input
                    ref={deadlineRef}
                    type="date"
                    className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  />
                  <p className="text-xs text-gray-500">
                    Set a deadline date for when coaches must acknowledge this document
                  </p>
                </div>
              )}
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
  };

  // Main render
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

  const selectedDocuments = getDocumentsForSelectedCoaches();

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
              ? 'Select coaches to manage their documents. Documents will be uploaded individually to each selected coach.' 
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
          {/* Coach List Sidebar */}
          {coaches.length > 0 && (
            <div className="lg:col-span-1">
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-gray-900">
                    {currentUser?.is_admin ? 'Select Coaches' : 'Your Documents'}
                  </h2>
                  <span className="text-sm text-gray-500">{coaches.length} total</span>
                </div>

                {currentUser?.is_admin && (
                  <div className="mb-4">
                    <button
                      onClick={handleSelectAllCoaches}
                      className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                    >
                      {selectedCoaches.size === filteredCoaches.length ? 'Deselect All' : 'Select All'}
                    </button>
                    <p className="text-xs text-gray-500 mt-1">
                      {selectedCoaches.size} coach{selectedCoaches.size !== 1 ? 'es' : ''} selected
                    </p>
                  </div>
                )}
                
                {(currentUser?.is_admin && coaches.length > 1) && (
                  <div className="relative mb-4">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search coaches or clubs..." 
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                )}

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
            <div>
              {/* Upload Button and Selection Status */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className="flex items-center space-x-2">
                      <Users className="h-6 w-6 text-blue-500" />
                      <div>
                        <h2 className="text-xl font-semibold text-gray-900">
                          {selectedCoaches.size} Coach{selectedCoaches.size !== 1 ? 'es' : ''} Selected
                        </h2>
                        <p className="text-gray-600">
                          {selectedCoaches.size === 0 
                            ? 'Select coaches to upload documents' 
                            : 'Documents will be uploaded individually to each coach'
                          }
                        </p>
                      </div>
                    </div>
                  </div>
                  <button 
                    onClick={handleUploadClick}
                    disabled={selectedCoaches.size === 0}
                    className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Upload Document(s)
                  </button>
                </div>
              </div>

              {/* Documents */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-semibold text-gray-900">
                    Documents ({selectedDocuments.length})
                  </h3>
                  <div className="flex items-center space-x-2">
                    <button className="p-2 text-gray-400 hover:text-gray-600 transition-colors">
                      <Folder className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {selectedDocuments.length > 0 ? (
                  <div className="grid grid-cols-1 gap-4">
                    {selectedDocuments.map(doc => (
                      <DocumentCard key={doc.id} document={doc} />
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No documents to display</h3>
                    <p className="text-gray-600 mb-4">
                      {selectedCoaches.size === 0 
                        ? 'Select coaches to view their documents and upload new ones'
                        : 'Upload the first document for the selected coaches'
                      }
                    </p>
                    <button 
                      onClick={handleUploadClick}
                      disabled={selectedCoaches.size === 0}
                      className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Upload Document(s)
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      {uploadModalOpen && <UploadModal />}
      {previewModalOpen && <PreviewModal />}
    </div>
  );
};

export default DocumentHub;