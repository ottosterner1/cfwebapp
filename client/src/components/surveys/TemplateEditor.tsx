import React, { useState, useEffect } from 'react';
import { Alert, AlertDescription } from '../ui/alert';

interface QuestionType {
  value: string;
  name: string;
  display_name: string;
  description: string;
  default_options: any;
}

interface Question {
  id?: number;
  question_text: string;
  question_type: string;
  is_required: boolean;
  order_index: number;
  options?: any;
  help_text?: string;
}

interface Template {
  id?: number;
  name: string;
  description?: string;
  purpose_statement: string;
  retention_days: number;
  max_frequency_days: number;
  allow_anonymous: boolean;
  collect_contact_info: boolean;
  send_reminder: boolean;
  reminder_days: number;
  questions: Question[];
}

interface TemplateEditorProps {
  clubId: number;
  templateId?: number;
  onSave: () => void;
  onCancel: () => void;
}

const TemplateEditor: React.FC<TemplateEditorProps> = ({ 
  clubId, 
  templateId, 
  onSave, 
  onCancel 
}) => {
  const [template, setTemplate] = useState<Template>({
    name: '',
    description: '',
    purpose_statement: '',
    retention_days: 730,
    max_frequency_days: 90,
    allow_anonymous: true,
    collect_contact_info: false,
    send_reminder: true,
    reminder_days: 7,
    questions: []
  });

  const [questionTypes, setQuestionTypes] = useState<QuestionType[]>([]);
  const [loading, setLoading] = useState(!!templateId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingQuestion, setEditingQuestion] = useState<number | null>(null);

  useEffect(() => {
    fetchQuestionTypes();
    if (templateId) {
      fetchTemplate();
    }
  }, [templateId]);

  const fetchQuestionTypes = async () => {
    try {
      const response = await fetch('/api/survey-question-types');
      if (response.ok) {
        const data = await response.json();
        setQuestionTypes(data.question_types);
      }
    } catch (err) {
      console.error('Failed to fetch question types:', err);
    }
  };

  const fetchTemplate = async () => {
    if (!templateId) return;
    
    try {
      const response = await fetch(`/api/survey-templates/${templateId}`);
      if (response.ok) {
        const data = await response.json();
        setTemplate(data.template);
      } else {
        throw new Error('Failed to fetch template');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const saveTemplate = async () => {
    if (!template.name.trim()) {
      setError('Template name is required');
      return;
    }

    if (!template.purpose_statement.trim()) {
      setError('Purpose statement is required');
      return;
    }

    setSaving(true);
    try {
      const url = templateId 
        ? `/api/survey-templates/${templateId}`
        : `/api/clubs/${clubId}/survey-templates`;
      
      const method = templateId ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(template)
      });

      if (response.ok) {
        onSave();
      } else {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save template');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  const addQuestion = () => {
    const newQuestion: Question = {
      question_text: '',
      question_type: 'text',
      is_required: false,
      order_index: template.questions.length + 1,
      help_text: ''
    };

    setTemplate(prev => ({
      ...prev,
      questions: [...prev.questions, newQuestion]
    }));
    setEditingQuestion(template.questions.length);
  };

  const updateQuestion = (index: number, updates: Partial<Question>) => {
    setTemplate(prev => ({
      ...prev,
      questions: prev.questions.map((q, i) => 
        i === index ? { ...q, ...updates } : q
      )
    }));
  };

  const deleteQuestion = (index: number) => {
    setTemplate(prev => ({
      ...prev,
      questions: prev.questions.filter((_, i) => i !== index)
        .map((q, i) => ({ ...q, order_index: i + 1 }))
    }));
    setEditingQuestion(null);
  };

  const moveQuestion = (index: number, direction: 'up' | 'down') => {
    if ((direction === 'up' && index === 0) || 
        (direction === 'down' && index === template.questions.length - 1)) {
      return;
    }

    const newIndex = direction === 'up' ? index - 1 : index + 1;
    const questions = [...template.questions];
    [questions[index], questions[newIndex]] = [questions[newIndex], questions[index]];
    
    // Update order_index
    questions.forEach((q, i) => {
      q.order_index = i + 1;
    });

    setTemplate(prev => ({ ...prev, questions }));
  };

  const getQuestionTypeConfig = (type: string) => {
    return questionTypes.find(qt => qt.value === type);
  };

  const renderQuestionOptions = (question: Question, index: number) => {
    const questionType = getQuestionTypeConfig(question.question_type);
    if (!questionType?.default_options) return null;

    switch (question.question_type) {
      case 'multiple_choice':
        return (
          <div className="mt-3">
            <label className="block text-sm font-medium text-gray-700 mb-2">Options</label>
            <div className="space-y-2">
              {(question.options?.options || []).map((option: string, optIndex: number) => (
                <div key={optIndex} className="flex items-center space-x-2">
                  <input
                    type="text"
                    value={option}
                    onChange={(e) => {
                      const newOptions = [...(question.options?.options || [])];
                      newOptions[optIndex] = e.target.value;
                      updateQuestion(index, {
                        options: { ...question.options, options: newOptions }
                      });
                    }}
                    className="flex-1 px-3 py-1 border border-gray-300 rounded-md text-sm"
                    placeholder="Option text"
                  />
                  <button
                    onClick={() => {
                      const newOptions = (question.options?.options || []).filter((_: any, i: number) => i !== optIndex);
                      updateQuestion(index, {
                        options: { ...question.options, options: newOptions }
                      });
                    }}
                    className="text-red-600 hover:text-red-800"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              ))}
              <button
                onClick={() => {
                  const currentOptions = question.options?.options || [];
                  updateQuestion(index, {
                    options: { 
                      ...question.options, 
                      options: [...currentOptions, ''] 
                    }
                  });
                }}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                + Add Option
              </button>
            </div>
          </div>
        );

      case 'rating':
        return (
          <div className="mt-3 grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Min Rating</label>
              <input
                type="number"
                min="1"
                max="10"
                value={question.options?.min || questionType.default_options.min}
                onChange={(e) => updateQuestion(index, {
                  options: { ...question.options, min: parseInt(e.target.value) }
                })}
                className="w-full px-3 py-1 border border-gray-300 rounded-md text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Max Rating</label>
              <input
                type="number"
                min="1"
                max="10"
                value={question.options?.max || questionType.default_options.max}
                onChange={(e) => updateQuestion(index, {
                  options: { ...question.options, max: parseInt(e.target.value) }
                })}
                className="w-full px-3 py-1 border border-gray-300 rounded-md text-sm"
              />
            </div>
          </div>
        );

      case 'nps':
        return (
          <div className="mt-3 grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Low Label</label>
              <input
                type="text"
                value={question.options?.low_label || questionType.default_options.low_label}
                onChange={(e) => updateQuestion(index, {
                  options: { ...question.options, low_label: e.target.value }
                })}
                className="w-full px-3 py-1 border border-gray-300 rounded-md text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">High Label</label>
              <input
                type="text"
                value={question.options?.high_label || questionType.default_options.high_label}
                onChange={(e) => updateQuestion(index, {
                  options: { ...question.options, high_label: e.target.value }
                })}
                className="w-full px-3 py-1 border border-gray-300 rounded-md text-sm"
              />
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            {templateId ? 'Edit Survey Template' : 'Create Survey Template'}
          </h2>
          <p className="text-gray-600">Build your survey questions and configure settings</p>
        </div>
        <div className="flex space-x-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={saveTemplate}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400"
          >
            {saving ? 'Saving...' : 'Save Template'}
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

      {/* Template Settings */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Template Settings</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Template Name *
            </label>
            <input
              type="text"
              value={template.name}
              onChange={(e) => setTemplate(prev => ({ ...prev, name: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g., End of Term Feedback"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Description
            </label>
            <input
              type="text"
              value={template.description || ''}
              onChange={(e) => setTemplate(prev => ({ ...prev, description: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Brief description of the survey"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Purpose Statement *
            </label>
            <textarea
              value={template.purpose_statement}
              onChange={(e) => setTemplate(prev => ({ ...prev, purpose_statement: e.target.value }))}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Explain why you're collecting this feedback and how it will be used"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Data Retention (days)
            </label>
            <select
              value={template.retention_days}
              onChange={(e) => setTemplate(prev => ({ ...prev, retention_days: parseInt(e.target.value) }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value={365}>1 year</option>
              <option value={730}>2 years</option>
              <option value={1095}>3 years</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Max Survey Frequency (days)
            </label>
            <select
              value={template.max_frequency_days}
              onChange={(e) => setTemplate(prev => ({ ...prev, max_frequency_days: parseInt(e.target.value) }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value={30}>Monthly</option>
              <option value={90}>Quarterly</option>
              <option value={180}>Bi-annually</option>
              <option value={365}>Annually</option>
            </select>
          </div>

          <div className="md:col-span-2">
            <div className="space-y-3">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={template.allow_anonymous}
                  onChange={(e) => setTemplate(prev => ({ ...prev, allow_anonymous: e.target.checked }))}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="ml-2 text-sm text-gray-700">Allow anonymous responses</span>
              </label>

              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={template.send_reminder}
                  onChange={(e) => setTemplate(prev => ({ ...prev, send_reminder: e.target.checked }))}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="ml-2 text-sm text-gray-700">Send reminder emails</span>
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Questions */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Questions</h3>
          <button
            onClick={addQuestion}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
          >
            Add Question
          </button>
        </div>

        {template.questions.length === 0 ? (
          <div className="text-center py-8">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h4 className="mt-2 text-sm font-medium text-gray-900">No questions yet</h4>
            <p className="mt-1 text-sm text-gray-500">Add your first question to get started</p>
          </div>
        ) : (
          <div className="space-y-4">
            {template.questions.map((question, index) => (
              <div key={index} className="border border-gray-200 rounded-lg p-4">
                {editingQuestion === index ? (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Question Text *</label>
                      <textarea
                        value={question.question_text}
                        onChange={(e) => updateQuestion(index, { question_text: e.target.value })}
                        rows={2}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Enter your question"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Question Type</label>
                        <select
                          value={question.question_type}
                          onChange={(e) => updateQuestion(index, { 
                            question_type: e.target.value,
                            options: getQuestionTypeConfig(e.target.value)?.default_options || {}
                          })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          {questionTypes.map((type) => (
                            <option key={type.value} value={type.value}>
                              {type.display_name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="flex items-center pt-6">
                        <label className="flex items-center">
                          <input
                            type="checkbox"
                            checked={question.is_required}
                            onChange={(e) => updateQuestion(index, { is_required: e.target.checked })}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="ml-2 text-sm text-gray-700">Required</span>
                        </label>
                      </div>
                    </div>

                    {renderQuestionOptions(question, index)}

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Help Text</label>
                      <input
                        type="text"
                        value={question.help_text || ''}
                        onChange={(e) => updateQuestion(index, { help_text: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Additional guidance for respondents"
                      />
                    </div>

                    <div className="flex justify-between">
                      <div className="flex space-x-2">
                        <button
                          onClick={() => moveQuestion(index, 'up')}
                          disabled={index === 0}
                          className="px-3 py-1 text-sm border border-gray-300 rounded text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                        >
                          ↑
                        </button>
                        <button
                          onClick={() => moveQuestion(index, 'down')}
                          disabled={index === template.questions.length - 1}
                          className="px-3 py-1 text-sm border border-gray-300 rounded text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                        >
                          ↓
                        </button>
                      </div>
                      
                      <div className="flex space-x-2">
                        <button
                          onClick={() => setEditingQuestion(null)}
                          className="px-3 py-1 text-sm border border-gray-300 rounded text-gray-700 hover:bg-gray-50"
                        >
                          Done
                        </button>
                        <button
                          onClick={() => deleteQuestion(index)}
                          className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-1">
                        <span className="text-sm font-medium text-gray-500">Q{index + 1}</span>
                        {question.is_required && (
                          <span className="text-xs bg-red-100 text-red-800 px-2 py-1 rounded">Required</span>
                        )}
                        <span className="text-xs bg-gray-100 text-gray-800 px-2 py-1 rounded">
                          {getQuestionTypeConfig(question.question_type)?.display_name}
                        </span>
                      </div>
                      <p className="text-gray-900">{question.question_text || 'Untitled Question'}</p>
                      {question.help_text && (
                        <p className="text-sm text-gray-500 mt-1">{question.help_text}</p>
                      )}
                    </div>
                    <button
                      onClick={() => setEditingQuestion(index)}
                      className="ml-4 text-blue-600 hover:text-blue-800 text-sm"
                    >
                      Edit
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default TemplateEditor;