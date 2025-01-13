import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card';
import { Alert, AlertDescription } from '../../components/ui/alert';
import type { ReportTemplate } from '../../types/dashboard';
import TemplateEditor from './TemplateEditor';

const TemplateManager: React.FC = () => {
  const [templates, setTemplates] = useState<ReportTemplate[]>([]);
  const [editingTemplate, setEditingTemplate] = useState<ReportTemplate | undefined>();
  const [error, setError] = useState<string>('');

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      const response = await fetch('/api/report-templates');
      if (!response.ok) throw new Error('Failed to fetch templates');
      const data = await response.json();
      setTemplates(data);
    } catch (err) {
      setError('Failed to load templates');
    }
  };

  const handleSaveTemplate = async (template: ReportTemplate) => {
    try {
      const method = template.id ? 'PUT' : 'POST';
      const url = template.id ? `/api/report-templates/${template.id}` : '/api/report-templates';
      
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(template),
      });
      
      if (!response.ok) throw new Error('Failed to save template');
      
      setEditingTemplate(undefined);
      fetchTemplates();
    } catch (err) {
      setError('Failed to save template');
    }
  };

  const handleDeleteTemplate = async (templateId: number) => {
    if (!confirm('Are you sure you want to delete this template? This action cannot be undone.')) {
      return;
    }

    try {
      const response = await fetch(`/api/report-templates/${templateId}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) throw new Error('Failed to delete template');
      
      fetchTemplates();
    } catch (err) {
      setError('Failed to delete template');
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {editingTemplate ? (
        <Card>
          <CardHeader>
            <CardTitle>{editingTemplate.id ? 'Edit Report Template' : 'Create New Report Template'}</CardTitle>
          </CardHeader>
          <CardContent>
            <TemplateEditor
              template={editingTemplate}
              onSave={handleSaveTemplate}
              onCancel={() => setEditingTemplate(undefined)}
            />
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Report Templates</h1>
              <p className="mt-1 text-sm text-gray-600">
                Create and manage report templates for different tennis groups.
              </p>
            </div>
            <button
              onClick={() => setEditingTemplate({
                name: '',
                description: '',
                sections: [],
                isActive: true,
                assignedGroups: []
              } as ReportTemplate)}
              className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
            >
              Create New Template
            </button>
          </div>

          <div className="grid grid-cols-1 gap-6">
            {templates.map((template) => (
              <Card key={template.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-lg font-semibold">{template.name}</CardTitle>
                      {template.description && (
                        <p className="mt-1 text-sm text-gray-600">{template.description}</p>
                      )}
                    </div>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => setEditingTemplate(template)}
                        className="text-sm text-blue-500 hover:text-blue-600"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteTemplate(template.id!)}
                        className="text-sm text-red-500 hover:text-red-600"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {template.sections.map((section) => (
                      <div key={section.id} className="border-t pt-4">
                        <h4 className="font-medium text-gray-900">{section.name}</h4>
                        <ul className="mt-2 space-y-2">
                          {section.fields.map((field) => (
                            <li key={field.id} className="flex items-center text-sm text-gray-600">
                              <span className="mr-2">•</span>
                              {field.name}
                              {field.isRequired && <span className="ml-1 text-red-500">*</span>}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>

                  <div className="mt-6 pt-4 border-t">
                    <h4 className="font-medium text-gray-900 mb-2">Assigned Groups</h4>
                    <div className="flex flex-wrap gap-2">
                      {template.assignedGroups?.map((group) => (
                        <span key={group.id} className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-sm">
                          {group.name}
                        </span>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default TemplateManager;