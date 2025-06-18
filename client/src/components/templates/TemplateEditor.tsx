import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader } from '../../components/ui/card';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { PlusCircle, X, GripVertical, ChevronDown, ChevronUp } from 'lucide-react';
import type { ReportTemplate, TemplateSection, TemplateField } from '../../types/dashboard';

interface TemplateEditorProps {
  template?: ReportTemplate;
  onSave: (template: ReportTemplate) => void;
  onCancel: () => void;
}

// Updated interface for organisation-level groups
interface OrganisationGroup {
  id: number;
  name: string;
  description?: string;
  club_names: string[];  // Array of club names with time slots
  clubs_with_times: number;  // Count of clubs with time slots
}

const FIELD_TYPES = [
  { value: 'text', label: 'Short Text' },
  { value: 'textarea', label: 'Long Text' },
  { value: 'rating', label: 'Rating (1-5)' },
  { value: 'select', label: 'Multiple Choice' },
  { value: 'progress', label: 'Progress Scale (Yes/Nearly/Not Yet)' }
];

const DEFAULT_OPTIONS = {
  rating: {
    min: 1,
    max: 5,
    options: ['Needs Development', 'Developing', 'Competent', 'Proficient', 'Excellent']
  },
  progress: {
    options: ['Yes', 'Nearly', 'Not Yet']
  }
};

const TemplateEditor: React.FC<TemplateEditorProps> = ({ template, onSave, onCancel }) => {
  const [name, setName] = useState(template?.name || '');
  const [description, setDescription] = useState(template?.description || '');
  const [sections, setSections] = useState<TemplateSection[]>(template?.sections || []);
  const [errors, setErrors] = useState<string[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<number[]>(
    template?.assignedGroups?.map(g => g.id) || []
  );
  const [availableGroups, setAvailableGroups] = useState<OrganisationGroup[]>([]);
  const [expandedSections, setExpandedSections] = useState<Set<number>>(new Set());
  const [loadingGroups, setLoadingGroups] = useState<Set<number>>(new Set());

  useEffect(() => {
    const fetchGroups = async () => {
      try {
        const response = await fetch('/api/organisation-groups');
        if (!response.ok) throw new Error('Failed to fetch groups');
        const groups = await response.json();
        setAvailableGroups(groups);
      } catch (error) {
        console.error('Error fetching groups:', error);
        setErrors(prev => [...prev, 'Failed to load groups. Please refresh the page.']);
      }
    };
    fetchGroups();
  }, []);

  const handleGroupToggle = async (groupId: number, checked: boolean) => {
    try {
      setLoadingGroups(prev => new Set([...prev, groupId]));
  
      if (template?.id) { // Only make API calls if we're editing an existing template
        if (!checked) {
          // Unassign template from group
          const response = await fetch(`/api/templates/group-assignments?group_id=${groupId}`, {
            method: 'DELETE'
          });
  
          if (!response.ok) {
            throw new Error('Failed to unassign template from group');
          }
        }
      }
  
      // Update local state after successful API call
      setSelectedGroups(prev => 
        checked 
          ? [...prev, groupId]
          : prev.filter(id => id !== groupId)
      );
    } catch (error) {
      console.error('Error toggling group assignment:', error);
      setErrors(prev => [...prev, 'Failed to update group assignment']);
    } finally {
      setLoadingGroups(prev => {
        const next = new Set(prev);
        next.delete(groupId);
        return next;
      });
    }
  };

  const toggleSection = (index: number) => {
    setExpandedSections(prev => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  const addSection = () => {
    const newSectionIndex = sections.length;
    setSections([...sections, {
      name: '',
      order: newSectionIndex,
      fields: []
    }]);
    setExpandedSections(prev => new Set([...prev, newSectionIndex]));
  };

  const updateSection = (index: number, updates: Partial<TemplateSection>) => {
    const newSections = [...sections];
    newSections[index] = { ...newSections[index], ...updates };
    setSections(newSections);
  };

  const removeSection = (index: number) => {
    setSections(sections.filter((_, i) => i !== index));
  };

  const addField = (sectionIndex: number) => {
    const newSections = [...sections];
    newSections[sectionIndex].fields.push({
      name: '',
      fieldType: 'text',
      isRequired: true,
      order: newSections[sectionIndex].fields.length,
      options: null
    });
    setSections(newSections);
  };

  const updateField = (sectionIndex: number, fieldIndex: number, updates: Partial<TemplateField>) => {
    const newSections = [...sections];
    const field = newSections[sectionIndex].fields[fieldIndex];
  
    if (updates.fieldType && FIELD_TYPES.some(type => type.value === updates.fieldType)) {
      updates.options = DEFAULT_OPTIONS[updates.fieldType as keyof typeof DEFAULT_OPTIONS] || null;
    }
  
    newSections[sectionIndex].fields[fieldIndex] = {
      ...field,
      ...updates
    };
    setSections(newSections);
  };

  const removeField = (sectionIndex: number, fieldIndex: number) => {
    const newSections = [...sections];
    newSections[sectionIndex].fields = newSections[sectionIndex].fields.filter((_, i) => i !== fieldIndex);
    setSections(newSections);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const newErrors: string[] = [];
    if (!name.trim()) newErrors.push('Please provide a template name');
    
    sections.forEach((section, sIndex) => {
      if (!section.name.trim()) {
        newErrors.push(`Section ${sIndex + 1} needs a name`);
      }
      if (section.fields.length === 0) {
        newErrors.push(`Add at least one field in ${section.name || 'section ' + (sIndex + 1)}`);
      }
      section.fields.forEach((field, fIndex) => {
        if (!field.name.trim()) {
          newErrors.push(`Field ${fIndex + 1} in section ${section.name} needs a name`);
        }
      });
    });

    if (newErrors.length > 0) {
      setErrors(newErrors);
      return;
    }

    // Updated to handle organisation-level groups
    onSave({
      id: template?.id,
      name,
      description,
      sections: sections.map((section, sIndex) => ({
        ...section,
        order: sIndex,
        fields: section.fields.map((field, fIndex) => ({
          ...field,
          order: fIndex
        }))
      })),
      assignedGroups: selectedGroups.map(groupId => {
        const group = availableGroups.find(g => g.id === groupId);
        return {
          id: group!.id,
          name: group!.name
        };
      }),
      isActive: true
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {errors.length > 0 && (
        <Alert variant="destructive">
          <AlertDescription>
            <ul className="list-disc list-inside">
              {errors.map((error, index) => (
                <li key={index}>{error}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-6">
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Template Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-gray-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              placeholder="Enter template name"
            />
          </div>

          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-gray-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              rows={3}
              placeholder="Enter template description (e.g., 'Recommendation-only template for group progression')"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Assign Groups
            <span className="block text-xs text-gray-500 mt-1">
              Select groups from your organisation. Groups are shared across all clubs.
            </span>
          </label>
          
          {/* Simplified group selection with side-by-side checkboxes */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {availableGroups.map(group => (
              <label
                key={group.id}
                className={`flex items-centre cursor-pointer ${
                  loadingGroups.has(group.id) ? 'opacity-50' : ''
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedGroups.includes(group.id)}
                  onChange={(e) => handleGroupToggle(group.id, e.target.checked)}
                  disabled={loadingGroups.has(group.id)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="ml-2 text-sm text-gray-900">{group.name}</span>
                {loadingGroups.has(group.id) && (
                  <span className="ml-1 text-xs text-gray-500">...</span>
                )}
              </label>
            ))}
          </div>
          
          {availableGroups.length === 0 && (
            <div className="text-centre py-6 text-gray-500">
              <p>No groups found in your organisation.</p>
              <p className="text-sm mt-1">Create groups in the Groups management section first.</p>
            </div>
          )}
          
          {selectedGroups.length > 0 && (
            <div className="mt-2 text-sm text-gray-600">
              {selectedGroups.length} group{selectedGroups.length > 1 ? 's' : ''} selected
            </div>
          )}
        </div>
      </div>

      {/* Assessment sections */}
      <div className="space-y-6">
        <div className="flex justify-between items-centre">
          <div>
            <h3 className="text-lg font-medium text-gray-900">Assessment Sections</h3>
            <p className="text-sm text-gray-500 mt-1">
              {sections.length === 0 ? 
                'This template will only collect group recommendations (no assessment fields)' : 
                'Add sections and fields for detailed assessments'
              }
            </p>
          </div>
          <button
            type="button"
            onClick={addSection}
            className="inline-flex items-centre px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colours"
          >
            <PlusCircle className="h-5 w-5 mr-2" />
            Add Section
          </button>
        </div>

        {sections.length === 0 ? (
          <div className="border-2 border-dashed border-gray-300 rounded-lg">
            <Card>
              <CardContent>
                <div className="p-8 text-centre text-gray-500">
                  <p className="text-lg font-medium mb-2">Recommendation-Only Template</p>
                  <p className="text-sm">
                    This template will only collect group recommendations for the next term.
                    You can add assessment sections later if needed.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="space-y-4">
            {sections.map((section, sectionIndex) => (
              <div key={sectionIndex} className="border border-gray-200 rounded-lg">
                <Card>
                  <CardHeader>
                  <div 
                    className="flex items-centre justify-between cursor-pointer hover:bg-gray-50"
                    onClick={() => toggleSection(sectionIndex)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        toggleSection(sectionIndex);
                      }
                    }}
                  >
                    <div className="flex items-centre space-x-3">
                      <GripVertical className="h-5 w-5 text-gray-400" />
                      <input
                        type="text"
                        value={section.name}
                        onChange={(e) => updateSection(sectionIndex, { name: e.target.value })}
                        placeholder="Section Name"
                        className="text-lg font-medium bg-transparent border-none focus:ring-0 p-0"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()} 
                      />
                    </div>
                    <div className="flex items-centre space-x-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeSection(sectionIndex);
                        }}
                        className="p-1 text-gray-400 hover:text-red-500 transition-colours"
                      >
                        <X className="h-5 w-5" />
                      </button>
                      {expandedSections.has(sectionIndex) ? (
                        <ChevronUp className="h-5 w-5 text-gray-400" />
                      ) : (
                        <ChevronDown className="h-5 w-5 text-gray-400" />
                      )}
                    </div>
                  </div>
                </CardHeader>

                {expandedSections.has(sectionIndex) && (
                  <CardContent>
                    <div className="space-y-4">
                      {section.fields.map((field, fieldIndex) => (
                        <div
                          key={fieldIndex}
                          className="flex flex-col sm:flex-row items-start sm:items-centre gap-4 p-4 bg-gray-50 rounded-lg"
                        >
                          <div className="flex-1">
                            <input
                              type="text"
                              value={field.name}
                              onChange={(e) => updateField(sectionIndex, fieldIndex, { name: e.target.value })}
                              placeholder="Field Name"
                              className="w-full px-3 py-2 rounded-md border border-gray-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                            />
                          </div>
                          <select
                            value={field.fieldType}
                            onChange={(e) => updateField(sectionIndex, fieldIndex, { fieldType: e.target.value as 'text' | 'textarea' | 'rating' | 'select' | 'progress' })}
                            className="w-full sm:w-auto px-3 py-2 rounded-md border border-gray-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                          >
                            {FIELD_TYPES.map(type => (
                              <option key={type.value} value={type.value}>{type.label}</option>
                            ))}
                          </select>
                          <label className="flex items-centre space-x-2">
                            <input
                              type="checkbox"
                              checked={field.isRequired}
                              onChange={(e) => updateField(sectionIndex, fieldIndex, { isRequired: e.target.checked })}
                              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-sm text-gray-700">Required</span>
                          </label>
                          <button
                            type="button"
                            onClick={() => removeField(sectionIndex, fieldIndex)}
                            className="p-1 text-gray-400 hover:text-red-500 transition-colours"
                          >
                            <X className="h-5 w-5" />
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => addField(sectionIndex)}
                        className="inline-flex items-centre px-4 py-2 text-sm text-blue-600 hover:text-blue-700 transition-colours"
                      >
                        <PlusCircle className="h-4 w-4 mr-2" />
                        Add Field
                      </button>
                    </div>
                  </CardContent>
                )}
              </Card>
            </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex justify-end space-x-4 pt-6 border-t">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          Save Template
        </button>
      </div>
    </form>
  );
};

export default TemplateEditor;