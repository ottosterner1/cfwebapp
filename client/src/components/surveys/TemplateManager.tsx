import React, { useState, useEffect } from 'react';
import { Alert, AlertDescription } from '../ui/alert';

interface SurveyTemplate {
  id: number;
  name: string;
  description?: string;
  purpose_statement: string;
  question_count: number;
  retention_days: number;
  max_frequency_days: number;
  allow_anonymous: boolean;
  created_at: string;
  created_by: string;
}

interface LibraryTemplate {
  name: string;
  description: string;
  purpose_statement: string;
  questions: Array<{
    question_text: string;
    question_type: string;
    is_required: boolean;
    order_index: number;
    options?: any;
  }>;
}

interface TemplateManagerProps {
  clubId: number;
  onEditTemplate: (templateId: number) => void;
  onCreateTemplate: () => void;
}

const TemplateManager: React.FC<TemplateManagerProps> = ({ 
  clubId, 
  onEditTemplate, 
  onCreateTemplate 
}) => {
  const [templates, setTemplates] = useState<SurveyTemplate[]>([]);
  const [libraryTemplates, setLibraryTemplates] = useState<LibraryTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showLibrary, setShowLibrary] = useState(false);
  const [creatingFromLibrary, setCreatingFromLibrary] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  useEffect(() => {
    fetchTemplates();
    fetchLibraryTemplates();
  }, [clubId]);

  const fetchTemplates = async () => {
    try {
      const response = await fetch(`/api/clubs/${clubId}/survey-templates`);
      if (response.ok) {
        const data = await response.json();
        setTemplates(data.templates);
      } else {
        throw new Error('Failed to fetch templates');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const fetchLibraryTemplates = async () => {
    try {
      const response = await fetch(`/api/clubs/${clubId}/survey-templates/library`);
      if (response.ok) {
        const data = await response.json();
        setLibraryTemplates(data.templates);
      }
    } catch (err) {
      console.error('Failed to fetch library templates:', err);
    }
  };

  const createFromLibrary = async (libraryTemplate: LibraryTemplate) => {
    setCreatingFromLibrary(libraryTemplate.name);
    try {
      const response = await fetch(`/api/clubs/${clubId}/survey-templates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: libraryTemplate.name,
          description: libraryTemplate.description,
          purpose_statement: libraryTemplate.purpose_statement,
          questions: libraryTemplate.questions
        })
      });

      if (response.ok) {
        await fetchTemplates();
        setShowLibrary(false);
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to create template');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setCreatingFromLibrary(null);
    }
  };

  const deleteTemplate = async (templateId: number) => {
    try {
      const response = await fetch(`/api/survey-templates/${templateId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        setTemplates(templates.filter(t => t.id !== templateId));
        setDeleteConfirm(null);
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to delete template');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  if (loading) {
    return (
      <div className="flex justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Survey Templates</h2>
          <p className="text-gray-600">Create and manage survey templates for your club</p>
        </div>
        <div className="flex space-x-3">
          <button
            onClick={() => setShowLibrary(true)}
            className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
          >
            Template Library
          </button>
          <button
            onClick={onCreateTemplate}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Create New Template
          </button>
        </div>
      </div>

      {error && (
        <Alert className="border-red-200 bg-red-50">
          <AlertDescription className="text-red-700">
            {error}
          </AlertDescription>
        </Alert>
      )}

      {/* Templates List */}
      {templates.length === 0 ? (
        <div className="text-center py-12">
          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <h3 className="mt-2 text-sm font-medium text-gray-900">No templates yet</h3>
          <p className="mt-1 text-sm text-gray-500">Get started by creating your first survey template</p>
          <div className="mt-6 flex justify-center space-x-3">
            <button
              onClick={() => setShowLibrary(true)}
              className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
            >
              Browse Templates
            </button>
            <button
              onClick={onCreateTemplate}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Create Template
            </button>
          </div>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {templates.map((template) => (
            <div key={template.id} className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-lg font-semibold text-gray-900 truncate">{template.name}</h3>
                <div className="flex space-x-1 ml-2">
                  <button
                    onClick={() => onEditTemplate(template.id)}
                    className="p-1 text-gray-400 hover:text-gray-600"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => setDeleteConfirm(template.id)}
                    className="p-1 text-gray-400 hover:text-red-600"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>

              {template.description && (
                <p className="text-sm text-gray-600 mb-3 line-clamp-2">{template.description}</p>
              )}

              <div className="space-y-2 text-sm text-gray-500">
                <div className="flex justify-between">
                  <span>Questions:</span>
                  <span className="font-medium">{template.question_count}</span>
                </div>
                <div className="flex justify-between">
                  <span>Retention:</span>
                  <span className="font-medium">{Math.round(template.retention_days / 365)} years</span>
                </div>
                <div className="flex justify-between">
                  <span>Anonymous:</span>
                  <span className={`font-medium ${template.allow_anonymous ? 'text-green-600' : 'text-red-600'}`}>
                    {template.allow_anonymous ? 'Yes' : 'No'}
                  </span>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-gray-200">
                <div className="flex justify-between items-center text-xs text-gray-500">
                  <span>Created {formatDate(template.created_at)}</span>
                  <span>by {template.created_by}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Library Modal */}
      {showLibrary && (
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg max-w-4xl max-h-screen overflow-y-auto m-4">
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-medium text-gray-900">Template Library</h3>
                <button
                  onClick={() => setShowLibrary(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="p-6">
              <div className="grid gap-6 md:grid-cols-2">
                {libraryTemplates.map((libraryTemplate, index) => (
                  <div key={index} className="border border-gray-200 rounded-lg p-4">
                    <h4 className="font-semibold text-gray-900 mb-2">{libraryTemplate.name}</h4>
                    <p className="text-sm text-gray-600 mb-3">{libraryTemplate.description}</p>
                    
                    <div className="space-y-1 text-xs text-gray-500 mb-4">
                      <div>Questions: {libraryTemplate.questions.length}</div>
                    </div>

                    <button
                      onClick={() => createFromLibrary(libraryTemplate)}
                      disabled={creatingFromLibrary === libraryTemplate.name}
                      className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-sm"
                    >
                      {creatingFromLibrary === libraryTemplate.name ? 'Creating...' : 'Use This Template'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg max-w-md mx-4">
            <div className="px-6 py-4">
              <h3 className="text-lg font-medium text-gray-900 mb-2">Delete Template</h3>
              <p className="text-sm text-gray-600 mb-4">
                Are you sure you want to delete this template? This action cannot be undone.
              </p>
              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => setDeleteConfirm(null)}
                  className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => deleteTemplate(deleteConfirm)}
                  className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TemplateManager;