import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card';
import { Alert, AlertDescription } from '../../components/ui/alert';
import type { 
  Group, 
  FieldOption, 
  Section, 
  DynamicReportFormProps
} from '../../types/dashboard';

const DynamicReportForm: React.FC<DynamicReportFormProps> = ({
  template,
  studentName,
  dateOfBirth,
  age,
  groupName,
  initialData,
  onSubmit,
  onCancel,
  isSubmitting = false,
  onSaveAndNext // New prop for handling save and next
}) => {
  const [formData, setFormData] = useState<Record<string, Record<string, any>>>({});
  const [errors, setErrors] = useState<string[]>([]);
  const [touched, setTouched] = useState<Record<string, Record<string, boolean>>>({});
  const [groups, setGroups] = useState<Group[]>([]);
  const [recommendedGroupId, setRecommendedGroupId] = useState<number | string>('');
  const [isSavingAndNext, setIsSavingAndNext] = useState(false);

  // Fetch available groups
  useEffect(() => {
    const fetchGroups = async () => {
      try {
        const response = await fetch('/api/groups');
        if (response.ok) {
          const data = await response.json();
          setGroups(data);
        }
      } catch (error) {
        console.error('Error fetching groups:', error);
      }
    };
    fetchGroups();
  }, []);

  // Initialize form data from template and initialData
  useEffect(() => {
    const allSections = new Set([
      ...template.sections.map(section => section.name),
      ...Object.keys(initialData?.content || {})
    ]);
  
    const initializedFormData: Record<string, Record<string, string>> = {};
    const initializedTouchedFields: Record<string, Record<string, boolean>> = {};
  
    allSections.forEach(sectionName => {
      const templateSection = template.sections.find(section => section.name === sectionName);
      const initialContent = initialData?.content?.[sectionName] || {};
  
      // Initialize form data
      initializedFormData[sectionName] = { ...initialContent };
  
      // Initialize touched fields for all template fields
      initializedTouchedFields[sectionName] = {};
      if (templateSection) {
        templateSection.fields.forEach(field => {
          initializedFormData[sectionName][field.name] = initialContent[field.name] || '';
          initializedTouchedFields[sectionName][field.name] = false;
        });
      }
    });
  
    setFormData(initializedFormData);
    setTouched(initializedTouchedFields);
    setRecommendedGroupId(initialData?.recommendedGroupId || '');
  }, [initialData, template]);

  const handleFieldChange = (sectionName: string, fieldName: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [sectionName]: {
        ...prev[sectionName],
        [fieldName]: value
      }
    }));

    setTouched(prev => ({
      ...prev,
      [sectionName]: {
        ...prev[sectionName],
        [fieldName]: true
      }
    }));

    setErrors(prev => prev.filter(error => !error.includes(fieldName)));
  };

  const validateField = (section: Section, field: FieldOption): string | null => {
    const value = formData[section.name]?.[field.name];
    
    if (field.isRequired && (!value || value.toString().trim() === '')) {
      return `${field.name} is required`;
    }

    switch (field.fieldType) {
      case 'number':
        if (value && isNaN(Number(value))) {
          return `${field.name} must be a valid number`;
        }
        if (field.options?.min !== undefined && Number(value) < field.options.min) {
          return `${field.name} must be at least ${field.options.min}`;
        }
        if (field.options?.max !== undefined && Number(value) > field.options.max) {
          return `${field.name} must be no more than ${field.options.max}`;
        }
        break;
      case 'rating':
        if (value && (isNaN(Number(value)) || Number(value) < 1 || Number(value) > 5)) {
          return `${field.name} must be between 1 and 5`;
        }
        break;
    }

    return null;
  };

  const validateForm = (): boolean => {
    const newErrors: string[] = [];

    template.sections.forEach(section => {
      section.fields.forEach(field => {
        const error = validateField(section, field);
        if (error) {
          newErrors.push(error);
        }
      });
    });

    if (!recommendedGroupId) {
      newErrors.push('Please select a recommended group');
    }

    setErrors(newErrors);
    return newErrors.length === 0;
  };

  const handleSubmit = async (e: React.FormEvent, saveAndNext: boolean = false) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    setIsSavingAndNext(saveAndNext);

    try {
      const submitData = {
        content: formData,
        recommendedGroupId: Number(recommendedGroupId),
        template_id: template.id
      };

      if (saveAndNext) {
        await onSaveAndNext?.(submitData);
      } else {
        await onSubmit(submitData);
      }
    } catch (error) {
      setErrors(prev => [...prev, 'Failed to submit report. Please try again.']);
      console.error('Submit error:', error);
    } finally {
      setIsSavingAndNext(false);
    }
  };

  const renderField = (section: Section, field: FieldOption) => {
    const value = formData[section.name]?.[field.name] || '';
    const isTouched = touched[section.name]?.[field.name];
    const error = isTouched ? validateField(section, field) : null;

    if (field.fieldType === 'progress') {
      return (
        <div className="flex py-2">
          <div className="flex-1">
            <label 
              htmlFor={`field_${section.id}_${field.id}`}
              className="text-sm font-medium text-gray-700"
            >
              {field.name}
            </label>
            {field.description && (
              <p className="text-sm text-gray-500 inline ml-2">
                {field.description}
              </p>
            )}
          </div>
          <div className="grid grid-cols-3 gap-4 w-[400px] px-6">
            {['Yes', 'Nearly', 'Not Yet'].map(option => (
              <div key={option} className="flex justify-center ml-8">
                <input
                  type="checkbox"
                  checked={value === option}
                  onChange={() => handleFieldChange(section.name, field.name, option)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
              </div>
            ))}
          </div>
        </div>
      );
    }

    const commonProps = {
      id: `field_${section.id}_${field.id}`,
      value,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => 
        handleFieldChange(section.name, field.name, e.target.value),
      className: `w-full p-2 border rounded ${error ? 'border-red-500' : 'border-gray-300'} 
                 focus:outline-none focus:ring-2 focus:ring-blue-500`,
      required: field.isRequired
    };

    switch (field.fieldType) {
      case 'text':
        return (
          <div className="space-y-0">
            <label 
              htmlFor={`field_${section.id}_${field.id}`}
              className="block text-sm font-medium text-gray-700"
            >
              {field.name}
              {field.isRequired && <span className="text-red-500 ml-1">*</span>}
            </label>
            {field.description && (
              <p className="text-sm text-gray-500 mb-0">{field.description}</p>
            )}
            <input type="text" {...commonProps} />
          </div>
        );
      
      case 'textarea':
        return (
          <div className="space-y-0">
            <label 
              htmlFor={`field_${section.id}_${field.id}`}
              className="block text-sm font-medium text-gray-700"
            >
              {field.name}
              {field.isRequired && <span className="text-red-500 ml-1">*</span>}
            </label>
            {field.description && (
              <p className="text-sm text-gray-500 mb-0">{field.description}</p>
            )}
            <textarea {...commonProps} className={`${commonProps.className} h-24`} />
          </div>
        );
      
      case 'number':
        return (
          <div className="space-y-0">
            <label 
              htmlFor={`field_${section.id}_${field.id}`}
              className="block text-sm font-medium text-gray-700"
            >
              {field.name}
              {field.isRequired && <span className="text-red-500 ml-1">*</span>}
            </label>
            {field.description && (
              <p className="text-sm text-gray-500 mb-0">{field.description}</p>
            )}
            <input
              type="number"
              min={field.options?.min}
              max={field.options?.max}
              {...commonProps}
            />
          </div>
        );
      
      case 'select':
        return (
          <div className="space-y-0">
            <label 
              htmlFor={`field_${section.id}_${field.id}`}
              className="block text-sm font-medium text-gray-700"
            >
              {field.name}
              {field.isRequired && <span className="text-red-500 ml-1">*</span>}
            </label>
            {field.description && (
              <p className="text-sm text-gray-500 mb-0">{field.description}</p>
            )}
            <select {...commonProps}>
              <option value="">Select an option</option>
              {field.options?.options?.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>
        );
      
      case 'rating':
        return (
          <div className="space-y-0">
            <label 
              htmlFor={`field_${section.id}_${field.id}`}
              className="block text-sm font-medium text-gray-700"
            >
              {field.name}
              {field.isRequired && <span className="text-red-500 ml-1">*</span>}
            </label>
            {field.description && (
              <p className="text-sm text-gray-500 mb-0">{field.description}</p>
            )}
            <select {...commonProps}>
              <option value="">Select rating</option>
              {[1, 2, 3, 4, 5].map((rating) => (
                <option key={rating} value={rating}>
                  {rating} - {['Poor', 'Below Average', 'Average', 'Good', 'Excellent'][rating - 1]}
                </option>
              ))}
            </select>
          </div>
        );
      
      default:
        return null;
    }
  };

  return (
    <Card>
    <CardHeader className="text-center border-b pb-6">
        <CardTitle className="text-2xl font-bold">
          {initialData ? 'Edit Report' : 'Create Report'}
        </CardTitle>
        <div className="mt-4 space-y-2">
          <div className="grid grid-cols-2 gap-4 text-left">
            <div className="flex items-center">
              <span className="font-semibold w-32">Player:</span>
              <span>{studentName}</span>
            </div>
            <div className="flex items-center">
              <span className="font-semibold w-32">Current Group:</span>
              <span>{groupName}</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 text-left">
            <div className="flex items-center">
              <span className="font-semibold w-32">Date of Birth:</span>
              <span>{dateOfBirth ? new Date(dateOfBirth).toLocaleDateString('en-GB') : 'Not provided'}</span>
            </div>
            <div className="flex items-center">
              <span className="font-semibold w-32">Age:</span>
              <span>{age ? `${age} years` : 'Not provided'}</span>
            </div>
          </div>
        </div>
        
        {/* Only show progress options if there are progress fields */}
        {template.sections.some(section => 
          section.fields.some(field => field.fieldType === 'progress')
        ) && (
          <div className="mt-3 p-2 rounded-lg"> 
            <div className="w-full mx-auto flex justify-end">
              <div className="grid grid-cols-3 text-center gap-4">
                <div className="flex flex-col items-center space-y-2">
                  <div className="h-4"></div>
                  <div>Yes</div>
                </div>
                <div className="flex flex-col items-center space-y-2">
                  <div className="h-4"></div>
                  <div>Nearly</div>
                </div>
                <div className="flex flex-col items-center space-y-2">
                  <div className="h-4"></div>
                  <div>Not Yet</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </CardHeader>

      <CardContent>
        {errors.length > 0 && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>
              <ul className="list-disc list-inside">
                {errors.map((error, index) => (
                  <li key={index}>{error}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        <form onSubmit={(e) => handleSubmit(e, false)} className="space-y-0">
          {template.sections
            .sort((a, b) => a.order - b.order)
            .map((section) => (
              <div key={section.id} className="mb-0">
                <div className="flex items-center">
                  <div className="bg-blue-500 text-white text-sm font-bold py-1 px-3 rounded-md">
                    {section.name}
                  </div>
                  <div className="flex-1 ml-4">
                    <div className="h-0.5 bg-blue-500"></div>
                  </div>
                </div>
                <div className="mt-1 space-y-0">
                  {section.fields
                    .sort((a, b) => a.order - b.order)
                    .map((field) => (
                      <div key={field.id}>
                        {renderField(section, field)}
                        {touched[section.name]?.[field.name] && 
                         validateField(section, field) && (
                          <p className="text-sm text-red-500 mt-1">
                            {validateField(section, field)}
                          </p>
                        )}
                      </div>
                    ))}
                </div>
              </div>
            ))}

          <div className="space-y-2 mb-8">
            <label 
              htmlFor="recommendedGroup"
              className="block text-sm font-medium text-gray-700"
            >
              Recommended Group<span className="text-red-500 ml-1">*</span>
            </label>
            <select
              id="recommendedGroup"
              value={recommendedGroupId}
              onChange={(e) => setRecommendedGroupId(Number(e.target.value) || '')}
              className="w-full p-2 border rounded border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            >
              <option value="">Select a group</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </div>

          <div className="h-4"></div>
          <div className="flex justify-end space-x-4">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 border rounded-md hover:bg-gray-50"
              disabled={isSubmitting || isSavingAndNext}
            >
              Cancel
            </button>
            {onSaveAndNext && (
              <button
                type="button"
                onClick={(e) => handleSubmit(e, true)}
                className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 
                         disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={isSubmitting || isSavingAndNext}
              >
                {isSavingAndNext ? (
                  <span className="flex items-center">
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Saving...
                  </span>
                ) : 'Save and Next'}
              </button>
            )}
            <button
              type="submit"
              className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 
                       disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isSubmitting || isSavingAndNext}
            >
              {isSubmitting ? (
                <span className="flex items-center">
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Saving...
                </span>
              ) : (initialData ? 'Update Report' : 'Save and Close')}
            </button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};

export default DynamicReportForm;