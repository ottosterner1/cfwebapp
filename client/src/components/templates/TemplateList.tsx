import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import type { ReportTemplate, GroupTemplate } from '../../types/dashboard';

interface TemplateListProps {
  templates: ReportTemplate[];
  groupTemplates: GroupTemplate[];
  onEdit: (template: ReportTemplate) => void;
  onDelete: (templateId: number) => void;
  onAssignGroup: (templateId: number, groupId: number) => void;
}

const TemplateList: React.FC<TemplateListProps> = ({ 
  templates, 
  groupTemplates,
  onEdit, 
  onDelete
}) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {templates.map((template) => {
        const templateAssignments = groupTemplates.filter(gt => gt.templateId === template.id);
        
        return (
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
                    onClick={() => onEdit(template)}
                    className="text-sm text-blue-500 hover:text-blue-600"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => {
                      if (window.confirm('Are you sure you want to delete this template?')) {
                        onDelete(template.id!);
                      }
                    }}
                    className="text-sm text-red-500 hover:text-red-600"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {template.sections.map((section, index) => (
                  <div key={index} className="border-t pt-4">
                    <h4 className="font-medium text-gray-900">{section.name}</h4>
                    <ul className="mt-2 space-y-2">
                      {section.fields.map((field, fieldIndex) => (
                        <li key={fieldIndex} className="flex items-center text-sm text-gray-600">
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
                <h4 className="font-medium text-gray-900 mb-2">Tennis Groups Using This Template</h4>
                <div className="flex flex-wrap gap-2">
                  {templateAssignments.map((assignment) => (
                    <span key={assignment.groupId} className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-sm">
                      {assignment.groupName}
                    </span>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

export default TemplateList;