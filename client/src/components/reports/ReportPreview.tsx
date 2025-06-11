import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card';

interface ReportPreviewProps {
  report: {
    studentName: string;
    groupName: string;
    submissionDate: string;
    content: Record<string, Record<string, any>>;
    recommendedGroupId: number;
  };
  template: {
    sections: Array<{
      name: string;
      fields: Array<{
        name: string;
        fieldType: string;
      }>;
    }>;
  };
}

const ReportPreview: React.FC<ReportPreviewProps> = ({ report, template }) => {
  const [recommendedGroupName, setRecommendedGroupName] = useState<string>('');

  useEffect(() => {
    const fetchGroupName = async () => {
      try {
        const response = await fetch('/clubs/api/groups');
        if (response.ok) {
          const groups = await response.json();
          const group = groups.find((g: { id: number }) => g.id === report.recommendedGroupId);
          if (group) {
            setRecommendedGroupName(group.name);
          }
        }
      } catch (error) {
        console.error('Error fetching group name:', error);
      }
    };

    if (report.recommendedGroupId) {
      fetchGroupName();
    }
  }, [report.recommendedGroupId]);

  const formatValue = (value: any, fieldType: string) => {
    if (value === undefined || value === null || value === '') {
      return '-';
    }

    switch (fieldType) {
      case 'rating':
        const ratings = ['Poor', 'Below Average', 'Average', 'Good', 'Excellent'];
        return `${value} - ${ratings[parseInt(value) - 1] || ''}`;
      default:
        return value;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Report Summary</CardTitle>
        <div className="text-sm text-gray-600">
          <div>Student: {report.studentName}</div>
          <div>Current Group: {report.groupName}</div>
          <div>Recommended Group: {recommendedGroupName || '-'}</div>
          <div>Submitted: {new Date(report.submissionDate).toLocaleDateString()}</div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {template.sections.map((section) => (
            <div key={section.name} className="space-y-4">
              <h3 className="font-semibold text-lg border-b pb-2">{section.name}</h3>
              <div className="space-y-4">
                {section.fields.map((field) => (
                  <div key={field.name} className="space-y-0.5">
                    <div className="font-medium text-sm text-gray-700">
                      {field.name}
                    </div>
                    <div className="text-gray-900">
                      {formatValue(
                        report.content[section.name]?.[field.name],
                        field.fieldType
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default ReportPreview;